const crypto = require('crypto');
const mongoose = require('mongoose');
const GiftCard = require('../models/GiftCard');
const GiftCardTransaction = require('../models/GiftCardTransaction');
const { validateGiftCardPayload } = require('../utils/adminValidation');

const round = value => Math.round(Number(value || 0) * 100) / 100;
const idOf = value => value?._id || value || null;
const tenantIdOf = tenant => {
  const value = idOf(tenant);
  if (!value || !mongoose.isValidObjectId(value)) throw makeError('A valid tenant is required', 400, 'GIFT_CARD_TENANT_REQUIRED');
  return value;
};
const userIdOf = user => {
  const value = idOf(user);
  if (!value || !mongoose.isValidObjectId(value)) throw makeError('A valid customer is required', 400, 'GIFT_CARD_CUSTOMER_REQUIRED');
  return value;
};
const makeError = (message, statusCode = 400, publicCode = 'GIFT_CARD_ERROR') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
};
const normalizedCode = code => String(code || '').toUpperCase().replace(/\s+/g, '').slice(0, 120);
const hashCode = code => crypto.createHash('sha256').update(normalizedCode(code)).digest('hex');
const normalizedKey = key => {
  const value = String(key || '').trim();
  return value ? value.slice(0, 200) : null;
};
const amountOf = (amount, { allowZero = false } = {}) => {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < (allowZero ? 0 : 0.01) || value > 100000000) {
    throw makeError('Gift card amount is invalid', 400, 'GIFT_CARD_AMOUNT_INVALID');
  }
  return round(value);
};
const queryWithSession = (query, session) => (session ? query.session(session) : query);
const expiryFilter = now => ({ $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }] });

const safeCard = card => card ? ({
  _id: card._id,
  tenant: card.tenant,
  codeLast4: card.codeLast4,
  initialAmount: round(card.initialAmount),
  balance: round(card.balance),
  currency: card.currency || 'INR',
  status: card.status,
  expiresAt: card.expiresAt || null,
  recipientName: card.recipientName || '',
  recipientEmail: card.recipientEmail || '',
  recipientPhone: card.recipientPhone || '',
  recipientUser: card.recipientUser?._id || card.recipientUser || null,
  senderName: card.senderName || '',
  message: card.message || '',
  createdAt: card.createdAt || null,
  lastUsedAt: card.lastUsedAt || null,
}) : null;

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

