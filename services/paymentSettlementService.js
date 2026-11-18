const mongoose = require('mongoose');
const PaymentAttempt = require('../models/PaymentAttempt');
const PaymentTransaction = require('../models/PaymentTransaction');
const PaymentSettlement = require('../models/PaymentSettlement');

const PROVIDER_ID = /^[a-z0-9._:-]{3,200}$/i;
const KEY = /^[A-Za-z0-9._:-]{8,160}$/;

const idOf = value => value?._id || value?.id || value;
const tenantOf = value => idOf(value?.tenant || value);
const roundMoney = value => Math.round(Number(value || 0) * 100) / 100;

const settlementError = (message, statusCode = 400, publicCode = 'PAYMENT_SETTLEMENT_INVALID') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
};

const money = (value, field, { required = false } = {}) => {
  if (value === undefined || value === null || value === '') {
    if (required) throw settlementError(`${field} is required`);
    return 0;
  }
  const normalized = roundMoney(value);
  if (!Number.isFinite(normalized) || normalized < 0) throw settlementError(`${field} must be a non-negative amount`);
  return normalized;
};

const normalizedCurrency = value => {
  const currency = String(value || 'INR').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw settlementError('Settlement currency is invalid');
  return currency;
};

const normalizedSettlementId = value => {
  const settlementId = String(value || '').trim();
  if (!PROVIDER_ID.test(settlementId)) throw settlementError('Provider settlement id is invalid');
  return settlementId;
};

const normalizedKey = (value, fallback) => {
  const key = String(value || fallback || '').trim();
  if (!KEY.test(key)) throw settlementError('Settlement idempotency key is invalid');
  return key;
};

const settlementFilter = ({ tenant, provider, status } = {}) => {
  const tenantId = tenantOf(tenant);
  if (!tenantId) throw settlementError('Settlement tenant is required', 400, 'TENANT_REQUIRED');
  const filter = { tenant: tenantId };
  if (provider) filter.provider = String(provider).trim().toLowerCase();
  if (status) filter.status = status;
  return filter;
};

const comparable = ({ settlement, entries }) => ({
  externalSettlementId: normalizedSettlementId(settlement?.id || settlement?.settlementId || settlement?.externalSettlementId),
  currency: normalizedCurrency(settlement?.currency),
  amount: money(settlement?.amount, 'Settlement amount', { required: true }),
  fees: money(settlement?.fees),
  tax: money(settlement?.tax),
  netAmount: settlement?.netAmount === undefined ? undefined : money(settlement.netAmount, 'Settlement net amount'),
  status: ['created', 'processed', 'failed', 'reversed'].includes(String(settlement?.status || '').toLowerCase())
    ? String(settlement.status).toLowerCase()
    : 'processed',
  utr: String(settlement?.utr || settlement?.utrNumber || '').slice(0, 200),
  settlementAt: settlement?.settlementAt || settlement?.settledAt || settlement?.createdAt || (settlement?.created_at ? new Date(Number(settlement.created_at) * 1000) : new Date()),
  entries: Array.isArray(entries) ? entries : [],
});

const assertCompatible = (existing, incoming) => {
  if (existing.externalSettlementId !== incoming.externalSettlementId
    || existing.currency !== incoming.currency
    || Math.round(Number(existing.amount) * 100) !== Math.round(incoming.amount * 100)) {
    throw settlementError('Settlement idempotency key was already used for another settlement', 409, 'SETTLEMENT_KEY_REUSED');
  }
};

