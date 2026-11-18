const mongoose = require('mongoose');
const Order = require('../models/Order');
const cartService = require('./cartService');

const idOf = value => value?._id || value;
const tenantIdOf = value => idOf(value);
const errorWith = (message, statusCode = 400, publicCode = 'ORDER_REORDER_INVALID') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
};
const reorderCustomerOrder = async ({ orderId, tenant, userId, idempotencyKey: keyInput } = {}) => {
  const tenantId = tenantIdOf(tenant);
  const customerId = idOf(userId);
  if (!mongoose.isValidObjectId(orderId) || !mongoose.isValidObjectId(tenantId) || !mongoose.isValidObjectId(customerId)) {
    const error = new Error('Order, tenant, and customer are required');
    error.statusCode = 400;
    error.publicCode = 'ORDER_REORDER_CONTEXT_INVALID';
    throw error;
  }
  const source = await Order.findOne({ _id: orderId, tenant: tenantId, user: customerId }).select('items orderNumber').lean();
  if (!source) throw errorWith('Order not found', 404, 'ORDER_NOT_FOUND');
  const items = (source.items || []).map(item => ({
    productId: String(idOf(item.product)),
    quantity: Number(item.quantity),
    variant: item.variant || {},
  }));
  if (!items.length) throw errorWith('This order has no items to reorder', 409, 'ORDER_REORDER_EMPTY');
  const result = await cartService.importItems({
    tenantId,
    userId: customerId,
    idempotencyKey: keyInput,
    items,
    source: 'order-reorder',
  });
  return { ...result, sourceOrder: { _id: source._id, orderNumber: source.orderNumber || '' } };
};

module.exports = { reorderCustomerOrder };