const generateCode = () => {
  const raw = crypto.randomBytes(9).toString('hex').toUpperCase();
  return `TATOZ-GIFT-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
};

const createGiftCard = ({ tenant, amount, expiresAt, code, recipientUser, recipientName, recipientEmail, recipientPhone, senderName, message, createdBy, idempotencyKey, session } = {}) => withTransaction(async currentSession => {
  const tenantId = tenantIdOf(tenant);
  const recipientUserId = recipientUser ? userIdOf(recipientUser) : undefined;
  const validated = validateGiftCardPayload({ amount, expiresAt, recipientName, recipientEmail, recipientPhone, senderName, message });
  const value = validated.amount;
  const key = normalizedKey(idempotencyKey);
  if (key) {
    const existingTransaction = await queryWithSession(GiftCardTransaction.findOne({ tenant: tenantId, idempotencyKey: key }), currentSession);
    if (existingTransaction) {
      const existingCard = await queryWithSession(GiftCard.findById(existingTransaction.giftCard), currentSession);
      return { card: existingCard, transaction: existingTransaction, code: null, idempotent: true };
    }
  }
  const plainCode = normalizedCode(code) || generateCode();
  if (plainCode.length < 8) throw makeError('Gift card code is too short', 400, 'GIFT_CARD_CODE_INVALID');
  const expiry = validated.expiresAt ? new Date(validated.expiresAt) : null;
  if (expiry && (!Number.isFinite(expiry.getTime()) || expiry <= new Date())) throw makeError('Gift card expiry must be in the future', 400, 'GIFT_CARD_EXPIRY_INVALID');
  let card;
  try {
    card = (await GiftCard.create([{
      tenant: tenantId,
      recipientUser: recipientUserId,
      codeHash: hashCode(plainCode),
      codeLast4: plainCode.slice(-4),
      initialAmount: value,
      balance: value,
      status: 'active',
      expiresAt: expiry || undefined,
      recipientName: validated.recipientName || undefined,
      recipientEmail: validated.recipientEmail || undefined,
      recipientPhone: validated.recipientPhone || undefined,
      senderName: validated.senderName || undefined,
      message: validated.message || undefined,
      createdBy,
    }], { session: currentSession }))[0];
  } catch (error) {
    if (error?.code === 11000) throw makeError('Gift card code already exists', 409, 'GIFT_CARD_CODE_EXISTS');
    throw error;
  }
  const transaction = (await GiftCardTransaction.create([{
    tenant: tenantId,
    giftCard: card._id,
    user: recipientUserId,
    direction: 'issue',
    amount: value,
    balanceBefore: 0,
    balanceAfter: value,
    source: 'issue',
    referenceType: 'gift_card',
    referenceId: String(card._id),
    idempotencyKey: key || `gift-card-issue:${card._id}`,
    note: 'Gift card issued',
    createdBy,
  }], { session: currentSession }))[0];
  return { card, transaction, code: plainCode, idempotent: false };
}, session);

const findCardByCode = async ({ tenant, code, session, includeInactive = false } = {}) => {
  const tenantId = tenantIdOf(tenant);
  const normalized = normalizedCode(code);
  if (normalized.length < 8) throw makeError('Gift card code is invalid', 400, 'GIFT_CARD_CODE_INVALID');
  const card = await queryWithSession(GiftCard.findOne({ tenant: tenantId, codeHash: hashCode(normalized) }), session);
  if (!card) throw makeError('Gift card not found', 404, 'GIFT_CARD_NOT_FOUND');
  const now = new Date();
  if (card.expiresAt && card.expiresAt <= now) {
    if (card.status === 'active') {
      card.status = 'expired';
      await card.save(session ? { session } : undefined);
    }
    throw makeError('Gift card has expired', 409, 'GIFT_CARD_EXPIRED');
  }
  if (!includeInactive && card.status !== 'active') {
    throw makeError(`Gift card is ${card.status}`, 409, `GIFT_CARD_${String(card.status || 'inactive').toUpperCase()}`);
  }
  if (card.balance <= 0) throw makeError('Gift card has no remaining balance', 409, 'GIFT_CARD_DEPLETED');
  return card;
};

const quoteRedemption = async ({ tenant, code, orderTotal, requestedAmount, session } = {}) => {
  const total = amountOf(orderTotal);
  const card = await findCardByCode({ tenant, code, session });
  const requested = requestedAmount === undefined || requestedAmount === null || requestedAmount === ''
    ? Math.min(round(card.balance), total)
    : amountOf(requestedAmount);
  if (requested > total + 0.01) throw makeError('Gift card amount cannot exceed the order total', 400, 'GIFT_CARD_AMOUNT_EXCEEDS_ORDER');
  if (requested > Number(card.balance) + 0.01) throw makeError('Gift card balance is insufficient', 409, 'GIFT_CARD_INSUFFICIENT_BALANCE');
  return { card, amount: round(Math.min(requested, total, card.balance)), codeLast4: card.codeLast4 };
};

const redeemGiftCard = ({ tenant, user, code, amount, order, referenceType = 'order', referenceId, idempotencyKey, note, createdBy, session } = {}) => withTransaction(async currentSession => {
  const tenantId = tenantIdOf(tenant);
  const userId = userIdOf(user);
  const value = amountOf(amount);
  const key = normalizedKey(idempotencyKey);
  if (!key) throw makeError('Gift card redemption requires a stable Idempotency-Key', 400, 'GIFT_CARD_IDEMPOTENCY_REQUIRED');
  const existing = await queryWithSession(GiftCardTransaction.findOne({ tenant: tenantId, idempotencyKey: key }), currentSession);
  if (existing) {
    const existingCard = await queryWithSession(GiftCard.findById(existing.giftCard), currentSession);
    return { card: existingCard, transaction: existing, amount: round(existing.amount), idempotent: true };
  }
  const card = await findCardByCode({ tenant: tenantId, code, session: currentSession });
  if (value > Number(card.balance) + 0.01) throw makeError('Gift card balance is insufficient', 409, 'GIFT_CARD_INSUFFICIENT_BALANCE');
  const now = new Date();
  const updated = await GiftCard.findOneAndUpdate(
    { _id: card._id, tenant: tenantId, status: 'active', balance: { $gte: value }, ...expiryFilter(now) },
    { $inc: { balance: -value }, $set: { lastUsedAt: now } },
    { new: true, session: currentSession },
  );
  if (!updated) throw makeError('Gift card balance changed; please retry checkout', 409, 'GIFT_CARD_CONCURRENT_UPDATE');
  updated.status = updated.balance <= 0 ? 'depleted' : 'active';
  await updated.save({ session: currentSession });
  const transaction = (await GiftCardTransaction.create([{
    tenant: tenantId,
    giftCard: updated._id,
    user: userId,
    order: mongoose.isValidObjectId(order || referenceId) ? (order || referenceId) : undefined,
    direction: 'redeem',
    amount: value,
    balanceBefore: round(updated.balance + value),
    balanceAfter: round(updated.balance),
    source: 'checkout_redeem',
    referenceType: referenceType ? String(referenceType).slice(0, 80) : 'order',
    referenceId: referenceId ? String(referenceId).slice(0, 160) : String(order || ''),
    idempotencyKey: key,
    note: note ? String(note).slice(0, 500) : undefined,
    createdBy,
  }], { session: currentSession }))[0];
  return { card: updated, transaction, amount: value, idempotent: false };
}, session);

const listTransactions = async ({ tenant, user, page = 1, limit = 20 } = {}) => {
  const tenantId = tenantIdOf(tenant);
  const userId = userIdOf(user);
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const filter = { tenant: tenantId, user: userId };
  const [transactions, total] = await Promise.all([
    GiftCardTransaction.find(filter).populate('giftCard', 'codeLast4 initialAmount balance currency status expiresAt').sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean(),
    GiftCardTransaction.countDocuments(filter),
  ]);
  return { transactions, pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) } };
};

const listAdminCards = async ({ tenant, page = 1, limit = 20, search = '', status, customerIds } = {}) => {
  const tenantId = tenantIdOf(tenant);
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const filter = { tenant: tenantId };
  if (status && ['active', 'disabled', 'depleted', 'expired'].includes(status)) filter.status = status;
  if (Array.isArray(customerIds)) filter.recipientUser = { $in: customerIds };
  if (search) {
    const safeSearch = String(search).slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').toUpperCase();
    filter.$or = [
      { codeLast4: { $regex: safeSearch, $options: 'i' } },
      { recipientName: { $regex: safeSearch, $options: 'i' } },
      { recipientEmail: { $regex: safeSearch, $options: 'i' } },
      { recipientPhone: { $regex: safeSearch, $options: 'i' } },
    ];
  }
  const [cards, total] = await Promise.all([
    GiftCard.find(filter).select('-codeHash').populate('recipientUser', 'name email phone').sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean(),
    GiftCard.countDocuments(filter),
  ]);
  return { cards, pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) } };
};

const setStatus = async ({ tenant, id, status } = {}) => {
  const tenantId = tenantIdOf(tenant);
  if (!['active', 'disabled'].includes(status)) throw makeError('Gift card status must be active or disabled', 400, 'GIFT_CARD_STATUS_INVALID');
  const card = await GiftCard.findOneAndUpdate({ _id: id, tenant: tenantId, status: { $in: ['active', 'disabled'] } }, { $set: { status } }, { new: true }).select('-codeHash');
  if (!card) throw makeError('Gift card not found or already settled', 404, 'GIFT_CARD_NOT_FOUND');
  return card;
};

const listCardTransactions = async ({ tenant, id, page = 1, limit = 50 } = {}) => {
  const tenantId = tenantIdOf(tenant);
  if (!mongoose.isValidObjectId(id)) throw makeError('Invalid gift card id', 400, 'GIFT_CARD_ID_INVALID');
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  const filter = { tenant: tenantId, giftCard: id };
  const [transactions, total] = await Promise.all([
    GiftCardTransaction.find(filter).populate('user', 'name email phone').sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean(),
    GiftCardTransaction.countDocuments(filter),
  ]);
  return { transactions, pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) } };
};

module.exports = {
  amountOf,
  createGiftCard,
  findCardByCode,
  quoteRedemption,
  redeemGiftCard,
  listTransactions,
  listAdminCards,
  listCardTransactions,
  setStatus,
  safeCard,
  makeError,
};
