const crypto = require('crypto');
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const WebhookEvent = require('../models/WebhookEvent');
const Order = require('../models/Order');
const PaymentAttempt = require('../models/PaymentAttempt');
const IntegrationConnection = require('../models/IntegrationConnection');
const integrationService = require('../services/integrationService');
const tenantIntegrationService = require('../services/tenantIntegrationService');
const { getAdapter } = require('../services/integrations/providerRegistry');
require('../services/integrations/registerBuiltins');
const inventoryReservationService = require('../services/inventoryReservationService');
const loyaltyService = require('../services/loyaltyService');
const couponSettlementService = require('../services/couponSettlementService');
const { recordPaymentTransaction } = require('../services/paymentTransactionService');

const SUPPORTED_PROVIDERS = new Set(['cashfree', 'razorpay', 'stripe']);
const orderProjection = '_id tenant user coupon orderNumber total externalPaymentAmount walletAmount walletSettlementStatus loyaltyPoints loyaltyAmount loyaltySettlementStatus giftCard giftCardAmount giftCardRefundedAmount giftCardSettlementStatus paymentStatus orderStatus paymentCurrency paymentId paymentProviderOrderId inventoryStatus inventoryReservation';

const externalAmountOf = order => {
  const amount = Number(order?.externalPaymentAmount);
  const hasSplit = Number(order?.walletAmount || 0) > 0
    || Number(order?.loyaltyPoints || 0) > 0
    || Number(order?.giftCardAmount || 0) > 0
    || (order?.walletSettlementStatus && order.walletSettlementStatus !== 'none')
    || (order?.loyaltySettlementStatus && order.loyaltySettlementStatus !== 'none')
    || (order?.giftCardSettlementStatus && order.giftCardSettlementStatus !== 'none');
  return Math.round(((hasSplit || amount > 0) ? amount : Number(order?.total || 0)) * 100) / 100;
};

const rawBodyOf = req => Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));

const parsePayload = rawBody => {
  try {
    const payload = JSON.parse(rawBody.toString('utf8'));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('payload must be an object');
    return payload;
  } catch (_) {
    const error = new Error('Invalid webhook payload');
    error.statusCode = 400;
    error.publicCode = 'PAYMENT_WEBHOOK_PAYLOAD_INVALID';
    throw error;
  }
};

const objectFor = (provider, payload) => {
  if (provider === 'stripe') return payload.data?.object || {};
  if (provider === 'razorpay') return payload.payload?.payment?.entity || payload.payload?.order?.entity || payload.payload?.payment || payload.payload?.order || {};
  return payload.data?.order || payload.data?.payment || payload.data || {};
};

const identifiersFrom = (provider, payload) => {
  const object = objectFor(provider, payload);
  if (provider === 'razorpay') {
    const orderObject = payload.payload?.order?.entity || {};
    const eventName = String(payload.event || '').toLowerCase();
    const status = String(object.status || eventName || '').toLowerCase();
    const providerOrderId = object.order_id || orderObject.id || '';
    const localOrderId = object.notes?.orderId || orderObject.notes?.orderId || '';
    const paymentId = object.id || '';
    return {
      object,
      providerOrderId: String(providerOrderId),
      localOrderId: String(localOrderId),
      paymentId: String(paymentId),
      status,
      successful: eventName === 'payment.captured' || status === 'captured',
      failed: eventName === 'payment.failed' || ['failed', 'refunded'].includes(status),
      amount: Number(object.amount_received ?? object.amount ?? 0) / 100,
      currency: String(object.currency || orderObject.currency || 'INR').toUpperCase(),
    };
  }
  const orderObject = provider === 'cashfree' ? (payload.data?.order || object) : object;
  const providerOrderId = provider === 'stripe'
    ? (object.id || object.payment_intent || '')
    : (orderObject.order_id || payload.data?.order_id || object.order_id || object.cf_order_id || '');
  const localOrderId = provider === 'stripe'
    ? (object.metadata?.orderId || '')
    : (orderObject.order_id || payload.data?.order_id || '');
  const paymentId = provider === 'stripe'
    ? (object.latest_charge || object.id || '')
    : (payload.data?.payment?.cf_payment_id || payload.data?.payment?.payment_id || object.cf_payment_id || object.payment_id || providerOrderId || '');
  const status = provider === 'stripe'
    ? String(object.status || (payload.type === 'payment_intent.succeeded' ? 'succeeded' : '')).toLowerCase()
    : String(payload.data?.payment?.payment_status || orderObject.order_status || object.order_status || '').toUpperCase();
  const successful = provider === 'stripe'
    ? payload.type === 'payment_intent.succeeded' || status === 'succeeded'
    : ['PAID', 'SUCCESS', 'COMPLETED'].includes(status);
  const failed = provider === 'stripe'
    ? payload.type === 'payment_intent.payment_failed' || ['canceled', 'requires_payment_method'].includes(status)
    : ['FAILED', 'CANCELLED', 'EXPIRED'].includes(status);
  const amount = provider === 'stripe'
    ? Number(object.amount_received ?? object.amount ?? 0) / 100
    : Number(orderObject.order_amount ?? payload.data?.payment?.payment_amount ?? object.amount ?? 0);
  const currency = String(provider === 'stripe'
    ? (object.currency || 'INR')
    : (orderObject.order_currency || payload.data?.payment?.payment_currency || 'INR')).toUpperCase();
  return { object, providerOrderId: String(providerOrderId || ''), localOrderId: String(localOrderId || ''), paymentId: String(paymentId || ''), status, successful, failed, amount, currency };
};

