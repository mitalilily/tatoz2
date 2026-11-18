const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');
const { prepareProductUpdate, recordManualStockAdjustment } = require('../services/productInventoryGuard');
const Order = require('../models/Order');
const Payout = require('../models/Payout');
const VendorLedger = require('../models/VendorLedger');
const Vendor = require('../models/Vendor');
const { createUniqueProductSlug } = require('../utils/slugify');
const { validateAddress, validateTaxProfile, normalizedPhone } = require('../utils/vendorValidation');
const { normalizeBulkOrderPayload } = require('../utils/bulkOrder');
const { validateProductPayload, validationError } = require('../utils/adminValidation');
const { addApprovedProductFilter, isProductApproved, pendingVendorProductFields } = require('../services/productApprovalService');

// @desc    Get vendor dashboard overview
// @route   GET /api/vendor/dashboard
const getDashboard = asyncHandler(async (req, res) => {
  const vendorId = req.vendor._id;

  const [
    totalProducts, activeProducts, orderStats, recentOrders,
    revenueData, totalPayouts, pendingPayouts, ledger, lowStockProducts,
  ] = await Promise.all([
    Product.countDocuments({ vendor: vendorId }),
    (() => { const query = { vendor: vendorId, isActive: true }; addApprovedProductFilter(query); return Product.countDocuments(query); })(),
    Order.aggregate([
      { $match: { 'subOrders.vendor': vendorId } },
      { $unwind: '$subOrders' },
      { $match: { 'subOrders.vendor': vendorId } },
      { $group: { _id: '$subOrders.status', count: { $sum: 1 }, revenue: { $sum: '$subOrders.total' } } },
    ]),
    Order.find({ 'subOrders.vendor': vendorId })
      .select('orderNumber subOrders total createdAt')
      .sort({ createdAt: -1 })
      .limit(5),
    Order.aggregate([
      { $match: { 'subOrders.vendor': vendorId, paymentStatus: 'paid' } },
      { $unwind: '$subOrders' },
      { $match: { 'subOrders.vendor': vendorId } },
      { $group: { _id: null, totalRevenue: { $sum: '$subOrders.vendorEarnings' } } },
    ]),
    Payout.aggregate([
      { $match: { vendor: vendorId, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$netAmount' } } },
    ]),
    Payout.aggregate([
      { $match: { vendor: vendorId, status: { $in: ['pending', 'processing'] } } },
      { $group: { _id: null, total: { $sum: '$netAmount' } } },
    ]),
    VendorLedger.find({ vendor: vendorId }).sort({ createdAt: -1 }).limit(10),
    (() => { const query = {
      vendor: vendorId,
      $expr: { $and: [
        { $gt: ['$lowStockThreshold', 0] },
        { $lte: ['$stock', '$lowStockThreshold'] },
      ]},
    }; addApprovedProductFilter(query); return Product.find(query); })()
      .select('title slug thumbnail images stock lowStockThreshold sku')
      .sort({ stock: 1 })
      .limit(5),
  ]);

  const ordersByStatus = {};
  orderStats.forEach((s) => { ordersByStatus[s._id] = { count: s.count, revenue: s.revenue }; });

  res.json({
    success: true,
    data: {
      stats: {
        totalProducts,
        activeProducts,
        totalOrders: orderStats.reduce((sum, s) => sum + s.count, 0),
        revenue: revenueData[0]?.totalRevenue || 0,
        totalPayouts: totalPayouts[0]?.total || 0,
        pendingPayout: pendingPayouts[0]?.total || 0,
        walletBalance: req.vendor.walletBalance,
        pendingPayoutBalance: req.vendor.pendingPayout,
      },
      ordersByStatus,
      recentOrders,
      recentLedger: ledger,
      lowStockProducts,
    },
  });
});

// @desc    Get vendor products
// @route   GET /api/vendor/products
const getProducts = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search, category, isActive, approvalStatus } = req.query;
  const query = { vendor: req.vendor._id };
  if (search) query.title = { $regex: search, $options: 'i' };
  if (isActive !== undefined) query.isActive = isActive === 'true';
  if (category) query.category = category;
  if (approvalStatus && ['pending', 'approved', 'rejected'].includes(approvalStatus)) query.approvalStatus = approvalStatus;

  const [products, total] = await Promise.all([
    Product.find(query).populate('category', 'name').sort({ createdAt: -1 }).skip((Number(page) - 1) * Number(limit)).limit(Number(limit)),
    Product.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: products,
    products,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) },
  });
});

