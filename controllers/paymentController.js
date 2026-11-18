const crypto = require('crypto');
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const PaymentAttempt = require('../models/PaymentAttempt');
const paymentManager = require('../services/payment/paymentManager');
const shippingManager = require('../services/shipping/shippingManager');
const { enqueue } = require('../services/outboxService');
const inventoryReservationService = require('../services/inventoryReservationService');
const walletSettlementService = require('../services/walletSettlementService');
const loyaltySettlementService = require('../services/loyaltySettlementService');
const giftCardSettlementService = require('../services/giftCardSettlementService');
const couponSettlementService = require('../services/couponSettlementService');
const loyaltyService = require('../services/loyaltyService');
const { recordPaymentTransaction } = require('../services/paymentTransactionService');

const ledgerKey = (...parts) => `payment-ledger:${crypto.createHash('sha256').update(parts.map(part => String(part || '')).join('|')).digest('hex')}`;
const guestTokenHash = token => crypto.createHash('sha256').update(String(token || '')).digest('hex');
const guestOrderAuthorized = (order, token) => {
  const supplied = String(token || '').trim();
  if (!supplied || !order?.guestAccessTokenHash || !order.guestAccessTokenExpiresAt || order.guestAccessTokenExpiresAt <= new Date()) return false;
  const expected = Buffer.from(String(order.guestAccessTokenHash));
  const actual = Buffer.from(guestTokenHash(supplied));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};
const assertPaymentOrderAccess = (req, res, order, token) => {
  const guestAuthorized = guestOrderAuthorized(order, token);
  if (!req.user && !guestAuthorized) {
    res.status(401);
    throw new Error('Guest order access token is required');
  }
  if (req.user && !['admin', 'superadmin'].includes(req.user.role) && String(order.user) !== String(req.user._id) && !guestAuthorized) {
    res.status(403);
    throw new Error('Not authorized');
  }
};

// Calculate package weight & dimensions from order items
// Weight: sum of (product.weight × quantity), Dimensions: max across all items
const calcPackageDimensions = (order) => {
  let totalWeight = 0;
  let maxLength = 0, maxWidth = 0, maxHeight = 0;

  for (const item of order.items) {
    const p = item.product;
    const qty = item.quantity || 1;
    const w = (p && typeof p === 'object' && p.weight) ? p.weight : 0.5;
    totalWeight += w * qty;

    if (p && typeof p === 'object' && p.dimensions) {
      if (p.dimensions.length > maxLength) maxLength = p.dimensions.length;
      if (p.dimensions.width > maxWidth) maxWidth = p.dimensions.width;
      if (p.dimensions.height > maxHeight) maxHeight = p.dimensions.height;
    }
  }

  return {
    weight: totalWeight || 0.5,
    length: maxLength || 10,
    breadth: maxWidth || 10,
    height: maxHeight || 10,
  };
};