const errorWith = (message, statusCode, publicCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
};

const ledgerKey = (...parts) => `payment-ledger:${crypto.createHash('sha256').update(parts.map(part => String(part || '')).join('|')).digest('hex')}`;

const verifyWebhookForProvider = ({ provider, adapter, rawBody, headers, config }) => {
  if (provider === 'stripe') return adapter.verifyWebhook(rawBody, headers['stripe-signature'], config);
  if (provider === 'razorpay') return adapter.verifyWebhook(rawBody, headers['x-razorpay-signature'], config);
  return adapter.verifyWebhook(rawBody, headers['x-webhook-signature'], headers['x-webhook-timestamp'], config);
};

const findCandidateOrders = async ({ provider, identifiers }) => {
  const clauses = [];
  if (identifiers.providerOrderId) clauses.push({ $or: [{ paymentProvider: provider }, { paymentMethod: provider }], paymentProviderOrderId: identifiers.providerOrderId });
  if (mongoose.isValidObjectId(identifiers.localOrderId)) clauses.push({ _id: identifiers.localOrderId });
  if (identifiers.providerOrderId) {
    const attempts = await PaymentAttempt.find({ provider, externalOrderId: identifiers.providerOrderId })
      .select('order tenant')
      .limit(3)
      .lean();
    attempts.forEach(attempt => { if (attempt.order) clauses.push({ _id: attempt.order }); });
  }
  if (!clauses.length) return [];
  const orders = await Order.find({ $or: clauses }).select(orderProjection).limit(3).lean();
  const unique = new Map(orders.map(order => [String(order._id), order]));
  return [...unique.values()];
};

const verifyForTenant = async ({ provider, tenant, rawBody, headers }) => {
  if (!tenant) throw errorWith('Tenant context is required for payment webhook', 503, 'PAYMENT_WEBHOOK_TENANT_REQUIRED');
  const config = await tenantIntegrationService.configFor(tenant, provider, { allowPlatformFallback: true });
  if (!config.enabled || !config.webhook_secret) throw errorWith('Payment webhook is not configured', 503, 'PAYMENT_WEBHOOK_NOT_CONFIGURED');
  const adapter = getAdapter(provider);
  if (!adapter || typeof adapter.verifyWebhook !== 'function') throw errorWith('Payment webhook adapter is unavailable', 503, 'PAYMENT_WEBHOOK_ADAPTER_UNAVAILABLE');
  try {
    verifyWebhookForProvider({ provider, adapter, rawBody, headers, config });
  } catch (_) {
    throw errorWith('Invalid payment webhook signature', 401, 'PAYMENT_WEBHOOK_SIGNATURE_INVALID');
  }
  return config;
};

