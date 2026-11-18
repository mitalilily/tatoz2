const mongoose = require('mongoose');
const User = require('../models/User');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const Category = require('../models/Category');
const CustomerSegment = require('../models/CustomerSegment');
const CustomerSegmentMembership = require('../models/CustomerSegmentMembership');
const { getTenantCustomerIds } = require('./customerScopeService');

const PAID_STATUSES = ['paid', 'refunded', 'partially_refunded'];
const ABANDONED_CART_AFTER_MS = 30 * 60 * 1000;
const MAX_CONDITIONS = 12;
const MAX_SAMPLE = 50;

const FIELD_CATALOG = [
  { field: 'orders_count', label: 'Total orders', type: 'number', operators: ['eq', 'gte', 'gt', 'lte', 'lt'] },
  { field: 'paid_orders_count', label: 'Paid orders', type: 'number', operators: ['eq', 'gte', 'gt', 'lte', 'lt'] },
  { field: 'total_spent', label: 'Total paid value', type: 'number', operators: ['eq', 'gte', 'gt', 'lte', 'lt'] },
  { field: 'last_order_days_ago', label: 'Days since last order', type: 'number', operators: ['eq', 'gte', 'gt', 'lte', 'lt', 'exists'] },
  { field: 'customer_days_old', label: 'Customer age in days', type: 'number', operators: ['eq', 'gte', 'gt', 'lte', 'lt'] },
  { field: 'has_abandoned_cart', label: 'Has abandoned cart', type: 'boolean', operators: ['eq'] },
  { field: 'has_cod_order', label: 'Has COD order', type: 'boolean', operators: ['eq'] },
  { field: 'has_prepaid_order', label: 'Has prepaid order', type: 'boolean', operators: ['eq'] },
  { field: 'city', label: 'City', type: 'string', operators: ['eq', 'contains', 'in', 'not_in'] },
  { field: 'state', label: 'State', type: 'string', operators: ['eq', 'contains', 'in', 'not_in'] },
  { field: 'pincode', label: 'Pincode', type: 'string', operators: ['eq', 'in', 'not_in'] },
  { field: 'category_name', label: 'Purchased category', type: 'string', operators: ['eq', 'contains', 'in', 'not_in'] },
  { field: 'tag', label: 'Customer tag', type: 'string', operators: ['eq', 'contains', 'in', 'not_in'] },
];

const FIELD_MAP = new Map(FIELD_CATALOG.map(field => [field.field, field]));

const segmentError = (message, statusCode = 400, code = 'CUSTOMER_SEGMENT_INVALID') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = code;
  return error;
};

const tenantIdOf = tenant => tenant?._id || tenant || null;

const ensureTenantId = tenant => {
  const tenantId = tenantIdOf(tenant);
  if (!mongoose.isValidObjectId(tenantId)) throw segmentError('Tenant context is required', 400, 'TENANT_REQUIRED');
  return tenantId;
};

const slugify = value => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 140);

const asNumber = (value, label) => {
  const number = Number(value);
  if (!Number.isFinite(number)) throw segmentError(`${label} must be a finite number`);
  return number;
};

const asBoolean = value => {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw segmentError('Boolean segment values must be true or false');
};

const normalizeCondition = condition => {
  if (!condition || typeof condition !== 'object' || Array.isArray(condition)) {
    throw segmentError('Each segment condition must be an object');
  }
  const field = FIELD_MAP.get(String(condition.field || '').trim());
  if (!field) throw segmentError(`Unsupported segment field: ${condition.field || 'empty'}`);
  const operator = String(condition.operator || '').trim();
  if (!field.operators.includes(operator)) throw segmentError(`Unsupported operator ${operator} for ${field.field}`);

  let value = condition.value;
  if (operator === 'exists') value = asBoolean(value);
  else if (field.type === 'number') value = asNumber(value, field.label);
  else if (field.type === 'boolean') value = asBoolean(value);
  else if (['in', 'not_in'].includes(operator)) {
    if (!Array.isArray(value) || value.length === 0 || value.length > 50) throw segmentError(`${field.label} list must contain 1 to 50 values`);
    value = value.map(item => String(item).trim().slice(0, 120)).filter(Boolean);
    if (!value.length) throw segmentError(`${field.label} list cannot be empty`);
  } else {
    value = String(value ?? '').trim().slice(0, 120);
    if (!value) throw segmentError(`${field.label} value is required`);
  }
  return { field: field.field, operator, value };
};

