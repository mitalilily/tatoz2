const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Settings = require('../models/Settings');
const RefundRequest = require('../models/RefundRequest');
const httpRequest = require('../utils/httpRequest');
const tenantIntegrationService = require('../services/tenantIntegrationService');
const shippingManager = require('../services/shipping/shippingManager');
const inventoryReservationService = require('../services/inventoryReservationService');
const returnLifecycleService = require('../services/returnLifecycleService');
const walletSettlementService = require('../services/walletSettlementService');
const loyaltySettlementService = require('../services/loyaltySettlementService');
const giftCardSettlementService = require('../services/giftCardSettlementService');
const couponSettlementService = require('../services/couponSettlementService');

const STATUS_ORDER = ['pending', 'confirmed', 'processing', 'packed', 'ready_to_ship', 'shipped', 'out_for_delivery', 'failed_delivery', 'rto', 'delivered', 'cancelled', 'returned'];

// ─── Helpers ───────────────────────────────────────────────────

const getCancellationSettings = async () => ({
  timeWindow: await Settings.get('cancellation_time_window', 48),
  maxStatus: await Settings.get('cancellation_max_status', 'packed'),
  autoRefund: await Settings.get('cancellation_auto_refund', true),
  reasons: await Settings.get('cancellation_reasons', ['Changed my mind', 'Found a better price elsewhere', 'Ordered by mistake', 'Delivery taking too long']),
  refundDaysMin: await Settings.get('refund_processing_days_min', 5),
  refundDaysMax: await Settings.get('refund_processing_days_max', 7),
});

const getRazorpayAuth = async tenantId => {
  const { key_id, key_secret, enabled } = await tenantIntegrationService.configFor(tenantId, 'razorpay', { allowPlatformFallback: true });
  if (!enabled || !key_id || !key_secret) throw new Error('Razorpay credentials are not configured');
  return Buffer.from(`${key_id}:${key_secret}`).toString('base64');
};

const processRazorpayRefund = async (paymentId, amountInRupees, tenantId) => {
  const auth = await getRazorpayAuth(tenantId);
  const body = { amount: Math.round(amountInRupees * 100) }; // rupees → paise
  const { data } = await httpRequest({
    url: `https://api.razorpay.com/v1/payments/${paymentId}/refund`,
    headers: { Authorization: `Basic ${auth}` },
    method: 'POST',
    body,
  });
  return data;
};

// ─── Controllers ───────────────────────────────────────────────

// @desc    Get cancellation policy (public)
// @route   GET /api/orders/cancellation-policy
const getCancellationPolicy = asyncHandler(async (req, res) => {
  const settings = await getCancellationSettings();
  res.json({
    success: true,
    policy: {
      reasons: settings.reasons,
      refundDaysMin: settings.refundDaysMin,
      refundDaysMax: settings.refundDaysMax,
    },
  });
});

// @desc    Check if order can be cancelled
// @route   GET /api/orders/:id/cancellation-eligibility
const checkEligibility = asyncHandler(async (req, res) => {
  let order = await Order.findOne({ _id: req.params.id, user: req.user._id, ...(req.tenant ? { tenant: req.tenant._id } : {}) });
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  const settings = await getCancellationSettings();
  const statusIndex = STATUS_ORDER.indexOf(order.orderStatus);
  const maxStatusIndex = STATUS_ORDER.indexOf(settings.maxStatus);
  const hoursSinceOrder = (Date.now() - new Date(order.createdAt).getTime()) / (1000 * 60 * 60);
  const timeRemaining = Math.max(0, (settings.timeWindow * 60 * 60 * 1000) - (Date.now() - new Date(order.createdAt).getTime()));

  // Already cancelled/delivered/returned
  if (['cancelled', 'delivered', 'returned'].includes(order.orderStatus)) {
    return res.json({ success: true, eligible: false, reason: `Order is already ${order.orderStatus}` });
  }

  // Status too advanced
  if (statusIndex > maxStatusIndex) {
    return res.json({ success: true, eligible: false, reason: `Order cannot be cancelled after ${settings.maxStatus} stage` });
  }

  // Time window expired
  if (settings.timeWindow > 0 && hoursSinceOrder > settings.timeWindow) {
    return res.json({ success: true, eligible: false, reason: 'Cancellation window has expired' });
  }

  res.json({ success: true, eligible: true, timeRemaining });
});

