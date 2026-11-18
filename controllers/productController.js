const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Vendor = require('../models/Vendor');
const Review = require('../models/Review');
const { prepareProductUpdate, recordManualStockAdjustment } = require('../services/productInventoryGuard');
const { createUniqueProductSlug } = require('../utils/slugify');
const { parsePagination } = require('../utils/pagination');
const { normalizeBulkOrderPayload } = require('../utils/bulkOrder');
const { validateProductPayload } = require('../utils/adminValidation');
const { addApprovedProductFilter, APPROVAL_STATUSES, isProductApproved } = require('../services/productApprovalService');
const { tenantScope, isGlobalAdmin } = require('../services/adminTenantScope');
const { optionalTenantFilter } = require('../services/publicScope');
const { getDescendantCategoryIds } = require('../services/categoryHierarchyService');

const PRODUCT_LIFECYCLE_STATUSES = new Set(['draft', 'active', 'inactive', 'archived']);
const adminProductScope = req => tenantScope(req);
// Product cards never need the long-form editor/SEO/AI payload. Keeping this
// projection explicit protects catalogue endpoints from growing with future
// product fields and reduces both Mongo hydration and response serialization.
const PUBLIC_PRODUCT_LIST_FIELDS = [
  '_id', 'title', 'slug', 'price', 'comparePrice', 'discount', 'thumbnail',
  'images.url', 'images.alt', 'category', 'brand', 'vendor', 'stock', 'reservedStock',
  'isFeatured', 'isFlashDeal', 'flashDealExpiry', 'variants.name',
  'variants.options.value', 'ratings.average', 'ratings.count', 'tags',
  'preorderEnabled', 'preorderPrice', 'backorderEnabled', 'productKind', 'variantType',
].join(' ');

const productLifecycleError = (message, publicCode = 'PRODUCT_LIFECYCLE_STATUS_INVALID') => {
  const error = new Error(message);
  error.statusCode = 400;
  error.publicCode = publicCode;
  return error;
};

const normalizeLifecyclePayload = (payload = {}, { forCreate = false } = {}) => {
  const update = { ...payload };
  // Ownership and derived inventory fields are controlled by the server.
  delete update.tenant;
  delete update.createdBy;
  delete update.reservedStock;
  delete update.soldStock;
  delete update.totalSales;
  // Approval is a separate admin review action. Never let a normal product
  // create/update payload bypass that workflow.
  delete update.approvalStatus;
  delete update.approvalSubmittedAt;
  delete update.approvalReviewedAt;
  delete update.approvalReviewedBy;
  delete update.approvalNote;
  delete update.rejectionReason;

  const hasLifecycleStatus = Object.prototype.hasOwnProperty.call(update, 'lifecycleStatus');
  const hasActiveFlag = Object.prototype.hasOwnProperty.call(update, 'isActive');
  let lifecycleStatus = hasLifecycleStatus
    ? String(update.lifecycleStatus || '').trim().toLowerCase()
    : hasActiveFlag
      ? (update.isActive ? 'active' : 'inactive')
      : null;

  if (forCreate && !lifecycleStatus) lifecycleStatus = 'active';
  if (lifecycleStatus && !PRODUCT_LIFECYCLE_STATUSES.has(lifecycleStatus)) {
    throw productLifecycleError(`Invalid product lifecycle status: ${lifecycleStatus}`);
  }
  if (lifecycleStatus) {
    update.lifecycleStatus = lifecycleStatus;
    update.isActive = lifecycleStatus === 'active';
  }

  if (Array.isArray(update.variants) && !hasLifecycleStatus && !Object.prototype.hasOwnProperty.call(update, 'variantType')) {
    update.variantType = update.variants.length ? 'variable' : 'simple';
  }
  return update;
};

const assertTenantCategory = async (category, tenantId) => {
  if (!tenantId || !category) return;
  const categoryId = category?._id || category;
  if (!mongoose.isValidObjectId(categoryId) || !(await Category.exists({ _id: categoryId, tenant: tenantId }))) {
    throw productLifecycleError('The selected category does not belong to this store', 'PRODUCT_CATEGORY_NOT_FOUND');
  }
};

