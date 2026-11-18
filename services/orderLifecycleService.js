const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const inventoryReservationService = require('./inventoryReservationService');
const walletSettlementService = require('./walletSettlementService');
const loyaltySettlementService = require('./loyaltySettlementService');
const giftCardSettlementService = require('./giftCardSettlementService');
const couponSettlementService = require('./couponSettlementService');
const { ORDER_STATUSES, normalizeOrderStatus } = require('../constants/orderStatuses');

const FULFILMENT_RANK = Object.freeze({
  pending: 0,
  confirmed: 1,
  processing: 2,
  packed: 3,
  ready_to_ship: 4,
  shipped: 5,
  out_for_delivery: 6,
  failed_delivery: 6,
  rto: 7,
  partially_fulfilled: 3,
  delivered: 7,
  return_requested: 8,
  refund_requested: 8,
  returned: 9,
  partially_refunded: 9,
  refunded: 10,
});

const tenantFilter = tenant => (tenant ? { tenant } : {});
const makeError = (message, statusCode = 409, publicCode = 'ORDER_TRANSITION_INVALID') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
};

const assertTransition = (order, nextStatus) => {
  const normalizedNextStatus = normalizeOrderStatus(nextStatus);
  if (!ORDER_STATUSES.includes(normalizedNextStatus)) throw makeError('Invalid order status', 400, 'ORDER_STATUS_INVALID');
  if (order.orderStatus === normalizedNextStatus) return normalizedNextStatus;
  if (['cancelled', 'returned', 'refunded'].includes(order.orderStatus)) {
    throw makeError(`Order is already ${order.orderStatus}`, 409, 'ORDER_TERMINAL');
  }
  if (order.orderStatus === 'rto' && !['return_requested', 'refund_requested', 'cancelled'].includes(normalizedNextStatus)) {
    throw makeError('RTO orders must use the return/refund workflow', 409, 'ORDER_TERMINAL');
  }
  if (normalizedNextStatus === 'returned') {
    if (!['refunded', 'replaced', 'closed'].includes(order.returnStatus)) {
      throw makeError('Complete the return/RMA workflow before marking an order returned', 409, 'RETURN_WORKFLOW_REQUIRED');
    }
    return normalizedNextStatus;
  }
  if (normalizedNextStatus === 'cancelled') {
    if (['delivered', 'returned'].includes(order.orderStatus)) {
      throw makeError('Delivered orders must use the return/RMA workflow', 409, 'RETURN_WORKFLOW_REQUIRED');
    }
    return normalizedNextStatus;
  }
  if (['return_requested', 'refund_requested'].includes(normalizedNextStatus)) {
    if (!['delivered', 'rto', 'returned', 'partially_fulfilled', 'return_requested', 'refund_requested'].includes(order.orderStatus)) {
      throw makeError('Return or refund requests require a fulfilled order stage', 409, 'RETURN_WORKFLOW_REQUIRED');
    }
    return normalizedNextStatus;
  }
  if (order.orderStatus === 'partially_fulfilled' && ['processing', 'packed', 'ready_to_ship', 'shipped'].includes(normalizedNextStatus)) {
    return normalizedNextStatus;
  }
  if (normalizedNextStatus === 'refunded') {
    if (!['refunded', 'partially_refunded'].includes(order.paymentStatus) && order.paymentMethod !== 'cod') {
      throw makeError('Payment must be refunded before marking the order refunded', 409, 'REFUND_WORKFLOW_REQUIRED');
    }
    return normalizedNextStatus;
  }
  if (normalizedNextStatus === 'partially_refunded' && order.paymentStatus !== 'partially_refunded') {
    throw makeError('Payment must be partially refunded before marking the order partially refunded', 409, 'REFUND_WORKFLOW_REQUIRED');
  }
  if (normalizedNextStatus === 'rto' && !['failed_delivery', 'shipped', 'out_for_delivery'].includes(order.orderStatus)) {
    throw makeError('RTO requires a failed or active delivery attempt', 409, 'ORDER_TRANSITION_INVALID');
  }
  if (normalizedNextStatus === 'failed_delivery' && !['shipped', 'out_for_delivery', 'failed_delivery'].includes(order.orderStatus)) {
    throw makeError('Failed delivery requires an active shipment', 409, 'ORDER_TRANSITION_INVALID');
  }
  const currentRank = FULFILMENT_RANK[order.orderStatus];
  const nextRank = FULFILMENT_RANK[normalizedNextStatus];
  if (currentRank === undefined || nextRank === undefined || nextRank < currentRank) {
    throw makeError(`Order cannot move from ${order.orderStatus} to ${normalizedNextStatus}`, 409, 'ORDER_TRANSITION_INVALID');
  }
  return normalizedNextStatus;
};

