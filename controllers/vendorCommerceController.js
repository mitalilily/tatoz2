const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Review = require('../models/Review');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const Settings = require('../models/Settings');
const CommissionRule = require('../models/CommissionRule');
const subscriptionService = require('../services/preorderSubscriptionService');
const { addApprovedProductFilter } = require('../services/productApprovalService');

const tenantIdFor = req => {
  const tenant = req.vendor?.tenant || req.tenant?._id;
  if (!tenant) {
    const error = new Error('Tenant context is required for seller commerce data');
    error.statusCode = 400;
    error.publicCode = 'TENANT_REQUIRED';
    throw error;
  }
  return tenant;
};

const vendorIdFor = req => req.vendor?._id;
const safePage = value => Math.max(1, Number(value) || 1);
const safeLimit = value => Math.min(100, Math.max(1, Number(value) || 20));
const roundMoney = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const vendorProductsQuery = req => ({ tenant: tenantIdFor(req), vendor: vendorIdFor(req) });

const getCommissionSummary = asyncHandler(async (req, res) => {
  const tenant = tenantIdFor(req);
  const vendor = req.vendor;
  const defaultRate = Number(await Settings.get('defaultCommissionRate', 10)) || 0;
  const productCategoryIds = await Product.find(vendorProductsQuery(req)).distinct('category');
  const products = await Product.find(vendorProductsQuery(req)).select('title slug category').populate('category', 'name commissionRate ancestors depth level').sort({ title: 1 }).lean();
  const commissionRules = await CommissionRule.find({ tenant, isActive: true, effectiveFrom: { $lte: new Date() }, $or: [{ vendor: vendor._id }, { vendor: null }, { vendor: { $exists: false } }] }).lean();
  const categories = await Category.find({ tenant, _id: { $in: productCategoryIds.filter(Boolean) }, isActive: true })
    .select('name slug commissionRate')
    .sort({ name: 1 })
    .lean();

  const orderMatch = { tenant, 'subOrders.vendor': vendorIdFor(req) };
  const totals = await Order.aggregate([
    { $match: orderMatch },
    { $unwind: '$subOrders' },
    { $match: { 'subOrders.vendor': vendorIdFor(req) } },
    { $group: {
      _id: null,
      orders: { $sum: 1 },
      sales: { $sum: '$subOrders.total' },
      commission: { $sum: '$subOrders.commissionAmount' },
      earnings: { $sum: '$subOrders.vendorEarnings' },
      commissionable: { $sum: '$subOrders.commissionableAmount' },
    } },
  ]);

  const overrideRate = Number(vendor.commissionRate || 0);
  const hasOverride = overrideRate > 0;
  const { resolveCommission } = require('../services/commissionService');
  const productRates = products.map(product => {
    const resolved = resolveCommission({
      rules: commissionRules,
      productId: product._id,
      categoryId: product.category?._id || product.category,
      categoryAncestors: product.category?.ancestors || [],
      vendorId: vendor._id,
      vendorRate: overrideRate,
      categoryRate: product.category?.commissionRate,
      defaultRate,
    });
    return { _id: product._id, title: product.title, slug: product.slug, category: product.category, commissionRate: resolved.rate, flatFee: resolved.flatFee, source: resolved.source, ruleName: resolved.ruleName || '' };
  });
  res.json({
    success: true,
    data: {
      vendorId: vendor._id,
      overrideRate: hasOverride ? overrideRate : null,
      defaultRate,
      rateSource: hasOverride ? 'seller_override' : 'category_or_product_rule',
      categoryRates: categories,
      productRates,
      totals: {
        orders: totals[0]?.orders || 0,
        sales: roundMoney(totals[0]?.sales),
        commissionable: roundMoney(totals[0]?.commissionable),
        commission: roundMoney(totals[0]?.commission),
        earnings: roundMoney(totals[0]?.earnings),
      },
    },
  });
});