// Unknown provider events cannot be bound to a local order yet. We may still
// verify them against an enabled connection so an authentic unmapped event is
// recorded as ignored, while an unauthenticated request fails closed.
const findVerifiedUnmappedConnection = async ({ provider, rawBody, headers }) => {
  const adapter = getAdapter(provider);
  if (!adapter || typeof adapter.verifyWebhook !== 'function') return null;
  // Preserve the migration path for a legacy platform Integration. A valid
  // legacy signature can only create an ignored event when no tenant order is
  // found; it cannot authorize cross-tenant state changes.
  try {
    const legacy = await integrationService.getProviderConfig(provider);
    if (legacy?.enabled && legacy?.webhook_secret) {
      try {
        verifyWebhookForProvider({ provider, adapter, rawBody, headers, config: legacy });
        return { tenant: null, config: legacy };
      } catch (_) {
        if (mongoose.connection.readyState !== 1) return null;
      }
    }
  } catch (_) { /* tenant connections remain the source of truth when available */ }
  const connections = await IntegrationConnection.find({ provider, enabled: true }).select('+credentialsEncrypted tenant').lean();
  for (const connection of connections) {
    try {
      const credentials = integrationService.decrypt(connection.credentialsEncrypted);
      const config = { ...credentials, enabled: true };
      verifyWebhookForProvider({ provider, adapter, rawBody, headers, config });
      return { tenant: connection.tenant, config };
    } catch (_) { /* a signature may belong to another tenant connection */ }
  }
  return null;
};

const eventIdOf = (req, payload, rawBody) => String(req.headers['x-event-id'] || req.headers['x-payment-event-id'] || req.headers['x-razorpay-event-id'] || payload.id || crypto.createHash('sha256').update(rawBody).digest('hex'));

const eventResponse = (event, extra = {}) => ({
  success: true,
  idempotent: true,
  eventId: event.eventId,
  processed: event.status === 'processed',
  ...extra,
});

const claimEvent = async ({ tenant, provider, eventId, payload, identifiers, rawBody }) => {
  const existing = await WebhookEvent.findOne({ provider, eventId }).lean();
  if (existing) {
    if (existing.tenant && tenant && String(existing.tenant) !== String(tenant)) {
      throw errorWith('Payment webhook event belongs to another tenant', 409, 'PAYMENT_WEBHOOK_TENANT_CONFLICT');
    }
    if (['processed', 'ignored', 'processing'].includes(existing.status)) return { event: existing, duplicate: true };
  }
  try {
    const event = await WebhookEvent.create({
      tenant,
      provider,
      eventId,
      eventType: payload.type || payload.event,
      status: 'processing',
      externalOrderId: identifiers.providerOrderId,
      paymentId: identifiers.paymentId,
      payloadHash: crypto.createHash('sha256').update(rawBody).digest('hex'),
    });
    return { event: event.toObject(), duplicate: false };
  } catch (error) {
    if (error.code !== 11000) throw error;
    const raced = await WebhookEvent.findOne({ provider, eventId }).lean();
    if (raced?.tenant && tenant && String(raced.tenant) !== String(tenant)) throw errorWith('Payment webhook event belongs to another tenant', 409, 'PAYMENT_WEBHOOK_TENANT_CONFLICT');
    return { event: raced, duplicate: true };
  }
};

const finishEvent = (eventId, provider, update) => WebhookEvent.updateOne({ provider, eventId }, { $set: update });

