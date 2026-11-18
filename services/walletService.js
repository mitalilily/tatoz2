const mongoose = require('mongoose');
const CustomerWallet = require('../models/CustomerWallet');
const WalletTransaction = require('../models/WalletTransaction');

const VALID_BUCKETS = new Set(['cash', 'promotional']);
const VALID_SOURCES = new Set(['manual', 'promotional', 'cashback', 'refund', 'loyalty', 'gift_card', 'order_payment', 'order_reversal', 'expiry']);

const idFor = value => value?._id || value || null;
const makeError = (message, statusCode = 400, publicCode = 'WALLET_ERROR') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
};
const tenantFilter = tenant => {
  const tenantId = idFor(tenant);
  if (!tenantId || !mongoose.isValidObjectId(tenantId)) throw makeError('A valid tenant is required', 400, 'WALLET_TENANT_REQUIRED');
  return tenantId;
};
const userIdOf = user => {
  const userId = idFor(user);
  if (!userId || !mongoose.isValidObjectId(userId)) throw makeError('A valid customer is required', 400, 'WALLET_CUSTOMER_REQUIRED');
  return userId;
};
const amountOf = amount => {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0 || value > 100000000) throw makeError('Wallet amount must be greater than 0', 400, 'WALLET_AMOUNT_INVALID');
  return Math.round(value * 100) / 100;
};
const normalizedKey = key => {
  const value = String(key || '').trim();
  return value ? value.slice(0, 200) : null;
};
const round = value => Math.round(Number(value || 0) * 100) / 100;
const queryWithSession = (query, session) => (session ? query.session(session) : query);

const ensureWallet = async ({ tenant, user, session }) => {
  const tenantId = tenantFilter(tenant);
  const userId = userIdOf(user);
  const query = CustomerWallet.findOneAndUpdate(
    { tenant: tenantId, user: userId },
    { $setOnInsert: { tenant: tenantId, user: userId, currency: 'INR', cashBalance: 0, promotionalBalance: 0, status: 'active' } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  if (session) query.session(session);
  return query;
};

const snapshot = wallet => ({
  _id: wallet._id,
  tenant: wallet.tenant,
  user: wallet.user,
  currency: wallet.currency || 'INR',
  cashBalance: round(wallet.cashBalance),
  promotionalBalance: round(wallet.promotionalBalance),
  totalBalance: round(Number(wallet.cashBalance || 0) + Number(wallet.promotionalBalance || 0)),
  status: wallet.status,
  lastTransactionAt: wallet.lastTransactionAt || null,
});

const expirePromotionalCredits = async ({ tenant, user, session, now = new Date() }) => {
  const tenantId = tenantFilter(tenant);
  const userId = userIdOf(user);
  const wallet = await ensureWallet({ tenant: tenantId, user: userId, session });
  const query = WalletTransaction.find({
    tenant: tenantId,
    user: userId,
    direction: 'credit',
    bucket: 'promotional',
    remainingAmount: { $gt: 0 },
    expiresAt: { $ne: null, $lte: now },
  }).sort({ expiresAt: 1, createdAt: 1 });
  const credits = await queryWithSession(query, session);

  for (const credit of credits) {
    const amount = round(credit.remainingAmount);
    if (amount <= 0) continue;
    const updatedWallet = await CustomerWallet.findOneAndUpdate(
      { _id: wallet._id, promotionalBalance: { $gte: amount } },
      { $inc: { promotionalBalance: -amount }, $set: { lastTransactionAt: now } },
      { new: true, session },
    );
    if (!updatedWallet) throw makeError('Wallet balance changed while expiring promotional credit', 409, 'WALLET_CONCURRENT_UPDATE');
    credit.remainingAmount = 0;
    await credit.save({ session });
    await WalletTransaction.create([{
      tenant: tenantId,
      user: userId,
      wallet: wallet._id,
      direction: 'debit',
      bucket: 'promotional',
      amount,
      balanceAfter: round(updatedWallet.cashBalance + updatedWallet.promotionalBalance),
      cashBalanceAfter: round(updatedWallet.cashBalance),
      promotionalBalanceAfter: round(updatedWallet.promotionalBalance),
      source: 'expiry',
      referenceType: 'wallet_credit',
      referenceId: String(credit._id),
      idempotencyKey: `wallet-expiry:${credit._id}`,
      note: 'Promotional wallet credit expired',
      remainingAmount: 0,
    }], { session });
  }
  return ensureWallet({ tenant: tenantId, user: userId, session });
};

const withWalletTransaction = async (callback, externalSession) => {
  if (externalSession) return callback(externalSession);
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => { result = await callback(session); });
    return result;
  } finally {
    await session.endSession();
  }
};

