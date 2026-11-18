const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const PaymentAttempt = require('../models/PaymentAttempt');
const PaymentTransaction = require('../models/PaymentTransaction');
const paymentSettlementService = require('../services/paymentSettlementService');
const paymentManager = require('../services/payment/paymentManager');
const providerRegistry = require('../services/integrations/providerRegistry');
const { recordPaymentTransaction, summarizePaymentTransactions } = require('../services/paymentTransactionService');

const PROVIDER = 'razorpay';
const idOf = value => value?._id || value;

const tenantIdFor = req => {
  const tenant = idOf(req.tenant);
  if (tenant) return tenant;
  const error = new Error('Tenant context is required for the Razorpay dashboard');
  error.statusCode = 400;
  error.publicCode = 'TENANT_REQUIRED';
  throw error;
};

const tenantScope = req => ({ tenant: tenantIdFor(req) });
const providerOrderScope = req => ({ ...tenantScope(req), $or: [{ paymentProvider: PROVIDER }, { paymentMethod: PROVIDER }] });
const safeLimit = value => Math.min(100, Math.max(1, Number(value) || 20));
const safeSkip = value => Math.max(0, Number(value) || 0);
const dateRange = (from, to) => {
  const createdAt = {};
  if (from) createdAt.$gte = new Date(from);
  if (to) createdAt.$lt = new Date(to);
  return Object.keys(createdAt).length ? { createdAt } : {};
};

const paymentStatus = attempt => {
  if (attempt.status === 'captured') return 'captured';
  if (attempt.status === 'authorized') return 'authorized';
  if (attempt.status === 'failed') return 'failed';
  if (attempt.status === 'refunded') return 'refunded';
  return attempt.providerStatus || attempt.status || 'pending';
};

const paymentRow = attempt => {
  const order = attempt.order && typeof attempt.order === 'object' ? attempt.order : null;
  const user = order?.user && typeof order.user === 'object' ? order.user : null;
  return {
    id: attempt.externalPaymentId || attempt.externalOrderId || String(attempt._id),
    order_id: attempt.externalOrderId || order?.paymentProviderOrderId || String(order?._id || ''),
    amount: Math.round(Number(attempt.amount || 0) * 100),
    currency: String(attempt.currency || 'INR').toUpperCase(),
    status: paymentStatus(attempt),
    method: 'razorpay',
    email: user?.email || '',
    contact: user?.phone || order?.shippingAddress?.phone || '',
    created_at: Math.floor(new Date(attempt.createdAt || Date.now()).getTime() / 1000),
    tenant: undefined,
  };
};

const orderRow = order => ({
  id: order.paymentProviderOrderId || order.paymentId || String(order._id),
  entity: 'order',
  amount: Math.round(Number(order.total || 0) * 100),
  currency: String(order.paymentCurrency || 'INR').toUpperCase(),
  status: order.paymentStatus || 'pending',
  receipt: order.orderNumber,
  created_at: Math.floor(new Date(order.createdAt || Date.now()).getTime() / 1000),
  notes: { orderId: String(order._id) },
});

const refundRow = transaction => {
  const attempt = transaction.paymentAttempt && typeof transaction.paymentAttempt === 'object' ? transaction.paymentAttempt : null;
  const status = transaction.eventType === 'refunded' ? 'processed' : transaction.eventType === 'refund_failed' ? 'failed' : 'pending';
  return {
    id: transaction.externalPaymentId || transaction.providerEventId || String(transaction._id),
    payment_id: attempt?.externalPaymentId || transaction.externalOrderId || '—',
    amount: Math.round(Number(transaction.amount || 0) * 100),
    status,
    speed_processed: status === 'processed' ? 'instant' : undefined,
    created_at: Math.floor(new Date(transaction.occurredAt || transaction.createdAt || Date.now()).getTime() / 1000),
  };
};

const settlementRow = settlement => ({
  id: settlement.externalSettlementId,
  entity: 'settlement',
  amount: Math.round(Number(settlement.amount || 0) * 100),
  fees: Math.round(Number(settlement.fees || 0) * 100),
  tax: Math.round(Number(settlement.tax || 0) * 100),
  net_amount: Math.round(Number(settlement.netAmount || 0) * 100),
  currency: String(settlement.currency || 'INR').toUpperCase(),
  status: settlement.status,
  utr: settlement.utr || '',
  created_at: Math.floor(new Date(settlement.settlementAt || settlement.createdAt || Date.now()).getTime() / 1000),
  settled_at: settlement.settlementAt ? Math.floor(new Date(settlement.settlementAt).getTime() / 1000) : undefined,
  transaction_count: Array.isArray(settlement.allocations) ? settlement.allocations.length : 0,
  source: 'tenant_settlement_ledger',
});