const settleSuccessfulPayment = async ({ order, provider, identifiers, eventId }) => {
  const expectedAmount = externalAmountOf(order);
  if (Math.round(Number(identifiers.amount) * 100) !== Math.round(expectedAmount * 100)) {
    throw errorWith('Payment amount mismatch', 400, 'PAYMENT_WEBHOOK_AMOUNT_MISMATCH');
  }
  if (identifiers.currency !== String(order.paymentCurrency || 'INR').toUpperCase()) {
    throw errorWith('Payment currency mismatch', 400, 'PAYMENT_WEBHOOK_CURRENCY_MISMATCH');
  }
  if (order.paymentStatus === 'paid') return { idempotent: true, updated: false };
  if (order.paymentStatus !== 'pending' || order.orderStatus !== 'pending') return { idempotent: true, updated: false };

  const session = await mongoose.startSession();
  let captured = false;
  try {
    await session.withTransaction(async () => {
      const updated = await Order.findOneAndUpdate(
        { _id: order._id, tenant: order.tenant, paymentStatus: 'pending', orderStatus: 'pending', $or: [{ paymentProvider: provider }, { paymentMethod: provider }], paymentProviderOrderId: order.paymentProviderOrderId },
        { $set: { paymentStatus: 'paid', orderStatus: 'confirmed', paymentId: identifiers.paymentId || identifiers.providerOrderId, paymentVerifiedAt: new Date(), ...(order.walletAmount > 0 && order.walletSettlementStatus === 'debited' ? { walletSettlementStatus: 'captured' } : {}), ...(order.loyaltyPoints > 0 && order.loyaltySettlementStatus === 'debited' ? { loyaltySettlementStatus: 'captured' } : {}), ...(order.giftCardAmount > 0 && order.giftCardSettlementStatus === 'debited' ? { giftCardSettlementStatus: 'captured' } : {}) } },
        { new: true, session },
      );
      if (!updated) return;
      captured = true;
      await inventoryReservationService.convertReservation({ orderId: updated._id, reservationId: updated.inventoryReservation, session, reason: `${provider}_webhook_captured` });
      const paymentAttempt = await PaymentAttempt.findOne({ order: order._id, tenant: order.tenant, provider, $or: [{ externalOrderId: order.paymentProviderOrderId }, { externalOrderId: identifiers.providerOrderId }] }).sort({ createdAt: -1 }).session(session).lean();
      await PaymentAttempt.updateMany(
        { order: order._id, tenant: order.tenant, provider, externalOrderId: order.paymentProviderOrderId },
        { $set: { status: 'captured', externalPaymentId: identifiers.paymentId || identifiers.providerOrderId, lastWebhookEventId: eventId, lastWebhookAt: new Date(), providerStatus: identifiers.status, capturedAt: new Date() } },
      ).session(session);
      await recordPaymentTransaction({
        tenant: updated.tenant,
        order: updated._id,
        paymentAttempt: paymentAttempt?._id,
        provider,
        eventType: 'provider_captured',
        status: 'succeeded',
        amount: expectedAmount,
        currency: identifiers.currency,
        externalOrderId: identifiers.providerOrderId || order.paymentProviderOrderId,
        externalPaymentId: identifiers.paymentId || identifiers.providerOrderId,
        providerEventId: eventId,
        idempotencyKey: ledgerKey(provider, eventId, 'captured'),
        source: 'webhook',
        reason: `Provider webhook ${identifiers.status || 'captured'}`,
        session,
      });
      await couponSettlementService.captureCouponForOrder({ order: updated, session });
      if (updated.tenant) await loyaltyService.earnPurchasePoints({ tenant: updated.tenant, user: updated.user, order: updated, session });
    });
  } finally {
    await session.endSession();
  }
  return { idempotent: !captured, updated: captured };
};

