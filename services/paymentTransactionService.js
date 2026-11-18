const PaymentTransaction = require('../models/PaymentTransaction');

const EVENT_TYPES = new Set([
  'attempt_created',
  'provider_order_created',
  'provider_authorized',
  'provider_captured',
  'provider_failed',
  'provider_cancelled',
  'refund_requested',
  'refunded',
  'refund_failed',
  'chargeback',
  'chargeback_reversed',
  'manual_adjustment',
]);
const STATUSES = new Set(['pending', 'succeeded', 'failed', 'reversed']);
const SOURCES = new Set(['checkout', 'verification', 'webhook', 'admin', 'system']);

const idOf = value => value?._id || value?.id || value;
const tenantOf = value => idOf(value?.tenant || value);
const orderOf = value => idOf(value?.order || value);
const attemptOf = value => idOf(value?.paymentAttempt || value);

const ledgerError = (message, statusCode = 400, publicCode = 'PAYMENT_TRANSACTION_INVALID') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
};

const sameId = (left, right) => (!left && !right) || String(left) === String(right);

const assertRecord = ({ order, provider, eventType, status, amount, currency, idempotencyKey, source }) => {
  if (!orderOf(order)) throw ledgerError('Payment transaction order is required');
  if (!String(provider || '').trim()) throw ledgerError('Payment transaction provider is required');
  if (!EVENT_TYPES.has(eventType)) throw ledgerError('Payment transaction event type is invalid');
  if (status !== undefined && !STATUSES.has(status)) throw ledgerError('Payment transaction status is invalid');
  if (!SOURCES.has(source)) throw ledgerError('Payment transaction source is invalid');
  if (!Number.isFinite(Number(amount)) || Number(amount) < 0) throw ledgerError('Payment transaction amount is invalid');
  if (!/^[A-Za-z]{3}$/.test(String(currency || 'INR'))) throw ledgerError('Payment transaction currency is invalid');
  if (!/^[A-Za-z0-9._:-]{8,160}$/.test(String(idempotencyKey || ''))) {
    throw ledgerError('Payment transaction idempotency key is invalid');
  }
};

const recordPaymentTransaction = async ({
  tenant,
  order,
  paymentAttempt,
  provider,
  eventType,
  status = 'succeeded',
  amount,
  currency = 'INR',
  externalOrderId = '',
  externalPaymentId = '',
  providerEventId = '',
  idempotencyKey,
  source,
  reason = '',
  actor,
  occurredAt,
  session,
} = {}) => {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  const normalizedCurrency = String(currency || 'INR').trim().toUpperCase();
  const normalizedAmount = Math.round(Number(amount || 0) * 100) / 100;
  const normalizedKey = String(idempotencyKey || '').trim();
  const orderId = orderOf(order);
  const tenantId = tenantOf(tenant);
  const attemptId = attemptOf(paymentAttempt);

  assertRecord({ order: orderId, provider: normalizedProvider, eventType, status, amount: normalizedAmount, currency: normalizedCurrency, idempotencyKey: normalizedKey, source });

  const lookup = { provider: normalizedProvider, idempotencyKey: normalizedKey };
  if (tenantId) lookup.tenant = tenantId;
  else lookup.tenant = { $exists: false };

  const findExisting = () => {
    const query = PaymentTransaction.findOne(lookup);
    if (session) query.session(session);
    return query.lean();
  };
  const ensureCompatible = existing => {
    if (!existing) return null;
    if (!sameId(existing.order, orderId)
      || existing.provider !== normalizedProvider
      || existing.eventType !== eventType
      || Math.round(Number(existing.amount) * 100) !== Math.round(normalizedAmount * 100)
      || String(existing.currency || '').toUpperCase() !== normalizedCurrency) {
      throw ledgerError('Payment transaction idempotency key was already used for another event', 409, 'PAYMENT_TRANSACTION_KEY_REUSED');
    }
    return { transaction: existing, idempotent: true };
  };

  const existing = ensureCompatible(await findExisting());
  if (existing) return existing;

  const transaction = new PaymentTransaction({
    tenant: tenantId || undefined,
    order: orderId,
    paymentAttempt: attemptId || undefined,
    provider: normalizedProvider,
    eventType,
    status,
    amount: normalizedAmount,
    currency: normalizedCurrency,
    externalOrderId: String(externalOrderId || '').slice(0, 200),
    externalPaymentId: String(externalPaymentId || '').slice(0, 200),
    providerEventId: String(providerEventId || '').slice(0, 200),
    idempotencyKey: normalizedKey,
    source,
    reason: String(reason || '').slice(0, 500),
    actor: idOf(actor) || undefined,
    occurredAt: occurredAt || new Date(),
  });

  try {
    await transaction.save(session ? { session } : undefined);
    return { transaction: transaction.toObject(), idempotent: false };
  } catch (error) {
    if (error.code !== 11000) throw error;
    const raced = ensureCompatible(await findExisting());
    if (raced) return raced;
    throw error;
  }
};

const scopedFilter = ({ tenant, provider, eventType, status, from, to, orderId } = {}) => {
  const filter = {};
  const tenantId = tenantOf(tenant);
  if (tenantId) filter.tenant = tenantId;
  if (provider) filter.provider = String(provider).trim().toLowerCase();
  if (eventType) filter.eventType = eventType;
  if (status) filter.status = status;
  if (orderId) filter.order = orderId;
  if (from || to) {
    filter.occurredAt = {};
    if (from) filter.occurredAt.$gte = new Date(from);
    if (to) filter.occurredAt.$lt = new Date(to);
  }
  return filter;
};

const listPaymentTransactions = async ({ tenant, provider, eventType, status, from, to, orderId, page = 1, limit = 30 } = {}) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 30));
  const filter = scopedFilter({ tenant, provider, eventType, status, from, to, orderId });
  const [transactions, total] = await Promise.all([
    PaymentTransaction.find(filter)
      .sort({ occurredAt: -1, _id: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .populate('order', 'orderNumber total paymentStatus orderStatus paymentMethod createdAt')
      .populate('paymentAttempt', 'status externalOrderId externalPaymentId providerStatus')
      .lean(),
    PaymentTransaction.countDocuments(filter),
  ]);
  return { transactions, pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) } };
};

const summarizePaymentTransactions = async ({ tenant, provider, from, to } = {}) => {
  const filter = scopedFilter({ tenant, provider, from, to });
  const [byEvent, byStatus] = await Promise.all([
    PaymentTransaction.aggregate([
      { $match: filter },
      { $group: { _id: '$eventType', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
      { $sort: { _id: 1 } },
    ]),
    PaymentTransaction.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);
  const eventStats = byEvent.reduce((out, row) => ({ ...out, [row._id]: { count: row.count, amount: Math.round(Number(row.amount || 0) * 100) / 100 } }), {});
  const statusStats = byStatus.reduce((out, row) => ({ ...out, [row._id]: row.count }), {});
  return {
    events: eventStats,
    statuses: statusStats,
    capturedAmount: eventStats.provider_captured?.amount || 0,
    refundedAmount: eventStats.refunded?.amount || 0,
    failedAmount: eventStats.provider_failed?.amount || 0,
    totalEvents: byEvent.reduce((sum, row) => sum + row.count, 0),
  };
};

module.exports = { recordPaymentTransaction, listPaymentTransactions, summarizePaymentTransactions, scopedFilter, EVENT_TYPES };
