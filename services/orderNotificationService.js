const Order = require('../models/Order');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const Vendor = require('../models/Vendor');
const notificationDeliveryService = require('./notificationDeliveryService');
const trustsignalService = require('./trustsignalService');
const { PLATFORM_NAME } = require('../constants/branding');

const templateKeys = Object.freeze({
  order_placed: 'order_confirmation_template_id',
  order_shipped: 'shipping_confirmation_template_id',
  order_delivered: 'delivery_confirmation_template_id',
  seller_order: 'seller_order_template_id',
  welcome: 'welcome_template_id',
  payment_success: 'payment_success_template_id',
  payment_failed: 'payment_failed_template_id',
  order_cancelled: 'order_cancelled_template_id',
  refund_requested: 'refund_requested_template_id',
  refund_approved: 'refund_approved_template_id',
  refund_processed: 'refund_processed_template_id',
  refund_rejected: 'refund_rejected_template_id',
});

const textFor = (event, { name = 'Customer', orderNumber = '', trackingNumber = '', amount = '', reason = '' } = {}) => {
  const customer = String(name || 'Customer').trim() || 'Customer';
  if (event === 'order_placed') return `Hi ${customer}, Thanks for placing your order no. ${orderNumber}, will update you about tracking details. Team ${PLATFORM_NAME}`;
  if (event === 'order_shipped') return `Hi ${customer}. Tracking details of your order no. ${orderNumber} has been shipped via Couriercart with tracking ID ${trackingNumber}. Team ${PLATFORM_NAME}`;
  if (event === 'order_delivered') return `Hi ${customer}, Your order no. ${orderNumber} has been delivered. Thank you for Shopping with us. Keep Shopping with ${PLATFORM_NAME} to earn Loyalty Card.`;
  if (event === 'seller_order') return `Dear Seller, you have got a new order no. ${orderNumber}, request to process the same at the earliest and update on portal. Team ${PLATFORM_NAME}`;
  if (event === 'welcome') return `Hi ${customer}, Welcome to ${PLATFORM_NAME} Family. Enjoy Shopping with ${PLATFORM_NAME}.`;
  if (event === 'payment_success') return `Hi ${customer}, payment for order no. ${orderNumber} was successful. Team ${PLATFORM_NAME}`;
  if (event === 'payment_failed') return `Hi ${customer}, payment for order no. ${orderNumber} could not be completed. Please retry. Team ${PLATFORM_NAME}`;
  if (event === 'order_cancelled') return `Hi ${customer}, your order no. ${orderNumber} has been cancelled. Team ${PLATFORM_NAME}`;
  if (event === 'refund_requested') return `Hi ${customer}, your refund request for order no. ${orderNumber} has been received for Rs. ${amount}. Team ${PLATFORM_NAME}`;
  if (event === 'refund_approved') return `Hi ${customer}, your refund for order no. ${orderNumber} has been approved for Rs. ${amount}. Team ${PLATFORM_NAME}`;
  if (event === 'refund_processed') return `Hi ${customer}, your refund for order no. ${orderNumber} has been processed for Rs. ${amount}. Team ${PLATFORM_NAME}`;
  if (event === 'refund_rejected') return `Hi ${customer}, your refund request for order no. ${orderNumber} was rejected. ${reason || ''} Team ${PLATFORM_NAME}`;
  return '';
};

const resolveTenant = async order => {
  if (order?.tenant) return order.tenant;
  const platform = await Tenant.findOne({ type: 'platform', status: { $ne: 'archived' } }).select('_id').lean();
  return platform?._id || null;
};

const resolveUser = async order => {
  if (order?.user && typeof order.user === 'object' && order.user.phone) return order.user;
  if (!order?.user) return null;
  return User.findById(order.user).select('name phone notificationPrefs').lean();
};

const recipientFor = (order, user) => order?.shippingAddress?.phone || user?.phone || '';