const getVendorReports = asyncHandler(async (req, res) => {
  const tenant = tenantIdFor(req);
  const period = ['7d', '30d', '90d'].includes(req.query.period) ? req.query.period : '30d';
  const days = Number(period.slice(0, -1));
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const vendor = vendorIdFor(req);
  const orderMatch = { tenant, createdAt: { $gte: startDate }, 'subOrders.vendor': vendor };
  const [summary, byStatus, daily, topProducts, productCount] = await Promise.all([
    Order.aggregate([
      { $match: orderMatch }, { $unwind: '$subOrders' }, { $match: { 'subOrders.vendor': vendor } },
      { $group: { _id: null, orders: { $sum: 1 }, sales: { $sum: '$subOrders.total' }, commission: { $sum: '$subOrders.commissionAmount' }, earnings: { $sum: '$subOrders.vendorEarnings' }, tax: { $sum: '$subOrders.tax' } } },
    ]),
    Order.aggregate([
      { $match: orderMatch }, { $unwind: '$subOrders' }, { $match: { 'subOrders.vendor': vendor } },
      { $group: { _id: '$subOrders.status', orders: { $sum: 1 }, sales: { $sum: '$subOrders.total' }, earnings: { $sum: '$subOrders.vendorEarnings' } } },
      { $sort: { orders: -1 } },
    ]),
    Order.aggregate([
      { $match: orderMatch }, { $unwind: '$subOrders' }, { $match: { 'subOrders.vendor': vendor } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, orders: { $sum: 1 }, sales: { $sum: '$subOrders.total' }, commission: { $sum: '$subOrders.commissionAmount' }, earnings: { $sum: '$subOrders.vendorEarnings' } } },
      { $sort: { _id: 1 } },
    ]),
    Order.aggregate([
      { $match: orderMatch }, { $unwind: '$subOrders' }, { $match: { 'subOrders.vendor': vendor } }, { $unwind: '$subOrders.items' },
      { $group: { _id: '$subOrders.items.product', sold: { $sum: '$subOrders.items.quantity' }, sales: { $sum: { $multiply: ['$subOrders.items.price', '$subOrders.items.quantity'] } } } },
      { $sort: { sold: -1 } }, { $limit: 10 },
    ]),
    Product.countDocuments(vendorProductsQuery(req)),
  ]);
  const topProductDocs = await Product.find({
    tenant,
    _id: { $in: topProducts.map(item => item._id).filter(Boolean) },
  }).select('title slug thumbnail images').lean();
  const topProductMap = new Map(topProductDocs.map(product => [String(product._id), product]));
  const totals = summary[0] || {};
  res.json({
    success: true,
    data: {
      period,
      startDate,
      summary: {
        products: productCount,
        orders: totals.orders || 0,
        sales: roundMoney(totals.sales),
        tax: roundMoney(totals.tax),
        commission: roundMoney(totals.commission),
        earnings: roundMoney(totals.earnings),
        averageOrderValue: totals.orders ? roundMoney(totals.sales / totals.orders) : 0,
      },
      byStatus: byStatus.map(item => ({ ...item, sales: roundMoney(item.sales), earnings: roundMoney(item.earnings) })),
      daily: daily.map(item => ({ ...item, sales: roundMoney(item.sales), commission: roundMoney(item.commission), earnings: roundMoney(item.earnings) })),
      topProducts: topProducts.map(item => ({ ...item, _id: topProductMap.get(String(item._id)) || item._id, sales: roundMoney(item.sales) })),
    },
  });
});

