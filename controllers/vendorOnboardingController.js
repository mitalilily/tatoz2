const asyncHandler = require('express-async-handler');
const path = require('path');
const Vendor = require('../models/Vendor');
const Notification = require('../models/Notification');
const { AGREEMENT_VERSION } = require('../constants/vendorLifecycle');
const { writeAudit, notifyVendorOwner } = require('../services/vendorAuditService');
const { saveFileToDisk } = require('../middleware/upload');
const { documentUrl, requiredVendorDocumentSlots, vendorRequiresFssai } = require('../utils/vendorCompliance');

const DOC_SLOTS = ['gstCertificate', 'panCard', 'businessProof', 'bankProof', 'fssaiCertificate'];
const SLA_DAYS = 10;

const slaDueAt = () => new Date(Date.now() + SLA_DAYS * 24 * 60 * 60 * 1000);

// Load the caller's own application regardless of review state. Team members
// are intentionally excluded: onboarding belongs to the store owner.
const loadOwnApplication = async (req) => {
  if (!req.tenant?._id) {
    const error = new Error('Tenant context is required');
    error.statusCode = 400;
    error.publicCode = 'TENANT_REQUIRED';
    throw error;
  }
  const vendor = await Vendor.findOne({ owner: req.user._id, tenant: req.tenant._id });
  if (!vendor) {
    const error = new Error('No seller application found for this account');
    error.statusCode = 404;
    error.publicCode = 'VENDOR_APPLICATION_NOT_FOUND';
    throw error;
  }
  return vendor;
};

const computeChecklist = (vendor) => ({
  profile: Boolean(vendor.storeName && vendor.contactPhone && vendor.address?.city),
  bank: Boolean(vendor.bankDetails?.accountNumber && vendor.bankDetails?.ifscCode),
  tax: Boolean(
    vendor.businessDetails?.panNumber
    && (vendor.businessDetails?.gstRegistrationType !== 'gstin' || vendor.businessDetails?.gstNumber),
  ),
  docs: requiredVendorDocumentSlots(vendor).every((slot) => Boolean(documentUrl(vendor.verification?.documents?.[slot]))),
  agreement: (vendor.agreements || []).length > 0,
});

// @desc    Get own onboarding case: state, SLA, checklist, agreement version
// @route   GET /api/vendor/onboarding/status
const getStatus = asyncHandler(async (req, res) => {
  const vendor = await loadOwnApplication(req);
  // Backfill the case wrapper for applications created before onboarding
  // existed so old sellers see a derived state instead of a blank page.
  if (!vendor.onboarding?.slaDueAt && ['pending', 'changes_requested'].includes(vendor.onboarding?.state || vendor.status)) {
    vendor.onboarding = {
      ...(vendor.onboarding?.toObject?.() || vendor.onboarding || {}),
      state: vendor.onboarding?.state || vendor.status || 'pending',
      slaDueAt: slaDueAt(),
    };
    await vendor.save();
  }
  const checklist = computeChecklist(vendor);
  res.json({
    success: true,
    data: {
      vendorId: vendor._id,
      storeName: vendor.storeName,
      requiresFssai: vendorRequiresFssai(vendor),
      requiredDocumentSlots: requiredVendorDocumentSlots(vendor),
      gstLocked: Boolean(vendor.taxProfile?.gstLockedAt || vendor.businessDetails?.gstNumber),
      slug: vendor.slug,
      status: vendor.status,
      onboarding: vendor.onboarding,
      verification: {
        status: vendor.verification?.status,
        rejectionReason: vendor.verification?.rejectionReason || '',
        documents: Object.fromEntries(DOC_SLOTS.map((slot) => [slot, documentUrl(vendor.verification?.documents?.[slot])])),
      },
      agreements: vendor.agreements || [],
      currentAgreementVersion: AGREEMENT_VERSION,
      checklist,
      slaDays: SLA_DAYS,
    },
  });
});

