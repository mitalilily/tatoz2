const mongoose = require('mongoose');
const User = require('../models/User');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const ReturnRequest = require('../models/ReturnRequest');
const RefundRequest = require('../models/RefundRequest');
const CustomerSegmentMembership = require('../models/CustomerSegmentMembership');
const { isUserInTenant } = require('./customerScopeService');

const PAID_STATUSES = ['paid', 'refunded', 'partially_refunded'];
const ACTIVE_RETURN_STATUSES = [
  'requested', 'approved', 'pickup_scheduled', 'picked_up', 'received',
  'inspection_pending', 'approved_for_refund', 'replacement_queued',
];

const tenantFilter = tenant => {
  const tenantId = tenant?._id || tenant || null;
  return tenantId ? { tenant: tenantId } : {};
};

const dateValue = value => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
};

const numberValue = value => Number.isFinite(Number(value)) ? Number(value) : 0;

const addTimelineEvent = (events, event) => {
  const at = dateValue(event.at);
  if (!at) return;
  events.push({ ...event, at: at.toISOString() });
};

const orderTimeline = (events, order) => {
  addTimelineEvent(events, {
    at: order.createdAt,
    type: 'order',
    event: 'order_created',
    label: `Order ${order.orderNumber || ''} created`.trim(),
    orderId: order._id,
    orderNumber: order.orderNumber,
    status: order.orderStatus,
  });
  (order.statusHistory || []).forEach(history => addTimelineEvent(events, {
    at: history.updatedAt || order.updatedAt || order.createdAt,
    type: 'order',
    event: 'order_status',
    label: `Order ${order.orderNumber || ''} → ${history.status}`.trim(),
    orderId: order._id,
    orderNumber: order.orderNumber,
    status: history.status,
    note: history.note || '',
  }));
};

const returnTimeline = (events, request) => {
  addTimelineEvent(events, {
    at: request.createdAt,
    type: 'return',
    event: 'return_created',
    label: `${request.type || 'return'} ${request.requestNumber || ''} requested`.trim(),
    returnId: request._id,
    requestNumber: request.requestNumber,
    orderId: request.order?._id || request.order,
    orderNumber: request.order?.orderNumber,
    status: request.status,
  });
  (request.statusHistory || []).forEach(history => addTimelineEvent(events, {
    at: history.updatedAt || request.updatedAt || request.createdAt,
    type: 'return',
    event: 'return_status',
    label: `${request.requestNumber || 'Return'} → ${history.to}`,
    returnId: request._id,
    requestNumber: request.requestNumber,
    orderId: request.order?._id || request.order,
    orderNumber: request.order?.orderNumber,
    status: history.to,
    from: history.from,
    note: history.note || '',
  }));
};

const refundTimeline = (events, refund) => {
  addTimelineEvent(events, {
    at: refund.createdAt,
    type: 'refund',
    event: 'refund_created',
    label: `Refund request for ${refund.order?.orderNumber || 'order'}`,
    refundId: refund._id,
    returnId: refund.returnRequest,
    orderId: refund.order?._id || refund.order,
    orderNumber: refund.order?.orderNumber,
    status: 'pending',
    amount: numberValue(refund.amount),
  });
  const statusAt = refund.processedAt || refund.reviewedAt || refund.updatedAt || refund.createdAt;
  if (refund.status && refund.status !== 'pending') addTimelineEvent(events, {
    at: statusAt,
    type: 'refund',
    event: 'refund_status',
    label: `Refund → ${refund.status}`,
    refundId: refund._id,
    returnId: refund.returnRequest,
    orderId: refund.order?._id || refund.order,
    orderNumber: refund.order?.orderNumber,
    status: refund.status,
    amount: numberValue(refund.approvedAmount ?? refund.amount),
  });
};