const normalizeDefinition = definition => {
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
    throw segmentError('Segment definition is required');
  }
  const match = definition.match === 'any' ? 'any' : 'all';
  const conditions = Array.isArray(definition.conditions)
    ? definition.conditions.slice(0, MAX_CONDITIONS).map(normalizeCondition)
    : [];
  if (!conditions.length) throw segmentError('Add at least one segment condition');
  return { match, conditions };
};

const normalizeSegmentInput = body => {
  const name = String(body?.name || '').trim().slice(0, 120);
  if (!name) throw segmentError('Segment name is required');
  const slug = slugify(body.slug || name);
  if (!slug) throw segmentError('Segment slug is required');
  return {
    name,
    slug,
    description: String(body.description || '').trim().slice(0, 500),
    definition: normalizeDefinition(body.definition),
    isActive: body.isActive !== false,
  };
};

const numeric = value => Number.isFinite(Number(value)) ? Number(value) : 0;

const uniqueStrings = values => Array.from(new Set(values.filter(Boolean).map(value => String(value))));

const buildCustomerSnapshots = async ({ tenant, userIds }) => {
  const tenantId = ensureTenantId(tenant);
  const ids = Array.from(new Map((userIds || []).filter(id => mongoose.isValidObjectId(id)).map(id => [String(id), id])).values());
  if (!ids.length) return [];

  const [users, orders, carts] = await Promise.all([
    User.find({ _id: { $in: ids }, role: 'customer' })
      .select('_id name email phone tags segment addresses createdAt')
      .lean(),
    Order.find({ tenant: tenantId, user: { $in: ids } })
      .select('user total paymentStatus paymentMethod createdAt shippingAddress items')
      .sort({ createdAt: -1 })
      .lean(),
    Cart.find({ tenant: tenantId, user: { $in: ids } })
      .select('user items updatedAt')
      .lean(),
  ]);

  const productIds = Array.from(new Set(orders.flatMap(order => (order.items || []).map(item => item.product).filter(Boolean).map(id => String(id)))));
  const products = productIds.length
    ? await Product.find({ _id: { $in: productIds } }).select('_id category').lean()
    : [];
  const categoryIds = Array.from(new Set(products.map(product => product.category).filter(Boolean).map(id => String(id))));
  const categories = categoryIds.length
    ? await Category.find({ _id: { $in: categoryIds } }).select('_id name').lean()
    : [];
  const productById = new Map(products.map(product => [String(product._id), product]));
  const categoryById = new Map(categories.map(category => [String(category._id), category.name]));
  const ordersByUser = new Map();
  orders.forEach(order => {
    const key = String(order.user);
    if (!ordersByUser.has(key)) ordersByUser.set(key, []);
    ordersByUser.get(key).push(order);
  });
  const cartsByUser = new Map(carts.map(cart => [String(cart.user), cart]));
  const now = Date.now();

  return users.map(user => {
    const userOrders = ordersByUser.get(String(user._id)) || [];
    const paidOrders = userOrders.filter(order => PAID_STATUSES.includes(order.paymentStatus));
    const latestOrder = userOrders[0] || null;
    const totalSpent = paidOrders.reduce((sum, order) => sum + numeric(order.total), 0);
    const categoryNames = [];
    userOrders.forEach(order => (order.items || []).forEach(item => {
      const product = productById.get(String(item.product));
      const categoryName = product?.category ? categoryById.get(String(product.category)) : null;
      if (categoryName) categoryNames.push(categoryName);
    }));
    const cart = cartsByUser.get(String(user._id));
    const latestAddress = latestOrder?.shippingAddress || user.addresses?.find(address => address.isDefault) || user.addresses?.[0] || {};
    const lastOrderAt = latestOrder?.createdAt ? new Date(latestOrder.createdAt) : null;
    const createdAt = user.createdAt ? new Date(user.createdAt) : null;
    const cartUpdatedAt = cart?.updatedAt ? new Date(cart.updatedAt).getTime() : 0;

    return {
      user_id: user._id,
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      tags: user.tags || [],
      segment: user.segment || 'new',
      orders_count: userOrders.length,
      paid_orders_count: paidOrders.length,
      total_spent: totalSpent,
      last_order_days_ago: lastOrderAt ? Math.max(0, Math.floor((now - lastOrderAt.getTime()) / 86400000)) : null,
      customer_days_old: createdAt ? Math.max(0, Math.floor((now - createdAt.getTime()) / 86400000)) : 0,
      has_abandoned_cart: Boolean(cart?.items?.length && cartUpdatedAt && now - cartUpdatedAt >= ABANDONED_CART_AFTER_MS),
      has_cod_order: userOrders.some(order => order.paymentMethod === 'cod'),
      has_prepaid_order: paidOrders.some(order => order.paymentMethod !== 'cod'),
      city: latestAddress.city || '',
      state: latestAddress.state || '',
      pincode: latestAddress.pincode || '',
      category_name: uniqueStrings(categoryNames),
    };
  });
};

