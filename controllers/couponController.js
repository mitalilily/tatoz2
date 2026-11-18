const asyncHandler = require('express-async-handler');
const Coupon = require('../models/Coupon');
const Product = require('../models/Product');
const Category = require('../models/Category');
const cartService = require('../services/cartService');
const { quoteCoupon } = require('../services/couponService');
const CouponRedemption = require('../models/CouponRedemption');
const { validateCouponPayload } = require('../utils/adminValidation');

const COUPON_MUTABLE_FIELDS = [
  'code', 'description', 'type', 'value', 'buyXGetY', 'tiers', 'bundleProducts', 'bundleDiscount',
  'minOrderAmount', 'maxDiscount', 'usageLimit', 'userLimit', 'applicableProducts',
  'applicableCategories', 'isActive', 'showOnCheckout', 'startDate', 'expiresAt', 'isFirstOrderOnly',
  'customerEligibility', 'eligibleUsers', 'audienceSegments', 'allowedPaymentMethods', 'allowedChannels', 'geo',
];

const sanitizeCouponPayload = body => {
  const payload = {};
  COUPON_MUTABLE_FIELDS.forEach(field => {
    if (Object.prototype.hasOwnProperty.call(body || {}, field)) payload[field] = body[field];
  });
  if (typeof payload.code === 'string') payload.code = payload.code.trim().toUpperCase();
  return payload;
};

const couponReferenceError = () => {
  const error = new Error('Every product and category in an offer must belong to this store');
  error.statusCode = 400;
  error.publicCode = 'COUPON_REFERENCE_NOT_FOUND';
  return error;
};

const assertCouponReferences = async (payload, tenantId) => {
  if (!tenantId) return;
  const productIds = [...new Set([
    ...(payload.applicableProducts || []),
    ...(payload.bundleProducts || []),
  ].map(item => String(item?._id || item)).filter(Boolean))];
  const categoryIds = [...new Set((payload.applicableCategories || []).map(item => String(item?._id || item)).filter(Boolean))];
  const [productCount, categoryCount] = await Promise.all([
    productIds.length ? Product.countDocuments({ _id: { $in: productIds }, tenant: tenantId }) : 0,
    categoryIds.length ? Category.countDocuments({ _id: { $in: categoryIds }, tenant: tenantId }) : 0,
  ]);
  if (productCount !== productIds.length || categoryCount !== categoryIds.length) throw couponReferenceError();
};

// @desc    Validate coupon
// @route   POST /api/coupons/validate
const validateCoupon = asyncHandler(async (req, res) => {
  const { code, paymentMethod, shippingAddress, channel } = req.body;
  if (typeof code !== 'string' || !code.trim()) {
    res.status(400);
    throw new Error('Coupon code is required');
  }
  if (!req.user?._id || !req.tenant?._id) {
    res.status(401);
    const error = new Error('Sign in to receive an authoritative coupon quote');
    error.publicCode = 'COUPON_LOGIN_REQUIRED';
    throw error;
  }

  const coupon = await Coupon.findOne({
    code: code.trim().toUpperCase(),
    tenant: req.tenant._id,
    isActive: true,
  });

  if (!coupon) { res.status(404); throw new Error('Invalid coupon code'); }
  const cart = await cartService.getCart({ tenantId: req.tenant._id, userId: req.user._id });
  const orderItems = (cart.items || []).map(item => ({
    itemType: item.itemType || (item.bundle ? 'bundle' : 'product'),
    product: item.product?._id || item.product,
    bundle: item.bundle?._id || item.bundle,
    bundleComponents: item.components || [],
    bundleRewards: item.freeRewards || [],
    bundleSnapshot: item.bundleSnapshot || null,
    price: Number(item.unitPrice || item.product?.price || 0),
    quantity: Number(item.quantity || 0),
  }));
  const productIds = orderItems.flatMap(item => [item.product, item.bundle, ...(item.bundleComponents || []).map(component => component.product), ...(item.bundleRewards || []).map(component => component.product)]).filter(Boolean);
  const products = productIds.length
    ? await Product.find({ _id: { $in: productIds }, tenant: req.tenant._id }).select('_id category').lean()
    : [];
  const productCategoryIds = new Map(products.map(product => [String(product._id), String(product.category || '')]));
  const subtotal = Number(cart.subtotal || 0);
  const benefit = await quoteCoupon({
    coupon,
    user: req.user,
    tenant: req.tenant._id,
    orderItems,
    subtotal,
    productCategoryIds,
    paymentMethod,
    shippingAddress,
    channel: channel || req.headers['x-client-platform'] || 'website',
  });

  res.json({
    success: true,
    authoritative: true,
    cartRevision: Number(cart.revision || 0),
    subtotal,
    coupon: {
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      discount: benefit.discount,
      freeShipping: benefit.freeShippingCoupon,
      description: benefit.description || coupon.description,
    }
  });
});

