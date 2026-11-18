const asyncHandler = require('express-async-handler');
const Bundle = require('../models/Bundle');
const Order = require('../models/Order');
const ClickEvent = require('../models/ClickEvent');
const {
  assertComponentProducts,
  assertRewardProduct,
  bundleError,
  normalizeComponents,
  normalizeSelectionRules,
  normalizeSelectionGroups,
  OFFER_TYPES,
  isBundleCurrentlyAvailable,
  publicBundle,
  quoteBundle,
  uniqueSlug,
} = require('../services/bundleService');

const scope = req => (req.tenant?._id ? { tenant: req.tenant._id } : {});

const listBundles = asyncHandler(async (req, res) => {
  const query = { ...scope(req), isActive: true, lifecycleStatus: 'active' };
  if (req.query.category) query.category = req.query.category;
  const bundles = await Bundle.find(query)
    .populate('category', 'name slug')
    .populate('components.product', 'title slug thumbnail images price comparePrice stock variants sku')
    .sort({ createdAt: -1 })
    .limit(Math.min(100, Number(req.query.limit) || 24))
    .lean();
  res.json({ success: true, bundles: bundles.filter(bundle => isBundleCurrentlyAvailable(bundle).available).map(publicBundle) });
});

const getBundle = asyncHandler(async (req, res) => {
  const bundle = await Bundle.findOne({ slug: req.params.slug, ...scope(req), isActive: true, lifecycleStatus: 'active' })
    .populate('category', 'name slug')
    .populate('components.product', 'title slug thumbnail images price comparePrice stock variants sku costPrice gstRate weight hsnCode isActive lifecycleStatus')
    .populate('freeReward.product', 'title slug thumbnail images price comparePrice stock variants sku costPrice gstRate weight hsnCode isActive lifecycleStatus')
    .lean();
  if (!bundle) { res.status(404); throw new Error('Bundle not found'); }
  const timing = isBundleCurrentlyAvailable(bundle);
  if (!timing.available) { res.status(404); throw new Error('Bundle not found'); }
  res.json({ success: true, bundle: publicBundle(bundle) });
});

const listAdminBundles = asyncHandler(async (req, res) => {
  const query = { ...scope(req) };
  if (req.query.status) query.lifecycleStatus = req.query.status;
  if (req.query.type) query.offerType = String(req.query.type);
  if (req.query.search) {
    const safeSearch = String(req.query.search).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [{ name: { $regex: safeSearch, $options: 'i' } }, { sku: { $regex: safeSearch, $options: 'i' } }, { internalName: { $regex: safeSearch, $options: 'i' } }];
  }
  const allowedSorts = new Set(['createdAt', 'name', 'price', 'lifecycleStatus', 'version']);
  const sortField = allowedSorts.has(req.query.sort) ? req.query.sort : 'createdAt';
  const direction = req.query.direction === 'asc' ? 1 : -1;
  const bundles = await Bundle.find(query).populate('category', 'name').populate('components.product', 'title sku price comparePrice stock thumbnail').populate('freeReward.product', 'title sku price stock').sort({ [sortField]: direction }).limit(Math.min(200, Number(req.query.limit) || 100)).lean();
  res.json({ success: true, bundles });
});

const getAdminBundle = asyncHandler(async (req, res) => {
  const bundle = await Bundle.findOne({ _id: req.params.id, ...scope(req) }).populate('components.product', 'title sku price stock variants').populate('freeReward.product', 'title sku price stock variants').lean();
  if (!bundle) { res.status(404); throw new Error('Bundle not found'); }
  res.json({ success: true, bundle });
});

