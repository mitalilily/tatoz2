const mongoose = require('mongoose');
const LoyaltyProgram = require('../models/LoyaltyProgram');
const LoyaltyAccount = require('../models/LoyaltyAccount');
const LoyaltyTransaction = require('../models/LoyaltyTransaction');

const DEFAULT_TIERS = [
  { id: 'bronze', label: 'Bronze', minLifetimePoints: 0, earnMultiplier: 1 },
  { id: 'silver', label: 'Silver', minLifetimePoints: 1000, earnMultiplier: 1.1 },
  { id: 'gold', label: 'Gold', minLifetimePoints: 5000, earnMultiplier: 1.25 },
  { id: 'platinum', label: 'Platinum', minLifetimePoints: 15000, earnMultiplier: 1.5 },
];

const idOf = value => value?._id || value || null;
const makeError = (message, statusCode = 400, publicCode = 'LOYALTY_ERROR') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
};
const tenantId = tenant => {
  const value = idOf(tenant);
  if (!value || !mongoose.isValidObjectId(value)) throw makeError('A valid tenant is required', 400, 'LOYALTY_TENANT_REQUIRED');
  return value;
};
const userId = user => {
  const value = idOf(user);
  if (!value || !mongoose.isValidObjectId(value)) throw makeError('A valid customer is required', 400, 'LOYALTY_CUSTOMER_REQUIRED');
  return value;
};
const pointsOf = points => {
  const value = Number(points);
  if (!Number.isInteger(value) || value <= 0 || value > 1000000000) throw makeError('Loyalty points must be a positive whole number', 400, 'LOYALTY_POINTS_INVALID');
  return value;
};
const roundCurrency = value => Math.round(Number(value || 0) * 100) / 100;
const normalizedKey = key => {
  const value = String(key || '').trim();
  return value ? value.slice(0, 200) : null;
};
const queryWithSession = (query, session) => (session ? query.session(session) : query);

