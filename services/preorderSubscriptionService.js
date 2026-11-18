const mongoose = require('mongoose');
const Product = require('../models/Product');
const Preorder = require('../models/Preorder');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const CustomerSubscription = require('../models/CustomerSubscription');
const { addApprovedProductFilter } = require('./productApprovalService');

const idOf = value => value?._id || value?.id || value;
const tenantOf = value => idOf(value?.tenant || value);
const errorWith = (message, statusCode = 400, publicCode = 'COMMERCE_LIFECYCLE_INVALID') => { const error = new Error(message); error.statusCode = statusCode; error.publicCode = publicCode; return error; };
const requireTenant = value => { const tenant = tenantOf(value); if (!tenant || !mongoose.isValidObjectId(tenant)) throw errorWith('Tenant context is required', 400, 'TENANT_REQUIRED'); return tenant; };
const text = value => String(value ?? '').trim();
const positiveInteger = (value, label) => { const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100000) throw errorWith(`${label} must be a positive whole number`); return parsed; };
const money = (value, label) => { const parsed = Number(value); if (!Number.isFinite(parsed) || parsed < 0) throw errorWith(`${label} must be a non-negative amount`); return Math.round(parsed * 100) / 100; };
const idempotency = value => { const key = text(value); if (key.length < 8 || key.length > 160) throw errorWith('A valid idempotency key is required'); return key; };
const productFor = async (tenant, productId) => { if (!mongoose.isValidObjectId(productId)) throw errorWith('Product not found', 404, 'PRODUCT_NOT_FOUND'); const productQuery = { _id: productId, tenant, isActive: true }; addApprovedProductFilter(productQuery); const product = await Product.findOne(productQuery).lean(); if (!product) throw errorWith('Product not found for this tenant', 404, 'PRODUCT_NOT_FOUND'); return product; };
const recordStatus = (document, status, note, actor) => { document.status = status; document.statusHistory = [...(document.statusHistory || []), { status, note: text(note).slice(0, 500), actor: idOf(actor) || null, at: new Date() }]; };

const createPreorder = async ({ tenant, user, data = {} } = {}) => {
  const tenantId = requireTenant(tenant); const userId = idOf(user); if (!mongoose.isValidObjectId(userId)) throw errorWith('Customer authentication is required', 401, 'CUSTOMER_REQUIRED');
  const product = await productFor(tenantId, data.product);
  if (!product.preorderEnabled && !product.backorderEnabled) throw errorWith('This product is not accepting pre-orders or back-orders', 409, 'PREORDER_NOT_AVAILABLE');
  const key = idempotency(data.idempotencyKey); const existing = await Preorder.findOne({ tenant: tenantId, user: userId, idempotencyKey: key }).lean(); if (existing) return { preorder: existing, idempotent: true };
  const quantity = positiveInteger(data.quantity || 1, 'Quantity'); const kind = Number(product.stock || 0) > 0 ? 'preorder' : (product.preorderEnabled ? 'preorder' : 'backorder');
  const unitPrice = money(product.preorderEnabled && product.preorderPrice !== null && product.preorderPrice !== undefined ? product.preorderPrice : product.price, 'Pre-order price');
  const depositAmount = money(data.depositAmount ?? (product.preorderDeposit || 0) * quantity, 'Deposit amount');
  if (depositAmount > unitPrice * quantity) throw errorWith('Deposit cannot exceed the order value');
  const preorder = await Preorder.create({ tenant: tenantId, user: userId, product: product._id, kind, quantity, unitPrice, depositAmount, estimatedShipDate: product.estimatedShippingDate, idempotencyKey: key, customerNote: text(data.customerNote).slice(0, 500), statusHistory: [{ status: 'pending_payment', note: 'Pre-order request created', actor: userId }] });
  return { preorder: preorder.toObject(), idempotent: false };
};

const listPreorders = async ({ tenant, user, status, page = 1, limit = 50 } = {}) => {
  const tenantId = requireTenant(tenant); const filter = { tenant: tenantId }; if (user) filter.user = idOf(user); if (status) filter.status = text(status); const safePage = Math.max(1, Number(page) || 1); const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
  const [items, total] = await Promise.all([Preorder.find(filter).populate('product', 'title slug price thumbnail').sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean(), Preorder.countDocuments(filter)]);
  return { items, total, page: safePage, limit: safeLimit, pages: Math.ceil(total / safeLimit) };
};

const updatePreorderStatus = async ({ tenant, preorderId, status, actor, note = '', order } = {}) => {
  const tenantId = requireTenant(tenant); if (!['pending_payment', 'confirmed', 'fulfilled', 'cancelled', 'refunded'].includes(status)) throw errorWith('Invalid pre-order status'); const preorder = await Preorder.findOne({ _id: preorderId, tenant: tenantId }); if (!preorder) throw errorWith('Pre-order not found', 404, 'PREORDER_NOT_FOUND');
  const transitions = { pending_payment: ['confirmed', 'cancelled'], confirmed: ['fulfilled', 'cancelled', 'refunded'], fulfilled: [], cancelled: [], refunded: [] }; if (preorder.status !== status && !transitions[preorder.status]?.includes(status)) throw errorWith(`Cannot move pre-order from ${preorder.status} to ${status}`, 409, 'PREORDER_STATUS_INVALID');
  recordStatus(preorder, status, note || `Pre-order marked ${status}`, actor); if (order && mongoose.isValidObjectId(order)) preorder.order = order; await preorder.save(); return preorder.toObject();
};

