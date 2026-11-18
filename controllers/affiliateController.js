const asyncHandler = require('express-async-handler');
const crypto = require('crypto');
const AffiliateProgram = require('../models/AffiliateProgram');
const AffiliateProfile = require('../models/AffiliateProfile');
const AffiliatePayout = require('../models/AffiliatePayout');
const User = require('../models/User');
const affiliateService = require('../services/affiliateService');
const { parsePagination } = require('../utils/pagination');

const tenantId = req => req.tenant?._id;
const mask = value => {
  const string = String(value || '');
  return string.length > 4 ? `****${string.slice(-4)}` : (string ? '****' : '');
};
const safePayout = payout => ({
  ...payout,
  payoutSnapshot: payout.payoutSnapshot ? {
    ...payout.payoutSnapshot,
    accountNumber: mask(payout.payoutSnapshot.accountNumber),
  } : {},
});

const ensureAffiliate = async (req, { allowPending = false } = {}) => {
  const profile = await AffiliateProfile.findOne({ tenant: tenantId(req), user: req.user._id });
  if (!profile && req.user.role !== 'affiliate') {
    const error = new Error('Affiliate account is not available for this storefront');
    error.statusCode = 403;
    throw error;
  }
  if (profile && !allowPending && profile.status !== 'approved') {
    const error = new Error(`Affiliate account is ${profile.status}; approval is required`);
    error.statusCode = 403;
    error.publicCode = 'AFFILIATE_APPROVAL_REQUIRED';
    throw error;
  }
  return profile;
};

// @route POST /api/affiliate/apply
const apply = asyncHandler(async (req, res) => {
  if (!req.tenant) { res.status(400); throw new Error('Tenant context is required'); }
  const existing = await AffiliateProfile.findOne({ tenant: tenantId(req), user: req.user._id });
  if (existing) return res.json({ success: true, profile: existing, idempotent: true });
  const profile = await AffiliateProfile.create({
    tenant: tenantId(req),
    user: req.user._id,
    applicationNote: String(req.body?.applicationNote || '').trim(),
    payoutDetails: req.body?.payoutDetails || {},
  });
  res.status(201).json({ success: true, profile, idempotent: false });
});

// @route GET /api/affiliate/me
const getMe = asyncHandler(async (req, res) => {
  const profile = await ensureAffiliate(req, { allowPending: true });
  if (!profile || profile.status !== 'approved') return res.json({ success: true, profile, dashboard: null });
  const dashboard = await affiliateService.getDashboard({ tenant: tenantId(req), affiliate: req.user._id });
  dashboard.payouts = dashboard.payouts.map(safePayout);
  res.json({ success: true, profile, dashboard });
});

// @route POST /api/affiliate/payouts
const requestPayout = asyncHandler(async (req, res) => {
  await ensureAffiliate(req);
  const result = await affiliateService.requestPayout({
    tenant: tenantId(req), affiliate: req.user._id, amount: req.body?.amount,
    payoutMethod: req.body?.payoutMethod, idempotencyKey: req.headers['idempotency-key'] || req.body?.idempotencyKey,
  });
  res.status(result.idempotent ? 200 : 201).json({ success: true, payout: safePayout(result.payout), idempotent: result.idempotent });
});

// @route GET /api/affiliate/payouts
const getMyPayouts = asyncHandler(async (req, res) => {
  await ensureAffiliate(req, { allowPending: true });
  const payouts = await AffiliatePayout.find({ tenant: tenantId(req), affiliate: req.user._id }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ success: true, payouts: payouts.map(safePayout) });
});

// @route GET/PUT /api/admin/affiliate/program
const getProgram = asyncHandler(async (req, res) => {
  const program = await affiliateService.getProgram(tenantId(req));
  res.json({ success: true, program });
});