// @desc Receive a signed tenant-bound Cashfree or Stripe webhook.
// @route POST /api/payments/:provider/webhook
const handlePaymentWebhook = asyncHandler(async (req, res) => {
  const provider = String(req.params.provider || '').toLowerCase();
  if (!SUPPORTED_PROVIDERS.has(provider)) { res.status(404); throw new Error('Provider webhook is not supported'); }
  const rawBody = rawBodyOf(req);
  const payload = parsePayload(rawBody);
  const identifiers = identifiersFrom(provider, payload);
  const candidates = await findCandidateOrders({ provider, identifiers });
  if (candidates.length > 1) throw errorWith('Payment webhook identifiers match multiple tenant orders', 409, 'PAYMENT_WEBHOOK_AMBIGUOUS');

  let tenant = candidates[0]?.tenant || null;
  if (tenant) {
    await verifyForTenant({ provider, tenant, rawBody, headers: req.headers || {} });
  } else {
    const matched = await findVerifiedUnmappedConnection({ provider, rawBody, headers: req.headers || {} });
    if (!matched) return res.status(401).json({ success: false, code: 'PAYMENT_WEBHOOK_SIGNATURE_INVALID', message: 'Invalid payment webhook signature' });
    tenant = matched.tenant;
  }

  const eventId = eventIdOf(req, payload, rawBody);
  const claimed = await claimEvent({ tenant, provider, eventId, payload, identifiers, rawBody });
  if (claimed.duplicate) return res.json(eventResponse(claimed.event));

  const order = candidates[0];
  if (!order) {
    await finishEvent(eventId, provider, { status: 'ignored', ignoredReason: 'tenant_order_not_found', processedAt: new Date() });
    return res.status(202).json({ success: true, ignored: true, reason: 'tenant_order_not_found', eventId });
  }

  try {
    if (identifiers.failed) {
      await PaymentAttempt.updateMany(
        { order: order._id, tenant: order.tenant, provider, externalOrderId: order.paymentProviderOrderId },
        { $set: { status: 'failed', providerStatus: identifiers.status, lastWebhookEventId: eventId, lastWebhookAt: new Date(), failureMessage: `Provider reported ${identifiers.status}` } },
      );
      const paymentAttempt = await PaymentAttempt.findOne({ order: order._id, tenant: order.tenant, provider, $or: [{ externalOrderId: order.paymentProviderOrderId }, { externalOrderId: identifiers.providerOrderId }] }).sort({ createdAt: -1 }).lean();
      await recordPaymentTransaction({
        tenant: order.tenant,
        order: order._id,
        paymentAttempt: paymentAttempt?._id,
        provider,
        eventType: 'provider_failed',
        status: 'failed',
        amount: paymentAttempt?.amount || identifiers.amount || externalAmountOf(order),
        currency: identifiers.currency || order.paymentCurrency || 'INR',
        externalOrderId: identifiers.providerOrderId || order.paymentProviderOrderId,
        externalPaymentId: identifiers.paymentId || identifiers.providerOrderId,
        providerEventId: eventId,
        idempotencyKey: ledgerKey(provider, eventId, 'failed'),
        source: 'webhook',
        reason: `Provider reported ${identifiers.status}`,
      });
    }
    const settlement = identifiers.successful
      ? await settleSuccessfulPayment({ order, provider, identifiers, eventId })
      : { idempotent: false, updated: false };
    await finishEvent(eventId, provider, { status: 'processed', processedAt: new Date() });
    if (settlement.updated) {
      const { createShipmentOrderInBackground } = require('./paymentController');
      setImmediate(() => createShipmentOrderInBackground(order._id).catch(error => console.error('[Shipping] payment webhook shipment enqueue failed:', error.message)));
    }
    return res.json({ success: true, processed: true, idempotent: Boolean(settlement.idempotent), eventId, tenant: String(order.tenant) });
  } catch (error) {
    if (order && identifiers.successful && ['PAYMENT_WEBHOOK_AMOUNT_MISMATCH', 'PAYMENT_WEBHOOK_CURRENCY_MISMATCH'].includes(error.publicCode)) {
      const paymentAttempt = await PaymentAttempt.findOne({ order: order._id, tenant: order.tenant, provider, $or: [{ externalOrderId: order.paymentProviderOrderId }, { externalOrderId: identifiers.providerOrderId }] }).sort({ createdAt: -1 }).lean();
      await recordPaymentTransaction({
        tenant: order.tenant,
        order: order._id,
        paymentAttempt: paymentAttempt?._id,
        provider,
        eventType: 'provider_failed',
        status: 'failed',
        amount: identifiers.amount || paymentAttempt?.amount || externalAmountOf(order),
        currency: identifiers.currency || order.paymentCurrency || 'INR',
        externalOrderId: identifiers.providerOrderId || order.paymentProviderOrderId,
        externalPaymentId: identifiers.paymentId || identifiers.providerOrderId,
        providerEventId: eventId,
        idempotencyKey: ledgerKey(provider, eventId, 'failed'),
        source: 'webhook',
        reason: error.publicCode,
      }).catch(() => {});
    }
    await finishEvent(eventId, provider, { status: 'failed', failureReason: String(error.message || 'Payment webhook processing failed').slice(0, 300) }).catch(() => {});
    throw error;
  }
});

module.exports = { handlePaymentWebhook, identifiersFrom, externalAmountOf };