const assertUniqueProductTitle = async (title, tenantId, excludeId) => {
  if (!title) return;
  const escaped = String(title).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const query = {
    title: { $regex: `^${escaped}$`, $options: 'i' },
    ...(tenantId ? { tenant: tenantId } : { tenant: { $exists: false } }),
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  };
  if (await Product.exists(query)) throw productLifecycleError('A product with this title already exists in this store', 'PRODUCT_TITLE_DUPLICATE');
};

const createUniqueProductSku = async (sourceSku) => {
  const base = String(sourceSku || '').trim();
  if (!base) return undefined;
  const normalized = base.slice(0, 70);
  let candidate = `${normalized}-COPY`;
  let suffix = 1;
  while (await Product.exists({ sku: candidate })) {
    candidate = `${normalized.slice(0, 64)}-COPY-${suffix}`;
    suffix += 1;
  }
  return candidate;
};

/** Get review count and average per product (approved only). Returns Map of productId string -> { average, count }. */
async function getReviewStatsForProducts(productIds, tenantId = null) {
  if (!productIds?.length) return new Map();
  const ids = productIds.map((id) => (typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id));
  const stats = await Review.aggregate([
    { $match: { product: { $in: ids }, status: 'approved', ...optionalTenantFilter(tenantId) } },
    { $group: { _id: '$product', average: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const map = new Map();
  stats.forEach((s) => {
    map.set(s._id.toString(), {
      average: Math.round(s.average * 10) / 10,
      count: s.count,
    });
  });
  return map;
}

function attachRatingsToProducts(products, reviewStats) {
  return products.map((p) => {
    const po = p.toObject ? p.toObject() : { ...p };
    const id = (po._id || p._id).toString();
    const stats = reviewStats.get(id);
    po.ratings = stats ? { average: stats.average, count: stats.count } : { average: 0, count: 0 };
    return po;
  });
}

// @desc    Get all products
// @route   GET /api/products
const getProducts = asyncHandler(async (req, res) => {
  const { category, brand: brandSlug, vendor: vendorValue, search, minPrice, maxPrice, sort, featured, flashDeal, ids, availability, minRating, size, color, tag } = req.query;
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });

  const query = { isActive: true, ...(req.tenant ? { tenant: req.tenant._id } : {}) };
  const andFilters = [];

  if (category) {
    const categoryIds = await getDescendantCategoryIds(category, req.tenant?._id, { includeInactive: false });
    query.category = categoryIds.length ? { $in: categoryIds } : { $in: [] };
  }
  if (brandSlug) {
    const Brand = require('../models/Brand');
    const brandLookup = mongoose.isValidObjectId(brandSlug)
      ? { _id: brandSlug }
      : { slug: brandSlug };
    const brandDoc = await Brand.findOne({ ...brandLookup, isActive: true, ...(req.tenant ? { tenant: req.tenant._id } : {}) });
    if (brandDoc) {
      query.brand = new RegExp(`^${brandDoc.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    } else {
      // An invalid collection reference must not silently widen the query to
      // every product, especially when the reference came from an AI plan.
      query._id = { $in: [] };
    }
  }
  if (vendorValue) {
    const value = String(vendorValue).trim();
    const vendorLookup = mongoose.isValidObjectId(value) ? { _id: value } : { slug: value };
    // A vendor filter is only meaningful inside a resolved tenant. Never
    // allow an unknown-host request to discover another tenant's products.
    const vendorDoc = req.tenant?._id
      ? await Vendor.findOne({ ...vendorLookup, tenant: req.tenant._id, status: 'active' }).select('_id').lean()
      : null;
    query.vendor = vendorDoc?._id || { $in: [] };
  }
  if (featured === 'true') query.isFeatured = true;
  if (ids) {
    const list = String(ids).split(',').map(s => s.trim()).filter(Boolean).slice(0, 100);
    if (list.length) query._id = { $in: list };
  }
  if (flashDeal === 'true') { query.isFlashDeal = true; query.flashDealExpiry = { $gt: new Date() }; }

  if (search) {
    const escaped = String(search).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    andFilters.push({ $or: [
      { title: regex },
      { description: regex },
      { tags: regex },
      { brand: regex },
    ] });
  }

  const availabilityValues = ['in_stock', 'out_of_stock', 'preorder', 'backorder'];
  if (availability) {
    if (!availabilityValues.includes(String(availability))) {
      res.status(400);
      throw new Error('Invalid availability filter');
    }
    if (availability === 'in_stock' || availability === 'out_of_stock') {
      const availableExpression = { $subtract: [{ $ifNull: ['$stock', 0] }, { $ifNull: ['$reservedStock', 0] }] };
      query.$expr = availability === 'in_stock' ? { $gt: [availableExpression, 0] } : { $lte: [availableExpression, 0] };
    } else if (availability === 'preorder') query.preorderEnabled = true;
    else if (availability === 'backorder') query.backorderEnabled = true;
  }

  if (size) {
    const escaped = String(size).slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    query.variants = { $elemMatch: { name: /size/i, 'options.value': regex } };
  }
  if (color) {
    const escaped = String(color).slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    andFilters.push({ $or: [
      { 'attributes.color': regex },
      { variants: { $elemMatch: { name: /color/i, 'options.value': regex } } },
    ] });
  }
  if (tag) {
    const escaped = String(tag).slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.tags = new RegExp(escaped, 'i');
  }
  if (minRating !== undefined && minRating !== '') {
    const rating = Number(minRating);
    if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
      res.status(400);
      throw new Error('Invalid minimum rating');
    }
    const ratingStats = await Review.aggregate([
      { $match: { status: 'approved', ...optionalTenantFilter(req.tenant) } },
      { $group: { _id: '$product', average: { $avg: '$rating' } } },
      { $match: { average: { $gte: rating } } },
    ]);
    andFilters.push({ $or: [
      { 'ratings.average': { $gte: rating } },
      { _id: { $in: ratingStats.map(item => item._id) } },
    ] });
  }

  if (andFilters.length) query.$and = andFilters;
  addApprovedProductFilter(query);

  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice) {
      const value = Number(minPrice);
      if (!Number.isFinite(value) || value < 0) { res.status(400); throw new Error('Invalid minimum price'); }
      query.price.$gte = value;
    }
    if (maxPrice) {
      const value = Number(maxPrice);
      if (!Number.isFinite(value) || value < 0) { res.status(400); throw new Error('Invalid maximum price'); }
      query.price.$lte = value;
    }
  }

  const sortOptions = {
    newest: { createdAt: -1 },
    popular: { 'ratings.average': -1, totalSales: -1 },
    price_asc: { price: 1 },
    price_desc: { price: -1 },
    bestseller: { totalSales: -1 },
  };
  const sortBy = sortOptions[sort] || { createdAt: -1 };

  // Count and page reads are independent. Run them together and use lean
  // documents because public catalogue responses are read-only snapshots.
  const [total, products] = await Promise.all([
    Product.countDocuments(query),
    Product.find(query)
      .populate('category', 'name slug')
      .sort(sortBy)
      .skip(skip)
      .limit(limit)
      .select(PUBLIC_PRODUCT_LIST_FIELDS)
      .lean(),
  ]);

  const reviewStats = await getReviewStatsForProducts(products.map((p) => p._id), req.tenant?._id);
  const productsWithRatings = attachRatingsToProducts(products, reviewStats);

  res.json({
    success: true,
    products: productsWithRatings,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// @desc    List active vendors represented in the current public catalogue
// @route   GET /api/products/vendors
const getProductVendors = asyncHandler(async (req, res) => {
  if (!req.tenant?._id) return res.json({ success: true, vendors: [] });

  const productQuery = {
    tenant: req.tenant._id,
    isActive: true,
    vendor: { $exists: true, $ne: null },
  };
  addApprovedProductFilter(productQuery);
  const vendorIds = await Product.distinct('vendor', productQuery);
  const vendors = await Vendor.find({
    _id: { $in: vendorIds },
    tenant: req.tenant._id,
    status: 'active',
  })
    .select('_id storeName slug logo')
    .sort({ storeName: 1 })
    .lean();

  res.json({ success: true, vendors });
});

// @desc    Return safe, tenant-scoped product suggestions for autocomplete
// @route   GET /api/products/suggestions
const getProductSuggestions = asyncHandler(async (req, res) => {
  const search = String(req.query.search || req.query.q || '').trim().slice(0, 100);
  if (search.length < 2) return res.json({ success: true, suggestions: [] });
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'i');
  const suggestionQuery = {
    isActive: true,
    ...(req.tenant ? { tenant: req.tenant._id } : {}),
    $or: [{ title: regex }, { brand: regex }, { tags: regex }, { sku: regex }],
  };
  addApprovedProductFilter(suggestionQuery);
  const products = await Product.find(suggestionQuery)
    .sort({ isFeatured: -1, totalSales: -1, createdAt: -1 })
    .limit(Math.min(10, Math.max(1, Number(req.query.limit) || 6)))
    .select('_id title slug thumbnail price comparePrice brand')
    .lean();
  res.json({ success: true, suggestions: products });
});

// @desc    Get single product
// @route   GET /api/products/:slug
const getProduct = asyncHandler(async (req, res) => {
  const productQuery = { slug: req.params.slug, isActive: true, ...(req.tenant ? { tenant: req.tenant._id } : {}) };
  addApprovedProductFilter(productQuery);
  const product = await Product.findOne(productQuery)
    .populate('category', 'name slug')
    .populate('createdBy', 'name')
    .lean();

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  // View analytics must not sit on the product-detail critical path. The
  // product snapshot is already authoritative; the counter is best-effort.
  Product.updateOne({ _id: product._id }, { $inc: { views: 1 } }).catch(() => {});

  const reviewStats = await getReviewStatsForProducts([product._id], req.tenant?._id);
  const stats = reviewStats.get(product._id.toString());
  const productObj = { ...product };
  productObj.ratings = stats ? { average: stats.average, count: stats.count } : { average: 0, count: 0 };

  res.json({ success: true, product: productObj });
});

// @desc    Create product
// @route   POST /api/admin/products
const createProduct = asyncHandler(async (req, res) => {
  const validatedPayload = validateProductPayload(req.body, { forCreate: true });
  const { title, description, price, category, stock, slug: _requestedRootSlug, ...rest } = validatedPayload;
  await assertUniqueProductTitle(title, req.tenant?._id);
  await assertTenantCategory(category, req.tenant?._id);
  const normalizedRest = normalizeLifecyclePayload(rest, { forCreate: true });
  Object.assign(normalizedRest, normalizeBulkOrderPayload(validatedPayload, { sellingPrice: price }));
  if (Array.isArray(normalizedRest.variants)) {
    normalizedRest.variants = normalizedRest.variants.map(variant => ({
      ...variant,
      options: (variant.options || []).map(option => {
        const { reservedStock: _reservedStock, soldStock: _soldStock, ...safeOption } = option;
        return safeOption;
      }),
    }));
  }

  const requestedSlug = req.body.slug || req.body.seo?.slug || title;
  const slug = await createUniqueProductSlug(requestedSlug);
  const product = await Product.create({
    title, description, price, category, stock, slug,
    ...normalizedRest,
    tenant: req.tenant?._id,
    createdBy: req.user._id,
  });
  if (req.tenant) require('../services/search/reindexService').enqueueProductReindex({ tenant: req.tenant._id, productId: product._id }).catch(() => {});

  // Auto-generate SEO if empty (fire-and-forget)
  if (!product.seo?.metaTitle) {
    const { autoGenerateSeo } = require('../utils/autoSeoGenerator');
    autoGenerateSeo(Product, product._id, { title, description, category: product.category?.name || '' }).catch(() => {});
  }

  res.status(201).json({ success: true, product });
});

// @desc    Update product
// @route   PUT /api/admin/products/:id
const updateProduct = asyncHandler(async (req, res) => {
  let product = await Product.findOne({ _id: req.params.id, ...adminProductScope(req) });
  if (!product) { res.status(404); throw new Error('Product not found'); }

  const previousStock = product.stock;
  const previousProduct = product.toObject();
  const preparedUpdate = prepareProductUpdate({ payload: req.body, currentProduct: product });
  const update = validateProductPayload(normalizeLifecyclePayload(preparedUpdate));
  const productTenant = product.tenant || req.tenant?._id;
  if (update.title) await assertUniqueProductTitle(update.title, productTenant, product._id);
  Object.assign(update, normalizeBulkOrderPayload(update, { sellingPrice: update.price ?? product.price }));
  if (Object.prototype.hasOwnProperty.call(update, 'category')) {
    await assertTenantCategory(update.category, productTenant);
  }

  const requestedSlug = update.slug || update.seo?.slug;
  if (requestedSlug && requestedSlug !== product.slug) {
    update.slug = await createUniqueProductSlug(requestedSlug, product._id);
  } else if (update.title && update.title !== product.title) {
    update.slug = await createUniqueProductSlug(update.title, product._id);
  }

  product = await Product.findOneAndUpdate({ _id: req.params.id, ...adminProductScope(req) }, { ...update, ...(productTenant ? { tenant: productTenant } : {}) }, { new: true, runValidators: true })
    .populate('category', 'name slug');
  if (!product) { res.status(404); throw new Error('Product not found'); }

  try {
    await recordManualStockAdjustment({
      productBefore: previousProduct,
      productAfter: product,
      tenant: productTenant,
    });
  } catch (error) {
    // Inventory counters remain authoritative even if an audit write is
    // temporarily unavailable; observability can surface the missed entry.
    console.error('Inventory adjustment audit failed:', error.message);
  }

  // Trigger stock alerts if stock went from 0 to >0
  if (previousStock <= 0 && product.stock > 0) {
    const { triggerStockAlerts } = require('./stockAlertController');
    triggerStockAlerts(product._id).catch(err => console.error('Stock alert trigger error:', err.message));
  }
  if (Number(previousProduct.price) > Number(product.price)) {
    const { triggerPriceDropAlerts } = require('./priceDropAlertController');
    triggerPriceDropAlerts(product._id, {
      tenantId: product.tenant || productTenant,
      previousPrice: Number(previousProduct.price),
      currentPrice: Number(product.price),
    }).catch(err => console.error('Price-drop alert trigger error:', err.message));
  }
  if (productTenant) require('../services/search/reindexService').enqueueProductReindex({ tenant: productTenant, productId: product._id }).catch(() => {});

  // Auto-generate SEO if empty (fire-and-forget)
  if (!product.seo?.metaTitle) {
    const { autoGenerateSeo } = require('../utils/autoSeoGenerator');
    autoGenerateSeo(Product, product._id, { title: product.title, description: product.description, category: product.category?.name || '' }).catch(() => {});
  }

  res.json({ success: true, product });
});

// @desc    Delete product
// @route   DELETE /api/admin/products/:id
const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ _id: req.params.id, ...adminProductScope(req) });
  if (!product) { res.status(404); throw new Error('Product not found'); }
  await product.deleteOne();
  if (product.tenant) require('../services/search/reindexService').enqueueProductReindex({ tenant: product.tenant, productId: product._id, action: 'delete' }).catch(() => {});
  res.json({ success: true, message: 'Product deleted' });
});

// @desc    Duplicate a product as an isolated draft
// @route   POST /api/admin/products/:id/duplicate
const duplicateProduct = asyncHandler(async (req, res) => {
  const source = await Product.findOne({
    _id: req.params.id,
    ...adminProductScope(req),
  }).lean();
  if (!source) {
    res.status(404);
    throw new Error('Product not found');
  }

  const clone = JSON.parse(JSON.stringify(source));
  delete clone._id;
  delete clone.__v;
  delete clone.createdAt;
  delete clone.updatedAt;
  clone.title = `${source.title} Copy`;
  clone.slug = await createUniqueProductSlug(clone.title);
  clone.sku = await createUniqueProductSku(source.sku);
  clone.barcode = '';
  clone.lifecycleStatus = 'draft';
  clone.isActive = false;
  clone.stock = 0;
  clone.reservedStock = 0;
  clone.soldStock = 0;
  clone.incomingStock = 0;
  clone.totalSales = 0;
  clone.views = 0;
  clone.ratings = { average: 0, count: 0 };
  clone.variants = (clone.variants || []).map(variant => ({
    ...variant,
    options: (variant.options || []).map(option => ({
      ...option,
      stock: 0,
      reservedStock: 0,
      soldStock: 0,
    })),
  }));
  clone.createdBy = req.user?._id;
  if (req.tenant) clone.tenant = req.tenant._id;

  const product = await Product.create(clone);
  if (req.tenant) require('../services/search/reindexService').enqueueProductReindex({ tenant: req.tenant._id, productId: product._id }).catch(() => {});
  res.status(201).json({ success: true, product, sourceProduct: source._id });
});

// @desc    Get featured products
// @route   GET /api/products/featured
const getFeaturedProducts = asyncHandler(async (req, res) => {
  const featuredQuery = { isFeatured: true, isActive: true, ...(req.tenant ? { tenant: req.tenant._id } : {}) };
  addApprovedProductFilter(featuredQuery);
  const products = await Product.find(featuredQuery)
    .populate('category', 'name slug')
    .select(PUBLIC_PRODUCT_LIST_FIELDS)
    .limit(12)
    .lean();

  const reviewStats = await getReviewStatsForProducts(products.map((p) => p._id), req.tenant?._id);
  const productsWithRatings = attachRatingsToProducts(products, reviewStats);
  res.json({ success: true, products: productsWithRatings });
});

// @desc    Get flash deals
// @route   GET /api/products/flash-deals
const getFlashDeals = asyncHandler(async (req, res) => {
  const flashQuery = {
    isFlashDeal: true,
    isActive: true,
    ...(req.tenant ? { tenant: req.tenant._id } : {}),
    flashDealExpiry: { $gt: new Date() },
  };
  addApprovedProductFilter(flashQuery);
  const products = await Product.find(flashQuery).populate('category', 'name slug').select(PUBLIC_PRODUCT_LIST_FIELDS).limit(8).lean();

  const reviewStats = await getReviewStatsForProducts(products.map((p) => p._id), req.tenant?._id);
  const productsWithRatings = attachRatingsToProducts(products, reviewStats);
  res.json({ success: true, products: productsWithRatings });
});

// @desc    Update product images
// @route   POST /api/admin/products/:id/images
const updateProductImages = asyncHandler(async (req, res) => {
  const { images } = req.body;
  if (!Array.isArray(images) || images.length > 20 || images.some(image => !image || typeof image.url !== 'string')) {
    res.status(400);
    throw new Error('images must be an array of up to 20 uploaded assets');
  }
  const product = await Product.findByIdAndUpdate(
    { _id: req.params.id, ...adminProductScope(req) },
    { images, thumbnail: images[0]?.url },
    { new: true, runValidators: true }
  );
  if (!product) { res.status(404); throw new Error('Product not found'); }
  res.json({ success: true, product });
});

// @desc    Get single product by ID (admin)
// @route   GET /api/admin/products/:id
const getAdminProduct = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ _id: req.params.id, ...adminProductScope(req) }).populate('category', 'name slug');
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }
  res.json({ success: true, product });
});

// @desc    List vendors represented in the admin catalogue
// @route   GET /api/admin/products/vendors
const getAdminProductVendors = asyncHandler(async (req, res) => {
  const productScope = adminProductScope(req);
  const vendorIds = await Product.distinct('vendor', {
    ...productScope,
    vendor: { $exists: true, $ne: null },
  });
  const vendorQuery = { _id: { $in: vendorIds } };
  if (isGlobalAdmin(req)) vendorQuery.tenant = { $in: req.adminTenantIds };
  else if (req.tenant?._id) vendorQuery.tenant = req.tenant._id;

  const vendors = await Vendor.find(vendorQuery)
    .select('_id storeName slug logo status tenant')
    .sort({ storeName: 1 })
    .lean();

  const platformProduct = await Product.exists({
    ...productScope,
    $or: [{ vendor: { $exists: false } }, { vendor: null }],
  });

  res.json({ success: true, vendors, hasPlatformProducts: Boolean(platformProduct) });
});

// @desc    Get admin products (all, including inactive)
// @route   GET /api/admin/products
const getAdminProducts = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const { search, category, status, vendor } = req.query;
  const query = adminProductScope(req);
  if (search) {
    const escaped = String(search).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [{ title: { $regex: escaped, $options: 'i' } }, { sku: { $regex: escaped, $options: 'i' } }];
  }
  if (category) query.category = category;
  if (vendor) {
    if (vendor === 'platform') query.vendor = null;
    else if (mongoose.isValidObjectId(vendor)) query.vendor = vendor;
    else query.vendor = { $in: [] };
  }
  if (status === 'active') {
    query.$and = [{ $or: [{ lifecycleStatus: 'active' }, { lifecycleStatus: { $exists: false }, isActive: true }] }];
  }
  if (status === 'inactive') {
    query.$and = [{ $or: [{ lifecycleStatus: 'inactive' }, { lifecycleStatus: { $exists: false }, isActive: false }] }];
  }
  if (status === 'draft' || status === 'archived') query.lifecycleStatus = status;
  if (status === 'pending_approval') query.approvalStatus = 'pending';
  if (status && !['active', 'inactive', 'draft', 'archived', 'pending_approval', 'low_stock', 'out_of_stock'].includes(status)) {
    res.status(400);
    throw productLifecycleError(`Invalid product status filter: ${status}`, 'PRODUCT_STATUS_FILTER_INVALID');
  }
  if (status === 'low_stock') query.$expr = { $lte: ['$stock', '$lowStockThreshold'] };
  if (status === 'out_of_stock') query.stock = 0;

  const [total, products] = await Promise.all([
    Product.countDocuments(query),
    Product.find(query)
      .populate('category', 'name')
      .populate('vendor', 'storeName slug logo status')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  res.json({ success: true, products, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

// @desc    Approve or reject a vendor product
// @route   PUT /api/admin/products/:id/approval
const reviewProduct = asyncHandler(async (req, res) => {
  const status = String(req.body?.status || '').trim().toLowerCase();
  if (!APPROVAL_STATUSES.has(status)) {
    res.status(400);
    throw productLifecycleError('Approval status must be pending, approved or rejected', 'PRODUCT_APPROVAL_STATUS_INVALID');
  }
  const product = await Product.findOne({ _id: req.params.id, ...adminProductScope(req) });
  if (!product) { res.status(404); throw new Error('Product not found'); }
  if (!product.vendor) {
    res.status(400);
    throw productLifecycleError('Only vendor products require approval', 'PRODUCT_APPROVAL_NOT_REQUIRED');
  }
  const wasLive = Boolean(product.isActive && (product.approvalStatus === 'approved' || !product.approvalStatus));
  const now = new Date();
  product.approvalStatus = status;
  product.approvalReviewedAt = status === 'pending' ? null : now;
  product.approvalReviewedBy = status === 'pending' ? null : req.user?._id;
  product.approvalNote = String(req.body?.note || '').trim().slice(0, 500);
  product.rejectionReason = status === 'rejected' ? product.approvalNote : '';
  product.isActive = status === 'approved';
  product.lifecycleStatus = status === 'approved' ? 'active' : status === 'rejected' ? 'inactive' : 'draft';
  if (status === 'pending' && !product.approvalSubmittedAt) product.approvalSubmittedAt = now;
  await product.save();

  const isLive = Boolean(product.isActive && product.approvalStatus === 'approved');
  if (wasLive !== isLive) {
    const Vendor = require('../models/Vendor');
    await Vendor.findByIdAndUpdate(product.vendor, { $inc: { 'stats.activeProducts': isLive ? 1 : -1 } });
  }
  res.json({ success: true, product, message: status === 'approved' ? 'Product approved and published' : status === 'rejected' ? 'Product rejected' : 'Product moved back to pending approval' });
});

module.exports = { getProducts, getProductVendors, getProductSuggestions, getProduct, createProduct, updateProduct, deleteProduct, duplicateProduct, getFeaturedProducts, getFlashDeals, updateProductImages, getAdminProducts, getAdminProductVendors, getAdminProduct, reviewProduct };