const updateProgram = asyncHandler(async (req, res) => {
  const allowed = ['enabled', 'defaultCommissionRate', 'minimumPayout', 'payoutCurrency', 'requireApproval', 'payoutMethods', 'terms'];
  const updates = Object.fromEntries(allowed.filter(key => Object.prototype.hasOwnProperty.call(req.body || {}, key)).map(key => [key, req.body[key]]));
  if (updates.payoutMethods && (!Array.isArray(updates.payoutMethods) || updates.payoutMethods.some(method => !['bank_transfer', 'upi', 'wallet', 'other'].includes(method)))) {
    res.status(400); throw new Error('Affiliate payout methods are invalid');
  }
  const program = await AffiliateProgram.findOneAndUpdate({ tenant: tenantId(req) }, updates, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true });
  res.json({ success: true, program });
});

// @route GET /api/admin/affiliate/affiliates
const listAffiliates = asyncHandler(async (req, res) => {
  const affiliates = await affiliateService.listAdminAffiliates({ tenant: tenantId(req), status: req.query?.status });
  res.json({ success: true, affiliates });
});

// @route PUT /api/admin/affiliate/affiliates/:id/status
const updateAffiliateStatus = asyncHandler(async (req, res) => {
  const profile = await affiliateService.updateProfileStatus({ tenant: tenantId(req), profileId: req.params.id, status: req.body?.status, adminNote: req.body?.adminNote, actorId: req.user._id });
  res.json({ success: true, profile });
});

// @route GET /api/admin/affiliate/payouts
const listPayouts = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const filter = { tenant: tenantId(req) };
  if (req.query?.status) filter.status = req.query.status;
  const [payouts, total] = await Promise.all([
    AffiliatePayout.find(filter).populate('affiliate', 'name email phone affiliateCode').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AffiliatePayout.countDocuments(filter),
  ]);
  res.json({ success: true, payouts: payouts.map(safePayout), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const processPayout = asyncHandler(async (req, res) => {
  const result = await affiliateService.transitionPayout({ tenant: tenantId(req), payoutId: req.params.id, to: 'processing', actorId: req.user._id, note: req.body?.note });
  res.json({ success: true, payout: safePayout(result.payout.toObject ? result.payout.toObject() : result.payout), idempotent: result.idempotent });
});

const completePayout = asyncHandler(async (req, res) => {
  const result = await affiliateService.transitionPayout({ tenant: tenantId(req), payoutId: req.params.id, to: 'paid', actorId: req.user._id, transactionRef: req.body?.transactionRef, note: req.body?.note });
  res.json({ success: true, payout: safePayout(result.payout.toObject ? result.payout.toObject() : result.payout), idempotent: result.idempotent });
});

const rejectPayout = asyncHandler(async (req, res) => {
  const result = await affiliateService.transitionPayout({ tenant: tenantId(req), payoutId: req.params.id, to: 'rejected', actorId: req.user._id, note: req.body?.note });
  res.json({ success: true, payout: safePayout(result.payout.toObject ? result.payout.toObject() : result.payout), idempotent: result.idempotent });
});

const adjustBalance = asyncHandler(async (req, res) => {
  const profile = await AffiliateProfile.findOne({ _id: req.body?.profileId, tenant: tenantId(req) });
  if (!profile) { res.status(404); throw new Error('Affiliate profile not found'); }
  const amount = Number(req.body?.amount);
  const direction = req.body?.direction === 'debit' ? 'debit' : 'credit';
  const result = await affiliateService.recordLedgerEntry({
    tenant: tenantId(req), affiliate: profile.user, type: direction === 'credit' ? 'adjustment_credit' : 'adjustment_debit',
    direction, amount, idempotencyKey: `admin-adjust:${crypto.randomUUID()}`, note: req.body?.note || 'Admin balance adjustment', createdBy: req.user._id,
  });
  res.status(201).json({ success: true, entry: result.entry });
});

module.exports = { apply, getMe, requestPayout, getMyPayouts, getProgram, updateProgram, listAffiliates, updateAffiliateStatus, listPayouts, processPayout, completePayout, rejectPayout, adjustBalance };