// Helper: create the selected shipping-provider order in the background after payment
const createShipmentOrderInBackground = async (orderId) => {
  try {
    const order = await Order.findById(orderId).populate('items.product', 'title sku weight dimensions');
    if (!order) return;

    const providerId = await shippingManager.selectedProvider();
    if (!providerId) return;
    const tenantConfig = await shippingManager.getConfig(providerId, order.tenant);
    if (!tenantConfig.enabled) {
      console.warn(`[${providerId}] Credentials not configured — skipping auto-shipment for order`, orderId);
      return;
    }

    const claimedOrder = await Order.findOneAndUpdate(
      { _id: order._id, shippingCreationLock: { $ne: true }, shippingProvider: { $in: ['', null] }, shiprocketOrderId: { $exists: false } },
      { $set: { shippingCreationLock: true, shippingCreationLockedAt: new Date() } },
      { new: true },
    );
    if (!claimedOrder) return;

    const Shipment = require('../models/Shipment');
    const existingShipment = await Shipment.findOne({ order: order._id, provider: providerId, status: { $ne: 'failed' } });
    if (existingShipment) return;

    const pkg = calcPackageDimensions(order);

    const shipmentData = {
      orderId: order.orderNumber,
      customerName: order.shippingAddress.fullName,
      customerEmail: '',
      address: order.shippingAddress,
      items: order.items.map(i => ({
        title: i.title,
        sku: i.sku || i.title?.slice(0, 20),
        quantity: i.quantity,
        price: i.price,
      })),
      total: order.total,
      paymentMethod: order.paymentMethod,
      weight: pkg.weight,
      length: pkg.length,
      breadth: pkg.breadth,
      height: pkg.height,
    };

    const result = await require('../services/shipping/providerManager').createShipment({ tenantId: order.tenant, provider: providerId, data: shipmentData });

    await Shipment.create({
      tenant: order.tenant,
      order: order._id,
      provider: providerId,
      idempotencyKey: `shipping-after-payment:${order._id}:${providerId}`,
      status: 'created',
      externalOrderId: String(result.orderId || ''),
      externalShipmentId: String(result.shipmentId || ''),
      trackingNumber: result.awbCode || result.waybill || result.awbNumber || '',
      courierName: result.courierName || '',
      raw: result,
    }).catch(error => { if (error.code !== 11000) throw error; });

    await Order.findByIdAndUpdate(orderId, {
      shippingProvider: providerId,
      shippingExternalOrderId: result.orderId,
      shippingExternalShipmentId: result.shipmentId,
      trackingNumber: result.awbCode || result.waybill || result.awbNumber,
      courierName: result.courierName,
      shippingStatus: result.status || 'created',
      shippingLastSync: new Date(),
      shippingCreationLock: false,
      ...(providerId === 'shiprocket' ? {
        shiprocketOrderId: result.orderId,
        shiprocketShipmentId: result.shipmentId,
        awbCode: result.awbCode,
        shiprocketStatus: result.status || 'NEW',
        shiprocketLastSync: new Date(),
      } : {}),
    });

    console.log(`[${providerId}] Auto-created shipment for`, orderId, '→ external order', result.orderId);
  } catch (err) {
    await Order.findByIdAndUpdate(orderId, { $set: { shippingCreationLock: false } }).catch(() => {});
    console.error('[Shipping] Auto-create failed for order', orderId, err.message);
  }
};

// Legacy orders may not have a tender split. New wallet/loyalty orders use
// zero deliberately when fully covered, so only fall back to total when no
// split is recorded at all.
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

// @desc    Get all active payment gateways (public config only)
// @route   GET /api/payments/gateways
const getActiveGateways = asyncHandler(async (req, res) => {
  const gateways = await paymentManager.getActiveGateways({ tenantId: req.tenant?._id });
  res.json({ success: true, gateways });
});

