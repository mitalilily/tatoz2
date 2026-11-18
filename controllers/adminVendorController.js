const asyncHandler = require('express-async-handler');
const Vendor = require('../models/Vendor');
const User = require('../models/User');
const Payout = require('../models/Payout');
const VendorLedger = require('../models/VendorLedger');
const VendorAudit = require('../models/VendorAudit');
const Settings = require('../models/Settings');
const Page = require('../models/Page');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { sendEmail } = require('../services/emailService');
const { PLATFORM_NAME } = require('../constants/branding');
const { REASON_CODES, isReasonCode } = require('../constants/vendorLifecycle');
const { writeAudit, notifyVendorOwner } = require('../services/vendorAuditService');
const Notification = require('../models/Notification');
const { tenantScope, isGlobalAdmin } = require('../services/adminTenantScope');
const { GSTIN_RE } = require('../utils/vendorValidation');
const { documentUrl, requiredVendorDocumentSlots } = require('../utils/vendorCompliance');

const scopedVendor = (req, extra = {}) => ({ ...extra, ...tenantScope(req) });
const vendorIdsForTenant = req => Vendor.find(tenantScope(req)).distinct('_id');
const tenantMatchesRequest = (req, tenantId) => !isGlobalAdmin(req)
  || req.adminTenantIds.some(id => String(id) === String(tenantId));

// @desc    List all vendors
// @route   GET /api/admin/vendors
const getVendors = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, search, riskTier, slaBreach, onboardingState } = req.query;
  const query = scopedVendor(req);
  if (status) query.status = status;
  if (onboardingState) query['onboarding.state'] = onboardingState;
  if (riskTier) query['onboarding.riskTier'] = riskTier;
  // slaBreach=true surfaces the review queue sorted by urgency: cases whose
  // SLA clock already ran out while still awaiting a decision.
  if (slaBreach === 'true') {
    query['onboarding.state'] = { $in: ['pending', 'changes_requested'] };
    query['onboarding.slaDueAt'] = { $lt: new Date() };
  }
  if (search) {
    query.$or = [
      { storeName: { $regex: search, $options: 'i' } },
      { slug: { $regex: search, $options: 'i' } },
      { contactEmail: { $regex: search, $options: 'i' } },
    ];
  }

  const [vendors, total] = await Promise.all([
    Vendor.find(query)
      .populate('owner', 'name email phone')
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit)),
    Vendor.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: vendors,
    tenantScoped: !isGlobalAdmin(req),
    globalScope: isGlobalAdmin(req),
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) },
  });
});

// @desc    Get vendor detail
// @route   GET /api/admin/vendors/:id
const getVendorDetail = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findOne(scopedVendor(req, { _id: req.params.id }))
    .populate('owner', 'name email phone isActive createdAt');

  if (!vendor) {
    res.status(404);
    throw new Error('Vendor not found');
  }

  const [totalPaidOut, pendingAmount, totalProducts, activeProducts, totalPages, publishedPages, totalOrders] = await Promise.all([
    Payout.aggregate([
      { $match: { vendor: vendor._id, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$netAmount' } } },
    ]),
    Payout.aggregate([
      { $match: { vendor: vendor._id, status: { $in: ['pending', 'processing'] } } },
      { $group: { _id: null, total: { $sum: '$netAmount' } } },
    ]),
    Product.countDocuments({ vendor: vendor._id }),
    Product.countDocuments({ vendor: vendor._id, isActive: true }),
    Page.countDocuments({ vendor: vendor._id, scope: 'vendor', kind: 'page', archivedAt: null }),
    Page.countDocuments({ vendor: vendor._id, scope: 'vendor', kind: 'page', archivedAt: null, status: 'published' }),
    Order.countDocuments({ 'subOrders.vendor': vendor._id }),
  ]);

  res.json({
    success: true,
    data: {
      ...vendor.toObject(),
      totalPaidOut: totalPaidOut[0]?.total || 0,
      pendingPayoutAmount: pendingAmount[0]?.total || 0,
      operationalStats: { totalProducts, activeProducts, totalPages, publishedPages, totalOrders },
      storeUrl: `${(process.env.CLIENT_URL || '').replace(/\/$/, '')}/store/${vendor.slug}`,
    },
  });
});