const findAttempt = async (req, id) => {
  const value = String(id || '').trim();
  const or = [{ externalPaymentId: value }, { externalOrderId: value }];
  if (mongoose.isValidObjectId(value)) or.push({ _id: value });
  return PaymentAttempt.findOne({ ...tenantScope(req), provider: PROVIDER, $or: or })
    .populate({
      path: 'order',
      select: 'orderNumber total paymentStatus paymentMethod paymentProviderOrderId paymentCurrency shippingAddress user createdAt',
      populate: { path: 'user', select: 'email phone' },
    });
};

const getAdapter = capability => {
  const adapter = providerRegistry.getAdapter(PROVIDER);
  if (!adapter || typeof adapter[capability] !== 'function') {
    const error = new Error(`Razorpay ${capability} operation is not available`);
    error.statusCode = 400;
    error.publicCode = 'RAZORPAY_OPERATION_UNAVAILABLE';
    throw error;
  }
  return adapter;
};

const configFor = req => paymentManager.getConfig({ provider: PROVIDER, tenantId: tenantIdFor(req) });
const normalizeKeyPart = value => String(value || '').replace(/[^A-Za-z0-9._:-]/g, '-').slice(0, 100) || 'request';

const liveConfigFor = async req => {
  const config = await configFor(req);
  if (!config.enabled || !paymentManager.hasRequiredCredentials(PROVIDER, config)) {
    const error = new Error('Razorpay live credentials are not configured for this tenant');
    error.statusCode = 409;
    error.publicCode = 'PAYMENT_PROVIDER_NOT_READY';
    throw error;
  }
  return config;
};

const collectLiveItems = async (adapter, method, config, params = {}, maxItems = 1000) => {
  const pageSize = Math.min(100, Math.max(1, Number(params.count) || 100));
  let skip = Math.max(0, Number(params.skip) || 0);
  const items = [];
  let truncated = false;

  while (items.length < maxItems) {
    const page = await adapter[method]({ ...params, count: pageSize, skip }, config);
    const pageItems = Array.isArray(page?.items) ? page.items : [];
    items.push(...pageItems);
    if (pageItems.length < pageSize) break;
    skip += pageItems.length;
    if (items.length >= maxItems) truncated = true;
  }

  return { items: items.slice(0, maxItems), truncated };
};

const livePaymentRow = payment => ({
  id: payment.id,
  order_id: payment.order_id || '',
  amount: Number(payment.amount || 0),
  currency: String(payment.currency || 'INR').toUpperCase(),
  status: payment.status || (Number(payment.captured) === 1 ? 'captured' : 'pending'),
  method: payment.method || '—',
  email: payment.email || '',
  contact: payment.contact || '',
  created_at: Number(payment.created_at || 0),
  captured: Number(payment.captured) === 1 || payment.status === 'captured',
  amount_refunded: Number(payment.amount_refunded || 0),
  source: 'razorpay_live_api',
});

const liveOrderRow = order => ({
  id: order.id,
  entity: order.entity || 'order',
  amount: Number(order.amount || 0),
  amount_paid: Number(order.amount_paid || 0),
  amount_due: Number(order.amount_due || 0),
  currency: String(order.currency || 'INR').toUpperCase(),
  status: order.status || 'created',
  receipt: order.receipt || '',
  created_at: Number(order.created_at || 0),
  notes: order.notes || {},
  source: 'razorpay_live_api',
});

const liveRefundRow = refund => ({
  id: refund.id,
  payment_id: refund.payment_id || '',
  amount: Number(refund.amount || 0),
  currency: String(refund.currency || 'INR').toUpperCase(),
  status: refund.status || 'pending',
  speed_processed: refund.speed_processed || '',
  speed_requested: refund.speed_requested || '',
  created_at: Number(refund.created_at || 0),
  source: 'razorpay_live_api',
});