const findIdempotent = async ({ tenant, user, idempotencyKey, session }) => {
  if (!idempotencyKey) return null;
  const query = WalletTransaction.findOne({ tenant: tenantFilter(tenant), user: userIdOf(user), idempotencyKey });
  return queryWithSession(query, session);
};

const mutate = async ({ tenant, user, direction, bucket, amount, source, referenceType, referenceId, idempotencyKey, note, createdBy, expiresAt, session }) => {
  const tenantId = tenantFilter(tenant);
  const userId = userIdOf(user);
  if (!['credit', 'debit'].includes(direction)) throw makeError('Invalid wallet transaction direction', 400, 'WALLET_DIRECTION_INVALID');
  if (!VALID_BUCKETS.has(bucket)) throw makeError('Invalid wallet balance bucket', 400, 'WALLET_BUCKET_INVALID');
  if (!VALID_SOURCES.has(source)) throw makeError('Invalid wallet transaction source', 400, 'WALLET_SOURCE_INVALID');
  const value = amountOf(amount);
  const key = normalizedKey(idempotencyKey);
  const existing = await findIdempotent({ tenant: tenantId, user: userId, idempotencyKey: key, session });
  if (existing) return { transaction: existing, wallet: await ensureWallet({ tenant: tenantId, user: userId, session }), idempotent: true };
  if (direction === 'credit' && bucket === 'cash' && expiresAt) throw makeError('Cash wallet credits cannot expire', 400, 'WALLET_EXPIRY_INVALID');
  if (expiresAt && Number.isNaN(new Date(expiresAt).getTime())) throw makeError('Invalid wallet expiry date', 400, 'WALLET_EXPIRY_INVALID');
  if (expiresAt && new Date(expiresAt) <= new Date()) throw makeError('Wallet expiry must be in the future', 400, 'WALLET_EXPIRY_INVALID');

  await expirePromotionalCredits({ tenant: tenantId, user: userId, session });
  const wallet = await ensureWallet({ tenant: tenantId, user: userId, session });
  if (wallet.status !== 'active') throw makeError('Wallet is blocked', 403, 'WALLET_BLOCKED');
  const balanceField = bucket === 'promotional' ? 'promotionalBalance' : 'cashBalance';
  const now = new Date();
  const update = direction === 'credit' ? { $inc: { [balanceField]: value }, $set: { lastTransactionAt: now } } : { $inc: { [balanceField]: -value }, $set: { lastTransactionAt: now } };
  const filter = direction === 'debit' ? { _id: wallet._id, [balanceField]: { $gte: value }, status: 'active' } : { _id: wallet._id, status: 'active' };
  const updatedWallet = await CustomerWallet.findOneAndUpdate(filter, update, { new: true, session });
  if (!updatedWallet) throw makeError('Insufficient wallet balance', 409, 'WALLET_INSUFFICIENT_BALANCE');

  const consumes = [];
  if (direction === 'debit' && bucket === 'promotional') {
    let left = value;
    const creditQuery = WalletTransaction.find({ tenant: tenantId, user: userId, direction: 'credit', bucket, remainingAmount: { $gt: 0 }, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }).sort({ expiresAt: 1, createdAt: 1 });
    const credits = await queryWithSession(creditQuery, session);
    for (const credit of credits) {
      if (left <= 0) break;
      const available = round(credit.remainingAmount);
      const consumed = Math.min(left, available);
      if (consumed <= 0) continue;
      credit.remainingAmount = round(available - consumed);
      await credit.save({ session });
      consumes.push({ transaction: credit._id, amount: consumed });
      left = round(left - consumed);
    }
    if (left > 0) throw makeError('Promotional wallet ledger is unavailable for this debit', 409, 'WALLET_LEDGER_CONFLICT');
  }

  const transaction = (await WalletTransaction.create([{
    tenant: tenantId,
    user: userId,
    wallet: updatedWallet._id,
    direction,
    bucket,
    amount: value,
    balanceAfter: round(updatedWallet.cashBalance + updatedWallet.promotionalBalance),
    cashBalanceAfter: round(updatedWallet.cashBalance),
    promotionalBalanceAfter: round(updatedWallet.promotionalBalance),
    source,
    referenceType: referenceType ? String(referenceType).slice(0, 80) : undefined,
    referenceId: referenceId ? String(referenceId).slice(0, 160) : undefined,
    idempotencyKey: key || undefined,
    note: note ? String(note).slice(0, 500) : undefined,
    createdBy,
    expiresAt: direction === 'credit' && bucket === 'promotional' && expiresAt ? new Date(expiresAt) : undefined,
    remainingAmount: direction === 'credit' ? value : 0,
    consumes,
  }], { session }))[0];
  return { transaction, wallet: updatedWallet, idempotent: false };
};