// GST is immutable for sellers. This is the only mutation path and is always
// an explicit admin approval, with both legacy and invoice tax identities kept
// in sync.
const approveVendorGstChange = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findOne(scopedVendor(req, { _id: req.params.id }));
  if (!vendor) { res.status(404); throw new Error('Vendor not found'); }
  const registrationType = req.body?.registrationType === 'gstin' ? 'gstin' : 'unregistered';
  const gstNumber = String(req.body?.gstNumber || '').trim().toUpperCase();
  if (registrationType === 'gstin' && !GSTIN_RE.test(gstNumber)) {
    res.status(422); throw new Error('Enter a valid 15-character GSTIN');
  }
  if (registrationType === 'unregistered' && gstNumber) {
    res.status(422); throw new Error('GSTIN must be empty for an unregistered seller');
  }
  const businessDetails = vendor.businessDetails?.toObject?.() || vendor.businessDetails || {};
  const taxProfile = vendor.taxProfile?.toObject?.() || vendor.taxProfile || {};
  vendor.businessDetails = { ...businessDetails, gstRegistrationType: registrationType, gstNumber };
  vendor.taxProfile = {
    ...taxProfile,
    registrationType,
    sellerGstin: gstNumber,
    gstLockedAt: new Date(),
    originState: taxProfile.originState || vendor.address?.state || '',
  };
  vendor.$locals.allowGstChange = true;
  await vendor.save();
  await writeAudit({
    tenant: vendor.tenant, vendorId: vendor._id, actorId: req.user._id,
    action: 'gst_change_approved', note: String(req.body?.note || '').trim().slice(0, 500),
  });
  res.json({ success: true, message: 'GST change approved and locked', data: vendor });
});

// @desc    Approve vendor
// @route   PUT /api/admin/vendors/:id/approve
const approveVendor = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findOne(scopedVendor(req, { _id: req.params.id })).populate('owner');
  if (!vendor) { res.status(404); throw new Error('Vendor not found'); }
  const missingDocuments = requiredVendorDocumentSlots(vendor).filter(slot => !documentUrl(vendor.verification?.documents?.[slot]));
  if (missingDocuments.length) {
    res.status(422);
    throw new Error(`Upload mandatory seller documents before approval: ${missingDocuments.join(', ')}`);
  }

  vendor.status = 'active';
  vendor.approvedAt = new Date();
  vendor.approvedBy = req.user._id;
  vendor.onboarding = {
    ...(vendor.onboarding?.toObject?.() || vendor.onboarding || {}),
    state: 'approved',
    reasonCode: '',
    reasonNote: '',
  };
  await vendor.save();

  await writeAudit({
    tenant: vendor.tenant, vendorId: vendor._id, actorId: req.user._id, action: 'approve',
    after: { status: 'active' },
  });

  if (vendor.owner && vendor.owner.role === 'customer') {
    vendor.owner.role = 'vendor';
    vendor.owner.vendor = vendor._id;
    await vendor.owner.save();
  }

  try {
    await Notification.create({
      tenant: vendor.tenant,
      title: 'Seller application approved',
      message: `Your seller application for ${vendor.storeName} has been approved.`,
      type: 'system',
      target: 'specific',
      targetUsers: [vendor.owner?._id || vendor.owner],
      status: 'sent',
      sentAt: new Date(),
      data: { kind: 'vendor_approval', vendorId: vendor._id, storeName: vendor.storeName },
    });
  } catch (error) {
    console.error('Seller approval notification failed:', error.message);
  }

  try {
    await sendEmail({
      tenantId: vendor.tenant,
      to: vendor.contactEmail,
      subject: `🎉 Your store "${vendor.storeName}" is approved!`,
      html: `<p>Congratulations! Your store <strong>${vendor.storeName}</strong> has been approved.</p>
             <p>You can now log in and start listing your products.</p>
             <p><a href="${process.env.CLIENT_URL}/vendor/dashboard">Go to your dashboard</a></p>`,
    });
  } catch (e) { /* non-fatal */ }

  res.json({ success: true, message: 'Vendor approved', data: vendor });
});