const liveSettlementRow = settlement => ({
  id: settlement.id,
  entity: settlement.entity || 'settlement',
  amount: Number(settlement.amount || 0),
  fees: Number(settlement.fees || 0),
  tax: Number(settlement.tax || 0),
  net_amount: Number(settlement.net_amount || Number(settlement.amount || 0) - Number(settlement.fees || 0) - Number(settlement.tax || 0)),
  currency: String(settlement.currency || 'INR').toUpperCase(),
  status: settlement.status || 'created',
  utr: settlement.utr || '',
  created_at: Number(settlement.created_at || 0),
  settled_at: Number(settlement.settled_at || settlement.created_at || 0),
  transaction_count: Number(settlement.transaction_count || 0),
  source: 'razorpay_live_api',
});

const liveStats = async (adapter, config) => {
  const [payments, refunds] = await Promise.all([
    collectLiveItems(adapter, 'listPayments', config, { count: 100 }, 1000),
    collectLiveItems(adapter, 'listRefunds', config, { count: 100 }, 1000),
  ]);
  const capturedPayments = payments.items.filter(payment => ['captured', 'refunded'].includes(String(payment.status || '').toLowerCase()) || Number(payment.captured) === 1);
  const failedPayments = payments.items.filter(payment => String(payment.status || '').toLowerCase() === 'failed');
  const daily = new Map();
  const since = Date.now() - (7 * 86400000);
  capturedPayments.forEach(payment => {
    const createdAt = Number(payment.created_at || 0) * 1000;
    if (!createdAt || createdAt < since) return;
    const date = new Date(createdAt).toISOString().slice(0, 10);
    const current = daily.get(date) || { date, amount: 0, count: 0 };
    current.amount += Number(payment.amount || 0) / 100;
    current.count += 1;
    daily.set(date, current);
  });
  return {
    totalRevenue: Math.round(capturedPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)) / 100,
    totalPayments: payments.items.length,
    captured: capturedPayments.length,
    failed: failedPayments.length,
    refunded: refunds.items.length,
    dailyData: [...daily.values()].sort((left, right) => left.date.localeCompare(right.date)).map(item => ({ ...item, amount: Math.round(item.amount * 100) / 100 })),
    source: 'razorpay_live_api',
    live: true,
    snapshot: { payments: payments.items.length, refunds: refunds.items.length, truncated: payments.truncated || refunds.truncated },
  };
};

// Razorpay overview metrics come from the live provider account. Local payment
// ledgers remain available through the provider-neutral audit endpoints, but
// the legacy Razorpay dashboard must reflect the account operators see in
// Razorpay rather than a partial local projection.
const getDashboardStats = asyncHandler(async (req, res) => {
  const adapter = getAdapter('listPayments');
  const config = await liveConfigFor(req);
  res.json({ success: true, stats: await liveStats(adapter, config) });
});

// Payment rows are read directly from the tenant's authenticated Razorpay
// account. The credentials are tenant-scoped, so the provider response cannot
// cross into another tenant's account.
const getPayments = asyncHandler(async (req, res) => {
  const count = safeLimit(req.query.count);
  const skip = safeSkip(req.query.skip);
  const adapter = getAdapter('listPayments');
  const config = await liveConfigFor(req);
  const result = await adapter.listPayments({ count, skip, from: req.query.from, to: req.query.to }, config);
  const items = result.items || [];
  res.json({ success: true, items: items.map(livePaymentRow), count: Number(result.count ?? items.length), skip, tenantScoped: true, source: 'razorpay_live_api', live: true });
});

const getPayment = asyncHandler(async (req, res) => {
  const adapter = getAdapter('fetchPayment');
  const payment = await adapter.fetchPayment(req.params.id, await liveConfigFor(req));
  res.json({ success: true, payment: livePaymentRow(payment), tenantScoped: true, source: 'razorpay_live_api', live: true });
});

const getOrders = asyncHandler(async (req, res) => {
  const count = safeLimit(req.query.count);
  const skip = safeSkip(req.query.skip);
  const adapter = getAdapter('listOrders');
  const config = await liveConfigFor(req);
  const result = await adapter.listOrders({ count, skip, from: req.query.from, to: req.query.to }, config);
  const items = result.items || [];
  res.json({ success: true, items: items.map(liveOrderRow), count: Number(result.count ?? items.length), skip, tenantScoped: true, source: 'razorpay_live_api', live: true });
});

const getRefunds = asyncHandler(async (req, res) => {
  const count = safeLimit(req.query.count);
  const skip = safeSkip(req.query.skip);
  const adapter = getAdapter('listRefunds');
  const config = await liveConfigFor(req);
  const result = await adapter.listRefunds({ count, skip, from: req.query.from, to: req.query.to }, config);
  const items = result.items || [];
  res.json({ success: true, items: items.map(liveRefundRow), count: Number(result.count ?? items.length), skip, tenantScoped: true, source: 'razorpay_live_api', live: true });
});

