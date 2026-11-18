const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const PaymentAttempt = require('../models/PaymentAttempt');
const Shipment = require('../models/Shipment');
const Settings = require('../models/Settings');
const paymentManager = require('../services/payment/paymentManager');
const shippingManager = require('../services/shipping/providerManager');
const tenantIntegrationService = require('../services/tenantIntegrationService');
const { catalog, getAdapter } = require('../services/integrations/providerRegistry');
const { getActiveProviders, getActiveProvider, isSupported } = require('../services/providerSelectionService');
const PaymentTransaction = require('../models/PaymentTransaction');
const { listPaymentTransactions, summarizePaymentTransactions, recordPaymentTransaction } = require('../services/paymentTransactionService');

const providerId = value => String(value || '').trim().toLowerCase();
const scoped = (req, base = {}) => req.tenant?._id ? { ...base, tenant: req.tenant._id } : base;
const configuredProvider = (provider, config) => Boolean(config?.enabled && paymentManager.hasRequiredCredentials(provider, config));
const providerOrderIds = async (req, provider, limit = 100) => {
  const [attempts, orders] = await Promise.all([
    PaymentAttempt.find(scoped(req, { provider })).select('externalOrderId').sort({ createdAt: -1 }).limit(limit).lean(),
    Order.find(scoped(req, { paymentProvider: provider })).select('paymentProviderOrderId').sort({ createdAt: -1 }).limit(limit).lean(),
  ]);
  return [...new Set([...attempts, ...orders].map(item => item.externalOrderId || item.paymentProviderOrderId).filter(Boolean).map(String))].slice(0, limit);
};

const liveStatsFromTransactions = (transactions, source, snapshot = {}) => {
  const rows = Array.isArray(transactions) ? transactions : [];
  const captured = rows.filter(item => item.status === 'succeeded' || item.eventType === 'provider_captured');
  const failed = rows.filter(item => item.status === 'failed' || item.eventType === 'provider_failed');
  const refunded = rows.filter(item => item.eventType === 'refunded');
  const capturedAmount = captured.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const failedAmount = failed.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const refundedAmount = refunded.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const attempts = rows.reduce((out, item) => ({ ...out, [item.status || 'pending']: (out[item.status || 'pending'] || 0) + 1 }), {});
  return {
    attempts,
    paidAmount: Math.round(capturedAmount * 100) / 100,
    paidOrders: captured.length,
    totalRevenue: Math.round(capturedAmount * 100) / 100,
    totalPayments: rows.length,
    captured: captured.length,
    failed: failed.length,
    refunded: refunded.length,
    ledger: {
      events: {
        provider_captured: { count: captured.length, amount: Math.round(capturedAmount * 100) / 100 },
        provider_failed: { count: failed.length, amount: Math.round(failedAmount * 100) / 100 },
        refunded: { count: refunded.length, amount: Math.round(refundedAmount * 100) / 100 },
      },
      statuses: attempts,
      capturedAmount: Math.round(capturedAmount * 100) / 100,
      refundedAmount: Math.round(refundedAmount * 100) / 100,
      failedAmount: Math.round(failedAmount * 100) / 100,
      totalEvents: rows.length,
    },
    source,
    live: true,
    snapshot,
  };
};