const normalizedActualValues = actual => Array.isArray(actual) ? actual : [actual];

const compareValue = (actual, operator, expected) => {
  if (operator === 'exists') return (actual !== null && actual !== undefined) === expected;
  const actualValues = normalizedActualValues(actual).filter(value => value !== null && value !== undefined);
  if (['eq', 'in'].includes(operator)) {
    const expectedValues = operator === 'in' ? expected : [expected];
    return actualValues.some(value => expectedValues.some(item => String(value).toLowerCase() === String(item).toLowerCase()));
  }
  if (operator === 'not_in') return actualValues.every(value => !expected.some(item => String(value).toLowerCase() === String(item).toLowerCase()));
  if (operator === 'contains') return actualValues.some(value => String(value).toLowerCase().includes(String(expected).toLowerCase()));
  if (operator === 'not_contains') return actualValues.every(value => !String(value).toLowerCase().includes(String(expected).toLowerCase()));
  const actualNumber = Number(actualValues[0]);
  const expectedNumber = Number(expected);
  if (!Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber)) return false;
  if (operator === 'gte') return actualNumber >= expectedNumber;
  if (operator === 'gt') return actualNumber > expectedNumber;
  if (operator === 'lte') return actualNumber <= expectedNumber;
  if (operator === 'lt') return actualNumber < expectedNumber;
  return false;
};

const evaluateCondition = (snapshot, condition) => compareValue(snapshot[condition.field], condition.operator, condition.value);

const evaluateDefinition = (snapshot, definition) => {
  const outcomes = definition.conditions.map(condition => evaluateCondition(snapshot, condition));
  return definition.match === 'any' ? outcomes.some(Boolean) : outcomes.every(Boolean);
};

const evaluateSegment = async ({ tenant, definition }) => {
  const tenantId = ensureTenantId(tenant);
  const userIds = await getTenantCustomerIds(tenantId);
  const snapshots = await buildCustomerSnapshots({ tenant: tenantId, userIds });
  const normalized = normalizeDefinition(definition);
  return { definition: normalized, snapshots, matches: snapshots.filter(snapshot => evaluateDefinition(snapshot, normalized)) };
};

const safeSample = snapshots => snapshots.slice(0, MAX_SAMPLE).map(snapshot => ({
  _id: snapshot.user_id,
  name: snapshot.name,
  email: snapshot.email,
  phone: snapshot.phone,
  ordersCount: snapshot.orders_count,
  totalSpent: snapshot.total_spent,
  lastOrderDaysAgo: snapshot.last_order_days_ago,
}));

const listSegments = async ({ tenant }) => {
  const tenantId = ensureTenantId(tenant);
  return CustomerSegment.find({ tenant: tenantId }).sort({ updatedAt: -1 }).lean();
};