const createPlan = async ({ tenant, data = {}, actor } = {}) => {
  const tenantId = requireTenant(tenant); const product = await productFor(tenantId, data.product); const name = text(data.name); if (!name || name.length > 120) throw errorWith('Subscription plan name is required'); const frequency = text(data.frequency || 'monthly').toLowerCase(); if (!['weekly', 'monthly', 'custom'].includes(frequency)) throw errorWith('Invalid subscription frequency'); const interval = positiveInteger(data.interval || 1, 'Interval'); if (frequency !== 'custom' && interval > (frequency === 'weekly' ? 52 : 12)) throw errorWith('Subscription interval is too large'); const price = money(data.price ?? product.price, 'Subscription price'); const discountPercentage = Number(data.discountPercentage || 0); if (!Number.isFinite(discountPercentage) || discountPercentage < 0 || discountPercentage > 100) throw errorWith('Subscription discount must be between 0 and 100');
  const plan = await SubscriptionPlan.create({ tenant: tenantId, product: product._id, name, frequency, interval, price, discountPercentage, isActive: data.isActive !== false && data.isActive !== 'false', createdBy: idOf(actor) || null }); return plan.toObject();
};

const listPlans = async ({ tenant, activeOnly = false } = {}) => {
  const tenantId = requireTenant(tenant);
  const approvedProductsQuery = { tenant: tenantId };
  addApprovedProductFilter(approvedProductsQuery);
  const approvedProductIds = await Product.find(approvedProductsQuery).distinct('_id');
  const filter = { tenant: tenantId, product: { $in: approvedProductIds } };
  if (activeOnly) filter.isActive = true;
  return SubscriptionPlan.find(filter).populate('product', 'title slug price thumbnail').sort({ createdAt: -1 }).lean();
};
const nextBillingDate = (from, plan) => { const date = new Date(from || Date.now()); if (plan.frequency === 'weekly') date.setUTCDate(date.getUTCDate() + 7 * plan.interval); else date.setUTCMonth(date.getUTCMonth() + plan.interval); return date; };

const subscribe = async ({ tenant, user, data = {} } = {}) => {
  const tenantId = requireTenant(tenant); const userId = idOf(user); if (!mongoose.isValidObjectId(userId)) throw errorWith('Customer authentication is required', 401, 'CUSTOMER_REQUIRED'); const key = idempotency(data.idempotencyKey); const existing = await CustomerSubscription.findOne({ tenant: tenantId, user: userId, idempotencyKey: key }).lean(); if (existing) return { subscription: existing, idempotent: true };
  const plan = await SubscriptionPlan.findOne({ _id: data.plan, tenant: tenantId, isActive: true }).lean(); if (!plan) throw errorWith('Subscription plan not found or inactive', 404, 'SUBSCRIPTION_PLAN_NOT_FOUND');
  const subscription = await CustomerSubscription.create({ tenant: tenantId, user: userId, plan: plan._id, product: plan.product, quantity: positiveInteger(data.quantity || 1, 'Quantity'), price: money(plan.price, 'Subscription price'), status: 'pending_payment', idempotencyKey: key, statusHistory: [{ status: 'pending_payment', note: 'Subscription created; payment confirmation required', actor: userId }] }); return { subscription: subscription.toObject(), idempotent: false };
};
const listSubscriptions = async ({ tenant, user, status, page = 1, limit = 50 } = {}) => { const tenantId = requireTenant(tenant); const filter = { tenant: tenantId }; if (user) filter.user = idOf(user); if (status) filter.status = text(status); const safePage = Math.max(1, Number(page) || 1); const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50)); const [items, total] = await Promise.all([CustomerSubscription.find(filter).populate('plan', 'name frequency interval price').populate('product', 'title slug thumbnail').sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean(), CustomerSubscription.countDocuments(filter)]); return { items, total, page: safePage, limit: safeLimit, pages: Math.ceil(total / safeLimit) }; };
const updateSubscriptionStatus = async ({ tenant, subscriptionId, status, actor, user, note = '' } = {}) => {
  const tenantId = requireTenant(tenant);
  if (!['active', 'paused', 'cancelled', 'expired'].includes(status)) throw errorWith('Invalid subscription status');
  const filter = { _id: subscriptionId, tenant: tenantId };
  // Admin/service callers may intentionally omit `user`; customer callers must
  // always pass it so an ID from the same storefront cannot cross accounts.
  if (user) filter.user = idOf(user);
  const subscription = await CustomerSubscription.findOne(filter).populate('plan');
  if (!subscription) throw errorWith('Subscription not found', 404, 'SUBSCRIPTION_NOT_FOUND');
  const transitions = { pending_payment: ['active', 'cancelled'], active: ['paused', 'cancelled', 'expired'], paused: ['active', 'cancelled'], cancelled: [], expired: [] };
  if (!transitions[subscription.status]?.includes(status)) throw errorWith(`Cannot move subscription from ${subscription.status} to ${status}`, 409, 'SUBSCRIPTION_STATUS_INVALID');
  recordStatus(subscription, status, note || `Subscription marked ${status}`, actor);
  if (status === 'active') subscription.nextBillingAt = nextBillingDate(new Date(), subscription.plan);
  if (status !== 'active') subscription.nextBillingAt = null;
  await subscription.save();
  return subscription.toObject();
};

module.exports = { createPreorder, listPreorders, updatePreorderStatus, createPlan, listPlans, subscribe, listSubscriptions, updateSubscriptionStatus, errorWith };