// @desc    Reject vendor
// @route   PUT /api/admin/vendors/:id/reject
const rejectVendor = asyncHandler(async (req, res) => {
  const { reason, reasonCode = '' } = req.body || {};
  const vendor = await Vendor.findOne(scopedVendor(req, { _id: req.params.id }));
  if (!vendor) { res.status(404); throw new Error('Vendor not found'); }

  vendor.status = 'rejected';
  vendor.rejectedAt = new Date();
  vendor.rejectionReason = reason || '';
  vendor.onboarding = {
    ...(vendor.onboarding?.toObject?.() || vendor.onboarding || {}),
    state: 'rejected',
    reasonCode: String(reasonCode || '').slice(0, 60),
    reasonNote: String(reason || '').slice(0, 1000),
  };
  await vendor.save();

  await writeAudit({
    tenant: vendor.tenant, vendorId: vendor._id, actorId: req.user._id, action: 'reject',
    reasonCode, note: reason || '', after: { status: 'rejected' },
  });
  await notifyVendorOwner(Notification, {
    tenantId: vendor.tenant, userId: vendor.owner, title: 'Seller application update',
    message: `Your application for ${vendor.storeName} was not approved.${reason ? ` Reason: ${reason}` : ''} You can fix the issues and resubmit from the seller portal.`,
    kind: 'vendor_rejection', vendorId: vendor._id,
  });

  try {
    await sendEmail({
      tenantId: vendor.tenant,
      to: vendor.contactEmail,
      subject: `Update on your "${vendor.storeName}" application`,
      html: `<p>Thank you for your interest in selling on ${PLATFORM_NAME}.</p>
             <p>Unfortunately, your application for <strong>${vendor.storeName}</strong> could not be approved at this time.</p>
             ${reason ? `<p>Reason: ${reason}</p>` : ''}`,
    });
  } catch (e) { /* non-fatal */ }

  res.json({ success: true, message: 'Vendor rejected', data: vendor });
});

// @desc    Send an application back for corrections (stays resubmittable)
// @route   PUT /api/admin/vendors/:id/request-changes
const requestChanges = asyncHandler(async (req, res) => {
  const { reasonCode, note = '' } = req.body || {};
  if (!reasonCode || !isReasonCode(reasonCode, 'changes_requested')) {
    res.status(422);
    throw new Error('A valid reason code is required to request changes');
  }
  const vendor = await Vendor.findOne(scopedVendor(req, { _id: req.params.id }));
  if (!vendor) { res.status(404); throw new Error('Vendor not found'); }
  if (vendor.status === 'active') {
    res.status(400);
    throw new Error('Active vendors cannot be sent back to onboarding. Suspend them instead.');
  }
  vendor.onboarding = {
    ...(vendor.onboarding?.toObject?.() || vendor.onboarding || {}),
    state: 'changes_requested',
    reasonCode,
    reasonNote: String(note).slice(0, 1000),
    slaDueAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
  };
  await vendor.save();
  await writeAudit({
    tenant: vendor.tenant, vendorId: vendor._id, actorId: req.user._id,
    action: 'request_changes', reasonCode, note, after: { state: 'changes_requested' },
  });
  await notifyVendorOwner(Notification, {
    tenantId: vendor.tenant, userId: vendor.owner, title: 'Changes requested on your application',
    message: `Your application for ${vendor.storeName} needs attention (${reasonCode}).${note ? ` Note: ${note}` : ''} Resubmit from the seller portal once fixed.`,
    kind: 'vendor_changes_requested', vendorId: vendor._id,
  });
  res.json({ success: true, message: 'Changes requested', data: vendor });
});