const creditWallet = args => withWalletTransaction(session => mutate({ ...args, direction: 'credit', session }), args.session);
const debitWallet = args => withWalletTransaction(session => mutate({ ...args, direction: 'debit', session }), args.session);

// Apply a server-authoritative wallet amount across promotional and cash
// buckets. Promotional credit is consumed first (FIFO inside mutate), then
// cash. Both ledger entries share the caller's transaction, so a shortage in
// either bucket rolls back the complete debit.
const debitWalletTotal = ({ tenant, user, amount, source = 'order_payment', referenceType, referenceId, idempotencyKey, note, createdBy, session } = {}) => withWalletTransaction(async currentSession => {
  const tenantId = tenantFilter(tenant);
  const userId = userIdOf(user);
  const value = amountOf(amount);
  const key = normalizedKey(idempotencyKey);
  if (key) {
    const existing = await queryWithSession(
      WalletTransaction.find({ tenant: tenantId, user: userId, idempotencyKey: { $in: [`${key}:promotional`, `${key}:cash`] } }).sort({ createdAt: 1 }),
      currentSession,
    );
    if (existing.length) {
      return {
        transactions: existing,
        wallet: await ensureWallet({ tenant: tenantId, user: userId, session: currentSession }),
        idempotent: true,
      };
    }
  }
  const wallet = await expirePromotionalCredits({ tenant: tenantId, user: userId, session: currentSession });
  if (round(wallet.cashBalance) + round(wallet.promotionalBalance) < value) {
    throw makeError('Insufficient wallet balance', 409, 'WALLET_INSUFFICIENT_BALANCE');
  }

  const promotionalAmount = Math.min(value, round(wallet.promotionalBalance));
  const cashAmount = round(value - promotionalAmount);
  const transactions = [];
  let allIdempotent = true;
  if (promotionalAmount > 0) {
    const result = await mutate({
      tenant: tenantId,
      user: userId,
      direction: 'debit',
      bucket: 'promotional',
      amount: promotionalAmount,
      source,
      referenceType,
      referenceId,
      idempotencyKey: key ? `${key}:promotional` : undefined,
      note,
      createdBy,
      session: currentSession,
    });
    transactions.push(result.transaction);
    allIdempotent = allIdempotent && result.idempotent;
  }
  if (cashAmount > 0) {
    const result = await mutate({
      tenant: tenantId,
      user: userId,
      direction: 'debit',
      bucket: 'cash',
      amount: cashAmount,
      source,
      referenceType,
      referenceId,
      idempotencyKey: key ? `${key}:cash` : undefined,
      note,
      createdBy,
      session: currentSession,
    });
    transactions.push(result.transaction);
    allIdempotent = allIdempotent && result.idempotent;
  }
  const latest = await ensureWallet({ tenant: tenantId, user: userId, session: currentSession });
  return { transactions, wallet: latest, idempotent: transactions.length > 0 && allIdempotent };
}, session);

const getWallet = ({ tenant, user, session } = {}) => withWalletTransaction(async currentSession => {
  const tenantId = tenantFilter(tenant);
  const userId = userIdOf(user);
  const wallet = await expirePromotionalCredits({ tenant: tenantId, user: userId, session: currentSession });
  return snapshot(wallet);
}, session);

const listTransactions = async ({ tenant, user, page = 1, limit = 20 } = {}) => {
  const tenantId = tenantFilter(tenant);
  const userId = userIdOf(user);
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const filter = { tenant: tenantId, user: userId };
  const [transactions, total] = await Promise.all([
    WalletTransaction.find(filter).sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean(),
    WalletTransaction.countDocuments(filter),
  ]);
  return { transactions, pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) } };
};

module.exports = { creditWallet, debitWallet, debitWalletTotal, ensureWallet, expirePromotionalCredits, getWallet, listTransactions, makeError };
