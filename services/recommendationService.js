const mongoose = require('mongoose');
const Product = require('../models/Product');
const ProductRecommendationRule = require('../models/ProductRecommendationRule');
const { addApprovedProductFilter } = require('./productApprovalService');

const TYPES = new Set(['related', 'frequently_bought', 'upsell', 'cross_sell', 'add_on']);
const recommendationError = (message, statusCode = 400, publicCode = 'RECOMMENDATION_INVALID') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
};
const tenantFilter = tenant => ({ tenant });

const normalizeType = type => {
  const value = String(type || 'related').toLowerCase();
  if (!TYPES.has(value)) throw recommendationError('Unsupported recommendation type');
  return value;
};

const resolveProducts = async ({ tenant, ids, field }) => {
  const values = Array.isArray(ids) ? ids.filter(id => mongoose.isValidObjectId(id)).map(id => String(id)) : [];
  if (!values.length) throw recommendationError(`${field} must contain at least one valid product`, 400, 'RECOMMENDATION_PRODUCTS_REQUIRED');
  if (values.length > 12) throw recommendationError('A recommendation rule may contain at most 12 products');
  const productQuery = { ...tenantFilter(tenant), _id: { $in: values }, isActive: true };
  addApprovedProductFilter(productQuery);
  const products = await Product.find(productQuery).select('_id').lean();
  const found = new Set(products.map(product => String(product._id)));
  if (found.size !== new Set(values).size) throw recommendationError('All recommendation products must belong to this store and be active', 404, 'RECOMMENDATION_PRODUCT_NOT_FOUND');
  return values.map(id => products.find(product => String(product._id) === id)?._id);
};

const safeRule = rule => {
  const value = rule.toObject ? rule.toObject() : rule;
  return { ...value, targetProducts: Array.isArray(value.targetProducts) ? value.targetProducts : [] };
};

const createRule = async ({ tenant, data = {} }) => {
  if (!tenant) throw recommendationError('Tenant is required', 400, 'RECOMMENDATION_TENANT_REQUIRED');
  if (!mongoose.isValidObjectId(data.sourceProduct)) throw recommendationError('A valid source product is required');
  const sourceQuery = { ...tenantFilter(tenant), _id: data.sourceProduct, isActive: true };
  addApprovedProductFilter(sourceQuery);
  const source = await Product.findOne(sourceQuery).select('_id');
  if (!source) throw recommendationError('Source product was not found in this store', 404, 'RECOMMENDATION_SOURCE_NOT_FOUND');
  const targetProducts = await resolveProducts({ tenant, ids: data.targetProducts, field: 'targetProducts' });
  if (targetProducts.some(id => String(id) === String(source._id))) throw recommendationError('A product cannot recommend itself');
  const rule = await ProductRecommendationRule.create({
    tenant,
    type: normalizeType(data.type),
    sourceProduct: source._id,
    targetProducts,
    label: String(data.label || '').trim().slice(0, 120),
    enabled: data.enabled !== false,
    priority: Number.isFinite(Number(data.priority)) ? Number(data.priority) : 0,
    maxItems: Math.min(12, Math.max(1, Number(data.maxItems || 4))),
  });
  return ProductRecommendationRule.findById(rule._id).populate('sourceProduct', 'title slug').populate('targetProducts', 'title slug price thumbnail images').lean();
};

const listRules = async ({ tenant, type }) => {
  const filter = tenantFilter(tenant);
  if (type) filter.type = normalizeType(type);
  return ProductRecommendationRule.find(filter)
    .populate('sourceProduct', 'title slug')
    .populate('targetProducts', 'title slug price thumbnail images')
    .sort({ priority: -1, updatedAt: -1 })
    .lean();
};

