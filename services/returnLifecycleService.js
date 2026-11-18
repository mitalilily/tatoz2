const mongoose = require('mongoose');
const Order = require('../models/Order');
const ReturnRequest = require('../models/ReturnRequest');
const Settings = require('../models/Settings');
const giftCardSettlementService = require('./giftCardSettlementService');

const ACTIVE_RETURN_STATUSES = [
  'requested',
  'approved',
  'pickup_scheduled',
  'picked_up',
  'received',
  'inspection_pending',
  'approved_for_refund',
  'replacement_queued',
];

const TERMINAL_RETURN_STATUSES = ['refunded', 'replaced', 'closed', 'rejected', 'cancelled'];

const TRANSITIONS = Object.freeze({
  requested: ['approved', 'rejected', 'cancelled'],
  approved: ['pickup_scheduled', 'cancelled'],
  pickup_scheduled: ['picked_up', 'cancelled'],
  picked_up: ['received'],
  received: ['inspection_pending'],
  inspection_pending: ['approved_for_refund', 'replacement_queued', 'rejected'],
  approved_for_refund: ['refunded', 'closed'],
  replacement_queued: ['replaced', 'closed'],
  refunded: ['closed'],
  replaced: ['closed'],
  closed: [],
  rejected: [],
  cancelled: [],
});

const tenantFilter = tenant => (tenant ? { tenant } : {});
const makeError = (message, statusCode = 400, publicCode = 'RETURN_WORKFLOW_ERROR') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
};

const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const variantKey = value => JSON.stringify(Object.entries(object(value)).sort(([left], [right]) => left.localeCompare(right)));

const parseItems = rawItems => {
  if (rawItems === undefined || rawItems === null || rawItems === '') return null;
  if (Array.isArray(rawItems)) return rawItems;
  if (typeof rawItems !== 'string') throw makeError('Return items must be an array', 400, 'RETURN_ITEMS_INVALID');
  try {
    const parsed = JSON.parse(rawItems);
    if (!Array.isArray(parsed)) throw new Error('not an array');
    return parsed;
  } catch (_error) {
    throw makeError('Return items must be a valid JSON array', 400, 'RETURN_ITEMS_INVALID');
  }
};

const normalizeItems = (order, rawItems) => {
  const requested = parseItems(rawItems) || (order.items || []).map(item => ({
    orderItemId: item._id,
    quantity: item.quantity,
  }));
  if (!requested.length || requested.length > 100) {
    throw makeError('At least one valid order item is required for a return', 400, 'RETURN_ITEMS_INVALID');
  }

  const used = new Set();
  return requested.flatMap(input => {
    if (!input || typeof input !== 'object') throw makeError('Invalid return item', 400, 'RETURN_ITEM_INVALID');
    const match = (order.items || []).find(item => {
      if (input.orderItemId && item._id?.toString() === String(input.orderItemId)) return true;
      return String(item.product) === String(input.product) && variantKey(item.variant) === variantKey(input.variant);
    });
    if (!match) throw makeError('Return item does not belong to this order', 400, 'RETURN_ITEM_NOT_IN_ORDER');
    const requestedQuantity = Number(input.quantity ?? match.quantity);
    if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1) {
      throw makeError(`Return quantity for ${match.title || 'item'} must be a positive whole number`, 400, 'RETURN_QUANTITY_INVALID');
    }

    if (match.itemType === 'bundle' || match.bundle) {
      const componentLines = [
        ...(Array.isArray(match.bundleComponents) ? match.bundleComponents.map((component, index) => ({ ...component, componentIndex: index, componentType: 'component' })) : []),
        ...(Array.isArray(match.bundleRewards) ? match.bundleRewards.map((component, index) => ({ ...component, componentIndex: index, componentType: 'reward' })) : []),
      ];
      const selectedIndex = input.componentIndex === undefined || input.componentIndex === null || input.componentIndex === '' ? null : Number(input.componentIndex);
      const selectedType = input.componentType === 'reward' ? 'reward' : 'component';
      const selectedLines = selectedIndex === null
        ? componentLines
        : componentLines.filter(line => line.componentIndex === selectedIndex && line.componentType === selectedType);
      if (!selectedLines.length) throw makeError('Selected bundle component does not belong to this order', 400, 'RETURN_ITEM_NOT_IN_ORDER');
      if (selectedIndex !== null && !['partial_components'].includes(match.bundleSnapshot?.returnPolicy || 'partial_components') && match.bundleSnapshot?.returnPolicy) {
        throw makeError('This bundle must be returned as a complete bundle', 400, 'BUNDLE_RETURN_POLICY');
      }
      return selectedLines.map(line => {
        const maxQuantity = Number(line.quantity || 0) * Number(match.quantity || 0);
        const quantity = selectedIndex === null ? Number(line.quantity || 0) * requestedQuantity : requestedQuantity;
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQuantity) {
          throw makeError(`Return quantity for ${line.title || match.title || 'bundle item'} must be between 1 and ${maxQuantity}`, 400, 'RETURN_QUANTITY_INVALID');
        }
        const key = `${match._id}:${line.componentType}:${line.componentIndex}`;
        if (used.has(key)) throw makeError('The same bundle component cannot be returned twice in one request', 400, 'RETURN_ITEM_DUPLICATE');
        used.add(key);
        const price = Number(line.allocatedUnitPrice ?? line.unitPrice ?? 0) || 0;
        return {
          orderItemId: match._id,
          itemType: 'bundle_component',
          componentIndex: line.componentIndex,
          componentType: line.componentType,
          bundleName: match.bundleName || match.title,
          product: line.product,
          title: line.title || match.title,
          image: line.image || match.image,
          price,
          quantity,
          variant: object(line.variant),
          sku: line.sku,
          amount: price * quantity,
        };
      });
    }

    const key = String(match._id);
    if (used.has(key)) throw makeError('The same order item cannot be returned twice in one request', 400, 'RETURN_ITEM_DUPLICATE');
    used.add(key);
    if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1 || requestedQuantity > match.quantity) {
      throw makeError(`Return quantity for ${match.title || 'item'} must be between 1 and ${match.quantity}`, 400, 'RETURN_QUANTITY_INVALID');
    }
    const price = Number(match.price) || 0;
    return [{
      orderItemId: match._id,
      itemType: 'product',
      product: match.product,
      title: match.title,
      image: match.image,
      price,
      quantity: requestedQuantity,
      variant: object(match.variant),
      sku: match.sku,
      amount: price * requestedQuantity,
    }];
  });
};