const saveBundle = async ({ req, existing }) => {
  const body = req.body || {};
  const components = normalizeComponents(body.components);
  await assertComponentProducts({ tenant: req.tenant?._id, components });
  const offerType = OFFER_TYPES.includes(body.offerType)
    ? body.offerType
    : body.bundleType === 'custom'
      ? 'custom_bundle'
      : body.bundleType === 'mix_match'
        ? 'mix_match'
        : 'fixed_combo';
  const selectionRules = normalizeSelectionRules(body.selectionRules, offerType);
  const selectionGroups = normalizeSelectionGroups(body.selectionGroups);
  if (['custom_bundle', 'custom_box', 'mix_match'].includes(offerType) && selectionRules.minProducts > components.length) {
    throw bundleError('Minimum selectable products cannot exceed the eligible product pool', 400, 'BUNDLE_SELECTION_RULES_INVALID');
  }
  const rewardInput = body.freeReward || (body.rewardProduct ? { product: body.rewardProduct, quantity: body.rewardQuantity, variant: body.rewardVariant } : null);
  let freeReward = { quantity: 1, variant: {} };
  if (offerType === 'buy_x_get_y_free') {
    if (components.some(component => String(component.product) === String(rewardInput?.product))) {
      throw bundleError('The free reward must be different from the required products', 400, 'BUNDLE_REWARD_DUPLICATE');
    }
    const reward = await assertRewardProduct({ tenant: req.tenant?._id, reward: rewardInput });
    freeReward = { product: reward.product._id, quantity: reward.quantity, variant: reward.variant };
  }
  const price = Number(body.price);
  if (!Number.isFinite(price) || price < 0) throw bundleError('Bundle price is required and must be non-negative', 400, 'BUNDLE_PRICE_INVALID');
  const target = existing || new Bundle({ tenant: req.tenant?._id, createdBy: req.user?._id });
  target.name = String(body.name || '').trim();
  if (!target.name) throw bundleError('Bundle name is required');
  target.internalName = String(body.internalName || target.internalName || '').trim().slice(0, 120);
  target.slug = await uniqueSlug(req.tenant?._id, body.slug || target.name, target._id);
  target.sku = String(body.sku || '').trim().toUpperCase();
  if (!target.sku) throw bundleError('Bundle SKU is required');
  target.bundleType = ['custom_bundle'].includes(offerType) ? 'custom'
    : offerType === 'mix_match' ? 'mix_match'
      : offerType === 'multipack' ? 'multipack'
        : offerType === 'custom_box' ? 'box'
          : offerType === 'quantity_bundle' ? 'quantity'
            : offerType === 'buy_x_get_y_free' ? 'promotion'
              : 'fixed';
  target.offerType = offerType;
  target.description = String(body.description || '');
  target.shortDescription = String(body.shortDescription || '');
  target.components = components;
  target.selectionGroups = selectionGroups;
  target.price = price;
  const comparePrice = body.comparePrice === '' || body.comparePrice === null || body.comparePrice === undefined ? 0 : Number(body.comparePrice);
  if (!Number.isFinite(comparePrice) || comparePrice < 0) throw bundleError('Bundle compare price is invalid', 400, 'BUNDLE_COMPARE_PRICE_INVALID');
  target.comparePrice = comparePrice;
  target.discountType = ['none', 'percentage', 'fixed'].includes(body.discountType) ? body.discountType : 'none';
  const discountValue = body.discountValue === '' || body.discountValue === null || body.discountValue === undefined ? 0 : Number(body.discountValue);
  if (!Number.isFinite(discountValue) || discountValue < 0) throw bundleError('Bundle discount value is invalid', 400, 'BUNDLE_DISCOUNT_INVALID');
  target.discountValue = discountValue;
  target.pricingType = ['fixed', 'percentage', 'fixed_discount', 'dynamic', 'fixed_box', 'tiered'].includes(body.pricingType)
    ? body.pricingType
    : target.discountType === 'percentage' ? 'percentage' : target.discountType === 'fixed' ? 'fixed_discount' : 'fixed';
  target.selectionRules = selectionRules;
  target.freeReward = freeReward;
  const costPrice = body.costPrice === '' || body.costPrice === null || body.costPrice === undefined ? 0 : Number(body.costPrice);
  if (!Number.isFinite(costPrice) || costPrice < 0) throw bundleError('Bundle cost price is invalid', 400, 'BUNDLE_COST_PRICE_INVALID');
  target.costPrice = costPrice;
  target.barcode = String(body.barcode || '');
  target.hsnCode = String(body.hsnCode || '');
  const gstRate = body.gstRate === '' || body.gstRate === null || body.gstRate === undefined ? null : Number(body.gstRate);
  if (gstRate !== null && (!Number.isFinite(gstRate) || gstRate < 0 || gstRate > 100)) throw bundleError('Bundle tax rate is invalid', 400, 'BUNDLE_TAX_INVALID');
  target.gstRate = gstRate;
  target.image = String(body.image || '');
  target.gallery = Array.isArray(body.gallery) ? body.gallery.slice(0, 20) : [];
  target.tags = Array.isArray(body.tags) ? body.tags.map(tag => String(tag).trim()).filter(Boolean).slice(0, 50) : [];
  if (Object.prototype.hasOwnProperty.call(body, 'category')) target.category = body.category || undefined;
  if (Object.prototype.hasOwnProperty.call(body, 'vendor')) target.vendor = body.vendor || undefined;
  target.availability = { ...(target.availability?.toObject?.() || target.availability || {}), ...(body.availability || {}) };
  target.label = String(body.label || target.label || 'Bundle').trim().slice(0, 40);
  target.badges = Array.isArray(body.badges) ? body.badges.map(value => String(value).trim()).filter(Boolean).slice(0, 10) : (target.badges || []);
  target.displaySettings = body.displaySettings && typeof body.displaySettings === 'object' ? body.displaySettings : target.displaySettings;
  target.channels = Array.isArray(body.channels) ? body.channels.filter(value => ['website', 'mobile_app', 'pos', 'b2b', 'marketplace', 'social_commerce'].includes(value)) : (target.channels?.length ? target.channels : ['website']);
  target.customerEligibility = body.customerEligibility && typeof body.customerEligibility === 'object' ? body.customerEligibility : (target.customerEligibility || {});
  target.returnPolicy = ['entire_bundle', 'partial_components'].includes(body.returnPolicy) ? body.returnPolicy : (target.returnPolicy || 'entire_bundle');
  target.discountCombination = body.discountCombination && typeof body.discountCombination === 'object' ? body.discountCombination : (target.discountCombination || {});
  target.fulfillmentStrategy = body.fulfillmentStrategy === 'split_allowed' ? 'split_allowed' : (target.fulfillmentStrategy || 'same_warehouse');
  target.lifecycleStatus = ['draft', 'active', 'inactive', 'archived'].includes(body.lifecycleStatus) ? body.lifecycleStatus : 'draft';
  target.isActive = target.lifecycleStatus === 'active';
  target.seo = body.seo && typeof body.seo === 'object' ? body.seo : target.seo;
  if (existing) target.version = Number(existing.version || 1) + 1;
  await target.save();
  return target;
};

