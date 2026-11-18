const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const LoyaltyProgram = require('../models/LoyaltyProgram');
const LoyaltyAccount = require('../models/LoyaltyAccount');
const { parsePagination } = require('../utils/pagination');
const { isUserInTenant } = require('../services/customerScopeService');
const { getCustomerScopeIds, resolveCustomerAudience, audienceError } = require('../services/adminCustomerAudienceService');
const loyaltyService = require('../services/loyaltyService');

const requireTenant = req => {
  if (!req.tenant?._id) {
    const error = new Error('Tenant context is required');
    error.statusCode = 400;
    error.publicCode = 'LOYALTY_TENANT_REQUIRED';
    throw error;
  }
  return req.tenant._id;
};

const requireCustomerTenant = async req => {
  const tenant = requireTenant(req);
  if (req.user?.role === 'customer' && !(await isUserInTenant({ tenant, userId: req.user._id }))) {
    const error = new Error('Customer is not available in this tenant');
    error.statusCode = 403;
    error.publicCode = 'LOYALTY_CUSTOMER_ACCESS_REQUIRED';
    throw error;
  }
  return tenant;
};

const safeProgram = program => ({
  _id: program?._id,
  tenant: program?.tenant,
  enabled: Boolean(program?.enabled),
  earnPointsPerCurrency: Number(program?.earnPointsPerCurrency || 0),
  redeemPointsPerCurrency: Number(program?.redeemPointsPerCurrency || 1),
  minimumRedeemPoints: Number(program?.minimumRedeemPoints || 0),
  maxRedeemPercent: Number(program?.maxRedeemPercent || 0),
  expiryDays: Number(program?.expiryDays || 0),
  tiers: (program?.tiers || []).map(tier => ({ id: tier.id, label: tier.label, minLifetimePoints: tier.minLifetimePoints, earnMultiplier: tier.earnMultiplier })),
  updatedAt: program?.updatedAt || null,
});

const getMyLoyalty = asyncHandler(async (req, res) => {
  const tenant = await requireCustomerTenant(req);
  const [program, account, ledger] = await Promise.all([
    loyaltyService.getProgram({ tenant }),
    loyaltyService.getAccount({ tenant, user: req.user._id }),
    loyaltyService.listTransactions({ tenant, user: req.user._id, page: req.query.page, limit: req.query.limit }),
  ]);
  res.json({ success: true, program: safeProgram(program), account, ...ledger });
});

const getProgram = asyncHandler(async (req, res) => {
  const tenant = requireTenant(req);
  const program = await loyaltyService.getProgram({ tenant });
  res.json({ success: true, program: safeProgram(program) });
});

const updateProgram = asyncHandler(async (req, res) => {
  const tenant = requireTenant(req);
  const current = await loyaltyService.getProgram({ tenant });
  const body = req.body || {};
  const next = {};
  if (body.enabled !== undefined) next.enabled = Boolean(body.enabled);
  for (const key of ['earnPointsPerCurrency', 'redeemPointsPerCurrency', 'minimumRedeemPoints', 'maxRedeemPercent', 'expiryDays']) {
    if (body[key] !== undefined) {
      const value = Number(body[key]);
      if (!Number.isFinite(value) || value < 0) { res.status(400); throw new Error(`Invalid loyalty setting: ${key}`); }
      next[key] = value;
    }
  }
  if (next.redeemPointsPerCurrency !== undefined && next.redeemPointsPerCurrency < 1) { res.status(400); throw new Error('redeemPointsPerCurrency must be at least 1'); }
  if (next.maxRedeemPercent !== undefined && next.maxRedeemPercent > 100) { res.status(400); throw new Error('maxRedeemPercent cannot exceed 100'); }
  if (next.expiryDays !== undefined && next.expiryDays > 3650) { res.status(400); throw new Error('expiryDays cannot exceed 3650'); }
  if (body.tiers !== undefined) {
    if (!Array.isArray(body.tiers) || body.tiers.length < 1 || body.tiers.length > 4) { res.status(400); throw new Error('Loyalty tiers must contain between 1 and 4 entries'); }
    const ids = new Set();
    next.tiers = body.tiers.map(tier => {
      const id = String(tier.id || '').trim();
      const label = String(tier.label || '').trim();
      const minLifetimePoints = Number(tier.minLifetimePoints);
      const earnMultiplier = Number(tier.earnMultiplier);
      if (!['bronze', 'silver', 'gold', 'platinum'].includes(id) || ids.has(id) || !label || !Number.isInteger(minLifetimePoints) || minLifetimePoints < 0 || !Number.isFinite(earnMultiplier) || earnMultiplier <= 0 || earnMultiplier > 10) {
        res.status(400); throw new Error('Invalid loyalty tier configuration');
      }
      ids.add(id);
      return { id, label: label.slice(0, 40), minLifetimePoints, earnMultiplier };
    });
    if (next.tiers[0].minLifetimePoints !== 0) { res.status(400); throw new Error('The first loyalty tier must start at 0 points'); }
  }
  Object.assign(current, next, { updatedBy: req.user._id });
  await current.save();
  res.json({ success: true, program: safeProgram(current) });
});