// @desc    Create a payment order for Razorpay
// @route   POST /api/payments/order
const createPaymentOrder = asyncHandler(async (req, res) => {
  const { gatewayId, orderId } = req.body;
  if (!gatewayId || !orderId) {
    res.status(400);
    throw new Error('gatewayId and orderId are required');
  }

  const order = await Order.findOne({ _id: orderId, ...(req.tenant ? { tenant: req.tenant._id } : {}) }).select('+guestAccessTokenHash');
  if (!order) { res.status(404); throw new Error('Order not found'); }
  assertPaymentOrderAccess(req, res, order, req.body?.guestAccessToken || req.headers?.['x-guest-order-token']);
  if (order.paymentStatus !== 'pending' || order.orderStatus !== 'pending') {
    res.status(409);
    throw new Error('This order is not awaiting payment');
  }
  const payableAmount = externalAmountOf(order);
  if (payableAmount <= 0) {
    res.status(409);
    throw new Error('This order has no external payment amount remaining');
  }
  await inventoryReservationService.assertReservationActive({ orderId: order._id });
  const idempotencyKey = req.headers['idempotency-key'] || `order:${order._id}:${gatewayId}`;
  const activeAttempt = await PaymentAttempt.findOne({ order: order._id, status: { $in: ['creating', 'created', 'pending', 'authorized'] } }).lean();
  if (activeAttempt && activeAttempt.provider !== gatewayId) {
    res.status(409);
    throw new Error(`Payment attempt is already active with ${activeAttempt.provider}`);
  }
  if (activeAttempt?.status === 'creating') {
    res.status(409);
    throw new Error('Payment attempt is already being created; retry with the same Idempotency-Key');
  }
  if (activeAttempt?.externalOrderId && !order.paymentProviderOrderId) {
    await Order.updateOne({ _id: order._id, paymentStatus: 'pending' }, { $set: { paymentMethod: gatewayId, paymentProvider: gatewayId, paymentProviderOrderId: activeAttempt.externalOrderId, paymentCurrency: activeAttempt.currency || 'INR' } });
    order.paymentMethod = gatewayId;
    order.paymentProviderOrderId = activeAttempt.externalOrderId;
    order.paymentCurrency = activeAttempt.currency || 'INR';
  }
  if (order.paymentProviderOrderId && order.paymentMethod === gatewayId) {
    const existingConfig = await paymentManager.getConfig({ provider: gatewayId, tenantId: req.tenant?._id });
    const existingAttempt = await PaymentAttempt.findOne({ order: order._id, provider: gatewayId }).select('metadata').lean();
    const existingMetadata = existingAttempt?.metadata || {};
    return res.json({
      success: true,
      paymentOrder: {
        id: order.paymentProviderOrderId,
        razorpayOrderId: gatewayId === 'razorpay' ? order.paymentProviderOrderId : undefined,
        externalOrderId: order.paymentProviderOrderId,
        amount: Math.round(payableAmount * 100),
        currency: order.paymentCurrency || 'INR',
        key_id: gatewayId === 'razorpay' ? existingConfig.key_id : undefined,
        publishable_key: gatewayId === 'stripe' ? existingConfig.publishable_key : undefined,
        environment: existingConfig.environment || 'sandbox',
        paymentSessionId: existingMetadata.paymentSessionId,
        clientSecret: existingMetadata.clientSecret,
      },
      idempotent: true,
    });
  }

  let attempt;
  try {
    attempt = await PaymentAttempt.create({ order: order._id, tenant: req.tenant?._id, provider: gatewayId, amount: payableAmount, currency: 'INR', idempotencyKey, status: 'creating' });
  } catch (error) {
    if (error.code === 11000) {
      const failed = await PaymentAttempt.findOneAndUpdate({ order: order._id, provider: gatewayId, status: 'failed' }, { $set: { tenant: req.tenant?._id, amount: payableAmount, currency: 'INR', idempotencyKey, status: 'creating', failureMessage: '' } }, { new: true });
      if (failed) attempt = failed;
      else { res.status(409); throw new Error('Payment attempt already exists; retry with the original Idempotency-Key'); }
    }
    else throw error;
  }
  await recordPaymentTransaction({
    tenant: req.tenant?._id,
    order: order._id,
    paymentAttempt: attempt._id,
    provider: gatewayId,
    eventType: 'attempt_created',
    status: 'pending',
    amount: payableAmount,
    currency: 'INR',
    idempotencyKey: ledgerKey(gatewayId, attempt._id, idempotencyKey, 'attempt_created'),
    source: 'checkout',
    reason: 'Payment attempt created',
  });
  let paymentOrder;
  try {
    paymentOrder = await paymentManager.createOrder(gatewayId, { amount: payableAmount, orderId: order._id.toString(), currency: 'INR', tenantId: req.tenant?._id, idempotencyKey });
  } catch (error) {
    await PaymentAttempt.findByIdAndUpdate(attempt._id, { $set: { status: 'failed', failureMessage: String(error.message || 'Payment order creation failed').slice(0, 500) } });
    await recordPaymentTransaction({
      tenant: req.tenant?._id,
      order: order._id,
      paymentAttempt: attempt._id,
      provider: gatewayId,
      eventType: 'provider_failed',
      status: 'failed',
      amount: payableAmount,
      currency: 'INR',
      idempotencyKey: ledgerKey(gatewayId, attempt._id, idempotencyKey, 'provider_failed'),
      source: 'checkout',
      reason: String(error.message || 'Payment order creation failed'),
    }).catch(() => {});
    throw error;
  }

  const externalOrderId = paymentOrder.externalOrderId || paymentOrder.razorpayOrderId || paymentOrder.id || '';
  await PaymentAttempt.findByIdAndUpdate(attempt._id, { $set: { externalOrderId, status: 'pending', metadata: { paymentSessionId: paymentOrder.paymentSessionId || '', clientSecret: paymentOrder.clientSecret || '' } } });
  await recordPaymentTransaction({
    tenant: req.tenant?._id,
    order: order._id,
    paymentAttempt: attempt._id,
    provider: gatewayId,
    eventType: 'provider_order_created',
    status: 'pending',
    amount: payableAmount,
    currency: paymentOrder.currency || 'INR',
    externalOrderId,
    idempotencyKey: ledgerKey(gatewayId, attempt._id, externalOrderId, 'provider_order_created'),
    source: 'checkout',
    reason: 'Provider payment order created',
  });

  await Order.findByIdAndUpdate(orderId, {
    paymentMethod: gatewayId,
    paymentProvider: gatewayId,
    paymentProviderOrderId: paymentOrder.externalOrderId || paymentOrder.razorpayOrderId || paymentOrder.id,
    paymentCurrency: paymentOrder.currency || 'INR',
  });

  paymentOrder.environment = (await paymentManager.getConfig({ provider: gatewayId, tenantId: req.tenant?._id })).environment || 'sandbox';
  res.json({ success: true, paymentOrder });
});