const createLiveRefund = async (req, paymentId) => {
  const config = await liveConfigFor(req);
  const fetcher = getAdapter('fetchPayment');
  const refunder = getAdapter('refund');
  const payment = await fetcher.fetchPayment(paymentId, config);
  if (!['captured', 'refunded'].includes(String(payment.status || '').toLowerCase())) {
    const error = new Error(`Only a captured Razorpay payment can be refunded (current status: ${payment.status || 'unknown'})`);
    error.statusCode = 409;
    throw error;
  }

  const availablePaise = Math.max(0, Number(payment.amount || 0) - Number(payment.amount_refunded || 0));
  const requestedPaise = req.body?.amount === undefined ? availablePaise : Math.round(Number(req.body.amount));
  const amount = requestedPaise / 100;
  if (!Number.isFinite(amount) || amount <= 0) { const error = new Error('Refund amount must be greater than zero'); error.statusCode = 400; throw error; }
  if (requestedPaise > availablePaise) { const error = new Error('Refund amount exceeds the remaining Razorpay payment amount'); error.statusCode = 409; throw error; }

  const refundId = normalizeKeyPart(req.body?.refundId || req.headers?.['idempotency-key'] || `amount-${requestedPaise}`);
  const notes = req.body?.notes && typeof req.body.notes === 'object'
    ? req.body.notes
    : req.body?.notes ? { reason: String(req.body.notes).slice(0, 200) } : undefined;
  const result = await refunder.refund({ paymentId, amount, refundId, notes }, config);
  return {
    id: result.refundId,
    payment_id: result.paymentId || paymentId,
    amount: Math.round(Number(result.amount || amount) * 100),
    currency: String(result.currency || payment.currency || 'INR').toUpperCase(),
    status: result.status || 'processed',
    created_at: Math.floor(Date.now() / 1000),
    source: 'razorpay_live_api',
  };
};