// @desc    Get single vendor product
// @route   GET /api/vendor/products/:id
const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ _id: req.params.id, vendor: req.vendor._id })
    .populate('category', 'name');
  if (!product) { res.status(404); throw new Error('Product not found'); }
  res.json({ success: true, product });
});

// @desc    Create product (vendor scoped)
// @route   POST /api/vendor/products
const createProduct = asyncHandler(async (req, res) => {
  const validated = validateProductPayload(req.body, { forCreate: true });
  const { title, description, shortDescription, price, comparePrice, category, images, thumbnail, sku, barcode, hsnCode, gstRate, costPrice, wholesalePrice, stock, lowStockThreshold, tags, variants, brand, weight, dimensions, shippingClass, productKind, variantType, cro } = validated;
  const duplicate = await Product.exists({ tenant: req.vendor.tenant, title: { $regex: `^${String(title).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
  if (duplicate) throw validationError('A product with this title already exists in this store', 'PRODUCT_TITLE_DUPLICATE');
  const bulkOrder = normalizeBulkOrderPayload(validated, { sellingPrice: price });

  const slug = await createUniqueProductSlug(title);

  const product = await Product.create({
    title, description, shortDescription, price, comparePrice, category, images, thumbnail, sku, barcode, hsnCode, gstRate, costPrice, wholesalePrice, stock, lowStockThreshold, tags, variants, brand, weight, dimensions, shippingClass, productKind, variantType, cro, slug,
    ...bulkOrder,
    ...pendingVendorProductFields(),
    vendor: req.vendor._id,
    tenant: req.vendor.tenant,
    createdBy: req.user._id,
  });

  await Vendor.findByIdAndUpdate(req.vendor._id, { $inc: { 'stats.totalProducts': 1 } });

  res.status(201).json({ success: true, data: product });
});

// @desc    Update product images (vendor scoped)
// @route   POST /api/vendor/products/:id/images
const updateProductImages = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ _id: req.params.id, vendor: req.vendor._id });
  if (!product) { res.status(404); throw new Error('Product not found'); }
  const wasLive = Boolean(product.isActive && isProductApproved(product));
  product.images = req.body.images;
  product.thumbnail = req.body.images?.[0]?.url || product.thumbnail;
  Object.assign(product, pendingVendorProductFields());
  await product.save();
  if (wasLive) await Vendor.findByIdAndUpdate(req.vendor._id, { $inc: { 'stats.activeProducts': -1 } });
  res.json({ success: true, data: product });
});

// @desc    Update product (vendor scoped)
// @route   PUT /api/vendor/products/:id
const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ _id: req.params.id, vendor: req.vendor._id });
  if (!product) { res.status(404); throw new Error('Product not found'); }
  const previousProduct = product.toObject();
  const update = validateProductPayload(prepareProductUpdate({ payload: req.body, currentProduct: product }));
  if (update.title) {
    const duplicate = await Product.exists({
      _id: { $ne: product._id },
      tenant: req.vendor.tenant,
      title: { $regex: `^${String(update.title).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
    });
    if (duplicate) throw validationError('A product with this title already exists in this store', 'PRODUCT_TITLE_DUPLICATE');
  }
  Object.assign(update, normalizeBulkOrderPayload(update, { sellingPrice: update.price ?? product.price }));

  // Never trust a vendor payload with tenant or accounting fields. Product
  // ownership stays attached to req.vendor for the entire lifecycle.
  const editableFields = [
    'title', 'description', 'shortDescription', 'price', 'comparePrice', 'discount',
    'category', 'images', 'thumbnail', 'sku', 'stock', 'lowStockThreshold', 'tags',
    'variants', 'brand', 'barcode', 'hsnCode', 'gstRate', 'costPrice', 'wholesalePrice', 'bulkOrderEnabled', 'bulkOrderTiers', 'productKind', 'variantType', 'weight', 'dimensions', 'shippingClass',
    'isFeatured', 'isFlashDeal', 'flashDealExpiry', 'seo', 'attributes', 'cro',
  ];
  const wasLive = Boolean(product.isActive && isProductApproved(product));
  editableFields.forEach(field => {
    if (Object.prototype.hasOwnProperty.call(update, field)) product[field] = update[field];
  });
  Object.assign(product, pendingVendorProductFields());
  await product.save();

  try {
    await recordManualStockAdjustment({
      productBefore: previousProduct,
      productAfter: product,
      tenant: product.tenant,
      reason: 'vendor_stock_adjustment',
    });
  } catch (error) {
    console.error('Vendor inventory adjustment audit failed:', error.message);
  }

  if (wasLive) await Vendor.findByIdAndUpdate(req.vendor._id, { $inc: { 'stats.activeProducts': -1 } });

  res.json({ success: true, data: product });
});

// @desc    Delete product (vendor scoped)
// @route   DELETE /api/vendor/products/:id
const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findOneAndDelete({ _id: req.params.id, vendor: req.vendor._id });
  if (!product) { res.status(404); throw new Error('Product not found'); }

  await Vendor.findByIdAndUpdate(req.vendor._id, { $inc: { 'stats.totalProducts': -1, 'stats.activeProducts': product.isActive && isProductApproved(product) ? -1 : 0 } });

  res.json({ success: true, message: 'Product deleted' });
});