// @desc    Cancel an order
// @route   POST /api/orders/:id/cancel
const cancelOrder = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  if (!reason) {
    res.status(400);
    throw new Error('Cancellation reason is required');
  }

  let order = await Order.findOne({ _id: req.params.id, user: req.user._id, ...(req.tenant ? { tenant: req.tenant._id } : {}) });
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  // Re-check eligibility
  const settings = await getCancellationSettings();
  const statusIndex = STATUS_ORDER.indexOf(order.orderStatus);
  const maxStatusIndex = STATUS_ORDER.indexOf(settings.maxStatus);
  const hoursSinceOrder = (Date.now() - new Date(order.createdAt).getTime()) / (1000 * 60 * 60);

  if (['cancelled', 'delivered', 'returned'].includes(order.orderStatus)) {
    res.status(400);
    throw new Error(`Order is already ${order.orderStatus}`);
  }
  if (statusIndex > maxStatusIndex) {
    res.status(400);
    throw new Error(`Order cannot be cancelled after ${settings.maxStatus} stage`);
  }
  if (settings.timeWindow > 0 && hoursSinceOrder > settings.timeWindow) {
    res.status(400);
    throw new Error('Cancellation window has expired');
  }

  // Change the order state and inventory state together. This prevents a
  // cancelled payment-pending order from holding stock or a retry from
  // restoring the same units twice.
  const inventorySession = await mongoose.startSession();
  try {
    await inventorySession.withTransaction(async () => {
      const current = await Order.findOne({
        _id: req.params.id,
        user: req.user._id,
        ...(req.tenant ? { tenant: req.tenant._id } : {}),
        orderStatus: { $nin: ['cancelled', 'delivered', 'returned'] },
      }).session(inventorySession);
      if (!current) {
        res.status(400);
        throw new Error('Order is already cancelled or no longer eligible');
      }

      current.orderStatus = 'cancelled';
      current.cancelledAt = new Date();
      current.cancellationReason = reason;
      current.statusHistory.push({
        status: 'cancelled',
        note: `Cancelled by customer: ${reason}`,
        updatedAt: new Date(),
      });

      if (current.inventoryStatus === 'reserved') {
        const transition = await inventoryReservationService.releaseReservation({
          orderId: current._id,
          reservationId: current.inventoryReservation,
          reason: 'customer_cancelled',
          session: inventorySession,
        });
        current.inventoryStatus = transition.status;
      } else if (['sold', 'converted'].includes(current.inventoryStatus)) {
        const transition = await inventoryReservationService.restockSoldOrder({ order: current, reason: 'customer_cancelled', session: inventorySession });
        current.inventoryStatus = transition.status;
      } else {
        // Compatibility path for orders created before inventory lifecycle
        // tracking existed. New orders never use this branch.
        for (const item of current.items) {
          await Product.updateOne({ _id: item.product, ...(current.tenant ? { tenant: current.tenant } : {}) }, { $inc: { stock: item.quantity } }).session(inventorySession);
        }
      }

      if (Number(current.walletAmount || 0) > 0 && ['debited', 'captured'].includes(current.walletSettlementStatus)) {
        await walletSettlementService.reverseWalletForOrder({
          order: current,
          source: 'order_reversal',
          reason: 'Wallet amount restored after customer cancellation',
          createdBy: req.user._id,
          session: inventorySession,
        });
      }
      if (Number(current.loyaltyPoints || 0) > 0 && ['debited', 'captured'].includes(current.loyaltySettlementStatus)) {
        await loyaltySettlementService.reverseLoyaltyForOrder({
          order: current,
          source: 'order_reversal',
          reason: 'Loyalty points restored after customer cancellation',
          createdBy: req.user._id,
          session: inventorySession,
        });
      }
      if (Number(current.giftCardAmount || 0) > 0 && ['debited', 'captured'].includes(current.giftCardSettlementStatus)) {
        await giftCardSettlementService.reverseGiftCardForOrder({
          order: current,
          source: 'order_reversal',
          reason: 'Gift card amount restored after customer cancellation',
          createdBy: req.user._id,
          session: inventorySession,
        });
      }
      await couponSettlementService.releaseCouponForOrder({
        order: current,
        reason: 'customer_cancelled',
        session: inventorySession,
      });
      const hasPrepaidTender = Number(current.walletAmount || 0) > 0 || Number(current.loyaltyPoints || 0) > 0 || Number(current.giftCardAmount || 0) > 0;
      if (current.paymentStatus === 'paid' && hasPrepaidTender && Number(current.externalPaymentAmount || 0) <= 0.01) current.paymentStatus = 'refunded';

      await current.save({ session: inventorySession });
      order = current;
    });
  } finally {
    await inventorySession.endSession();
  }

  // Cancel on Shiprocket (best-effort)
  if (order.shiprocketOrderId || order.awbCode) {
    try {
      const shiprocket = require('../services/shipping/providers/shiprocket');
      const srConfig = await shippingManager.getConfig('shiprocket', req.tenant?._id || order.tenant);
      if (srConfig.enabled && srConfig.email && srConfig.password) {
        if (order.awbCode) {
          await shiprocket.cancelShipment(order.awbCode, srConfig);
        }
        if (order.shiprocketOrderId) {
          await shiprocket.cancelOrders(order.shiprocketOrderId, srConfig);
        }
        order.shiprocketStatus = 'CANCELLED';
      }
    } catch (err) {
      console.error('[Shiprocket] Cancel failed for order', order._id.toString(), err.message);
      // Non-fatal — order is still cancelled locally
    }
  }

  // Preserve the provider stored on the order. A provider switch must not
  // orphan an already-created shipment from another provider.
  if (order.shippingProvider && order.shippingProvider !== 'shiprocket'
    && (order.shippingExternalOrderId || order.trackingNumber || order.awbCode)) {
    try {
      await shippingManager.cancelShipment(order.trackingNumber || order.awbCode, {
        tenantId: req.tenant?._id,
        provider: order.shippingProvider,
        externalOrderId: order.shippingExternalOrderId,
      });
      order.shippingStatus = 'cancelled';
      order.shippingLastSync = new Date();
    } catch (err) {
      console.error(`[${order.shippingProvider}] Cancel failed for order`, order._id.toString(), err.message);
      // Non-fatal — order is still cancelled locally
    }
  }

  let refundInfo = null;

  // Handle refund for paid Razorpay orders. For a partial wallet checkout,
  // only the externally captured remainder is sent to Razorpay; the wallet
  // portion was restored inside the cancellation transaction above.
  if (order.paymentStatus === 'paid' && order.paymentMethod === 'razorpay' && order.paymentId) {
    const preShip = statusIndex <= STATUS_ORDER.indexOf('packed');
    const externalRefundAmount = Number(order.externalPaymentAmount || order.total);

    if (settings.autoRefund && preShip) {
      // Auto-refund
      try {
        const rzpRefund = await processRazorpayRefund(order.paymentId, externalRefundAmount, req.tenant?._id || order.tenant);
        order.paymentStatus = 'refunded';

        await RefundRequest.create({
          tenant: req.tenant?._id,
          order: order._id,
          user: req.user._id,
          type: 'cancellation',
          status: 'processed',
          amount: externalRefundAmount,
          approvedAmount: externalRefundAmount,
          reason,
          razorpayRefundId: rzpRefund.id,
          processedAt: new Date(),
          reviewedAt: new Date(),
        });

        refundInfo = { auto: true, amount: Number(order.total), externalAmount: externalRefundAmount, walletAmount: Number(order.walletAmount || 0), status: 'processed' };
      } catch (err) {
        // Auto-refund failed — create pending request instead
        await RefundRequest.create({
          tenant: req.tenant?._id,
          order: order._id,
          user: req.user._id,
          type: 'cancellation',
          status: 'pending',
          amount: externalRefundAmount,
          reason,
        });
        refundInfo = { auto: false, amount: Number(order.total), externalAmount: externalRefundAmount, walletAmount: Number(order.walletAmount || 0), status: 'pending', error: 'Auto-refund failed, submitted for review' };
      }
    } else {
      // Manual refund — create pending request
      await RefundRequest.create({
        tenant: req.tenant?._id,
        order: order._id,
        user: req.user._id,
        type: 'cancellation',
        status: 'pending',
          amount: externalRefundAmount,
        reason,
      });
        refundInfo = { auto: false, amount: Number(order.total), externalAmount: externalRefundAmount, walletAmount: Number(order.walletAmount || 0), status: 'pending' };
      }
  }

  if ((order.walletAmount > 0 && order.walletSettlementStatus === 'reversed'
    || order.loyaltyPoints > 0 && order.loyaltySettlementStatus === 'reversed'
    || order.giftCardAmount > 0 && order.giftCardSettlementStatus === 'reversed') && !refundInfo) {
    if (order.paymentStatus === 'paid') {
      order.paymentStatus = 'refunded';
    }
    refundInfo = {
      auto: true,
      amount: Number(order.total),
      externalAmount: Number(order.externalPaymentAmount || 0),
      walletAmount: Number(order.walletAmount || 0),
      loyaltyPoints: Number(order.loyaltyPoints || 0),
      loyaltyAmount: Number(order.loyaltyAmount || 0),
      giftCardAmount: Number(order.giftCardAmount || 0),
      giftCardLast4: order.giftCardLast4 || '',
      status: 'processed',
    };
  }

  await order.save();

  require('../services/orderNotificationService').sendOrderLifecycleEvent(order, 'order_cancelled').catch(error => console.error('[TrustSignal] cancellation SMS hook failed:', error.message));

  res.json({
    success: true,
    message: 'Order cancelled successfully',
    refundInfo,
  });
});

