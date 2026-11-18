const mongoose = require('mongoose');
const Order = require('../models/Order');
const { normalizeOrderStatus } = require('../constants/orderStatuses');

const idOf = value => value?._id || value;

const errorWith = (message, statusCode = 400, publicCode = 'PACKING_SLIP_INVALID') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
};

const tenantIdOf = tenant => idOf(tenant);

const safeVariant = variant => {
  if (!variant || typeof variant !== 'object' || Array.isArray(variant)) return {};
  return Object.fromEntries(Object.entries(variant).slice(0, 20).map(([key, value]) => [
    String(key).slice(0, 80),
    String(value ?? '').slice(0, 120),
  ]));
};

const safeAddress = address => ({
  fullName: String(address?.fullName || '').trim(),
  phone: String(address?.phone || '').trim(),
  street: String(address?.street || '').trim(),
  city: String(address?.city || '').trim(),
  state: String(address?.state || '').trim(),
  pincode: String(address?.pincode || '').trim(),
  country: String(address?.country || 'India').trim(),
});

const getPackingSlip = async ({ orderId, tenant } = {}) => {
  const tenantId = tenantIdOf(tenant);
  if (!mongoose.isValidObjectId(orderId)) throw errorWith('Packing slip order not found', 404, 'ORDER_NOT_FOUND');

  const query = Order.findOne({
    _id: orderId,
    ...(tenantId ? { tenant: tenantId } : {}),
  })
    .select('orderNumber user shippingAddress orderStatus paymentStatus paymentMethod paymentCurrency createdAt customerNote items')
    .populate('user', 'name email phone')
    .lean();
  const order = await query;
  if (!order) throw errorWith('Packing slip order not found', 404, 'ORDER_NOT_FOUND');

  const items = (order.items || []).map(item => ({
    title: String(item.title || 'Product').trim().slice(0, 240),
    sku: String(item.sku || '').trim().slice(0, 120),
    quantity: Number(item.quantity) || 0,
    variant: safeVariant(item.variant),
  }));

  return {
    documentType: 'packing_slip',
    generatedAt: new Date().toISOString(),
    orderId: String(order._id),
    orderNumber: String(order.orderNumber || order._id),
    orderDate: order.createdAt,
    status: normalizeOrderStatus(order.orderStatus || 'pending'),
    paymentMethod: String(order.paymentMethod || ''),
    paymentStatus: String(order.paymentStatus || 'pending'),
    currency: String(order.paymentCurrency || 'INR'),
    customer: {
      name: String(order.user?.name || order.shippingAddress?.fullName || 'Customer').trim().slice(0, 200),
      email: String(order.user?.email || '').trim().slice(0, 240),
      phone: String(order.shippingAddress?.phone || order.user?.phone || '').trim().slice(0, 40),
    },
    shippingAddress: safeAddress(order.shippingAddress),
    items,
    totalUnits: items.reduce((sum, item) => sum + item.quantity, 0),
    distinctItems: items.length,
    customerNote: String(order.customerNote || '').trim().slice(0, 2000),
  };
};

module.exports = { getPackingSlip };