// @desc    Get vendor orders
// @route   GET /api/vendor/orders
const getOrders = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const match = { 'subOrders.vendor': req.vendor._id };
  const subOrderMatch = { 'subOrders.vendor': req.vendor._id };
  if (status) subOrderMatch['subOrders.status'] = status;

  const pipeline = [
    { $match: match },
    { $unwind: '$subOrders' },
    { $match: subOrderMatch },
    { $sort: { createdAt: -1 } },
    { $skip: (Number(page) - 1) * Number(limit) },
    { $limit: Number(limit) + 1 },
    {
      $project: {
        _id: 1,
        orderNumber: 1,
        user: 1,
        shippingAddress: 1,
        paymentMethod: 1,
        paymentStatus: 1,
        createdAt: 1,
        subOrder: '$subOrders',
      },
    },
  ];

  const [orders, total] = await Promise.all([
    Order.aggregate(pipeline),
    Order.aggregate([
      { $match: match },
      { $unwind: '$subOrders' },
      { $match: status ? { ...subOrderMatch } : match },
      { $count: 'total' },
    ]),
  ]);

  const populatedOrders = await Order.populate(orders, [
    { path: 'user', select: 'name email phone' },
  ]);

  res.json({
    success: true,
    data: populatedOrders,
    pagination: { page: Number(page), limit: Number(limit), total: total[0]?.total || 0, pages: Math.ceil((total[0]?.total || 0) / Number(limit)) },
  });
});

// @desc    Get vendor order detail
// @route   GET /api/vendor/orders/:subOrderNumber
const getOrderDetail = asyncHandler(async (req, res) => {
  const order = await Order.findOne(
    { 'subOrders.orderNumber': req.params.subOrderNumber },
    { 'subOrders.$': 1 }
  ).populate('user', 'name email phone');

  if (!order || !order.subOrders?.length) {
    res.status(404); throw new Error('Order not found');
  }

  const subOrder = order.subOrders[0];
  if (subOrder.vendor.toString() !== req.vendor._id.toString()) {
    res.status(403); throw new Error('Not your order');
  }

  res.json({ success: true, data: { ...order.toObject(), subOrder } });
});

// @desc    Update sub-order status
// @route   PUT /api/vendor/orders/:subOrderNumber/status
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, note } = req.body;
  const validTransitions = ['confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'];
  if (!validTransitions.includes(status)) {
    res.status(400); throw new Error('Invalid status transition');
  }

  const currentOrder = await Order.findOne({ 'subOrders.orderNumber': req.params.subOrderNumber, 'subOrders.vendor': req.vendor._id }).select('subOrders');
  if (!currentOrder) { res.status(404); throw new Error('Order not found'); }
  const currentSubOrder = currentOrder.subOrders.find(item => item.orderNumber === req.params.subOrderNumber && String(item.vendor) === String(req.vendor._id));
  if (!currentSubOrder) { res.status(404); throw new Error('Order not found'); }
  const wasDelivered = currentSubOrder.status === 'delivered';

  const order = await Order.findOneAndUpdate(
    { 'subOrders.orderNumber': req.params.subOrderNumber, 'subOrders.vendor': req.vendor._id },
    {
      $set: { 'subOrders.$.status': status },
      $push: {
        'subOrders.$.statusHistory': {
          status, note: note || '', updatedBy: req.user._id, updatedAt: new Date(),
        },
      },
    },
    { new: true }
  );

  if (!order) { res.status(404); throw new Error('Order not found'); }

  // If delivered, credit vendor wallet
  if (status === 'delivered' && !wasDelivered) {
    const subOrder = order.subOrders.find(s => s.orderNumber === req.params.subOrderNumber);
    if (subOrder) {
      const vendor = await Vendor.findByIdAndUpdate(
        req.vendor._id,
        { $inc: { walletBalance: subOrder.vendorEarnings, 'stats.completedOrders': 1 } },
        { new: true }
      );
      await VendorLedger.create({
        vendor: req.vendor._id,
        type: 'sale_credit',
        amount: subOrder.vendorEarnings,
        balanceAfter: vendor.walletBalance,
        reference: { subOrder: order._id },
        note: `Order #${subOrder.orderNumber} delivered`,
        createdBy: req.user._id,
      });
    }
  }

  res.json({ success: true, message: 'Status updated' });
});