// @desc    Release a wallet debit when a payment attempt has failed before a
// provider payment becomes active. A pending/authorized provider attempt is
// deliberately not released because a late provider capture must never be
// allowed to race a local wallet reversal.
// @route   POST /api/payments/release-wallet
const releaseWallet = asyncHandler(async (req, res) => {
  const { orderId } = req.body;
  if (!orderId) {
    res.status(400);
    throw new Error('orderId is required');
  }
  const order = await Order.findOne({ _id: orderId, ...(req.tenant ? { tenant: req.tenant._id } : {}) }).select('+guestAccessTokenHash');
  if (!order) { res.status(404); throw new Error('Order not found'); }
  assertPaymentOrderAccess(req, res, order, req.body?.guestAccessToken || req.headers?.['x-guest-order-token']);
  const walletPending = Number(order.walletAmount || 0) > 0 && order.walletSettlementStatus === 'debited';
  const loyaltyPending = Number(order.loyaltyPoints || 0) > 0 && order.loyaltySettlementStatus === 'debited';
  const giftCardPending = Number(order.giftCardAmount || 0) > 0 && order.giftCardSettlementStatus === 'debited';
  if (!walletPending && !loyaltyPending && !giftCardPending) {
    return res.json({ success: true, released: false, idempotent: true, order });
  }
  const activeAttempt = await PaymentAttempt.findOne({ order: order._id, status: { $in: ['creating', 'created', 'pending', 'authorized'] } }).lean();
  if (activeAttempt) {
    res.status(409);
    const error = new Error('Stored tender cannot be released while a provider payment attempt is active');
    error.publicCode = 'TENDER_RELEASE_PAYMENT_ACTIVE';
    throw error;
  }

  const session = await mongoose.startSession();
  let updated;
  try {
    await session.withTransaction(async () => {
      updated = await Order.findOne({
        _id: order._id,
        ...(req.tenant ? { tenant: req.tenant._id } : {}),
        paymentStatus: 'pending',
        orderStatus: 'pending',
      }).session(session);
      if (!updated) {
        res.status(409);
        throw new Error('Order is no longer awaiting payment');
      }
      let released = false;
      if (updated.walletSettlementStatus === 'debited' && Number(updated.walletAmount || 0)) {
        await walletSettlementService.reverseWalletForOrder({
          order: updated,
          source: 'order_reversal',
          reason: 'Wallet amount released before provider payment retry',
          createdBy: req.user?._id,
          session,
        });
        released = true;
      }
      if (updated.loyaltySettlementStatus === 'debited' && Number(updated.loyaltyPoints || 0)) {
        await loyaltySettlementService.reverseLoyaltyForOrder({
          order: updated,
          source: 'order_reversal',
          reason: 'Loyalty points released before provider payment retry',
          createdBy: req.user?._id,
          session,
        });
        released = true;
      }
      if (updated.giftCardSettlementStatus === 'debited' && Number(updated.giftCardAmount || 0)) {
        await giftCardSettlementService.reverseGiftCardForOrder({
          order: updated,
          source: 'order_reversal',
          reason: 'Gift card amount released before provider payment retry',
          createdBy: req.user?._id,
          session,
        });
        released = true;
      }
      if (!released) return;
      const remainingWallet = ['debited', 'captured'].includes(updated.walletSettlementStatus) ? Number(updated.walletAmount || 0) : 0;
      const remainingLoyalty = ['debited', 'captured'].includes(updated.loyaltySettlementStatus) ? Number(updated.loyaltyAmount || 0) : 0;
      const remainingGiftCard = ['debited', 'captured'].includes(updated.giftCardSettlementStatus) ? Number(updated.giftCardAmount || 0) : 0;
      updated.externalPaymentAmount = Math.round(Math.max(0, Number(updated.total || 0) - remainingWallet - remainingLoyalty - remainingGiftCard) * 100) / 100;
      updated.paymentProviderOrderId = undefined;
      updated.paymentProvider = '';
      await updated.save({ session });
    });
  } finally {
    await session.endSession();
  }
  res.json({ success: true, released: true, order: updated });
});