const createBundle = asyncHandler(async (req, res) => {
  const bundle = await saveBundle({ req });
  res.status(201).json({ success: true, bundle });
});

const updateBundle = asyncHandler(async (req, res) => {
  const bundle = await Bundle.findOne({ _id: req.params.id, ...scope(req) });
  if (!bundle) { res.status(404); throw new Error('Bundle not found'); }
  const updated = await saveBundle({ req, existing: bundle });
  res.json({ success: true, bundle: updated });
});

const deleteBundle = asyncHandler(async (req, res) => {
  const result = await Bundle.findOneAndUpdate({ _id: req.params.id, ...scope(req) }, { $set: { lifecycleStatus: 'archived', isActive: false } }, { new: true });
  if (!result) { res.status(404); throw new Error('Bundle not found'); }
  res.json({ success: true, bundle: result });
});

const quoteAdminBundle = asyncHandler(async (req, res) => {
  const quote = await quoteBundle({ tenantId: req.tenant?._id, bundleId: req.params.id, quantity: req.body?.quantity || 1, selections: req.body?.selections, requireActive: false });
  res.json({ success: true, quote });
});

const quotePublicBundle = asyncHandler(async (req, res) => {
  const quote = await quoteBundle({
    tenantId: req.tenant?._id,
    bundleId: req.params.id,
    quantity: req.body?.quantity || 1,
    selections: req.body?.selections,
    requireActive: true,
    enforceStock: true,
  });
  res.json({ success: true, quote });
});

