const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const CustomerWallet = require('../models/CustomerWallet');
const { parsePagination } = require('../utils/pagination');
const { isUserInTenant } = require('../services/customerScopeService');
const { getCustomerScopeIds, resolveCustomerAudience, audienceError } = require('../services/adminCustomerAudienceService');
const walletService = require('../services/walletService');

const tenantId = req => req.tenant?._id;
const walletUser = req => req.user?._id;

const requireCustomerTenant = async req => {
  if (!req.tenant?._id) {
    const error = new Error('Tenant context is required');
    error.statusCode = 400;
    error.publicCode = 'WALLET_TENANT_REQUIRED';
    throw error;
  }
  if (req.user?.role === 'customer' && !(await isUserInTenant({ tenant: req.tenant._id, userId: req.user._id }))) {
    const error = new Error('Customer is not available in this tenant');
    error.statusCode = 403;
    error.publicCode = 'WALLET_TENANT_ACCESS_REQUIRED';
    throw error;
  }
};

const getMyWallet = asyncHandler(async (req, res) => {
  await requireCustomerTenant(req);
  const wallet = await walletService.getWallet({ tenant: tenantId(req), user: walletUser(req) });
  const { page, limit } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const ledger = await walletService.listTransactions({ tenant: tenantId(req), user: walletUser(req), page, limit });
  res.json({ success: true, wallet, ...ledger });
});

const getWallets = asyncHandler(async (req, res) => {
  if (!req.tenant?._id) { res.status(400); throw new Error('Tenant context is required'); }
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const userIds = await getCustomerScopeIds({ tenant: req.tenant._id, segmentId: req.query.segmentId });
  const query = { role: 'customer', _id: { $in: userIds || [] } };
  if (req.query.search) {
    const escaped = String(req.query.search).slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [{ name: { $regex: escaped, $options: 'i' } }, { email: { $regex: escaped, $options: 'i' } }, { phone: { $regex: escaped, $options: 'i' } }];
  }
  const [total, users] = await Promise.all([
    User.countDocuments(query),
    User.find(query).select('name email phone isActive').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
  ]);
  const wallets = await CustomerWallet.find({ tenant: req.tenant._id, user: { $in: users.map(user => user._id) } }).lean();
  const byUser = new Map(wallets.map(wallet => [String(wallet.user), wallet]));
  res.json({
    success: true,
    wallets: users.map(user => {
      const wallet = byUser.get(String(user._id)) || { cashBalance: 0, promotionalBalance: 0, currency: 'INR', status: 'active' };
      return { user, wallet: { ...wallet, totalBalance: Number(wallet.cashBalance || 0) + Number(wallet.promotionalBalance || 0) } };
    }),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

const getWalletForCustomer = asyncHandler(async (req, res) => {
  if (!req.tenant?._id) { res.status(400); throw new Error('Tenant context is required'); }
  if (!(await isUserInTenant({ tenant: req.tenant._id, userId: req.params.userId }))) { res.status(404); throw new Error('Customer is not available in this tenant'); }
  const user = await User.findOne({ _id: req.params.userId, role: 'customer' }).select('name email phone isActive').lean();
  if (!user) { res.status(404); throw new Error('Customer not found'); }
  const wallet = await walletService.getWallet({ tenant: req.tenant._id, user: user._id });
  const ledger = await walletService.listTransactions({ tenant: req.tenant._id, user: user._id, page: req.query.page, limit: req.query.limit });
  res.json({ success: true, user, wallet, ...ledger });
});

const adjustWallet = asyncHandler(async (req, res) => {
  if (!req.tenant?._id) { res.status(400); throw new Error('Tenant context is required'); }
  const userId = req.params.userId;
  if (!(await isUserInTenant({ tenant: req.tenant._id, userId }))) { res.status(404); throw new Error('Customer is not available in this tenant'); }
  const { direction, amount, bucket = 'cash', source = 'manual', note, expiresAt, referenceType, referenceId } = req.body || {};
  const idempotencyKey = req.headers['idempotency-key'] || req.body?.idempotencyKey;
  if (!idempotencyKey) {
    res.status(400);
    const error = new Error('Idempotency-Key is required for wallet adjustments');
    error.publicCode = 'WALLET_IDEMPOTENCY_REQUIRED';
    throw error;
  }
  const mutation = direction === 'debit' ? walletService.debitWallet : direction === 'credit' ? walletService.creditWallet : null;
  if (!mutation) { res.status(400); throw new Error('Wallet direction must be credit or debit'); }
  const result = await mutation({ tenant: req.tenant._id, user: userId, amount, bucket, source, note, expiresAt, referenceType, referenceId, idempotencyKey, createdBy: req.user._id });
  res.status(result.idempotent ? 200 : 201).json({ success: true, idempotent: result.idempotent, wallet: walletService.getWallet ? { _id: result.wallet._id, currency: result.wallet.currency, cashBalance: result.wallet.cashBalance, promotionalBalance: result.wallet.promotionalBalance, totalBalance: Number(result.wallet.cashBalance || 0) + Number(result.wallet.promotionalBalance || 0), status: result.wallet.status } : result.wallet, transaction: result.transaction });
});

const adjustWalletsBulk = asyncHandler(async (req, res) => {
  if (!req.tenant?._id) { res.status(400); throw new Error('Tenant context is required'); }
  const operationKey = String(req.headers['idempotency-key'] || req.body?.idempotencyKey || '').trim();
  if (!operationKey) { res.status(400); throw audienceError('Idempotency-Key is required for bulk wallet adjustments', 400, 'WALLET_IDEMPOTENCY_REQUIRED'); }
  const direction = req.body?.direction;
  const mutation = direction === 'debit' ? walletService.debitWallet : direction === 'credit' ? walletService.creditWallet : null;
  if (!mutation) { res.status(400); throw new Error('Wallet direction must be credit or debit'); }
  const audience = await resolveCustomerAudience({
    tenant: req.tenant._id,
    userIds: req.body?.userIds,
    segmentId: req.body?.segmentId,
    segmentIds: req.body?.segmentIds,
  });
  const results = [];
  for (const user of audience.users) {
    try {
      const result = await mutation({
        tenant: req.tenant._id,
        user: user._id,
        amount: req.body?.amount,
        bucket: req.body?.bucket || 'cash',
        source: req.body?.source || 'manual',
        note: req.body?.note,
        expiresAt: req.body?.expiresAt,
        referenceType: 'bulk_admin_adjustment',
        referenceId: operationKey,
        idempotencyKey: `${operationKey}:${user._id}`,
        createdBy: req.user._id,
      });
      results.push({ userId: user._id, name: user.name, email: user.email, success: true, idempotent: result.idempotent, totalBalance: Number(result.wallet.cashBalance || 0) + Number(result.wallet.promotionalBalance || 0) });
    } catch (error) {
      results.push({ userId: user._id, name: user.name, email: user.email, success: false, code: error.publicCode, message: error.message || 'Wallet adjustment failed' });
    }
  }
  const succeeded = results.filter(result => result.success).length;
  const failed = results.length - succeeded;
  res.status(200).json({ success: failed === 0, partial: succeeded > 0 && failed > 0, audience: { count: results.length, segmentIds: audience.segmentIds }, succeeded, failed, results });
});

module.exports = { getMyWallet, getWallets, getWalletForCustomer, adjustWallet, adjustWalletsBulk };