const paymentSummary = asyncHandler(async (req, res) => {
  const provider = providerId(req.params.provider);
  if (!isSupported('payment', provider)) { res.status(400); throw new Error('Unsupported payment provider'); }
  const [config, activeProviders] = await Promise.all([
    paymentManager.getConfig({ provider, tenantId: req.tenant?._id }),
    getActiveProviders('payment'),
  ]);
  const adapter = getAdapter(provider);
  const configured = configuredProvider(provider, config);
  const providerInfo = { id: provider, name: catalog[provider].name, active: activeProviders.includes(provider), configured };

  if (configured && typeof adapter?.getDashboardSummary === 'function') {
    const stats = await adapter.getDashboardSummary(config, { from: req.query.from, to: req.query.to });
    return res.json({ success: true, provider: { ...providerInfo, live: true, dashboardSource: stats.source }, stats });
  }

  if (configured && typeof adapter?.listTransactionsForOrders === 'function') {
    const result = await adapter.listTransactionsForOrders(await providerOrderIds(req, provider), config);
    const stats = liveStatsFromTransactions(result.transactions, result.source || `${provider}_live_api`, result.snapshot || {});
    stats.dashboardNote = 'Live provider status is loaded for this tenant\'s provider order IDs.';
    return res.json({ success: true, provider: { ...providerInfo, live: true, dashboardSource: stats.source, dashboardScope: result.dashboardScope }, stats });
  }

  if (configured && typeof adapter?.listTransactions === 'function') {
    const result = await adapter.listTransactions({ count: 100, limit: 100, page: 1, skip: 0, from: req.query.from, to: req.query.to }, config);
    const stats = liveStatsFromTransactions(result.transactions, result.source || `${provider}_live_api`, { ...(result.snapshot || {}), hasMore: result.hasMore || false });
    return res.json({ success: true, provider: { ...providerInfo, live: true, dashboardSource: stats.source }, stats });
  }

  const [counts, revenue, ledger] = await Promise.all([
    PaymentAttempt.aggregate([{ $match: scoped(req, { provider }) }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Order.aggregate([{ $match: scoped(req, { paymentProvider: provider, paymentStatus: 'paid' }) }, { $group: { _id: null, amount: { $sum: '$total' }, count: { $sum: 1 } } }]),
    summarizePaymentTransactions({ tenant: req.tenant?._id, provider, from: req.query.from, to: req.query.to }),
  ]);
  const dashboardSource = 'tenant_payment_ledger';
  const dashboardNote = provider === 'cashfree'
    ? 'Cashfree exposes payment details per order. This view uses the tenant ledger until an order is selected for provider reconciliation.'
    : configured ? 'This provider adapter has no account-level transaction listing; the view uses the tenant payment ledger.' : 'Live provider credentials are not configured; the view uses only tenant ledger history.';
  res.json({ success: true, provider: { ...providerInfo, live: false, dashboardSource, liveApiAvailable: false }, stats: { attempts: counts.reduce((out, item) => ({ ...out, [item._id]: item.count }), {}), paidOrders: revenue[0]?.count || 0, paidAmount: revenue[0]?.amount || 0, ledger, source: dashboardSource, live: false, dashboardNote } });
});

const paymentTransactions = asyncHandler(async (req, res) => {
  const provider = providerId(req.params.provider);
  if (!isSupported('payment', provider)) { res.status(400); throw new Error('Unsupported payment provider'); }
  const config = await paymentManager.getConfig({ provider, tenantId: req.tenant?._id });
  const adapter = getAdapter(provider);
  if (configuredProvider(provider, config) && typeof adapter?.listTransactionsForOrders === 'function') {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const result = await adapter.listTransactionsForOrders(await providerOrderIds(req, provider, limit), config);
    let transactions = Array.isArray(result.transactions) ? result.transactions : [];
    if (req.query.eventType) transactions = transactions.filter(item => item.eventType === req.query.eventType);
    if (req.query.status) transactions = transactions.filter(item => item.status === req.query.status);
    return res.json({ success: true, ...result, transactions, source: result.source || `${provider}_live_api`, live: true, tenantScoped: true, ledgerBackfillPending: false });
  }
  if (configuredProvider(provider, config) && typeof adapter?.listTransactions === 'function') {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const page = Math.max(1, Number(req.query.page) || 1);
    const result = await adapter.listTransactions({
      count: limit,
      limit,
      page,
      skip: (page - 1) * limit,
      eventType: req.query.eventType,
      status: req.query.status,
      from: req.query.from,
      to: req.query.to,
    }, config);
    let transactions = Array.isArray(result.transactions) ? result.transactions : [];
    if (req.query.eventType) transactions = transactions.filter(item => item.eventType === req.query.eventType);
    if (req.query.status) transactions = transactions.filter(item => item.status === req.query.status);
    return res.json({ success: true, ...result, transactions, source: result.source || `${provider}_live_api`, live: true, tenantScoped: true, ledgerBackfillPending: false });
  }
  const ledger = await listPaymentTransactions({
    tenant: req.tenant?._id,
    provider,
    eventType: req.query.eventType,
    status: req.query.status,
    from: req.query.from,
    to: req.query.to,
    orderId: req.query.orderId,
    page: req.query.page,
    limit: req.query.limit,
  });
  // Older attempts predate the ledger. Keep the dashboard useful during the
  // additive migration while all new events are recorded append-only.
  if (ledger.pagination.total === 0) {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const attempts = await PaymentAttempt.find(scoped(req, { provider })).sort({ createdAt: -1 }).limit(limit).populate('order', 'orderNumber total paymentStatus createdAt').lean();
    return res.json({ success: true, transactions: attempts.map(attempt => ({
      ...attempt,
      eventType: 'attempt_created',
      source: 'system',
      status: attempt.status === 'failed' ? 'failed' : attempt.status === 'captured' ? 'succeeded' : 'pending',
      idempotentLegacyProjection: true,
    })), pagination: { page: 1, limit, total: attempts.length, pages: attempts.length ? 1 : 0 }, source: 'tenant_payment_ledger', live: false, tenantScoped: true, ledgerBackfillPending: attempts.length > 0 });
  }
  res.json({ success: true, ...ledger, source: 'tenant_payment_ledger', live: false, tenantScoped: true, ledgerBackfillPending: false });
});

const paymentRefund = asyncHandler(async (req, res) => {
  const provider = providerId(req.params.provider);
  if (!isSupported('payment', provider)) { res.status(400); throw new Error('Unsupported payment provider'); }
  const attempt = await PaymentAttempt.findOne(scoped(req, { provider, $or: [{ externalPaymentId: req.body.paymentId }, { externalOrderId: req.body.paymentId }] })).sort({ createdAt: -1 });
  if (!attempt) { res.status(404); throw new Error('Payment attempt not found'); }
  const order = await Order.findOne(scoped(req, { _id: attempt.order })).select('_id tenant total paymentStatus paymentCurrency paymentProviderOrderId refundTotal').lean();
  if (!order) { res.status(404); throw new Error('Payment order not found'); }
  if (!['captured', 'refunded'].includes(attempt.status)) { res.status(409); throw new Error('Only a captured payment can be refunded'); }
  const amount = Math.round(Number(req.body.amount || attempt.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) { res.status(400); throw new Error('Refund amount must be greater than zero'); }
  const refundedRows = await PaymentTransaction.aggregate([
    { $match: { ...(req.tenant?._id ? { tenant: req.tenant._id } : {}), provider, order: attempt.order, eventType: 'refunded', status: 'succeeded' } },
    { $group: { _id: null, amount: { $sum: '$amount' } } },
  ]);
  const capturedAmount = Number(attempt.amount || 0);
  const refundedAmount = Number(refundedRows[0]?.amount || 0);
  if (amount > Math.round((capturedAmount - refundedAmount) * 100) / 100) { res.status(409); throw new Error('Refund amount exceeds the remaining captured amount'); }
  const adapter = getAdapter(provider);
  const config = await paymentManager.getConfig({ provider, tenantId: req.tenant?._id });
  if (!adapter?.refund) { res.status(400); throw new Error(`${catalog[provider].name} refund API is not available in the configured adapter`); }
  const refundId = String(req.body.refundId || req.headers['idempotency-key'] || `refund_${attempt.order}_${Date.now()}`);
  const ledgerKey = key => `admin-refund:${provider}:${attempt._id}:${key}`.replace(/[^A-Za-z0-9._:-]/g, '-').slice(0, 160);
  const existingRefund = await PaymentTransaction.findOne({ ...(req.tenant?._id ? { tenant: req.tenant._id } : {}), provider, order: attempt.order, eventType: 'refunded', status: 'succeeded', idempotencyKey: ledgerKey(`${refundId}:succeeded`) }).lean();
  if (existingRefund) return res.json({ success: true, refund: { refundId: existingRefund.externalPaymentId, status: 'succeeded' }, idempotent: true });
  await recordPaymentTransaction({ tenant: req.tenant?._id, order: order._id, paymentAttempt: attempt._id, provider, eventType: 'refund_requested', status: 'pending', amount, currency: order.paymentCurrency || attempt.currency, externalOrderId: attempt.externalOrderId, externalPaymentId: refundId, idempotencyKey: ledgerKey(`${refundId}:requested`), source: 'admin', reason: req.body.reason || 'Admin refund requested', actor: req.user?._id });
  let result;
  try {
    result = await adapter.refund({ orderId: attempt.externalOrderId, paymentIntentId: attempt.externalOrderId, refundId, amount, reason: req.body.reason }, config);
  } catch (error) {
    await recordPaymentTransaction({ tenant: req.tenant?._id, order: order._id, paymentAttempt: attempt._id, provider, eventType: 'refund_failed', status: 'failed', amount, currency: order.paymentCurrency || attempt.currency, externalOrderId: attempt.externalOrderId, externalPaymentId: refundId, idempotencyKey: ledgerKey(`${refundId}:failed`), source: 'admin', reason: String(error.message || 'Provider refund failed') });
    throw error;
  }
  const providerRefundId = String(result?.refundId || refundId);
  await recordPaymentTransaction({ tenant: req.tenant?._id, order: order._id, paymentAttempt: attempt._id, provider, eventType: 'refunded', status: 'succeeded', amount, currency: order.paymentCurrency || attempt.currency, externalOrderId: attempt.externalOrderId, externalPaymentId: providerRefundId, idempotencyKey: ledgerKey(`${refundId}:succeeded`), source: 'admin', reason: req.body.reason || 'Provider refund completed', actor: req.user?._id });
  const nextRefundTotal = Math.round((Number(order.refundTotal || 0) + amount) * 100) / 100;
  const fullyRefunded = nextRefundTotal >= Number(order.total || attempt.amount);
  await PaymentAttempt.findByIdAndUpdate(attempt._id, { $set: { status: fullyRefunded ? 'refunded' : 'captured', metadata: { ...(attempt.metadata || {}), lastRefund: { refundId: providerRefundId, status: result?.status || 'succeeded', amount } } } });
  await Order.findByIdAndUpdate(order._id, { $set: { paymentStatus: fullyRefunded ? 'refunded' : 'partially_refunded', refundTotal: nextRefundTotal } });
  res.json({ success: true, refund: result, idempotent: false });
});

const shippingSummary = asyncHandler(async (req, res) => {
  const provider = providerId(req.params.provider);
  if (!isSupported('shipping', provider)) { res.status(400); throw new Error('Unsupported shipping provider'); }
  const [config, activeProvider, counts] = await Promise.all([
    shippingManager.configFor(req.tenant?._id, provider),
    getActiveProvider('shipping'),
    Shipment.aggregate([{ $match: scoped(req, { provider }) }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  res.json({ success: true, provider: { id: provider, name: catalog[provider].name, active: activeProvider === provider, configured: Boolean(config.enabled) }, stats: { shipments: counts.reduce((out, item) => ({ ...out, [item._id]: item.count }), {}) } });
});

const shippingShipments = asyncHandler(async (req, res) => {
  const provider = providerId(req.params.provider);
  if (!isSupported('shipping', provider)) { res.status(400); throw new Error('Unsupported shipping provider'); }
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const shipments = await Shipment.find(scoped(req, { provider })).sort({ createdAt: -1 }).limit(limit).populate('order', 'orderNumber total orderStatus createdAt').lean();
  res.json({ success: true, shipments });
});

const shippingRates = asyncHandler(async (req, res) => {
  const provider = providerId(req.params.provider);
  const rates = await shippingManager.getRates({ tenantId: req.tenant?._id, provider, ...(req.body || {}) });
  res.json({ success: true, rates });
});

const shippingTrack = asyncHandler(async (req, res) => {
  const provider = providerId(req.params.provider);
  const trackingNumber = req.body?.trackingNumber || req.query?.trackingNumber;
  if (!trackingNumber) { res.status(400); throw new Error('trackingNumber is required'); }
  const tracking = await shippingManager.trackShipment({ tenantId: req.tenant?._id, provider, trackingNumber });
  res.json({ success: true, tracking });
});

module.exports = { paymentSummary, paymentTransactions, paymentRefund, shippingSummary, shippingShipments, shippingRates, shippingTrack };