const duplicateBundle = asyncHandler(async (req, res) => {
  const source = await Bundle.findOne({ _id: req.params.id, ...scope(req) }).lean();
  if (!source) { res.status(404); throw new Error('Bundle not found'); }
  const copy = { ...source };
  delete copy._id;
  delete copy.createdAt;
  delete copy.updatedAt;
  delete copy.__v;
  copy.name = `${source.name} Copy`;
  copy.slug = await uniqueSlug(req.tenant?._id, `${source.slug}-copy`);
  copy.sku = await uniqueSku(req.tenant?._id, `${source.sku}-COPY`);
  copy.lifecycleStatus = 'draft';
  copy.isActive = false;
  copy.version = 1;
  copy.stats = { views: 0, addToCart: 0, unitsSold: 0, revenue: 0, discount: 0 };
  copy.createdBy = req.user?._id;
  const duplicate = await Bundle.create(copy);
  res.status(201).json({ success: true, bundle: duplicate });
});

const publishBundle = asyncHandler(async (req, res) => {
  const bundle = await Bundle.findOne({ _id: req.params.id, ...scope(req) });
  if (!bundle) { res.status(404); throw new Error('Bundle not found'); }
  await assertComponentProducts({ tenant: req.tenant?._id, components: normalizeComponents(bundle.components) });
  const timing = isBundleCurrentlyAvailable(bundle);
  if (!timing.available && timing.code !== 'BUNDLE_NOT_STARTED') throw bundleError(timing.message, 409, timing.code);
  bundle.lifecycleStatus = 'active';
  bundle.isActive = true;
  bundle.version = Number(bundle.version || 1) + 1;
  await bundle.save();
  res.json({ success: true, bundle });
});

const archiveBundle = asyncHandler(async (req, res) => {
  const bundle = await Bundle.findOneAndUpdate({ _id: req.params.id, ...scope(req) }, { $set: { lifecycleStatus: 'archived', isActive: false }, $inc: { version: 1 } }, { new: true });
  if (!bundle) { res.status(404); throw new Error('Bundle not found'); }
  res.json({ success: true, bundle });
});

const getBundleAnalytics = asyncHandler(async (req, res) => {
  const bundle = await Bundle.findOne({ _id: req.params.id, ...scope(req) }).select('_id name stats components').lean();
  if (!bundle) { res.status(404); throw new Error('Bundle not found'); }
  const [orders, events] = await Promise.all([
    Order.find({ ...scope(req), 'items.bundle': bundle._id }).select('items createdAt').lean(),
    ClickEvent.countDocuments({ ...scope(req), targetId: String(bundle._id), eventType: 'page_view' }),
  ]);
  const bundleItems = orders.flatMap(order => (order.items || []).filter(item => String(item.bundle) === String(bundle._id)));
  const unitsSold = bundleItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const revenue = bundleItems.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
  const selectedProducts = new Map();
  bundleItems.forEach(item => (item.bundleComponents || []).forEach(component => {
    const key = String(component.product);
    const current = selectedProducts.get(key) || { product: component.product, title: component.title, quantity: 0 };
    current.quantity += Number(component.quantity || 0) * Number(item.quantity || 0);
    selectedProducts.set(key, current);
  }));
  const components = [...selectedProducts.values()].sort((a, b) => b.quantity - a.quantity);
  const discount = bundleItems.reduce((sum, item) => sum + Math.max(0, (item.bundleComponents || []).reduce((componentSum, component) => componentSum + Number(component.allocatedDiscount || 0), 0)) * Number(item.quantity || 0), 0);
  res.json({ success: true, analytics: { views: events || Number(bundle.stats?.views || 0), addToCart: Number(bundle.stats?.addToCart || 0), unitsSold, revenue, discount, conversionRate: events ? Number((unitsSold / events * 100).toFixed(2)) : 0, components } });
});

// Product SKUs are unique per tenant in practice; keep duplicate bundle SKUs
// readable while using the same deterministic suffix strategy as slugs.
const uniqueSku = async (tenant, requested) => {
  const base = String(requested || 'BUNDLE-COPY').trim().toUpperCase().slice(0, 80) || 'BUNDLE-COPY';
  let sku = base;
  let suffix = 1;
  while (await Bundle.exists({ tenant, sku })) {
    suffix += 1;
    sku = `${base.slice(0, 74)}-${suffix}`;
  }
  return sku;
};

module.exports = { listBundles, getBundle, listAdminBundles, getAdminBundle, createBundle, updateBundle, deleteBundle, quoteAdminBundle, quotePublicBundle, duplicateBundle, publishBundle, archiveBundle, getBundleAnalytics };