const returnWindow = async (order, session) => {
  const configuredDays = Number(await Settings.get('return_window_days', 7, { session }));
  const days = Number.isFinite(configuredDays) ? Math.max(0, configuredDays) : 7;
  const deliveredAt = order.deliveredAt || order.updatedAt || order.createdAt;
  const endsAt = days > 0 ? new Date(new Date(deliveredAt).getTime() + days * 24 * 60 * 60 * 1000) : null;
  return { days, endsAt };
};

const createInternal = async ({ orderId, userId, tenant, type = 'return', reason, description = '', items, images = [], session }) => {
  if (!mongoose.isValidObjectId(orderId) || !mongoose.isValidObjectId(userId)) {
    throw makeError('Valid order and customer are required', 400, 'RETURN_CONTEXT_INVALID');
  }
  if (!['return', 'replacement', 'exchange'].includes(type)) {
    throw makeError('Invalid return type', 400, 'RETURN_TYPE_INVALID');
  }
  if (!String(reason || '').trim()) throw makeError('Return reason is required', 400, 'RETURN_REASON_REQUIRED');

  const order = await Order.findOne({ _id: orderId, user: userId, ...tenantFilter(tenant) }).session(session);
  if (!order) throw makeError('Order not found', 404, 'ORDER_NOT_FOUND');
  if (!['delivered', 'returned'].includes(order.orderStatus)) {
    throw makeError('A return can only be requested after delivery', 400, 'RETURN_ORDER_NOT_DELIVERED');
  }

  const { days, endsAt } = await returnWindow(order, session);
  if (endsAt && new Date() > endsAt) throw makeError(`Return window of ${days} days has expired`, 400, 'RETURN_WINDOW_EXPIRED');

  const existing = await ReturnRequest.findOne({
    order: order._id,
    ...tenantFilter(tenant),
    status: { $in: ACTIVE_RETURN_STATUSES },
  }).session(session);
  if (existing) throw makeError('A return request is already active for this order', 409, 'RETURN_ALREADY_ACTIVE');
  if (ACTIVE_RETURN_STATUSES.includes(order.returnStatus)) {
    throw makeError('A return request is already active for this order', 409, 'RETURN_ALREADY_ACTIVE');
  }

  const normalizedItems = normalizeItems(order, items);
  const requestedAmount = normalizedItems.reduce((sum, item) => sum + item.amount, 0);
  const created = await ReturnRequest.create([{
    tenant,
    order: order._id,
    user: userId,
    type,
    status: 'requested',
    reason: String(reason).trim(),
    description: String(description || '').trim(),
    items: normalizedItems,
    requestedAmount,
    images: Array.isArray(images) ? images : [],
    statusHistory: [{ to: 'requested', note: 'Return request submitted by customer', updatedBy: userId }],
  }], { session });
  const request = created[0];

  order.returnStatus = 'requested';
  order.returnRequest = request._id;
  if (endsAt) order.returnWindowEndsAt = endsAt;
  order.statusHistory.push({
    status: order.orderStatus,
    note: `Return request ${request.requestNumber} submitted`,
    updatedBy: userId,
  });
  await order.save({ session });
  return { request, order, idempotent: false };
};