const sendEvent = async ({ event, order, user, recipient, tenant, userId, parameters = {}, amount, reason }) => {
  if (!tenant || !recipient) return null;
  const config = await trustsignalService.getConfig(tenant);
  if (!trustsignalService.isConfigured(config)) return null;
  const templateId = config[templateKeys[event]];
  // Never send an unapproved or guessed DLT message. The hook remains in
  // place, and becomes active as soon as the matching approved template ID
  // is configured.
  if (!templateId) return null;
  const name = user?.name || order?.shippingAddress?.fullName || 'Customer';
  return notificationDeliveryService.send({
    tenant,
    channel: 'sms',
    recipient,
    userId: userId || user?._id || order?.user,
    purpose: 'transactional',
    eventType: event,
    idempotencyKey: `trustsignal:${event}:${order?._id || 'account'}:${recipient}`,
    templateName: templateId,
    parameters,
    body: textFor(event, { name, orderNumber: order?.orderNumber, trackingNumber: order?.trackingNumber || order?.awbCode, amount, reason }),
  });
};

const sendOrderPlaced = async orderInput => {
  const order = orderInput?._id ? orderInput : await Order.findById(orderInput).lean();
  if (!order) return [];
  const tenant = await resolveTenant(order);
  const user = await resolveUser(order);
  const deliveries = [];
  const customer = await sendEvent({ event: 'order_placed', order, user, recipient: recipientFor(order, user), tenant, userId: user?._id }).catch(error => { console.error('[TrustSignal] order SMS failed:', error.message); return null; });
  if (customer) deliveries.push(customer);

  const vendorIds = [...new Set((order.subOrders || []).map(item => String(item.vendor)).filter(Boolean))];
  if (vendorIds.length && tenant) {
    const vendors = await Vendor.find({ _id: { $in: vendorIds } }).populate('owner', 'phone name').lean();
    for (const vendor of vendors) {
      const delivery = await sendEvent({ event: 'seller_order', order, user: vendor.owner, recipient: vendor.owner?.phone || vendor.contactPhone, tenant, userId: vendor.owner?._id }).catch(error => { console.error('[TrustSignal] seller order SMS failed:', error.message); return null; });
      if (delivery) deliveries.push(delivery);
    }
  }
  return deliveries;
};

const sendOrderStatus = async (orderInput, status) => {
  const order = orderInput?._id ? orderInput : await Order.findById(orderInput).lean();
  if (!order) return null;
  const event = status === 'shipped' ? 'order_shipped' : status === 'delivered' ? 'order_delivered' : null;
  if (!event) return null;
  const tenant = await resolveTenant(order);
  const user = await resolveUser(order);
  return sendEvent({ event, order, user, recipient: recipientFor(order, user), tenant, userId: user?._id }).catch(error => { console.error(`[TrustSignal] ${event} SMS failed:`, error.message); return null; });
};

const sendPaymentEvent = async (orderInput, event) => {
  const order = orderInput?._id ? orderInput : await Order.findById(orderInput).lean();
  if (!order || !['payment_success', 'payment_failed'].includes(event)) return null;
  const tenant = await resolveTenant(order);
  const user = await resolveUser(order);
  return sendEvent({ event, order, user, recipient: recipientFor(order, user), tenant, userId: user?._id }).catch(error => { console.error(`[TrustSignal] ${event} SMS failed:`, error.message); return null; });
};

const sendOrderLifecycleEvent = async (orderInput, event, extra = {}) => {
  const order = orderInput?._id ? orderInput : await Order.findById(orderInput).lean();
  if (!order || !Object.prototype.hasOwnProperty.call(templateKeys, event)) return null;
  const tenant = await resolveTenant(order);
  const user = await resolveUser(order);
  return sendEvent({ event, order, user, recipient: recipientFor(order, user), tenant, userId: user?._id, ...extra }).catch(error => { console.error(`[TrustSignal] ${event} SMS failed:`, error.message); return null; });
};

const sendWelcomeSms = async ({ user, tenant }) => {
  if (!user?.phone) return null;
  const resolvedTenant = tenant || await resolveTenant({});
  if (!resolvedTenant) return null;
  return sendEvent({ event: 'welcome', user, recipient: user.phone, tenant: resolvedTenant, userId: user._id }).catch(error => { console.error('[TrustSignal] welcome SMS failed:', error.message); return null; });
};

module.exports = { templateKeys, textFor, sendEvent, sendOrderPlaced, sendOrderStatus, sendPaymentEvent, sendOrderLifecycleEvent, sendWelcomeSms };