// @desc    Get vendor payouts
// @route   GET /api/vendor/payouts
const getPayouts = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const [payouts, total] = await Promise.all([
    Payout.find({ vendor: req.vendor._id }).sort({ requestedAt: -1 }).skip((Number(page) - 1) * Number(limit)).limit(Number(limit)),
    Payout.countDocuments({ vendor: req.vendor._id }),
  ]);
  res.json({ success: true, data: payouts, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) } });
});

// @desc    Request payout
// @route   POST /api/vendor/payouts/request
const requestPayout = asyncHandler(async (req, res) => {
  const { amount } = req.body;
  const vendor = req.vendor;

  if (!amount || amount <= 0) { res.status(400); throw new Error('Invalid amount'); }
  // Re-verification holds money movement while the catalog keeps selling.
  // Only vendors explicitly flagged (lastRecheckAt set) are held — legacy
  // vendors whose verification was never reviewed keep working as before.
  if (vendor.verification?.status === 'under_review' && vendor.verification?.lastRecheckAt) {
    res.status(403);
    throw new Error('Payouts are on hold while your store is under re-verification');
  }
  // Repeat submissions (double-clicks, retries) with the same key return the
  // original payout instead of locking the wallet twice.
  const idempotencyKey = String(req.headers['idempotency-key'] || req.body?.idempotencyKey || '').slice(0, 120);
  if (idempotencyKey) {
    const existing = await Payout.findOne({ vendor: vendor._id, idempotencyKey });
    if (existing) return res.json({ success: true, data: existing, deduped: true });
  }
  if (amount > vendor.walletBalance) { res.status(400); throw new Error('Insufficient wallet balance'); }
  if (amount < vendor.settings.minPayoutThreshold) { res.status(400).json({ message: `Minimum payout is ₹${vendor.settings.minPayoutThreshold}` }); return; }

  // Re-fetch vendor with bank fields that are select:false on the model.
  // The vendorAuth middleware uses default selection, so accountNumber/ifscCode
  // would otherwise be undefined when snapshotting onto the payout record.
  const vendorWithBank = await Vendor.findById(vendor._id)
    .select('+bankDetails.accountNumber +bankDetails.ifscCode +bankDetails.upiId');

  const payout = await Payout.create({
    tenant: vendor.tenant,
    vendor: vendor._id,
    amount,
    commissionDeducted: 0,
    netAmount: amount,
    status: 'pending',
    idempotencyKey,
    bankSnapshot: {
      accountHolderName: vendor.bankDetails?.accountHolderName || '',
      accountNumber: vendorWithBank.bankDetails?.accountNumber || '',
      ifscCode: vendorWithBank.bankDetails?.ifscCode || '',
      bankName: vendor.bankDetails?.bankName || '',
    },
    periodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    periodEnd: new Date(),
  });

  vendor.pendingPayout = (vendor.pendingPayout || 0) + amount;
  await vendor.save();

  res.status(201).json({ success: true, data: payout });
});