const updateRule = async ({ tenant, id, data = {} }) => {
  const rule = await ProductRecommendationRule.findOne({ ...tenantFilter(tenant), _id: id });
  if (!rule) throw recommendationError('Recommendation rule not found', 404, 'RECOMMENDATION_NOT_FOUND');
  if (data.type !== undefined) rule.type = normalizeType(data.type);
  if (data.sourceProduct !== undefined) {
    if (!mongoose.isValidObjectId(data.sourceProduct)) throw recommendationError('A valid source product is required');
    const sourceQuery = { ...tenantFilter(tenant), _id: data.sourceProduct, isActive: true };
    addApprovedProductFilter(sourceQuery);
    const source = await Product.findOne(sourceQuery).select('_id');
    if (!source) throw recommendationError('Source product was not found in this store', 404, 'RECOMMENDATION_SOURCE_NOT_FOUND');
    rule.sourceProduct = source._id;
  }
  if (data.targetProducts !== undefined) rule.targetProducts = await resolveProducts({ tenant, ids: data.targetProducts, field: 'targetProducts' });
  if (rule.targetProducts.some(id => String(id) === String(rule.sourceProduct))) throw recommendationError('A product cannot recommend itself');
  if (data.label !== undefined) rule.label = String(data.label || '').trim().slice(0, 120);
  if (data.enabled !== undefined) rule.enabled = data.enabled === true;
  if (data.priority !== undefined) rule.priority = Number(data.priority);
  if (data.maxItems !== undefined) rule.maxItems = Math.min(12, Math.max(1, Number(data.maxItems)));
  await rule.save();
  return ProductRecommendationRule.findById(rule._id).populate('sourceProduct', 'title slug').populate('targetProducts', 'title slug price thumbnail images').lean();
};

const deleteRule = async ({ tenant, id }) => {
  const result = await ProductRecommendationRule.deleteOne({ ...tenantFilter(tenant), _id: id });
  if (!result.deletedCount) throw recommendationError('Recommendation rule not found', 404, 'RECOMMENDATION_NOT_FOUND');
  return { deleted: true };
};

const listRecommendations = async ({ tenant, productId, type = 'related', limit = 4 }) => {
  if (!tenant || !mongoose.isValidObjectId(productId)) return { source: 'none', products: [] };
  const normalizedType = normalizeType(type);
  const sourceQuery = { ...tenantFilter(tenant), _id: productId, isActive: true };
  addApprovedProductFilter(sourceQuery);
  const source = await Product.findOne(sourceQuery).select('_id category').lean();
  if (!source) throw recommendationError('Product not found', 404, 'RECOMMENDATION_SOURCE_NOT_FOUND');
  const rules = await ProductRecommendationRule.find({ tenant, sourceProduct: source._id, type: normalizedType, enabled: true })
    .sort({ priority: -1, updatedAt: -1 })
    .limit(10)
    .lean();
  const targetIds = [];
  for (const rule of rules) {
    for (const id of rule.targetProducts || []) {
      if (!targetIds.some(existing => String(existing) === String(id))) targetIds.push(id);
      if (targetIds.length >= Math.min(12, Math.max(1, Number(limit) || 4))) break;
    }
    if (targetIds.length >= Math.min(12, Math.max(1, Number(limit) || 4))) break;
  }
  if (targetIds.length) {
    const targetQuery = { ...tenantFilter(tenant), _id: { $in: targetIds }, isActive: true };
    addApprovedProductFilter(targetQuery);
    const targetProducts = await Product.find(targetQuery).populate('category', 'name slug').select('-aiRawData -seo.schema').lean();
    const order = new Map(targetIds.map((id, index) => [String(id), index]));
    targetProducts.sort((a, b) => order.get(String(a._id)) - order.get(String(b._id)));
    return { source: 'rule', type: normalizedType, products: targetProducts.slice(0, Number(limit) || 4) };
  }
  const fallbackQuery = { ...tenantFilter(tenant), category: source.category, _id: { $ne: source._id }, isActive: true };
  addApprovedProductFilter(fallbackQuery);
  const fallback = await Product.find(fallbackQuery)
    .sort({ isFeatured: -1, totalSales: -1, createdAt: -1 })
    .limit(Math.min(12, Math.max(1, Number(limit) || 4)))
    .populate('category', 'name slug')
    .select('-aiRawData -seo.schema')
    .lean();
  return { source: 'category_fallback', type: normalizedType, products: fallback };
};

module.exports = { createRule, listRules, updateRule, deleteRule, listRecommendations, safeRule };