const releaseLegacyStock = async (order, session) => {
  for (const item of (order.inventoryItems?.length ? order.inventoryItems : order.items || [])) {
    const filter = { _id: item.product, ...tenantFilter(order.tenant) };
    await Product.updateOne(filter, { $inc: { stock: Number(item.quantity) || 0 } }).session(session);
  }
};

const transitionInternal = async ({ orderId, status, note = '', trackingNumber, tenant, actorId, session }) => {
  const order = await Order.findOne({ _id: orderId, ...tenantFilter(tenant) }).session(session);
  if (!order) throw makeError('Order not found', 404, 'ORDER_NOT_FOUND');
  const normalizedStatus = assertTransition(order, status);
  if (order.orderStatus === normalizedStatus) return { order, idempotent: true };

  const previous = order.orderStatus;
  if (normalizedStatus === 'cancelled') {
    if (order.inventoryStatus === 'reserved') {
      const transition = await inventoryReservationService.releaseReservation({
        orderId: order._id,
        reservationId: order.inventoryReservation,
        reason: 'admin_cancelled',
        session,
      });
      order.inventoryStatus = transition.status;
    } else if (['sold', 'converted'].includes(order.inventoryStatus)) {
      const transition = await inventoryReservationService.restockSoldOrder({ order, reason: 'admin_cancelled', session });
      order.inventoryStatus = transition.status;
    } else if (order.inventoryStatus === 'legacy') {
      await releaseLegacyStock(order, session);
      order.inventoryStatus = 'released';
    }
    order.cancelledAt = new Date();
    order.cancellationReason = String(note || 'Cancelled by admin').trim();
    if (Number(order.walletAmount || 0) > 0 && ['debited', 'captured'].includes(order.walletSettlementStatus)) {
      await walletSettlementService.reverseWalletForOrder({
        order,
        source: 'order_reversal',
        reason: 'Wallet amount restored after admin cancellation',
        createdBy: actorId,
        session,
      });
    }
    if (Number(order.loyaltyPoints || 0) > 0 && ['debited', 'captured'].includes(order.loyaltySettlementStatus)) {
      await loyaltySettlementService.reverseLoyaltyForOrder({
        order,
        source: 'order_reversal',
        reason: 'Loyalty points restored after admin cancellation',
        createdBy: actorId,
        session,
      });
    }
    if (Number(order.giftCardAmount || 0) > 0 && ['debited', 'captured'].includes(order.giftCardSettlementStatus)) {
      await giftCardSettlementService.reverseGiftCardForOrder({
        order,
        source: 'order_reversal',
        reason: 'Gift card amount restored after admin cancellation',
        createdBy: actorId,
        session,
      });
    }
    await couponSettlementService.releaseCouponForOrder({
      order,
      reason: 'admin_cancelled',
      session,
    });
    const hasPrepaidTender = Number(order.walletAmount || 0) > 0 || Number(order.loyaltyPoints || 0) > 0 || Number(order.giftCardAmount || 0) > 0;
    if (order.paymentStatus === 'paid' && hasPrepaidTender && Number(order.externalPaymentAmount || 0) <= 0.01) order.paymentStatus = 'refunded';
  }
  if (normalizedStatus === 'delivered') order.deliveredAt = order.deliveredAt || new Date();
  if (normalizedStatus === 'returned') {
    order.returnedAt = order.returnedAt || new Date();
    order.isReturn = true;
  }
  if (trackingNumber !== undefined) order.trackingNumber = String(trackingNumber || '').trim();
  order.orderStatus = normalizedStatus;
  order.statusHistory.push({
    status: normalizedStatus,
    note: String(note || '').trim(),
    updatedBy: actorId,
    updatedAt: new Date(),
  });
  await order.save({ session });
  return { order, previous, status: normalizedStatus, idempotent: false };
};

const transitionOrderStatus = async args => {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      result = await transitionInternal({ ...args, session });
    });
  } finally {
    await session.endSession();
  }
  return result;
};

module.exports = { FULFILMENT_RANK, ORDER_STATUSES, normalizeOrderStatus, assertTransition, transitionOrderStatus };