// @desc    Verify payment and mark order as paid
// @route   POST /api/payments/verify
const verifyPayment = asyncHandler(async (req, res) => {
  const { gatewayId, orderId, ...payload } = req.body;
  if (!gatewayId || !orderId) {
    res.status(400);
    throw new Error('gatewayId and orderId are required');
  }

  const order = await Order.findOne({ _id: orderId, ...(req.tenant ? { tenant: req.tenant._id } : {}) }).select('+guestAccessTokenHash tenant user coupon orderStatus paymentStatus paymentMethod paymentProviderOrderId paymentCurrency total externalPaymentAmount walletAmount walletSettlementStatus loyaltyPoints loyaltyAmount loyaltySettlementStatus giftCard giftCardLast4 giftCardAmount giftCardRefundedAmount giftCardSettlementStatus paymentId inventoryStatus inventoryReservation guestAccessTokenExpiresAt');
  if (!order) { res.status(404); throw new Error('Order not found'); }
  assertPaymentOrderAccess(req, res, order, req.body?.guestAccessToken || req.headers?.['x-guest-order-token']);
  const providerOrderId = payload.razorpay_order_id || payload.cashfree_order_id || payload.order_id || payload.payment_intent || payload.stripe_payment_intent_id;
  const paymentId = payload.razorpay_payment_id || payload.cf_payment_id || payload.payment_id || payload.payment_intent || payload.stripe_payment_intent_id;
  if (order.paymentMethod !== gatewayId || order.paymentProviderOrderId !== providerOrderId) {
    res.status(400);
    throw new Error('Payment does not belong to this order');
  }
  // A provider webhook may win the race with the browser callback. Once the
  // order is paid, never reject the customer just because the provider used a
  // different payment-event ID in its asynchronous notification.
  if (order.paymentStatus === 'paid') return res.json({ success: true, verified: true, paymentId: order.paymentId || paymentId, idempotent: true });
  if (order.paymentStatus !== 'pending' || order.orderStatus !== 'pending') {
    res.status(409);
    throw new Error('Order is no longer awaiting payment');
  }

  const payableAmount = externalAmountOf(order);
  const result = await paymentManager.verifyPayment(gatewayId, payload, {
    providerOrderId: order.paymentProviderOrderId,
    amount: payableAmount,
    currency: order.paymentCurrency || 'INR',
    tenantId: req.tenant?._id,
  });
  const session = await mongoose.startSession();
  let updated;
  try {
    await session.withTransaction(async () => {
      updated = await Order.findOneAndUpdate(
        { _id: orderId, ...(req.tenant ? { tenant: req.tenant._id } : {}), paymentStatus: 'pending', orderStatus: 'pending', paymentProviderOrderId: order.paymentProviderOrderId },
        { $set: { paymentStatus: 'paid', orderStatus: 'confirmed', paymentId: result.paymentId || paymentId, paymentVerifiedAt: new Date(), ...(order.walletAmount > 0 && order.walletSettlementStatus === 'debited' ? { walletSettlementStatus: 'captured' } : {}), ...(order.loyaltyPoints > 0 && order.loyaltySettlementStatus === 'debited' ? { loyaltySettlementStatus: 'captured' } : {}), ...(order.giftCardAmount > 0 && order.giftCardSettlementStatus === 'debited' ? { giftCardSettlementStatus: 'captured' } : {}) } },
        { new: true, session },
      );
      if (!updated) {
        res.status(409);
        throw new Error('Payment state changed; refresh the order');
      }
      await inventoryReservationService.convertReservation({ orderId: updated._id, reservationId: updated.inventoryReservation, session, reason: 'payment_captured' });
      const paymentAttempt = await PaymentAttempt.findOne({ order: orderId, ...(req.tenant ? { tenant: req.tenant._id } : {}), provider: gatewayId, externalOrderId: order.paymentProviderOrderId }).sort({ createdAt: -1 }).session(session).lean();
      await PaymentAttempt.updateMany(
        { order: orderId, ...(req.tenant ? { tenant: req.tenant._id } : {}), provider: gatewayId, externalOrderId: order.paymentProviderOrderId },
        { $set: { status: 'captured', externalPaymentId: result.paymentId || paymentId, capturedAt: new Date() } },
      ).session(session);
      await recordPaymentTransaction({
        tenant: updated.tenant,
        order: updated._id,
        paymentAttempt: paymentAttempt?._id,
        provider: gatewayId,
        eventType: 'provider_captured',
        status: 'succeeded',
        amount: payableAmount,
        currency: order.paymentCurrency || 'INR',
        externalOrderId: order.paymentProviderOrderId,
        externalPaymentId: result.paymentId || paymentId,
        providerEventId: result.paymentId || paymentId,
        idempotencyKey: ledgerKey(gatewayId, orderId, result.paymentId || paymentId, 'verify_captured'),
        source: 'verification',
        reason: 'Browser payment verification succeeded',
        session,
      });
      await couponSettlementService.captureCouponForOrder({ order: updated, session });
      if (updated.tenant) {
        await loyaltyService.earnPurchasePoints({ tenant: updated.tenant, user: updated.user, order: updated, session });
      }
    });
  } finally {
    await session.endSession();
  }

  // Tenant shipments use the durable outbox/worker path. Legacy orders retain
  // the compatibility fallback until their tenant migration is complete.
  if (updated.tenant) {
    await enqueue({ tenant: updated.tenant, type: 'shipping.order-created', aggregateType: 'Order', aggregateId: orderId, idempotencyKey: `shipping-after-payment:${orderId}`, payload: { action: 'auto-create-order', orderId: String(orderId) } });
  } else {
    setImmediate(() => createShipmentOrderInBackground(orderId));
  }

  require('../services/orderNotificationService').sendPaymentEvent(updated, 'payment_success').catch(error => console.error('[TrustSignal] payment SMS hook failed:', error.message));

  res.json({ success: true, verified: true, paymentId: result.paymentId || paymentId });
});

module.exports = { getActiveGateways, createPaymentOrder, releaseWallet, verifyPayment, calcPackageDimensions, createShipmentOrderInBackground, createShiprocketOrderInBackground: createShipmentOrderInBackground };