const getVendorReviews = asyncHandler(async (req, res) => {
  const tenant = tenantIdFor(req);
  const productIds = await Product.find(vendorProductsQuery(req)).distinct('_id');
  const page = safePage(req.query.page);
  const limit = safeLimit(req.query.limit);
  const filter = { tenant, product: { $in: productIds } };
  if (['pending', 'approved', 'rejected'].includes(req.query.status)) filter.status = req.query.status;
  const [reviews, total, stats] = await Promise.all([
    Review.find(filter)
      .populate('product', 'title slug thumbnail')
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Review.countDocuments(filter),
    Review.aggregate([{ $match: filter }, { $group: { _id: null, average: { $avg: '$rating' }, total: { $sum: 1 }, approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } }, pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } } } }]),
  ]);
  res.json({ success: true, reviews, stats: stats[0] || { average: 0, total: 0, approved: 0, pending: 0 }, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const replyToVendorReview = asyncHandler(async (req, res) => {
  const tenant = tenantIdFor(req);
  const productIds = await Product.find(vendorProductsQuery(req)).distinct('_id');
  const reply = String(req.body?.reply ?? '').trim();
  if (reply.length > 2000) { res.status(422); throw new Error('Review reply must be 2000 characters or fewer'); }
  const review = await Review.findOne({ _id: req.params.id, tenant, product: { $in: productIds } });
  if (!review) { res.status(404); throw new Error('Review not found'); }
  review.vendorReply = reply;
  review.vendorReplyAt = reply ? new Date() : null;
  review.vendorReplyBy = reply ? req.user._id : null;
  await review.save();
  res.json({ success: true, review });
});

const planProductFor = async (req, productId, { approved = false } = {}) => {
  if (!mongoose.isValidObjectId(productId)) throw subscriptionService.errorWith('Product not found', 404, 'PRODUCT_NOT_FOUND');
  const query = { ...vendorProductsQuery(req), _id: productId, isActive: true };
  if (approved) addApprovedProductFilter(query);
  const product = await Product.findOne(query).select('_id title price approvalStatus').lean();
  if (!product) throw subscriptionService.errorWith('Product not found or not approved for subscription plans', 404, 'PRODUCT_NOT_FOUND');
  return product;
};

const populatePlan = query => query.populate('product', 'title slug price thumbnail approvalStatus').populate('createdBy', 'name email');

const getVendorSubscriptionPlans = asyncHandler(async (req, res) => {
  const page = safePage(req.query.page);
  const limit = safeLimit(req.query.limit);
  const productIds = await Product.find(vendorProductsQuery(req)).distinct('_id');
  const filter = { tenant: tenantIdFor(req), product: { $in: productIds } };
  if (req.query.activeOnly === 'true') filter.isActive = true;
  const [plans, total] = await Promise.all([
    populatePlan(SubscriptionPlan.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)).lean(),
    SubscriptionPlan.countDocuments(filter),
  ]);
  res.json({ success: true, plans, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const normalizePlanInput = body => {
  const name = String(body?.name || '').trim();
  if (!name || name.length > 120) throw subscriptionService.errorWith('Subscription plan name is required');
  const frequency = String(body?.frequency || 'monthly').trim().toLowerCase();
  if (!['weekly', 'monthly', 'custom'].includes(frequency)) throw subscriptionService.errorWith('Invalid subscription frequency');
  const interval = Number(body?.interval || 1);
  if (!Number.isInteger(interval) || interval < 1 || interval > 52 || (frequency === 'monthly' && interval > 12)) throw subscriptionService.errorWith('Subscription interval is invalid');
  const price = Number(body?.price);
  if (!Number.isFinite(price) || price < 0) throw subscriptionService.errorWith('Subscription price must be a non-negative amount');
  const discountPercentage = Number(body?.discountPercentage || 0);
  if (!Number.isFinite(discountPercentage) || discountPercentage < 0 || discountPercentage > 100) throw subscriptionService.errorWith('Subscription discount must be between 0 and 100');
  return { name, frequency, interval, price: roundMoney(price), discountPercentage, isActive: body?.isActive !== false && body?.isActive !== 'false' };
};

const createVendorSubscriptionPlan = asyncHandler(async (req, res) => {
  const product = await planProductFor(req, req.body?.product, { approved: true });
  const input = normalizePlanInput({ ...req.body, price: req.body?.price ?? product.price });
  const plan = await SubscriptionPlan.create({ ...input, tenant: tenantIdFor(req), product: product._id, vendor: vendorIdFor(req), createdBy: req.user._id });
  res.status(201).json({ success: true, plan: await populatePlan(SubscriptionPlan.findById(plan._id)).lean() });
});

const updateVendorSubscriptionPlan = asyncHandler(async (req, res) => {
  const productIds = await Product.find(vendorProductsQuery(req)).distinct('_id');
  const plan = await SubscriptionPlan.findOne({ _id: req.params.id, tenant: tenantIdFor(req), product: { $in: productIds } });
  if (!plan) { res.status(404); throw new Error('Subscription plan not found'); }
  const input = normalizePlanInput({ ...plan.toObject(), ...(req.body || {}) });
  Object.assign(plan, input);
  await plan.save();
  res.json({ success: true, plan: await populatePlan(SubscriptionPlan.findById(plan._id)).lean() });
});

const deactivateVendorSubscriptionPlan = asyncHandler(async (req, res) => {
  const productIds = await Product.find(vendorProductsQuery(req)).distinct('_id');
  const plan = await SubscriptionPlan.findOneAndUpdate(
    { _id: req.params.id, tenant: tenantIdFor(req), product: { $in: productIds } },
    { $set: { isActive: false } },
    { new: true },
  );
  if (!plan) { res.status(404); throw new Error('Subscription plan not found'); }
  res.json({ success: true, plan });
});

module.exports = {
  getCommissionSummary,
  getVendorReports,
  getVendorReviews,
  replyToVendorReview,
  getVendorSubscriptionPlans,
  createVendorSubscriptionPlan,
  updateVendorSubscriptionPlan,
  deactivateVendorSubscriptionPlan,
};