const withTransaction = async (callback, externalSession) => {
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

const ensureProgram = async ({ tenant, session }) => {
  const id = tenantId(tenant);
  const query = LoyaltyProgram.findOneAndUpdate(
    { tenant: id },
    { $setOnInsert: { tenant: id, enabled: false, tiers: DEFAULT_TIERS } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  if (session) query.session(session);
  return query;
};

const ensureAccount = async ({ tenant, user, session }) => {
  const tenantValue = tenantId(tenant);
  const userValue = userId(user);
  const query = LoyaltyAccount.findOneAndUpdate(
    { tenant: tenantValue, user: userValue },
    { $setOnInsert: { tenant: tenantValue, user: userValue, tier: 'bronze', status: 'active' } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  if (session) query.session(session);
  return query;
};

const snapshot = account => ({
  _id: account._id,
  tenant: account.tenant,
  user: account.user,
  pointsBalance: Number(account.pointsBalance || 0),
  lifetimeEarned: Number(account.lifetimeEarned || 0),
  lifetimeRedeemed: Number(account.lifetimeRedeemed || 0),
  tier: account.tier || 'bronze',
  status: account.status || 'active',
  lastTransactionAt: account.lastTransactionAt || null,
});

const sortedTiers = program => [...(program?.tiers?.length ? program.tiers : DEFAULT_TIERS)]
  .sort((a, b) => Number(a.minLifetimePoints || 0) - Number(b.minLifetimePoints || 0));

const tierFor = (program, lifetimeEarned) => sortedTiers(program)
  .filter(tier => Number(tier.minLifetimePoints || 0) <= Number(lifetimeEarned || 0))
  .pop()?.id || 'bronze';

const tierMultiplier = (program, tierId) => Number(sortedTiers(program).find(tier => tier.id === tierId)?.earnMultiplier || 1);

const expirePoints = async ({ tenant, user, session, now = new Date() }) => {
  const tenantValue = tenantId(tenant);
  const userValue = userId(user);
  const account = await ensureAccount({ tenant: tenantValue, user: userValue, session });
  const query = LoyaltyTransaction.find({
    tenant: tenantValue,
    user: userValue,
    direction: 'earn',
    remainingPoints: { $gt: 0 },
    expiresAt: { $ne: null, $lte: now },
  }).sort({ expiresAt: 1, createdAt: 1 });
  const credits = await queryWithSession(query, session);
  for (const credit of credits) {
    const points = Number(credit.remainingPoints || 0);
    if (points <= 0) continue;
    const updated = await LoyaltyAccount.findOneAndUpdate(
      { _id: account._id, pointsBalance: { $gte: points }, status: 'active' },
      { $inc: { pointsBalance: -points }, $set: { lastTransactionAt: now } },
      { new: true, session },
    );
    if (!updated) throw makeError('Loyalty balance changed while expiring points', 409, 'LOYALTY_CONCURRENT_UPDATE');
    credit.remainingPoints = 0;
    await credit.save({ session });
    await LoyaltyTransaction.create([{
      tenant: tenantValue,
      user: userValue,
      account: account._id,
      direction: 'expire',
      points,
      balanceAfter: Number(updated.pointsBalance || 0),
      source: 'expiry',
      referenceType: 'loyalty_credit',
      referenceId: String(credit._id),
      idempotencyKey: `loyalty-expiry:${credit._id}`,
      note: 'Loyalty points expired',
      remainingPoints: 0,
    }], { session });
  }
  return ensureAccount({ tenant: tenantValue, user: userValue, session });
};

const findIdempotent = async ({ tenant, user, idempotencyKey, session }) => {
  if (!idempotencyKey) return null;
  const query = LoyaltyTransaction.findOne({ tenant: tenantId(tenant), user: userId(user), idempotencyKey });
  return queryWithSession(query, session);
};

const mutate = async ({ tenant, user, direction, points, source, referenceType, referenceId, idempotencyKey, note, createdBy, expiresAt, session }) => {
  const tenantValue = tenantId(tenant);
  const userValue = userId(user);
  if (!['earn', 'redeem', 'reversal'].includes(direction)) throw makeError('Invalid loyalty transaction direction', 400, 'LOYALTY_DIRECTION_INVALID');
  if (!['purchase', 'referral', 'review', 'manual', 'checkout_redeem', 'order_reversal'].includes(source)) throw makeError('Invalid loyalty transaction source', 400, 'LOYALTY_SOURCE_INVALID');
  const value = pointsOf(points);
  const key = normalizedKey(idempotencyKey);
  const existing = await findIdempotent({ tenant: tenantValue, user: userValue, idempotencyKey: key, session });
  if (existing) return { transaction: existing, account: await ensureAccount({ tenant: tenantValue, user: userValue, session }), idempotent: true };
  if (expiresAt && Number.isNaN(new Date(expiresAt).getTime())) throw makeError('Invalid loyalty expiry date', 400, 'LOYALTY_EXPIRY_INVALID');
  if (expiresAt && new Date(expiresAt) <= new Date()) throw makeError('Loyalty expiry must be in the future', 400, 'LOYALTY_EXPIRY_INVALID');

  const program = await ensureProgram({ tenant: tenantValue, session });
  const account = await expirePoints({ tenant: tenantValue, user: userValue, session });
  if (account.status !== 'active') throw makeError('Loyalty account is blocked', 403, 'LOYALTY_BLOCKED');
  if ((direction === 'redeem') && !program.enabled) throw makeError('Loyalty redemption is disabled', 409, 'LOYALTY_DISABLED');

  const now = new Date();
  const delta = direction === 'redeem' ? -value : value;
  const filter = direction === 'redeem'
    ? { _id: account._id, pointsBalance: { $gte: value }, status: 'active' }
    : direction === 'reversal'
      ? { _id: account._id, pointsBalance: { $gte: 0 }, lifetimeRedeemed: { $gte: value }, status: 'active' }
      : { _id: account._id, status: 'active' };
  const updated = await LoyaltyAccount.findOneAndUpdate(
    filter,
    {
      $inc: {
        pointsBalance: delta,
        ...(direction === 'earn' ? { lifetimeEarned: value } : {}),
        ...(direction === 'redeem' ? { lifetimeRedeemed: value } : {}),
        ...(direction === 'reversal' ? { lifetimeRedeemed: -value } : {}),
      },
      $set: { lastTransactionAt: now },
    },
    { new: true, session },
  );
  if (!updated) throw makeError(direction === 'redeem' ? 'Insufficient loyalty points' : 'Loyalty account is unavailable', 409, direction === 'redeem' ? 'LOYALTY_INSUFFICIENT_POINTS' : 'LOYALTY_CONCURRENT_UPDATE');

  const consumes = [];
  let reversalCreditRestored = false;
  if (direction === 'redeem') {
    let left = value;
    const creditQuery = LoyaltyTransaction.find({
      tenant: tenantValue,
      user: userValue,
      direction: 'earn',
      remainingPoints: { $gt: 0 },
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    }).sort({ expiresAt: 1, createdAt: 1 });
    const credits = await queryWithSession(creditQuery, session);
    for (const credit of credits) {
      if (left <= 0) break;
      const available = Number(credit.remainingPoints || 0);
      const consumed = Math.min(left, available);
      if (consumed <= 0) continue;
      credit.remainingPoints = available - consumed;
      await credit.save({ session });
      consumes.push({ transaction: credit._id, points: consumed });
      left -= consumed;
    }
    if (left > 0) throw makeError('Loyalty ledger is unavailable for this redemption', 409, 'LOYALTY_LEDGER_CONFLICT');
  }

  if (direction === 'reversal') {
    // A reversal must put the original FIFO credit buckets back as well as
    // restoring the aggregate account balance. Without this, the customer
    // could see points in the balance that can never expire or be redeemed.
    const originalQuery = LoyaltyTransaction.findOne({
      tenant: tenantValue,
      user: userValue,
      direction: 'redeem',
      referenceType: referenceType ? String(referenceType) : undefined,
      referenceId: referenceId ? String(referenceId) : undefined,
    }).sort({ createdAt: -1 });
    const original = await queryWithSession(originalQuery, session);
    if (!original || Number(original.points || 0) < value) {
      throw makeError('Original loyalty redemption was not found', 409, 'LOYALTY_REDEMPTION_NOT_FOUND');
    }
    const reversalMatch = { tenant: tenantValue, user: userValue, direction: 'reversal' };
    if (referenceType) reversalMatch.referenceType = String(referenceType);
    if (referenceId) reversalMatch.referenceId = String(referenceId);
    const priorReversals = await queryWithSession(
      LoyaltyTransaction.aggregate([
        { $match: reversalMatch },
        { $group: { _id: null, points: { $sum: '$points' } } },
      ]),
      session,
    );
    const alreadyRestored = Number(priorReversals[0]?.points || 0);
    if (alreadyRestored + value > Number(original.points || 0)) {
      throw makeError('Loyalty redemption was already reversed', 409, 'LOYALTY_REDEMPTION_ALREADY_REVERSED');
    }
    for (const consumed of original.consumes || []) {
      const consumedPoints = Number(consumed.points || 0);
      if (!consumed.transaction || consumedPoints <= 0) continue;
      await LoyaltyTransaction.updateOne(
        { _id: consumed.transaction, tenant: tenantValue, user: userValue, direction: 'earn' },
        { $inc: { remainingPoints: consumedPoints } },
        { session },
      );
    }
    reversalCreditRestored = true;
  }

  updated.tier = tierFor(program, updated.lifetimeEarned);
  await updated.save({ session });
  const transaction = (await LoyaltyTransaction.create([{
    tenant: tenantValue,
    user: userValue,
    account: updated._id,
    direction,
    points: value,
    balanceAfter: Number(updated.pointsBalance || 0),
    source,
    referenceType: referenceType ? String(referenceType).slice(0, 80) : undefined,
    referenceId: referenceId ? String(referenceId).slice(0, 160) : undefined,
    idempotencyKey: key || undefined,
    note: note ? String(note).slice(0, 500) : undefined,
    createdBy,
    expiresAt: direction === 'earn' && expiresAt ? new Date(expiresAt) : undefined,
    remainingPoints: direction === 'earn' ? value : 0,
    consumes: reversalCreditRestored ? [] : consumes,
  }], { session }))[0];
  return { transaction, account: updated, idempotent: false };
};

const earnPoints = args => withTransaction(session => mutate({ ...args, direction: 'earn', session }), args.session);
const redeemPoints = args => withTransaction(session => mutate({ ...args, direction: 'redeem', session }), args.session);
const reverseRedeemedPoints = args => withTransaction(session => mutate({ ...args, direction: 'reversal', source: 'order_reversal', session }), args.session);

const getProgram = ({ tenant, session } = {}) => ensureProgram({ tenant, session });
const getAccount = ({ tenant, user, session } = {}) => withTransaction(async currentSession => {
  await ensureProgram({ tenant, session: currentSession });
  const account = await expirePoints({ tenant, user, session: currentSession });
  return snapshot(account);
}, session);

const quoteRedemption = async ({ tenant, user, orderTotal, requestedPoints = 0, session } = {}) => {
  const requested = Number(requestedPoints || 0);
  if (!Number.isFinite(requested) || requested < 0 || !Number.isInteger(requested)) throw makeError('Loyalty points must be a positive whole number', 400, 'LOYALTY_POINTS_INVALID');
  if (requested === 0) return { points: 0, amount: 0, program: await ensureProgram({ tenant, session }), account: await ensureAccount({ tenant, user, session }) };
  const program = await ensureProgram({ tenant, session });
  if (!program.enabled) throw makeError('Loyalty redemption is disabled', 409, 'LOYALTY_DISABLED');
  const account = await expirePoints({ tenant, user, session });
  if (account.status !== 'active') throw makeError('Loyalty account is blocked', 403, 'LOYALTY_BLOCKED');
  if (requested < Number(program.minimumRedeemPoints || 0)) throw makeError(`Redeem at least ${program.minimumRedeemPoints} loyalty points`, 400, 'LOYALTY_MINIMUM_NOT_MET');
  if (requested > Number(account.pointsBalance || 0)) throw makeError('Insufficient loyalty points', 409, 'LOYALTY_INSUFFICIENT_POINTS');
  const maxAmount = roundCurrency(Math.max(0, Number(orderTotal || 0)) * Number(program.maxRedeemPercent || 0) / 100);
  const maxPoints = Math.floor(maxAmount * Number(program.redeemPointsPerCurrency || 1) + 1e-9);
  if (requested > maxPoints) throw makeError('Loyalty points exceed the order redemption limit', 400, 'LOYALTY_LIMIT_EXCEEDED');
  return {
    points: requested,
    amount: roundCurrency(requested / Number(program.redeemPointsPerCurrency || 1)),
    program,
    account,
  };
};

const earnPurchasePoints = ({ tenant, user, order, session } = {}) => withTransaction(async currentSession => {
  const program = await ensureProgram({ tenant, session: currentSession });
  if (!program.enabled || !Number(program.earnPointsPerCurrency || 0)) return { points: 0, disabled: true };
  const account = await ensureAccount({ tenant, user, session: currentSession });
  const multiplier = tierMultiplier(program, account.tier);
  const points = Math.floor(Math.max(0, Number(order?.total || 0)) * Number(program.earnPointsPerCurrency || 0) * multiplier);
  if (!points) return { points: 0, disabled: false, account: snapshot(account) };
  const expiryDays = Number(program.expiryDays || 0);
  const expiresAt = expiryDays > 0 ? new Date(Date.now() + expiryDays * 86400000) : undefined;
  return earnPoints({
    tenant,
    user,
    points,
    source: 'purchase',
    referenceType: 'order',
    referenceId: order?._id,
    idempotencyKey: `loyalty-order-earn:${order?._id}`,
    note: `Points earned on order ${order?.orderNumber || order?._id}`,
    expiresAt,
    session: currentSession,
  });
}, session);

const listTransactions = async ({ tenant, user, page = 1, limit = 20 } = {}) => {
  const tenantValue = tenantId(tenant);
  const userValue = userId(user);
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const filter = { tenant: tenantValue, user: userValue };
  const [transactions, total] = await Promise.all([
    LoyaltyTransaction.find(filter).sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean(),
    LoyaltyTransaction.countDocuments(filter),
  ]);
  return { transactions, pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) } };
};

module.exports = {
  DEFAULT_TIERS,
  makeError,
  ensureProgram,
  ensureAccount,
  getProgram,
  getAccount,
  quoteRedemption,
  earnPoints,
  redeemPoints,
  reverseRedeemedPoints,
  earnPurchasePoints,
  listTransactions,
  tierFor,
};