// @desc    Suspend vendor
// @route   PUT /api/admin/vendors/:id/suspend
const suspendVendor = asyncHandler(async (req, res) => {
  const { reasonCode = '', note = '' } = req.body || {};
  const vendor = await Vendor.findOne(scopedVendor(req, { _id: req.params.id }));
  if (!vendor) { res.status(404); throw new Error('Vendor not found'); }
  vendor.status = 'suspended';
  vendor.onboarding = {
    ...(vendor.onboarding?.toObject?.() || vendor.onboarding || {}),
    state: 'suspended',
    reasonCode: String(reasonCode).slice(0, 60),
    reasonNote: String(note).slice(0, 1000),
  };
  await vendor.save();
  await writeAudit({
    tenant: vendor.tenant, vendorId: vendor._id, actorId: req.user._id,
    action: 'suspend', reasonCode, note, after: { status: 'suspended' },
  });
  res.json({ success: true, message: 'Vendor suspended', data: vendor });
});

// @desc    Reactivate vendor
// @route   PUT /api/admin/vendors/:id/reactivate
const reactivateVendor = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findOne(scopedVendor(req, { _id: req.params.id }));
  if (!vendor) { res.status(404); throw new Error('Vendor not found'); }
  vendor.status = 'active';
  vendor.onboarding = {
    ...(vendor.onboarding?.toObject?.() || vendor.onboarding || {}),
    state: 'approved',
    reasonCode: '',
    reasonNote: '',
  };
  await vendor.save();
  await writeAudit({
    tenant: vendor.tenant, vendorId: vendor._id, actorId: req.user._id,
    action: 'reactivate', after: { status: 'active' },
  });
  res.json({ success: true, message: 'Vendor reactivated', data: vendor });
});

// @desc    Static review reason codes for admin selects
// @route   GET /api/admin/vendors/meta/reason-codes
const getReasonCodes = asyncHandler(async (req, res) => {
  res.json({ success: true, data: REASON_CODES });
});

// @desc    Audit trail for one vendor (newest first)
// @route   GET /api/admin/vendors/:id/audit
const getVendorAudit = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const vendor = await Vendor.findOne(scopedVendor(req, { _id: req.params.id })).select('_id');
  if (!vendor) { res.status(404); throw new Error('Vendor not found'); }
  const [entries, total] = await Promise.all([
    VendorAudit.find({ vendor: vendor._id })
      .populate('actor', 'name email role')
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit)),
    VendorAudit.countDocuments({ vendor: vendor._id }),
  ]);
  res.json({
    success: true,
    data: entries,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) },
  });
});

// @desc    Bulk lifecycle action (max 100 ids, per-id results)
// @route   POST /api/admin/vendors/bulk
const bulkVendorAction = asyncHandler(async (req, res) => {
  const { ids = [], action } = req.body || {};
  if (!['approve', 'suspend', 'reactivate'].includes(action)) {
    res.status(422);
    throw new Error('Action must be one of approve, suspend, reactivate');
  }
  if (!Array.isArray(ids) || !ids.length || ids.length > 100) {
    res.status(422);
    throw new Error('Provide 1 to 100 vendor ids');
  }
  const results = [];
  // eslint-disable-next-line no-restricted-syntax
  for (const id of ids) {
    try {
      const vendor = await Vendor.findOne({ _id: id, ...tenantScope(req) });
      if (!vendor) throw new Error('Vendor not found');
      const target = action === 'approve' ? 'active' : action === 'suspend' ? 'suspended' : 'active';
      const before = vendor.status;
      if (action === 'approve') {
        const missingDocuments = requiredVendorDocumentSlots(vendor).filter(slot => !documentUrl(vendor.verification?.documents?.[slot]));
        if (missingDocuments.length) throw new Error(`Missing documents: ${missingDocuments.join(', ')}`);
      }
      vendor.status = target;
      vendor.onboarding = {
        ...(vendor.onboarding?.toObject?.() || vendor.onboarding || {}),
        state: target === 'active' ? 'approved' : 'suspended',
      };
      if (action === 'approve') {
        vendor.approvedAt = new Date();
        vendor.approvedBy = req.user._id;
      }
      await vendor.save();
      if (action === 'approve' && vendor.owner) {
        const owner = await User.findById(vendor.owner);
        if (owner && owner.role === 'customer') {
          owner.role = 'vendor';
          owner.vendor = vendor._id;
          await owner.save();
        }
      }
      await writeAudit({
        tenant: vendor.tenant, vendorId: vendor._id, actorId: req.user._id, action,
        before: { status: before }, after: { status: target }, note: 'Bulk action',
      });
      results.push({ id, success: true, status: target });
    } catch (error) {
      results.push({ id, success: false, error: error.message });
    }
  }
  res.json({ success: true, data: results });
});

