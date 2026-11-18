const asyncHandler = require('express-async-handler');
const ReferralCode = require('../models/ReferralCode');
const Product = require('../models/Product');
const { generateUniqueCode, validateCustomCode } = require('../utils/generateReferralCode');
const { trackClick, getAnalytics } = require('../services/referralService');

const scopeFilter = req => (req.tenant ? { tenant: req.tenant._id } : { tenant: { $exists: false } });

// @desc    Create referral code
// @route   POST /api/admin/referral/codes
const createReferralCode = asyncHandler(async (req, res) => {
  const { productId, ownerType, ownerName, ownerId, expiresAt, usageLimit, commissionRate, commissionType, customCode, notes, tags } = req.body;

  let code;
  if (customCode) {
    code = await validateCustomCode(customCode);
  } else {
    const prefix = ownerName ? ownerName.substring(0, 3).toUpperCase() : '';
    code = await generateUniqueCode(prefix, 6);
  }

  const product = await Product.findOne({ _id: productId, ...(req.tenant ? { tenant: req.tenant._id } : {}) }).select('_id');
  if (!product) { res.status(404); throw new Error('Product is not available in this storefront'); }

  const referralCode = await ReferralCode.create({
    tenant: req.tenant?._id,
    code,
    product: productId,
    owner: ownerId || null,
    ownerName,
    ownerType: ownerType || 'campaign',
    expiresAt,
    usageLimit,
    commissionRate: commissionRate || 0,
    commissionType: commissionType || 'percentage',
    notes,
    tags,
  });

  await referralCode.populate('product', 'title thumbnail slug');

  res.status(201).json({ success: true, referralCode });
});

// @desc    Get all referral codes
// @route   GET /api/admin/referral/codes
const getReferralCodes = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, productId, ownerId, search } = req.query;
  const query = { ...scopeFilter(req) };
  if (productId) query.product = productId;
  if (ownerId) query.owner = ownerId;
  if (search) query.code = { $regex: search, $options: 'i' };

  const skip = (Number(page) - 1) * Number(limit);
  const total = await ReferralCode.countDocuments(query);
  const codes = await ReferralCode.find(query)
    .populate('product', 'title thumbnail slug price')
    .populate('owner', 'name email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit));

  res.json({ success: true, codes, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
});

// @desc    Get single referral code
// @route   GET /api/admin/referral/codes/:id
const getReferralCode = asyncHandler(async (req, res) => {
  const code = await ReferralCode.findOne({ _id: req.params.id, ...scopeFilter(req) })
    .populate('product', 'title thumbnail slug price')
    .populate('owner', 'name email');
  if (!code) { res.status(404); throw new Error('Referral code not found'); }
  res.json({ success: true, code });
});

// @desc    Update referral code
// @route   PUT /api/admin/referral/codes/:id
const updateReferralCode = asyncHandler(async (req, res) => {
  const allowed = ['ownerName', 'ownerType', 'expiresAt', 'usageLimit', 'commissionRate', 'commissionType', 'customUrl', 'notes', 'tags', 'isActive'];
  const updates = Object.fromEntries(allowed.filter(key => Object.prototype.hasOwnProperty.call(req.body || {}, key)).map(key => [key, req.body[key]]));
  const code = await ReferralCode.findOneAndUpdate({ _id: req.params.id, ...scopeFilter(req) }, updates, { new: true, runValidators: true })
    .populate('product', 'title thumbnail slug')
    .populate('owner', 'name email');
  if (!code) { res.status(404); throw new Error('Referral code not found'); }
  res.json({ success: true, code });
});

// @desc    Delete referral code
// @route   DELETE /api/admin/referral/codes/:id
const deleteReferralCode = asyncHandler(async (req, res) => {
  const code = await ReferralCode.findOne({ _id: req.params.id, ...scopeFilter(req) });
  if (!code) { res.status(404); throw new Error('Referral code not found'); }
  await code.deleteOne();
  res.json({ success: true, message: 'Referral code deleted' });
});

// @desc    Track click (public)
// @route   POST /api/referral/track
const trackReferralClick = asyncHandler(async (req, res) => {
  const { code, landingPage } = req.body;
  if (!code) { res.status(400); throw new Error('Code is required'); }

  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const sessionId = req.cookies?.sessionId || req.headers['x-session-id'] || `anon_${Date.now()}`;

  const result = await trackClick({
    code,
    ip,
    userAgent: req.headers['user-agent'],
    sessionId,
    userId: req.user?._id,
    referrer: req.headers.referer,
    landingPage,
    tenant: req.tenant,
  });

  if (!result) {
    return res.json({ success: true, valid: false, message: 'Invalid or expired referral code' });
  }

  // Set referral cookie (30 days)
  res.cookie('ref_code', code.toUpperCase(), {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    httpOnly: false,
    sameSite: 'lax',
  });

  res.json({ success: true, valid: true, message: 'Click tracked' });
});

// @desc    Get analytics dashboard
// @route   GET /api/admin/referral/analytics
const getReferralAnalytics = asyncHandler(async (req, res) => {
  const { startDate, endDate, productId } = req.query;
  const data = await getAnalytics({ startDate, endDate, productId, tenant: req.tenant });
  res.json({ success: true, ...data });
});

// @desc    Export analytics CSV
// @route   GET /api/admin/referral/analytics/export
const exportAnalytics = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  const { codes } = await getAnalytics({ startDate, endDate, limit: 1000, tenant: req.tenant });

  const csv = [
    'Code,Product,Owner,Clicks,Conversions,Revenue,Conversion Rate,Created At',
    ...codes.map(c =>
      `${c.code},"${c.product?.title || 'N/A'}","${c.ownerName || 'N/A'}",${c.stats.clicks},${c.stats.conversions},${c.stats.revenue.toFixed(2)},${c.stats.conversionRate.toFixed(2)}%,${c.createdAt.toISOString()}`
    )
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=referral-analytics-${Date.now()}.csv`);
  res.send(csv);
});

module.exports = { createReferralCode, getReferralCodes, getReferralCode, updateReferralCode, deleteReferralCode, trackReferralClick, getReferralAnalytics, exportAnalytics };