const createReturnRequest = async args => {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      result = await createInternal({ ...args, session });
    });
  } finally {
    await session.endSession();
  }
  return result;
};

const transitionInternal = async ({ returnId, to, tenant, actorId, note = '', approvedAmount, trackingNumber, courierName, settlementConfirmed = false, session }) => {
  if (!mongoose.isValidObjectId(returnId)) throw makeError('Invalid return request id', 400, 'RETURN_ID_INVALID');
  if (!ReturnRequest.statuses.includes(to)) throw makeError('Invalid return status', 400, 'RETURN_STATUS_INVALID');

  const request = await ReturnRequest.findOne({ _id: returnId, ...tenantFilter(tenant) }).session(session);
  if (!request) throw makeError('Return request not found', 404, 'RETURN_NOT_FOUND');
  if (request.status === to) return { request, order: await Order.findById(request.order).session(session), idempotent: true };
  if (!(TRANSITIONS[request.status] || []).includes(to)) {
    throw makeError(`Return cannot move from ${request.status} to ${to}`, 409, 'RETURN_TRANSITION_INVALID');
  }

  const order = await Order.findOne({ _id: request.order, ...tenantFilter(tenant) }).session(session);
  if (!order) throw makeError('Order for return request not found', 404, 'ORDER_NOT_FOUND');
  if (to === 'refunded' && ['razorpay', 'cashfree', 'stripe'].includes(order.paymentMethod)
    && order.paymentStatus === 'paid' && !settlementConfirmed) {
    throw makeError('Complete the payment-provider refund before closing this RMA as refunded', 409, 'REFUND_PROVIDER_REQUIRED');
  }
  const now = new Date();
  const from = request.status;
  request.status = to;
  request.statusHistory.push({ from, to, note: String(note || '').trim(), updatedBy: actorId, updatedAt: now });
  if (['approved', 'rejected'].includes(to)) {
    request.reviewedBy = actorId;
    request.reviewedAt = now;
  }
  if (approvedAmount !== undefined && approvedAmount !== null && approvedAmount !== '') {
    const amount = Number(approvedAmount);
    if (!Number.isFinite(amount) || amount < 0 || amount > request.requestedAmount) {
      throw makeError(`Approved return amount must be between 0 and ₹${request.requestedAmount}`, 400, 'RETURN_AMOUNT_INVALID');
    }
    request.approvedAmount = amount;
  } else if (to === 'approved_for_refund' && request.approvedAmount === undefined) {
    request.approvedAmount = request.requestedAmount;
  }
  if (trackingNumber !== undefined) request.trackingNumber = String(trackingNumber || '').trim();
  if (courierName !== undefined) request.courierName = String(courierName || '').trim();
  if (to === 'pickup_scheduled') request.pickupScheduledAt = request.pickupScheduledAt || now;
  if (to === 'picked_up') request.pickedUpAt = now;
  if (to === 'received') request.receivedAt = now;
  if (to === 'closed') request.closedAt = now;
  if (note) request.adminNote = String(note).trim();
  await request.save({ session });

  if (to === 'refunded' && Number(order.giftCardAmount || 0) > 0) {
    await giftCardSettlementService.reverseGiftCardForOrder({
      order,
      source: 'refund',
      amount: request.approvedAmount ?? request.requestedAmount,
      reason: 'Gift card amount restored after approved return/refund',
      createdBy: actorId,
      session,
    });
  }

  order.returnStatus = to;
  if (['refunded', 'replaced', 'closed'].includes(to)) {
    order.orderStatus = 'returned';
    order.isReturn = true;
    order.returnedAt = order.returnedAt || now;
    if (request.approvedAmount !== undefined) order.refundTotal = request.approvedAmount;
  }
  if (to === 'refunded' && ['paid', 'partially_refunded'].includes(order.paymentStatus)) {
    order.paymentStatus = (request.approvedAmount || request.requestedAmount) >= order.total ? 'refunded' : 'partially_refunded';
  }
  order.statusHistory.push({
    status: order.orderStatus,
    note: `Return ${request.requestNumber}: ${from} → ${to}${note ? ` — ${note}` : ''}`,
    updatedBy: actorId,
    updatedAt: now,
  });
  await order.save({ session });
  return { request, order, idempotent: false };
};

const transitionReturn = async args => {
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

module.exports = {
  ACTIVE_RETURN_STATUSES,
  TERMINAL_RETURN_STATUSES,
  TRANSITIONS,
  createReturnRequest,
  normalizeItems,
  transitionReturn,
};