// @desc    Flag a vendor for re-verification (payouts pause, catalog stays live)
// @route   POST /api/admin/vendors/:id/reverify
const reverifyVendor = asyncHandler(async (req, res) => {
  const { reasonCode = 'ANNUAL_RECHECK', note = '' } = req.body || {};
  if (!isReasonCode(reasonCode, 'reverify')) {
    res.status(422);
    throw new Error('A valid re-verification reason code is required');
  }
  const vendor = await Vendor.findOne(scopedVendor(req, { _id: req.params.id }));
  if (!vendor) { res.status(404); throw new Error('Vendor not found'); }
  vendor.verification = {
    ...(vendor.verification?.toObject?.() || vendor.verification || {}),
    status: 'under_review',
    lastRecheckAt: new Date(),
    rejectionReason: String(note).slice(0, 500),
  };
  vendor.onboarding = {
    ...(vendor.onboarding?.toObject?.() || vendor.onboarding || {}),
    reasonCode,
    reasonNote: String(note).slice(0, 1000),
    slaDueAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
  };
  await vendor.save();
  await writeAudit({
    tenant: vendor.tenant, vendorId: vendor._id, actorId: req.user._id,
    action: 'reverify', reasonCode, note,
  });
  await notifyVendorOwner(Notification, {
    tenantId: vendor.tenant, userId: vendor.owner, title: 'Periodic verification required',
    message: `Your store ${vendor.storeName} needs re-verification (${reasonCode}). Payouts stay on hold until documents are approved; your catalog remains live.`,
    kind: 'vendor_reverify', vendorId: vendor._id,
  });
  res.json({ success: true, message: 'Vendor flagged for re-verification', data: vendor });
});

// @desc    Override vendor commission rate
// @route   PUT /api/admin/vendors/:id/commission
const updateVendorCommission = asyncHandler(async (req, res) => {
  const { commissionRate } = req.body;
  if (commissionRate === undefined || commissionRate < 0 || commissionRate > 100) {
    res.status(400);
    throw new Error('Commission rate must be between 0 and 100');
  }
  const vendor = await Vendor.findOne(scopedVendor(req, { _id: req.params.id }));
  if (!vendor) { res.status(404); throw new Error('Vendor not found'); }
  const before = vendor.commissionRate;
  vendor.commissionRate = commissionRate;
  await vendor.save();
  await writeAudit({
    tenant: vendor.tenant, vendorId: vendor._id, actorId: req.user._id,
    action: 'commission', before: { commissionRate: before }, after: { commissionRate },
  });
  res.json({ success: true, message: 'Commission rate updated', data: vendor });
});