// @desc    Request a refund for a delivered/returned order
// @route   POST /api/orders/:id/refund-request
const requestRefund = asyncHandler(async (req, res) => {
  const { type, reason, description, amount } = req.body;

  if (!type || !['return', 'partial'].includes(type)) {
    res.status(400);
    throw new Error('Refund type must be return or partial');
  }
  if (!reason) {
    res.status(400);
    throw new Error('Reason is required');
  }

  const order = await Order.findOne({ _id: req.params.id, user: req.user._id, ...(req.tenant ? { tenant: req.tenant._id } : {}) });
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  if (!['delivered', 'returned'].includes(order.orderStatus)) {
    res.status(400);
    throw new Error('Refund can only be requested for delivered or returned orders');
  }

  // Check for existing pending refund
  const existing = await RefundRequest.findOne({ order: order._id, status: 'pending', ...(req.tenant ? { tenant: req.tenant._id } : {}) });
  if (existing) {
    res.status(400);
    throw new Error('A refund request is already pending for this order');
  }

  // Handle image uploads
  const images = [];
  if (req.files && req.files.length > 0) {
    const { saveFileToDisk } = require('../middleware/upload');
    const path = require('path');
    for (const file of req.files) {
      const ext = path.extname(file.originalname) || '.jpg';
      const result = await saveFileToDisk(file.buffer, { ext, originalname: file.originalname, mimetype: file.mimetype });
      images.push({ url: result.url, publicId: result.filename });
    }
  }

  let refundAmount = order.total;
  if (type === 'partial') {
    refundAmount = Number(amount);
    if (!Number.isFinite(refundAmount) || refundAmount <= 0 || refundAmount > order.total) {
      res.status(400);
      throw new Error(`Partial refund amount must be greater than 0 and no more than ₹${order.total}`);
    }
  }

  let returnRequest = null;
  if (type === 'return') {
    const result = await returnLifecycleService.createReturnRequest({
      orderId: order._id,
      userId: req.user._id,
      tenant: req.tenant?._id,
      type: 'return',
      reason,
      description,
      images,
    });
    returnRequest = result.request;
  }

  const refund = await RefundRequest.create({
    tenant: req.tenant?._id,
    order: order._id,
    user: req.user._id,
    ...(returnRequest ? { returnRequest: returnRequest._id } : {}),
    type,
    amount: refundAmount,
    reason,
    description: description || '',
    images,
  });

  res.status(201).json({
    success: true,
    message: type === 'return' ? 'Return request submitted. It will be reviewed within 24 hours.' : 'Refund request submitted. It will be reviewed within 24 hours.',
    refundRequest: { _id: refund._id, status: refund.status, amount: refund.amount, returnRequest: returnRequest?._id || null },
  });
});

module.exports = { getCancellationPolicy, checkEligibility, cancelOrder, requestRefund };