// @desc    Get wallet / ledger
// @route   GET /api/vendor/wallet
const getWallet = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const [ledger, total] = await Promise.all([
    VendorLedger.find({ vendor: req.vendor._id }).sort({ createdAt: -1 }).skip((Number(page) - 1) * Number(limit)).limit(Number(limit)),
    VendorLedger.countDocuments({ vendor: req.vendor._id }),
  ]);
  res.json({
    success: true,
    data: {
      walletBalance: req.vendor.walletBalance,
      pendingPayout: req.vendor.pendingPayout,
      totalEarnings: req.vendor.totalEarnings,
      totalWithdrawn: req.vendor.totalWithdrawn,
      ledger,
    },
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) },
  });
});

// @desc    Update store settings
// @route   PUT /api/vendor/store
const updateStore = asyncHandler(async (req, res) => {
  if (req.body.storefront?.seo && req.vendor?.features?.seo === false) {
    res.status(403);
    throw new Error('SEO access is disabled for this vendor account');
  }
  const vendor = await Vendor.findById(req.vendor._id);
  if (!vendor) { res.status(404); throw new Error('Vendor profile not found'); }
  if (req.body.contactEmail !== undefined && String(req.body.contactEmail).trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(req.body.contactEmail).trim())) {
    res.status(422); throw new Error('Enter a valid contact email');
  }
  if (req.body.contactPhone !== undefined && !/^[6-9]\d{9}$/.test(normalizedPhone(req.body.contactPhone))) {
    res.status(422); throw new Error('Enter a valid 10-digit Indian mobile number');
  }
  if (req.body.address !== undefined) {
    const addressValidation = validateAddress(req.body.address, { required: false });
    if (addressValidation.errors.length) {
      res.status(422); throw new Error(addressValidation.errors[0].message);
    }
    req.body.address = addressValidation.value;
  }
  const topLevelFields = ['logo', 'banner', 'description', 'contactEmail', 'contactPhone', 'address', 'socialLinks'];
  topLevelFields.forEach(field => {
    if (req.body[field] !== undefined) vendor[field] = req.body[field];
  });
  if (req.body.settings && typeof req.body.settings === 'object') {
    vendor.settings = { ...(vendor.settings?.toObject?.() || vendor.settings || {}), ...req.body.settings };
  }
  if (req.body.storefront && typeof req.body.storefront === 'object') {
    const incoming = req.body.storefront;
    const current = vendor.storefront?.toObject?.() || vendor.storefront || {};
    vendor.storefront = {
      ...current,
      tagline: incoming.tagline ?? current.tagline,
      announcement: incoming.announcement ?? current.announcement,
      theme: { ...(current.theme || {}), ...(incoming.theme || {}) },
      policies: { ...(current.policies || {}), ...(incoming.policies || {}) },
      seo: { ...(current.seo || {}), ...(incoming.seo || {}) },
    };
  }
  await vendor.save();
  res.json({ success: true, data: vendor });
});

// @desc    Get store settings
// @route   GET /api/vendor/store
const getStore = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findById(req.vendor._id).populate('owner', 'name email phone');
  res.json({ success: true, data: vendor });
});

// Vendor-owned GST and invoicing profile. It is kept on the vendor record so
// seller settings cannot accidentally bleed across tenant or vendor scopes.
const getTaxProfile = asyncHandler(async (req, res) => {
  res.json({ success: true, profile: req.vendor.taxProfile || {} });
});

const updateTaxProfile = asyncHandler(async (req, res) => {
  const validation = validateTaxProfile(req.body || {});
  if (validation.errors.length) {
    const error = new Error(validation.errors[0].message);
    error.statusCode = 422;
    error.publicCode = 'VENDOR_TAX_PROFILE_INVALID';
    error.details = validation.errors;
    throw error;
  }
  const vendor = await Vendor.findById(req.vendor._id);
  if (!vendor) { res.status(404); throw new Error('Vendor profile not found'); }
  const current = vendor.taxProfile?.toObject?.() || vendor.taxProfile || {};
  const incomingGstin = validation.value.sellerGstin;
  const incomingRegistrationType = validation.value.registrationType;
  const gstWasSubmitted = Object.prototype.hasOwnProperty.call(req.body || {}, 'sellerGstin')
    || Object.prototype.hasOwnProperty.call(req.body || {}, 'registrationType');
  if (gstWasSubmitted && (String(incomingGstin || '') !== String(current.sellerGstin || '')
    || incomingRegistrationType !== (current.registrationType || 'unregistered'))) {
    res.status(403);
    throw new Error('GST is locked after registration. Contact admin through a support ticket to change it.');
  }
  vendor.taxProfile = {
    ...current,
    ...validation.value,
    sellerGstin: current.sellerGstin || validation.value.sellerGstin,
    registrationType: current.registrationType || validation.value.registrationType,
  };
  await vendor.save();
  res.json({ success: true, profile: vendor.taxProfile });
});