// @desc    Update vendor feature permissions and storefront controls
// @route   PUT /api/admin/vendors/:id/settings
const updateVendorSettings = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findOne(scopedVendor(req, { _id: req.params.id }));
  if (!vendor) { res.status(404); throw new Error('Vendor not found'); }

  const featureKeys = ['catalog', 'orders', 'inventory', 'payouts', 'analytics', 'seo', 'pageBuilder', 'customStorefront', 'coupons', 'customDomain', 'commissions', 'reports', 'reviews', 'subscriptions'];
  if (req.body.features && typeof req.body.features === 'object') {
    const features = { ...(vendor.features?.toObject?.() || vendor.features || {}) };
    featureKeys.forEach(key => {
      if (typeof req.body.features[key] === 'boolean') features[key] = req.body.features[key];
    });
    vendor.features = features;
  }
  if (req.body.settings && typeof req.body.settings === 'object') {
    const settings = { ...(vendor.settings?.toObject?.() || vendor.settings || {}) };
    if (req.body.settings.minPayoutThreshold !== undefined) {
      const threshold = Number(req.body.settings.minPayoutThreshold);
      if (!Number.isFinite(threshold) || threshold < 0) { res.status(400); throw new Error('Minimum payout threshold is invalid'); }
      settings.minPayoutThreshold = threshold;
    }
    ['autoPayout', 'notifyOnNewOrder'].forEach(key => {
      if (typeof req.body.settings[key] === 'boolean') settings[key] = req.body.settings[key];
    });
    vendor.settings = settings;
  }
  if (req.body.storefront && typeof req.body.storefront === 'object') {
    const incoming = req.body.storefront;
    const current = vendor.storefront?.toObject?.() || vendor.storefront || {};
    vendor.storefront = {
      ...current,
      tagline: incoming.tagline ?? current.tagline,
      announcement: incoming.announcement ?? current.announcement,
      theme: { ...(current.theme || {}), ...(incoming.theme || {}) },
      seo: { ...(current.seo || {}), ...(incoming.seo || {}) },
    };
  }
  await vendor.save();
  res.json({ success: true, message: 'Vendor settings updated', data: vendor });
});

// @desc    Update vendor KYC/verification review status
// @route   PUT /api/admin/vendors/:id/verification
const updateVendorVerification = asyncHandler(async (req, res) => {
  const { status, rejectionReason = '', documents = {} } = req.body || {};
  const allowed = ['pending', 'under_review', 'verified', 'rejected'];
  if (!allowed.includes(status)) { res.status(400); throw new Error('Invalid verification status'); }
  const vendor = await Vendor.findOne(scopedVendor(req, { _id: req.params.id }));
  if (!vendor) { res.status(404); throw new Error('Vendor not found'); }
  const current = vendor.verification?.toObject?.() || vendor.verification || {};
  vendor.verification = {
    ...current,
    status,
    rejectionReason: String(rejectionReason || '').slice(0, 500),
    documents: { ...(current.documents || {}), ...(documents || {}) },
    reviewedAt: ['verified', 'rejected'].includes(status) ? new Date() : current.reviewedAt,
    reviewedBy: ['verified', 'rejected'].includes(status) ? req.user._id : current.reviewedBy,
  };
  await vendor.save();
  res.json({ success: true, message: 'Verification status updated', data: vendor });
});

// @desc    Get all payouts (admin)
// @route   GET /api/admin/payouts
const getPayouts = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, vendorId } = req.query;
  const tenantVendorIds = await vendorIdsForTenant(req);
  const query = { vendor: { $in: tenantVendorIds } };
  if (status) query.status = status;
  if (vendorId) {
    if (!tenantVendorIds.some(id => String(id) === String(vendorId))) { res.status(404); throw new Error('Vendor not found'); }
    query.vendor = vendorId;
  }

  const [payouts, total] = await Promise.all([
    Payout.find(query)
      .populate({ path: 'vendor', select: 'storeName slug owner', populate: { path: 'owner', select: 'name email' } })
      .sort({ requestedAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit)),
    Payout.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: payouts,
    tenantScoped: !isGlobalAdmin(req),
    globalScope: isGlobalAdmin(req),
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) },
  });
});

// @desc    Process payout (mark processing)
// @route   PUT /api/admin/payouts/:id/process
const processPayout = asyncHandler(async (req, res) => {
  const payout = await Payout.findById(req.params.id).populate('vendor', 'tenant storeName');
  if (!payout) { res.status(404); throw new Error('Payout not found'); }
  if (!tenantMatchesRequest(req, payout.vendor?.tenant)) { res.status(404); throw new Error('Payout not found'); }
  if (payout.status !== 'pending') {
    res.status(400); throw new Error('Payout is not in pending status');
  }
  payout.status = 'processing';
  await payout.save();
  await writeAudit({
    tenant: payout.vendor.tenant, vendorId: payout.vendor._id, actorId: req.user._id,
    action: 'payout_process', after: { payoutId: payout._id },
  });
  res.json({ success: true, data: payout });
});