const createRefund = asyncHandler(async (req, res) => {
  const paymentId = String(req.body?.paymentId || '').trim();
  if (!paymentId) { res.status(400); throw new Error('paymentId is required'); }
  const attempt = await findAttempt(req, paymentId);
  if (!attempt) {
    const refund = await createLiveRefund(req, paymentId);
    return res.json({ success: true, idempotent: false, refund, tenantScoped: true, source: 'razorpay_live_api', live: true });
  }
  if (attempt.status !== 'captured') { res.status(409); throw new Error('Only a captured payment can be refunded'); }
  if (!attempt.externalPaymentId) { res.status(409); throw new Error('Captured payment has no provider payment identifier'); }

  const requestedPaise = req.body?.amount === undefined ? Math.round(Number(attempt.amount || 0) * 100) : Math.round(Number(req.body.amount));
  const amount = requestedPaise / 100;
  if (!Number.isFinite(amount) || amount <= 0) { res.status(400); throw new Error('Refund amount must be greater than zero'); }
  const tenant = tenantIdFor(req);
  const orderId = attempt.order?._id || attempt.order;
  const refundedRows = await PaymentTransaction.aggregate([
    { $match: { tenant, provider: PROVIDER, order: orderId, eventType: 'refunded', status: 'succeeded' } },
    { $group: { _id: null, amount: { $sum: '$amount' } } },
  ]);
  const remaining = Math.round((Number(attempt.amount || 0) - Number(refundedRows[0]?.amount || 0)) * 100) / 100;
  if (amount > remaining) { res.status(409); throw new Error('Refund amount exceeds the remaining captured amount'); }

  const clientKey = req.body?.refundId || req.headers?.['idempotency-key'] || `amount-${requestedPaise}`;
  const refundId = normalizeKeyPart(clientKey);
  const ledgerKey = `legacy-refund:${attempt._id}:${refundId}`.slice(0, 145);
  const successKey = `${ledgerKey}:succeeded`;
  const existing = await PaymentTransaction.findOne({ tenant, provider: PROVIDER, eventType: 'refunded', status: 'succeeded', idempotencyKey: successKey }).lean();
  if (existing) return res.json({ success: true, idempotent: true, refund: refundRow({ ...existing, paymentAttempt: attempt }) });

  const notes = req.body?.notes && typeof req.body.notes === 'object' ? req.body.notes : req.body?.notes ? { reason: String(req.body.notes).slice(0, 200) } : undefined;
  await recordPaymentTransaction({
    tenant, order: orderId, paymentAttempt: attempt._id, provider: PROVIDER, eventType: 'refund_requested', status: 'pending', amount, currency: attempt.currency,
    externalOrderId: attempt.externalOrderId, externalPaymentId: refundId, idempotencyKey: `${ledgerKey}:requested`.slice(0, 160), source: 'admin', reason: 'Legacy Razorpay dashboard refund requested', actor: req.user?._id,
  });

  let result;
  try {
    const adapter = getAdapter('refund');
    result = await adapter.refund({ paymentId: attempt.externalPaymentId, amount, refundId, notes }, await configFor(req));
  } catch (error) {
    await recordPaymentTransaction({
      tenant, order: orderId, paymentAttempt: attempt._id, provider: PROVIDER, eventType: 'refund_failed', status: 'failed', amount, currency: attempt.currency,
      externalOrderId: attempt.externalOrderId, externalPaymentId: refundId, idempotencyKey: `${ledgerKey}:failed`.slice(0, 160), source: 'admin', reason: String(error.message || 'Razorpay refund failed'), actor: req.user?._id,
    });
    throw error;
  }

  const providerRefundId = String(result?.refundId || refundId);
  await recordPaymentTransaction({
    tenant, order: orderId, paymentAttempt: attempt._id, provider: PROVIDER, eventType: 'refunded', status: 'succeeded', amount,
    currency: result?.currency || attempt.currency, externalOrderId: attempt.externalOrderId, externalPaymentId: providerRefundId, providerEventId: providerRefundId,
    idempotencyKey: successKey, source: 'admin', reason: 'Legacy Razorpay dashboard refund completed', actor: req.user?._id,
  });
  const order = await Order.findOne({ ...tenantScope(req), _id: orderId }).select('total refundTotal').lean();
  const refundTotal = Math.round((Number(order?.refundTotal || 0) + amount) * 100) / 100;
  const fullyRefunded = refundTotal >= Number(order?.total || attempt.amount || 0);
  await Promise.all([
    PaymentAttempt.findByIdAndUpdate(attempt._id, { $set: { status: fullyRefunded ? 'refunded' : 'captured', metadata: { ...(attempt.metadata || {}), lastRefund: { refundId: providerRefundId, amount } } } }),
    Order.updateOne({ ...tenantScope(req), _id: orderId }, { $set: { paymentStatus: fullyRefunded ? 'refunded' : 'partially_refunded', refundTotal } }),
  ]);
  res.json({ success: true, idempotent: false, refund: { id: providerRefundId, payment_id: attempt.externalPaymentId, amount: requestedPaise, status: 'processed', created_at: Math.floor(Date.now() / 1000) } });
});

const getSettlements = asyncHandler(async (req, res) => {
  const count = safeLimit(req.query.count);
  const skip = safeSkip(req.query.skip);
  const adapter = getAdapter('listSettlements');
  const config = await liveConfigFor(req);
  const result = await adapter.listSettlements({ count, skip, from: req.query.from, to: req.query.to, status: req.query.status }, config);
  const items = result.items || [];
  res.json({
    success: true,
    items: items.map(liveSettlementRow),
    count: Number(result.count ?? items.length),
    pagination: { page: Math.floor(skip / count) + 1, limit: count, pages: items.length < count ? Math.floor(skip / count) + 1 : undefined, total: Number(result.count ?? items.length) },
    tenantScoped: true,
    source: 'razorpay_live_api',
    live: true,
    settlementsAvailable: true,
    reconciliationRequired: false,
  });
});

const getSettlement = asyncHandler(async (req, res) => {
  const adapter = getAdapter('fetchSettlement');
  const settlement = await adapter.fetchSettlement(req.params.id, await liveConfigFor(req));
  res.json({ ...liveSettlementRow(settlement), success: true, tenantScoped: true, live: true });
});

// Reconciliation imports only normalized provider settlement data. The
// service resolves every payment id against this tenant before persisting and
// never stores the raw provider response or credentials.
const reconcileSettlement = asyncHandler(async (req, res) => {
  const settlement = req.body?.settlement || req.body || {};
  const entries = req.body?.payments || req.body?.entries || settlement.payments || settlement.entries || [];
  const result = await paymentSettlementService.reconcileSettlement({
    tenant: tenantIdFor(req),
    provider: PROVIDER,
    settlement,
    entries,
    source: 'admin',
    actor: req.user?._id,
  });
  res.status(result.idempotent ? 200 : 201).json({
    success: true,
    idempotent: result.idempotent,
    settlement: settlementRow(result.settlement),
    tenantScoped: true,
    source: 'tenant_settlement_ledger',
  });
});