// @desc    Sales analytics
// @route   GET /api/vendor/analytics
const getAnalytics = asyncHandler(async (req, res) => {
  const { period = '7d' } = req.query;
  const days = period === '30d' ? 30 : period === '90d' ? 90 : 7;
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const salesData = await Order.aggregate([
    { $match: { 'subOrders.vendor': req.vendor._id, createdAt: { $gte: startDate } } },
    { $unwind: '$subOrders' },
    { $match: { 'subOrders.vendor': req.vendor._id } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        sales: { $sum: '$subOrders.total' },
        earnings: { $sum: '$subOrders.vendorEarnings' },
        orders: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const topProducts = await Order.aggregate([
    { $match: { 'subOrders.vendor': req.vendor._id, createdAt: { $gte: startDate } } },
    { $unwind: '$subOrders' },
    { $match: { 'subOrders.vendor': req.vendor._id } },
    { $unwind: '$subOrders.items' },
    { $group: { _id: '$subOrders.items.product', totalSold: { $sum: '$subOrders.items.quantity' }, revenue: { $sum: { $multiply: ['$subOrders.items.price', '$subOrders.items.quantity'] } } } },
    { $sort: { totalSold: -1 } },
    { $limit: 10 },
  ]);

  const populatedTop = await Product.populate(topProducts, { path: '_id', select: 'title slug images thumbnail' });

  res.json({ success: true, data: { salesData, topProducts: populatedTop } });
});

// @desc    Full money trail: every sale credit, commission debit and payout
// @route   GET /api/vendor/ledger
const getLedger = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, type } = req.query;
  const query = { vendor: req.vendor._id };
  if (type) query.type = type;
  const [entries, total] = await Promise.all([
    VendorLedger.find(query).sort({ createdAt: -1 }).skip((Number(page) - 1) * Number(limit)).limit(Number(limit)),
    VendorLedger.countDocuments(query),
  ]);
  res.json({
    success: true,
    data: {
      walletBalance: req.vendor.walletBalance,
      pendingPayout: req.vendor.pendingPayout,
      entries,
    },
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) },
  });
});

// @desc    Bulk-create catalog products (max 100 rows, per-row error report)
// @route   POST /api/vendor/products/bulk
const bulkCreateProducts = asyncHandler(async (req, res) => {
  const { items = [] } = req.body || {};
  if (!Array.isArray(items) || !items.length || items.length > 100) {
    res.status(422);
    throw new Error('Provide 1 to 100 product rows');
  }
  const created = [];
  const errors = [];
  // eslint-disable-next-line no-restricted-syntax
  for (let index = 0; index < items.length; index += 1) {
    try {
      const validated = validateProductPayload(items[index], { forCreate: true });
      const duplicate = await Product.exists({
        tenant: req.vendor.tenant,
        title: { $regex: `^${String(validated.title).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      });
      if (duplicate) throw validationError(`Row ${index + 1}: a product with this title already exists`, 'PRODUCT_TITLE_DUPLICATE');
      const bulkOrder = normalizeBulkOrderPayload(validated, { sellingPrice: validated.price });
      const slug = await createUniqueProductSlug(validated.title);
      // eslint-disable-next-line no-await-in-loop
      const product = await Product.create({
        ...validated,
        ...bulkOrder,
        ...pendingVendorProductFields(),
        slug,
        vendor: req.vendor._id,
        tenant: req.vendor.tenant,
        createdBy: req.user._id,
      });
      created.push(product);
    } catch (error) {
      errors.push({ index, message: error.message });
    }
  }
  if (created.length) {
    await Vendor.findByIdAndUpdate(req.vendor._id, { $inc: { 'stats.totalProducts': created.length } });
  }
  res.status(201).json({ success: true, data: { created, errors, total: items.length } });
});

module.exports = { getDashboard, getProducts, getProduct, createProduct, updateProduct, updateProductImages, deleteProduct, bulkCreateProducts, getOrders, getOrderDetail, updateOrderStatus, getPayouts, requestPayout, getWallet, getLedger, updateStore, getStore, getTaxProfile, updateTaxProfile, getAnalytics };