const getSegment = async ({ tenant, segmentId }) => {
  const tenantId = ensureTenantId(tenant);
  if (!mongoose.isValidObjectId(segmentId)) return null;
  return CustomerSegment.findOne({ _id: segmentId, tenant: tenantId }).lean();
};

const createSegment = async ({ tenant, body, actorId }) => {
  const tenantId = ensureTenantId(tenant);
  const input = normalizeSegmentInput(body);
  try {
    return await CustomerSegment.create({ ...input, tenant: tenantId, createdBy: actorId, updatedBy: actorId });
  } catch (error) {
    if (error?.code === 11000) throw segmentError('A segment with this name already exists in this tenant', 409, 'CUSTOMER_SEGMENT_DUPLICATE');
    throw error;
  }
};

const updateSegment = async ({ tenant, segmentId, body, actorId }) => {
  const tenantId = ensureTenantId(tenant);
  const current = await CustomerSegment.findOne({ _id: segmentId, tenant: tenantId });
  if (!current) return null;
  const input = normalizeSegmentInput({ ...current.toObject(), ...body, definition: body?.definition || current.definition });
  try {
    Object.assign(current, input, { updatedBy: actorId });
    await current.save();
    return current;
  } catch (error) {
    if (error?.code === 11000) throw segmentError('A segment with this name already exists in this tenant', 409, 'CUSTOMER_SEGMENT_DUPLICATE');
    throw error;
  }
};

const deleteSegment = async ({ tenant, segmentId }) => {
  const tenantId = ensureTenantId(tenant);
  const segment = await CustomerSegment.findOneAndDelete({ _id: segmentId, tenant: tenantId });
  if (!segment) return false;
  await CustomerSegmentMembership.deleteMany({ tenant: tenantId, segment: segment._id });
  return true;
};

const previewSegment = async ({ tenant, definition }) => {
  const evaluated = await evaluateSegment({ tenant, definition });
  return {
    definition: evaluated.definition,
    count: evaluated.matches.length,
    sample: safeSample(evaluated.matches),
  };
};

const applySegment = async ({ tenant, segmentId }) => {
  const tenantId = ensureTenantId(tenant);
  const segment = await CustomerSegment.findOne({ _id: segmentId, tenant: tenantId });
  if (!segment) return null;
  if (!segment.isActive) throw segmentError('Inactive segments cannot be applied', 409, 'CUSTOMER_SEGMENT_INACTIVE');
  const evaluated = await evaluateSegment({ tenant: tenantId, definition: segment.definition });
  const matchedIds = evaluated.matches.map(snapshot => snapshot.user_id);
  if (matchedIds.length) {
    await CustomerSegmentMembership.bulkWrite(matchedIds.map(user => ({
      updateOne: {
        filter: { tenant: tenantId, segment: segment._id, user },
        update: { $set: { matchedAt: new Date() } },
        upsert: true,
      },
    })), { ordered: false });
    await CustomerSegmentMembership.deleteMany({ tenant: tenantId, segment: segment._id, user: { $nin: matchedIds } });
  } else {
    await CustomerSegmentMembership.deleteMany({ tenant: tenantId, segment: segment._id });
  }
  segment.memberCount = matchedIds.length;
  segment.lastEvaluatedAt = new Date();
  await segment.save();
  return { segment: segment.toObject(), count: matchedIds.length, sample: safeSample(evaluated.matches) };
};

const getSegmentMemberIds = async ({ tenant, segmentId }) => {
  const tenantId = ensureTenantId(tenant);
  const segment = await CustomerSegment.findOne({ _id: segmentId, tenant: tenantId }).select('_id').lean();
  if (!segment) return null;
  return CustomerSegmentMembership.distinct('user', { tenant: tenantId, segment: segment._id });
};

module.exports = {
  FIELD_CATALOG,
  normalizeDefinition,
  evaluateDefinition,
  listSegments,
  getSegment,
  createSegment,
  updateSegment,
  deleteSegment,
  previewSegment,
  applySegment,
  getSegmentMemberIds,
};