// @desc    Upload KYC documents for own application (images or PDF)
// @route   POST /api/vendor/onboarding/documents
const uploadDocuments = asyncHandler(async (req, res) => {
  const vendor = await loadOwnApplication(req);
  if (['approved', 'suspended'].includes(vendor.onboarding?.state) || vendor.status === 'active') {
    res.status(400);
    throw new Error('Documents are locked for approved stores. Contact support for re-verification.');
  }
  const files = req.files || {};
  const slotNames = Object.keys(files).filter((key) => DOC_SLOTS.includes(key));
  if (!slotNames.length) {
    res.status(400);
    throw new Error('Attach at least one document (GST, PAN, business proof, bank proof or FSSAI certificate)');
  }
  let expiresAt = {};
  try {
    if (req.body?.expiresAt) expiresAt = JSON.parse(req.body.expiresAt);
  } catch (_) { /* optional metadata; ignore malformed input */ }

  const documents = { ...(vendor.verification?.documents?.toObject?.() || vendor.verification?.documents || {}) };
  if (slotNames.includes('gstCertificate') && documentUrl(documents.gstCertificate)) {
    res.status(400);
    throw new Error('GST certificate is locked after first upload. Contact admin through a support ticket to change GST.');
  }
  // eslint-disable-next-line no-restricted-syntax
  for (const slot of slotNames) {
    const file = Array.isArray(files[slot]) ? files[slot][0] : files[slot];
    if (!file) continue;
    const ext = path.extname(file.originalname || '').toLowerCase().slice(0, 10) || '.pdf';
    const saved = await saveFileToDisk(file.buffer, {
      ext,
      originalname: file.originalname,
      mimetype: file.mimetype,
    });
    documents[slot] = {
      url: saved.url,
      uploadedAt: new Date(),
      expiresAt: expiresAt[slot] ? new Date(expiresAt[slot]) : null,
    };
  }
  vendor.verification = {
    ...(vendor.verification?.toObject?.() || vendor.verification || {}),
    status: 'under_review',
    submittedAt: new Date(),
    documents,
  };
  vendor.onboarding = {
    ...(vendor.onboarding?.toObject?.() || vendor.onboarding || {}),
    state: vendor.status === 'rejected' ? vendor.onboarding?.state : 'pending',
    checklist: computeChecklist(vendor),
  };
  await vendor.save();
  await writeAudit({
    tenant: vendor.tenant, vendorId: vendor._id, actorId: req.user._id,
    action: 'documents_submitted', note: `Slots: ${slotNames.join(', ')}`,
  });
  res.json({ success: true, message: 'Documents submitted for review', data: { documents: Object.fromEntries(DOC_SLOTS.map((slot) => [slot, documentUrl(documents[slot])])) } });
});

// @desc    Accept the seller agreement for own application
// @route   POST /api/vendor/onboarding/agreement/accept
const acceptAgreement = asyncHandler(async (req, res) => {
  const vendor = await loadOwnApplication(req);
  const templateVersion = String(req.body?.templateVersion || AGREEMENT_VERSION).slice(0, 20);
  if ((vendor.agreements || []).some((a) => a.templateVersion === templateVersion)) {
    return res.json({ success: true, message: 'Agreement already accepted', data: { agreements: vendor.agreements } });
  }
  vendor.agreements = [...(vendor.agreements || []), {
    templateVersion,
    signedAt: new Date(),
    ip: (req.ip || '').slice(0, 80),
  }];
  await vendor.save();
  await writeAudit({
    tenant: vendor.tenant, vendorId: vendor._id, actorId: req.user._id,
    action: 'agreement_accepted', note: `Agreement ${templateVersion} signed`,
  });
  res.status(201).json({ success: true, message: 'Agreement accepted', data: { agreements: vendor.agreements } });
});

// @desc    Resubmit a rejected / changes-requested application
// @route   POST /api/vendor/onboarding/resubmit
const resubmit = asyncHandler(async (req, res) => {
  const vendor = await loadOwnApplication(req);
  const state = vendor.onboarding?.state || vendor.status;
  if (!['rejected', 'changes_requested'].includes(state) && vendor.status !== 'rejected') {
    res.status(400);
    throw new Error('Only rejected applications or those with requested changes can be resubmitted');
  }
  vendor.status = 'pending';
  vendor.rejectedAt = undefined;
  vendor.rejectionReason = '';
  vendor.onboarding = {
    ...(vendor.onboarding?.toObject?.() || vendor.onboarding || {}),
    state: 'pending',
    reasonCode: '',
    reasonNote: '',
    slaDueAt: slaDueAt(),
  };
  vendor.verification = {
    ...(vendor.verification?.toObject?.() || vendor.verification || {}),
    status: 'pending',
    rejectionReason: '',
  };
  await vendor.save();
  try {
    await Notification.create({
      tenant: vendor.tenant,
      title: 'Seller application resubmitted',
      message: `${vendor.storeName} resubmitted its seller application for admin review.`,
      type: 'system',
      target: 'role',
      targetRole: 'admin',
      status: 'sent',
      sentAt: new Date(),
      data: { kind: 'vendor_resubmission', vendorId: vendor._id, storeName: vendor.storeName },
    });
  } catch (error) {
    console.error('Seller resubmission notification failed:', error.message);
  }
  await writeAudit({
    tenant: vendor.tenant, vendorId: vendor._id, actorId: req.user._id, action: 'resubmitted',
  });
  await notifyVendorOwner(Notification, {
    tenantId: vendor.tenant, userId: vendor.owner, title: 'Application resubmitted',
    message: `Your seller application for ${vendor.storeName} is back in review.`,
    kind: 'vendor_resubmission', vendorId: vendor._id,
  });
  res.json({ success: true, message: 'Application resubmitted for review', data: { status: vendor.status, onboarding: vendor.onboarding } });
});

module.exports = { getStatus, uploadDocuments, acceptAgreement, resubmit, slaDueAt, DOC_SLOTS };