const reconcileSettlement = async ({ tenant, provider, settlement, entries, source = 'admin', actor } = {}) => {
  const tenantId = tenantOf(tenant);
  if (!tenantId) throw settlementError('Settlement tenant is required', 400, 'TENANT_REQUIRED');
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  if (!normalizedProvider) throw settlementError('Settlement provider is required');
  const incoming = comparable({ settlement, entries });
  const idempotencyKey = normalizedKey(settlement?.idempotencyKey || settlement?.idempotency_key, `settlement:${incoming.externalSettlementId}`);

  const [byExternalId, byKey] = await Promise.all([
    PaymentSettlement.findOne({ tenant: tenantId, provider: normalizedProvider, externalSettlementId: incoming.externalSettlementId }).lean(),
    PaymentSettlement.findOne({ tenant: tenantId, provider: normalizedProvider, idempotencyKey }).lean(),
  ]);
  if (byExternalId || byKey) {
    const existing = byExternalId || byKey;
    assertCompatible(existing, incoming);
    return { settlement: existing, idempotent: true };
  }

  if (!incoming.entries.length || incoming.entries.length > 1000) {
    throw settlementError('Settlement must contain one to one thousand payment allocations', 400, 'SETTLEMENT_ALLOCATIONS_REQUIRED');
  }
  const seenPaymentIds = new Set();
  const paymentIds = incoming.entries.map(entry => String(entry?.paymentId || entry?.externalPaymentId || '').trim());
  if (paymentIds.some(paymentId => !paymentId) || paymentIds.some(paymentId => {
    if (seenPaymentIds.has(paymentId)) return true;
    seenPaymentIds.add(paymentId);
    return false;
  })) {
    throw settlementError('Settlement allocations must contain unique provider payment ids', 400, 'SETTLEMENT_ALLOCATIONS_INVALID');
  }

  const attempts = await PaymentAttempt.find({ tenant: tenantId, provider: normalizedProvider, externalPaymentId: { $in: paymentIds } }).lean();
  const attemptByPaymentId = new Map(attempts.map(attempt => [attempt.externalPaymentId, attempt]));
  const missingPaymentId = paymentIds.find(paymentId => !attemptByPaymentId.has(paymentId));
  if (missingPaymentId) throw settlementError('Settlement contains a payment that does not belong to this tenant', 409, 'SETTLEMENT_PAYMENT_NOT_FOUND');

  const allocations = [];
  let allocatedAmount = 0;
  let allocatedFees = 0;
  let allocatedTax = 0;
  for (const entry of incoming.entries) {
    const paymentId = String(entry.paymentId || entry.externalPaymentId).trim();
    const attempt = attemptByPaymentId.get(paymentId);
    if (!['captured', 'refunded'].includes(attempt.status)) {
      throw settlementError('Only captured payment attempts can be settled', 409, 'SETTLEMENT_PAYMENT_NOT_CAPTURED');
    }
    const amount = money(entry.amount, `Settlement allocation for ${paymentId}`, { required: true });
    const fees = money(entry.fees);
    const tax = money(entry.tax);
    const netAmount = entry.netAmount === undefined ? roundMoney(amount - fees - tax) : money(entry.netAmount, `Settlement net amount for ${paymentId}`);
    if (netAmount < 0 || netAmount > amount) throw settlementError(`Settlement net amount for ${paymentId} is invalid`);
    const capture = await PaymentTransaction.findOne({
      tenant: tenantId,
      provider: normalizedProvider,
      paymentAttempt: attempt._id,
      eventType: 'provider_captured',
      status: 'succeeded',
    }).sort({ occurredAt: -1, _id: -1 }).lean();
    allocations.push({
      paymentAttempt: attempt._id,
      paymentTransaction: capture?._id,
      order: attempt.order,
      externalPaymentId: paymentId,
      amount,
      fees,
      tax,
      netAmount,
    });
    allocatedAmount = roundMoney(allocatedAmount + amount);
    allocatedFees = roundMoney(allocatedFees + fees);
    allocatedTax = roundMoney(allocatedTax + tax);
  }

  if (Math.abs(allocatedAmount - incoming.amount) > 0.01) {
    throw settlementError('Settlement amount must equal the tenant payment allocations', 409, 'SETTLEMENT_AMOUNT_MISMATCH');
  }
  if (incoming.fees && Math.abs(incoming.fees - allocatedFees) > 0.01) {
    throw settlementError('Settlement fees must equal the payment allocations', 409, 'SETTLEMENT_FEES_MISMATCH');
  }
  if (incoming.tax && Math.abs(incoming.tax - allocatedTax) > 0.01) {
    throw settlementError('Settlement tax must equal the payment allocations', 409, 'SETTLEMENT_TAX_MISMATCH');
  }

  const fees = incoming.fees || allocatedFees;
  const tax = incoming.tax || allocatedTax;
  const netAmount = incoming.netAmount === undefined ? roundMoney(incoming.amount - fees - tax) : incoming.netAmount;
  if (netAmount < 0 || netAmount > incoming.amount) throw settlementError('Settlement net amount is invalid');

  const document = new PaymentSettlement({
    tenant: tenantId,
    provider: normalizedProvider,
    externalSettlementId: incoming.externalSettlementId,
    status: incoming.status,
    amount: incoming.amount,
    fees,
    tax,
    netAmount,
    currency: incoming.currency,
    utr: incoming.utr,
    settlementAt: new Date(incoming.settlementAt),
    allocations,
    idempotencyKey,
    source,
    createdBy: idOf(actor) || undefined,
  });
  try {
    await document.save();
    return { settlement: document.toObject(), idempotent: false };
  } catch (error) {
    if (error.code !== 11000) throw error;
    const raced = await PaymentSettlement.findOne({ tenant: tenantId, provider: normalizedProvider, $or: [{ externalSettlementId: incoming.externalSettlementId }, { idempotencyKey }] }).lean();
    if (raced) {
      assertCompatible(raced, incoming);
      return { settlement: raced, idempotent: true };
    }
    throw error;
  }
};

const listSettlements = async ({ tenant, provider, status, page = 1, limit = 20 } = {}) => {
  const filter = settlementFilter({ tenant, provider, status });
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const [settlements, total] = await Promise.all([
    PaymentSettlement.find(filter).sort({ settlementAt: -1, _id: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean(),
    PaymentSettlement.countDocuments(filter),
  ]);
  return { settlements, total, page: safePage, limit: safeLimit, pages: Math.ceil(total / safeLimit) };
};

const findSettlement = async ({ tenant, provider, id } = {}) => {
  const filter = settlementFilter({ tenant, provider });
  const value = String(id || '').trim();
  if (!value) return null;
  const or = [{ externalSettlementId: value }];
  if (mongoose.isValidObjectId(value)) or.push({ _id: value });
  return PaymentSettlement.findOne({ ...filter, $or: or }).lean();
};

module.exports = { reconcileSettlement, listSettlements, findSettlement, roundMoney };