const getAccounts = asyncHandler(async (req, res) => {
  const tenant = requireTenant(req);
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const userIds = await getCustomerScopeIds({ tenant, segmentId: req.query.segmentId });
  const query = { role: 'customer', _id: { $in: userIds || [] } };
  if (req.query.search) {
    const escaped = String(req.query.search).slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [{ name: { $regex: escaped, $options: 'i' } }, { email: { $regex: escaped, $options: 'i' } }, { phone: { $regex: escaped, $options: 'i' } }];
  }
  const [total, users, accounts] = await Promise.all([
    User.countDocuments(query),
    User.find(query).select('name email phone isActive').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    LoyaltyAccount.find({ tenant }).lean(),
  ]);
  const byUser = new Map(accounts.map(account => [String(account.user), account]));
  res.json({
    success: true,
    accounts: users.map(user => ({ user, account: byUser.get(String(user._id)) || { tenant, user: user._id, pointsBalance: 0, lifetimeEarned: 0, lifetimeRedeemed: 0, tier: 'bronze', status: 'active' } })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

const adjustAccount = asyncHandler(async (req, res) => {
  const tenant = requireTenant(req);
  const user = req.params.userId;
  if (!(await isUserInTenant({ tenant, userId: user }))) { res.status(404); throw new Error('Customer is not available in this tenant'); }
  const idempotencyKey = req.headers?.['idempotency-key'] || req.body?.idempotencyKey;
  if (!idempotencyKey) { res.status(400); const error = new Error('Idempotency-Key is required for loyalty adjustments'); error.publicCode = 'LOYALTY_IDEMPOTENCY_REQUIRED'; throw error; }
  const direction = req.body?.direction;
  const mutation = direction === 'debit' ? loyaltyService.redeemPoints : direction === 'credit' ? loyaltyService.earnPoints : null;
  if (!mutation) { res.status(400); throw new Error('Loyalty direction must be credit or debit'); }
  const result = await mutation({ tenant, user, points: req.body?.points, source: 'manual', referenceType: 'admin_adjustment', idempotencyKey, note: req.body?.note, expiresAt: req.body?.expiresAt, createdBy: req.user._id });
  res.status(result.idempotent ? 200 : 201).json({ success: true, idempotent: result.idempotent, account: result.account, transaction: result.transaction });
});

const adjustAccountsBulk = asyncHandler(async (req, res) => {
  const tenant = requireTenant(req);
  const operationKey = String(req.headers?.['idempotency-key'] || req.body?.idempotencyKey || '').trim();
  if (!operationKey) { res.status(400); throw audienceError('Idempotency-Key is required for bulk loyalty adjustments', 400, 'LOYALTY_IDEMPOTENCY_REQUIRED'); }
  const direction = req.body?.direction;
  const mutation = direction === 'debit' ? loyaltyService.redeemPoints : direction === 'credit' ? loyaltyService.earnPoints : null;
  if (!mutation) { res.status(400); throw new Error('Loyalty direction must be credit or debit'); }
  const points = Number(req.body?.points);
  if (!Number.isSafeInteger(points) || points <= 0) { res.status(400); throw new Error('Points must be a positive whole number'); }
  const audience = await resolveCustomerAudience({
    tenant,
    userIds: req.body?.userIds,
    segmentId: req.body?.segmentId,
    segmentIds: req.body?.segmentIds,
  });
  const results = [];
  for (const user of audience.users) {
    try {
      const result = await mutation({
        tenant,
        user: user._id,
        points,
        source: 'manual',
        referenceType: 'bulk_admin_adjustment',
        referenceId: operationKey,
        idempotencyKey: `${operationKey}:${user._id}`,
        note: req.body?.note,
        createdBy: req.user._id,
        expiresAt: req.body?.expiresAt,
      });
      results.push({ userId: user._id, name: user.name, email: user.email, success: true, idempotent: result.idempotent, pointsBalance: result.account.pointsBalance });
    } catch (error) {
      results.push({ userId: user._id, name: user.name, email: user.email, success: false, code: error.publicCode, message: error.message || 'Loyalty adjustment failed' });
    }
  }
  const succeeded = results.filter(result => result.success).length;
  const failed = results.length - succeeded;
  res.status(200).json({ success: failed === 0, partial: succeeded > 0 && failed > 0, audience: { count: results.length, segmentIds: audience.segmentIds }, succeeded, failed, results });
});

module.exports = { getMyLoyalty, getProgram, updateProgram, getAccounts, adjustAccount, adjustAccountsBulk };