const capturePayment = asyncHandler(async (req, res) => {
  const attempt = await findAttempt(req, req.params.id);
  if (!attempt) {
    const config = await liveConfigFor(req);
    const fetcher = getAdapter('fetchPayment');
    const capturer = getAdapter('capture');
    const payment = await fetcher.fetchPayment(req.params.id, config);
    if (payment.status === 'captured') return res.json({ success: true, idempotent: true, payment: livePaymentRow(payment), tenantScoped: true, source: 'razorpay_live_api', live: true });
    if (payment.status !== 'authorized') { res.status(409); throw new Error(`Only an authorized Razorpay payment can be captured (current status: ${payment.status || 'unknown'})`); }
    const amountPaise = Math.round(Number(req.body?.amount || payment.amount || 0));
    if (!Number.isFinite(amountPaise) || amountPaise <= 0) { res.status(400); throw new Error('amount is required in paise'); }
    const result = await capturer.capture({ paymentId: req.params.id, amount: amountPaise / 100, currency: String(req.body?.currency || payment.currency || 'INR').toUpperCase() }, config);
    const updated = { ...payment, status: result.status || 'captured', captured: 1, amount: Math.round(Number(result.amount || amountPaise / 100) * 100), currency: result.currency || payment.currency };
    return res.json({ success: true, idempotent: false, payment: livePaymentRow(updated), tenantScoped: true, source: 'razorpay_live_api', live: true });
  }
  if (attempt.status === 'captured') return res.json({ success: true, idempotent: true, payment: paymentRow(attempt) });
  if (!attempt.externalPaymentId) { res.status(409); throw new Error('Authorized payment has no provider payment identifier'); }
  const amountPaise = Math.round(Number(req.body?.amount));
  if (!Number.isFinite(amountPaise) || amountPaise <= 0) { res.status(400); throw new Error('amount is required in paise'); }
  const amount = amountPaise / 100;
  const currency = String(req.body?.currency || attempt.currency || 'INR').toUpperCase();
  const tenant = tenantIdFor(req);
  const keyPart = normalizeKeyPart(req.headers?.['idempotency-key'] || `${attempt.externalPaymentId}-${amountPaise}-${currency}`);
  const idempotencyKey = `legacy-capture:${attempt._id}:${keyPart}`.slice(0, 160);
  const existing = await PaymentTransaction.findOne({ tenant, provider: PROVIDER, eventType: 'provider_captured', source: 'admin', idempotencyKey }).lean();
  if (existing) {
    const refreshed = await PaymentAttempt.findById(attempt._id).populate('order').lean();
    return res.json({ success: true, idempotent: true, payment: paymentRow(refreshed || attempt) });
  }
  const adapter = getAdapter('capture');
  const result = await adapter.capture({ paymentId: attempt.externalPaymentId, amount, currency }, await configFor(req));
  const providerPaymentId = String(result?.paymentId || attempt.externalPaymentId);
  await recordPaymentTransaction({
    tenant, order: attempt.order?._id || attempt.order, paymentAttempt: attempt._id, provider: PROVIDER, eventType: 'provider_captured', status: 'succeeded',
    amount: result?.amount || amount, currency: result?.currency || currency, externalOrderId: attempt.externalOrderId, externalPaymentId: providerPaymentId,
    idempotencyKey, source: 'admin', reason: 'Legacy Razorpay dashboard capture completed', actor: req.user?._id,
  });
  await PaymentAttempt.findByIdAndUpdate(attempt._id, { $set: { status: 'captured', externalPaymentId: providerPaymentId, providerStatus: result?.status || 'captured', capturedAt: new Date() } });
  await Order.updateOne({ ...tenantScope(req), _id: attempt.order?._id || attempt.order }, { $set: { paymentStatus: 'paid', paymentId: providerPaymentId, paymentProvider: PROVIDER, paymentVerifiedAt: new Date() } });
  const refreshed = await PaymentAttempt.findById(attempt._id).populate('order').lean();
  res.json({ success: true, idempotent: false, payment: paymentRow(refreshed || attempt) });
});

module.exports = { getDashboardStats, getPayments, getPayment, getOrders, getRefunds, createRefund, getSettlements, getSettlement, reconcileSettlement, capturePayment };