const getCustomer360 = async ({ userId, tenant }) => {
  if (!mongoose.isValidObjectId(userId)) return null;
  if (!(await isUserInTenant({ tenant, userId }))) return null;

  const customer = await User.findOne({ _id: userId, role: 'customer' })
    .select('-password -resetPasswordToken -twoFactorSecret -emailVerificationToken')
    .lean();
  if (!customer) return null;

  const commerceFilter = { user: userId, ...tenantFilter(tenant) };
  const audienceFilter = { user: userId, ...(tenant ? tenantFilter(tenant) : {}) };
  const [orderStatsRows, orders, returns, refunds, cart, audienceMemberships] = await Promise.all([
    Order.aggregate([
      { $match: commerceFilter },
      { $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        paidOrders: { $sum: { $cond: [{ $in: ['$paymentStatus', PAID_STATUSES] }, 1, 0] } },
        totalOrderValue: { $sum: { $ifNull: ['$total', 0] } },
        paidOrderValue: { $sum: { $cond: [{ $in: ['$paymentStatus', PAID_STATUSES] }, { $ifNull: ['$total', 0] }, 0] } },
        pendingOrders: { $sum: { $cond: [{ $in: ['$orderStatus', ['pending', 'confirmed', 'packed']] }, 1, 0] } },
        cancelledOrders: { $sum: { $cond: [{ $eq: ['$orderStatus', 'cancelled'] }, 1, 0] } },
        returnedOrders: { $sum: { $cond: [{ $or: [{ $eq: ['$orderStatus', 'returned'] }, { $ne: ['$returnStatus', 'none'] }] }, 1, 0] } },
        lastOrderAt: { $max: '$createdAt' },
      } },
    ]),
    Order.find(commerceFilter)
      .select('_id orderNumber orderStatus paymentStatus total subtotal shippingCost tax discount createdAt updatedAt deliveredAt cancelledAt trackingNumber returnStatus refundTotal items')
      .sort({ createdAt: -1 }).limit(50).lean(),
    ReturnRequest.find(commerceFilter)
      .select('_id requestNumber order type status reason requestedAmount approvedAmount createdAt updatedAt reviewedAt closedAt statusHistory items')
      .populate('order', 'orderNumber total orderStatus')
      .sort({ createdAt: -1 }).limit(50).lean(),
    RefundRequest.find(commerceFilter)
      .select('_id order returnRequest type status amount approvedAmount reason createdAt updatedAt reviewedAt processedAt')
      .populate('order', 'orderNumber total orderStatus')
      .sort({ createdAt: -1 }).limit(50).lean(),
    Cart.findOne(commerceFilter)
      .select('_id items revision updatedAt createdAt')
      .lean(),
    CustomerSegmentMembership.find(audienceFilter)
      .select('segment matchedAt')
      .populate('segment', 'name slug')
      .sort({ matchedAt: -1 })
      .limit(50)
      .lean(),
  ]);

  const stats = orderStatsRows[0] || {};
  const totalOrders = numberValue(stats.totalOrders);
  const returnCounts = returns.reduce((result, request) => {
    result[request.status] = (result[request.status] || 0) + 1;
    return result;
  }, {});
  const activeReturns = returns.filter(request => ACTIVE_RETURN_STATUSES.includes(request.status)).length;
  const refundedAmount = refunds
    .filter(refund => refund.status === 'processed')
    .reduce((sum, refund) => sum + numberValue(refund.approvedAmount ?? refund.amount), 0);
  const pendingRefunds = refunds.filter(refund => refund.status === 'pending').length;
  const events = [];
  orders.forEach(order => orderTimeline(events, order));
  returns.forEach(request => returnTimeline(events, request));
  refunds.forEach(refund => refundTimeline(events, refund));
  events.sort((left, right) => new Date(right.at) - new Date(left.at));

  return {
    customer,
    summary: {
      totalOrders,
      paidOrders: numberValue(stats.paidOrders),
      totalOrderValue: numberValue(stats.totalOrderValue),
      paidOrderValue: numberValue(stats.paidOrderValue),
      averageOrderValue: totalOrders ? numberValue(stats.totalOrderValue) / totalOrders : 0,
      pendingOrders: numberValue(stats.pendingOrders),
      cancelledOrders: numberValue(stats.cancelledOrders),
      returnedOrders: numberValue(stats.returnedOrders),
      lastOrderAt: stats.lastOrderAt || null,
      activeReturns,
      returnCounts,
      pendingRefunds,
      refundedAmount,
    },
    orders,
    returns,
    refunds,
    cart: cart ? {
      id: cart._id,
      itemCount: (cart.items || []).length,
      quantity: (cart.items || []).reduce((sum, item) => sum + numberValue(item.quantity), 0),
      revision: cart.revision || 0,
      updatedAt: cart.updatedAt,
      createdAt: cart.createdAt,
    } : null,
    audienceSegments: audienceMemberships
      .filter(membership => membership.segment)
      .map(membership => ({
        _id: membership.segment._id,
        name: membership.segment.name,
        slug: membership.segment.slug,
        matchedAt: membership.matchedAt,
      })),
    timeline: events.slice(0, 100),
  };
};

module.exports = { getCustomer360 };