// @desc    Get all coupons (admin)
// @route   GET /api/admin/coupons
const getCoupons = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);
  const scope = req.tenant ? { tenant: req.tenant._id } : {};
  const total = await Coupon.countDocuments(scope);
  const coupons = await Coupon.find(scope).sort({ createdAt: -1 }).skip(skip).limit(Number(limit))
    .populate('applicableProducts', 'title thumbnail')
    .populate('bundleProducts', 'title thumbnail');
  res.json({ success: true, coupons, pagination: { page: Number(page), limit: Number(limit), total } });
});

// @desc    Create coupon (admin)
// @route   POST /api/admin/coupons
const createCoupon = asyncHandler(async (req, res) => {
  const payload = validateCouponPayload(sanitizeCouponPayload(req.body), { forCreate: true });
  await assertCouponReferences(payload, req.tenant?._id);
  const coupon = await Coupon.create({ ...payload, ...(req.tenant ? { tenant: req.tenant._id } : {}) });
  res.status(201).json({ success: true, coupon });
});

// @desc    Update coupon (admin)
// @route   PUT /api/admin/coupons/:id
const updateCoupon = asyncHandler(async (req, res) => {
  const scope = req.tenant ? { tenant: req.tenant._id } : {};
  const current = await Coupon.findOne({ _id: req.params.id, ...scope });
  if (!current) { res.status(404); throw new Error('Coupon not found'); }
  const rawPayload = sanitizeCouponPayload(req.body);
  const merged = { ...current.toObject(), ...rawPayload };
  const validated = validateCouponPayload(merged, { forCreate: true });
  const payload = sanitizeCouponPayload(validated);
  await assertCouponReferences(payload, req.tenant?._id);
  const coupon = await Coupon.findOneAndUpdate({ _id: req.params.id, ...scope }, payload, { new: true, runValidators: true });
  if (!coupon) { res.status(404); throw new Error('Coupon not found'); }
  res.json({ success: true, coupon });
});

// @desc    Delete coupon (admin)
// @route   DELETE /api/admin/coupons/:id
const deleteCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findOne({ _id: req.params.id, ...(req.tenant ? { tenant: req.tenant._id } : {}) });
  if (!coupon) { res.status(404); throw new Error('Coupon not found'); }
  await coupon.deleteOne();
  res.json({ success: true, message: 'Coupon deleted' });
});

// @desc    Get visible coupons for checkout (public)
// @route   GET /api/coupons/available
const getAvailableCoupons = asyncHandler(async (req, res) => {
  const now = new Date();
  const coupons = await Coupon.find({
    ...(req.tenant ? { tenant: req.tenant._id } : {}),
    isActive: true,
    showOnCheckout: true,
    expiresAt: { $gt: now },
    $and: [
      { $or: [{ startDate: { $exists: false } }, { startDate: null }, { startDate: { $lte: now } }] },
      { $or: [{ usageLimit: null }, { usageLimit: { $exists: false } }, { $expr: { $lt: ['$usageCount', '$usageLimit'] } }] },
    ],
  }).select('code description type value minOrderAmount maxDiscount expiresAt isFirstOrderOnly customerEligibility allowedPaymentMethods allowedChannels geo audienceSegments').sort({ createdAt: -1 }).limit(10);
  res.json({ success: true, coupons });
});

// @desc    Get coupon redemption audit entries (admin)
// @route   GET /api/admin/coupons/:id/redemptions
const getCouponRedemptions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const scope = {
    tenant: req.tenant?._id,
    coupon: req.params.id,
    ...(status ? { status: String(status) } : {}),
  };
  const [total, redemptions] = await Promise.all([
    CouponRedemption.countDocuments(scope),
    CouponRedemption.find(scope)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .populate('user', 'name email phone')
      .populate('order', 'orderNumber total paymentStatus orderStatus')
      .lean(),
  ]);
  res.json({ success: true, redemptions, pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) } });
});

module.exports = { validateCoupon, getCoupons, createCoupon, updateCoupon, deleteCoupon, getAvailableCoupons, getCouponRedemptions };