// @desc    Complete payout
// @route   PUT /api/admin/payouts/:id/complete
const completePayout = asyncHandler(async (req, res) => {
  const { utrNumber, transactionRef } = req.body || {};
  // UTR is the bank proof of a manual transfer; completing without it would
  // leave the seller with no way to trace the money.
  if (!utrNumber || !String(utrNumber).trim()) {
    res.status(422);
    throw new Error('UTR number is required to complete a payout');
  }
  const payout = await Payout.findById(req.params.id).populate('vendor', 'tenant storeName walletBalance');
  if (!payout) { res.status(404); throw new Error('Payout not found'); }
  if (!tenantMatchesRequest(req, payout.vendor?.tenant)) { res.status(404); throw new Error('Payout not found'); }
  if (payout.status !== 'processing') {
    res.status(400);
    throw new Error('Only payouts in processing status can be completed');
  }

  payout.status = 'completed';
  payout.utrNumber = String(utrNumber).trim();
  payout.transactionRef = transactionRef || '';
  payout.processedAt = new Date();
  payout.processedBy = req.user._id;
  await payout.save();

  const updatedVendor = await Vendor.findOneAndUpdate(
    { _id: payout.vendor._id, ...tenantScope(req) },
    { $inc: { totalWithdrawn: payout.netAmount, pendingPayout: -payout.amount, walletBalance: -payout.amount } },
    { new: true },
  );

  // Double-entry proof in the seller-visible ledger (preserves the existing
  // accounting direction: complete decrements both wallet and pending lock).
  try {
    await VendorLedger.create({
      vendor: payout.vendor._id,
      type: 'payout_debit',
      amount: payout.amount,
      balanceAfter: updatedVendor ? updatedVendor.walletBalance : payout.vendor.walletBalance - payout.amount,
      reference: { payout: payout._id },
      note: `Payout completed${payout.utrNumber ? ` · UTR ${payout.utrNumber}` : ''}`,
      createdBy: req.user._id,
    });
  } catch (error) {
    console.error('Payout ledger write failed:', error.message);
  }
  await writeAudit({
    tenant: payout.vendor.tenant, vendorId: payout.vendor._id, actorId: req.user._id,
    action: 'payout_complete', note: `UTR ${payout.utrNumber}`, after: { payoutId: payout._id, netAmount: payout.netAmount },
  });

  res.json({ success: true, data: payout });
});

// @desc    Fail payout
// @route   PUT /api/admin/payouts/:id/fail
const failPayout = asyncHandler(async (req, res) => {
  const { failureReason } = req.body;
  const payout = await Payout.findById(req.params.id).populate('vendor', 'tenant storeName');
  if (!payout) { res.status(404); throw new Error('Payout not found'); }
  if (!tenantMatchesRequest(req, payout.vendor?.tenant)) { res.status(404); throw new Error('Payout not found'); }
  payout.status = 'failed';
  payout.failureReason = failureReason || '';
  await payout.save();

  // Release the locked pending payout back so the amount becomes requestable again.
  // Note: requestPayout does NOT decrement walletBalance, so on failure we only need
  // to unlock pendingPayout — walletBalance was never debited.
  await Vendor.findOneAndUpdate({ _id: payout.vendor._id, ...tenantScope(req) }, {
    $inc: { pendingPayout: -payout.amount },
  });
  await writeAudit({
    tenant: payout.vendor.tenant, vendorId: payout.vendor._id, actorId: req.user._id,
    action: 'payout_fail', note: failureReason || '', after: { payoutId: payout._id },
  });

  res.json({ success: true, data: payout });
});

module.exports = {
  getVendors, getVendorDetail, approveVendorGstChange, approveVendor, rejectVendor, requestChanges, suspendVendor, reactivateVendor,
  updateVendorCommission, updateVendorSettings, updateVendorVerification,
  getReasonCodes, getVendorAudit, bulkVendorAction, reverifyVendor,
  getPayouts, processPayout, completePayout, failPayout,
};
