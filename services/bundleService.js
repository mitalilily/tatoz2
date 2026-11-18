const mongoose = require('mongoose');
const slugify = require('slugify');
const Bundle = require('../models/Bundle');
const Product = require('../models/Product');
const { resolveProductSelection } = require('./cartProductService');
const { addApprovedProductFilter } = require('./productApprovalService');

const roundMoney = value => Math.round((Number(value) || 0) * 100) / 100;
const tenantFilter = tenant => (tenant ? { tenant } : {});
const bundleError = (message, statusCode = 400, publicCode = 'BUNDLE_INVALID') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
};

const OFFER_TYPES = Object.freeze([
  'fixed_combo',
  'fixed_variant',
  'multipack',
  'buy_x_get_y_free',
  'custom_bundle',
  'custom_box',
  'mix_match',
  'quantity_bundle',
  'frequently_bought_together',
  'add_on',
]);

const SELECTABLE_OFFER_TYPES = Object.freeze(['custom_bundle', 'custom_box', 'mix_match']);

const isSelectableOffer = offerType => SELECTABLE_OFFER_TYPES.includes(offerType);

const isBundleCurrentlyAvailable = (bundle, now = new Date()) => {
  const startAt = bundle?.availability?.startAt ? new Date(bundle.availability.startAt) : null;
  const endAt = bundle?.availability?.endAt ? new Date(bundle.availability.endAt) : null;
  if (startAt && !Number.isNaN(startAt.getTime()) && now < startAt) return { available: false, code: 'BUNDLE_NOT_STARTED', message: 'This bundle offer has not started yet' };
  if (endAt && !Number.isNaN(endAt.getTime()) && now >= endAt) return { available: false, code: 'BUNDLE_EXPIRED', message: 'This bundle offer has ended' };
  return { available: true };
};

const offerTypeFor = bundle => {
  if (OFFER_TYPES.includes(bundle?.offerType)) return bundle.offerType;
  if (bundle?.bundleType === 'custom') return 'custom_bundle';
  if (bundle?.bundleType === 'mix_match') return 'mix_match';
  if (bundle?.bundleType === 'multipack') return 'multipack';
  if (bundle?.bundleType === 'box') return 'custom_box';
  if (bundle?.bundleType === 'quantity') return 'quantity_bundle';
  if (bundle?.bundleType === 'promotion') return 'buy_x_get_y_free';
  return 'fixed_combo';
};

const uniqueSlug = async (tenant, requested, excludeId) => {
  const base = slugify(String(requested || 'bundle'), { lower: true, strict: true, trim: true }) || 'bundle';
  let slug = base;
  let suffix = 1;
  while (await Bundle.exists({ tenant, slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })) {
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
  return slug;
};

const normalizeComponents = components => {
  if (!Array.isArray(components) || components.length === 0 || components.length > 100) {
    throw bundleError('A bundle must contain between 1 and 100 components', 400, 'BUNDLE_COMPONENTS_INVALID');
  }
  const seen = new Set();
  return components.map((input, index) => {
    if (!input || !mongoose.isValidObjectId(input.product)) throw bundleError(`Invalid bundle component at position ${index + 1}`);
    const key = String(input.product);
    if (seen.has(key)) throw bundleError('A product cannot appear twice in the same bundle', 400, 'BUNDLE_COMPONENT_DUPLICATE');
    seen.add(key);
    const quantity = Number(input.quantity || 1);
    const minQuantity = Number(input.minQuantity || quantity);
    const maxQuantity = Number(input.maxQuantity || quantity);
    if (![quantity, minQuantity, maxQuantity].every(value => Number.isInteger(value) && value >= 1 && value <= 100) || minQuantity > maxQuantity) {
      throw bundleError('Bundle component quantities must be whole numbers between 1 and 100', 400, 'BUNDLE_COMPONENT_QUANTITY_INVALID');
    }
    const priceOverride = input.priceOverride === '' || input.priceOverride === null || input.priceOverride === undefined ? null : Number(input.priceOverride);
    const priceAdjustment = Number(input.priceAdjustment || 0);
    if ((priceOverride !== null && (!Number.isFinite(priceOverride) || priceOverride < 0)) || !Number.isFinite(priceAdjustment)) {
      throw bundleError('Bundle component pricing is invalid', 400, 'BUNDLE_COMPONENT_PRICE_INVALID');
    }
    return {
      ...(input._id ? { _id: input._id } : {}),
      product: input.product,
      quantity,
      required: input.required !== false,
      customerSelectable: Boolean(input.customerSelectable),
      allowDuplicate: Boolean(input.allowDuplicate),
      group: String(input.group || '').trim().slice(0, 80),
      minQuantity,
      maxQuantity,
      priceOverride,
      priceAdjustment,
      sortOrder: Number(input.sortOrder || index),
      defaultVariant: input.defaultVariant && typeof input.defaultVariant === 'object' ? input.defaultVariant : {},
    };
  });
};

const normalizeSelectionRules = (input = {}, offerType = 'fixed_combo') => {
  const source = input && typeof input === 'object' ? input : {};
  const integer = (value, fallback) => {
    const number = value === '' || value === null || value === undefined ? fallback : Number(value);
    if (!Number.isInteger(number) || number < 1 || number > 100) {
      throw bundleError('Bundle selection rules must be whole numbers between 1 and 100', 400, 'BUNDLE_SELECTION_RULES_INVALID');
    }
    return number;
  };
  const rules = {
    minProducts: integer(source.minProducts, 1),
    maxProducts: integer(source.maxProducts, 100),
    requiredQuantity: integer(source.requiredQuantity, 1),
    maxQuantityPerProduct: integer(source.maxQuantityPerProduct, 100),
  };
  if (rules.maxProducts < rules.minProducts) {
    throw bundleError('Maximum selectable products cannot be less than the minimum', 400, 'BUNDLE_SELECTION_RULES_INVALID');
  }
  if (!isSelectableOffer(offerType)) {
    rules.minProducts = 1;
    rules.maxProducts = 100;
    rules.requiredQuantity = 1;
  }
  return rules;
};

const normalizeSelectionGroups = (input = []) => {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 50).map((group, index) => {
    const minimumSelection = Number(group.minimumSelection ?? group.minSelection ?? 1);
    const maximumSelection = Number(group.maximumSelection ?? group.maxSelection ?? minimumSelection);
    if (!String(group.name || '').trim()) throw bundleError('Every selection group needs a name', 400, 'BUNDLE_SELECTION_GROUP_INVALID');
    if (![minimumSelection, maximumSelection].every(value => Number.isInteger(value) && value >= 0 && value <= 100) || maximumSelection < minimumSelection) {
      throw bundleError('Selection group limits are invalid', 400, 'BUNDLE_SELECTION_GROUP_INVALID');
    }
    return {
      key: String(group.key || group.name).trim().slice(0, 80),
      name: String(group.name).trim().slice(0, 120),
      description: String(group.description || '').trim().slice(0, 300),
      minimumSelection,
      maximumSelection,
      required: group.required !== false,
      duplicateAllowed: Boolean(group.duplicateAllowed),
      sortOrder: Number.isInteger(Number(group.sortOrder)) ? Number(group.sortOrder) : index,
    };
  });
};

const assertComponentProducts = async ({ tenant, components, session }) => {
  const productQuery = { _id: { $in: components.map(item => item.product) }, ...tenantFilter(tenant) };
  addApprovedProductFilter(productQuery);
  const products = await Product.find(productQuery).session(session || null).lean();
  const byId = new Map(products.map(product => [String(product._id), product]));
  for (const component of components) {
    const product = byId.get(String(component.product));
    if (!product) throw bundleError('Every bundle component must belong to this store', 400, 'BUNDLE_COMPONENT_TENANT_MISMATCH');
    if (!product.isActive && product.lifecycleStatus !== 'active') throw bundleError(`Bundle component ${product.title} is not active`, 409, 'BUNDLE_COMPONENT_INACTIVE');
  }
  return byId;
};

const assertRewardProduct = async ({ tenant, reward, session }) => {
  if (!reward?.product || !mongoose.isValidObjectId(reward.product)) {
    throw bundleError('A free reward product is required for Buy A + B Get C Free', 400, 'BUNDLE_REWARD_REQUIRED');
  }
  const productQuery = { _id: reward.product, ...tenantFilter(tenant) };
  addApprovedProductFilter(productQuery);
  const product = await Product.findOne(productQuery).session(session || null).lean();
  if (!product) throw bundleError('The free reward product must belong to this store', 400, 'BUNDLE_REWARD_TENANT_MISMATCH');
  if (!product.isActive && product.lifecycleStatus !== 'active') throw bundleError(`Free reward ${product.title} is not active`, 409, 'BUNDLE_REWARD_INACTIVE');
  const quantity = Number(reward.quantity || 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
    throw bundleError('Free reward quantity must be a whole number between 1 and 100', 400, 'BUNDLE_REWARD_QUANTITY_INVALID');
  }
  return { product, quantity, variant: reward.variant && typeof reward.variant === 'object' ? reward.variant : {} };
};

const selectionInputFor = (selections, component) => {
  if (!selections) return { variant: component.defaultVariant || {}, quantity: component.quantity };
  const source = Array.isArray(selections)
    ? selections.find(item => item && (String(item.component || item.product) === String(component._id) || String(item.product) === String(component.product)))
    : selections[String(component._id)] || selections[String(component.product)];
  if (!source) return { variant: component.defaultVariant || {}, quantity: component.quantity };
  return {
    variant: source.variant || source.selection || component.defaultVariant || {},
    quantity: source.quantity === undefined ? component.quantity : Number(source.quantity),
  };
};

const selectionEntries = selections => {
  if (!selections) return [];
  return Array.isArray(selections)
    ? selections
    : Object.entries(selections).map(([key, value]) => ({
      ...(value && typeof value === 'object' ? value : {}),
      component: value?.component || key,
    }));
};

const hasExplicitSelection = (selections, component) => {
  if (!selections) return false;
  return Array.isArray(selections)
    ? selections.some(item => item && (String(item.component || item.product) === String(component._id) || String(item.product) === String(component.product)))
    : Boolean(selections[String(component._id)] || selections[String(component.product)]);
};

const assertKnownSelections = (selections, components) => {
  if (!selections) return;
  const entries = selectionEntries(selections);
  for (const item of entries) {
    if (!item || typeof item !== 'object') throw bundleError('Bundle selections are invalid', 400, 'BUNDLE_SELECTIONS_INVALID');
    const key = item.component || item.product;
    const match = components.find(component => String(component._id) === String(key) || String(component.product) === String(key));
    if (!match) {
      throw bundleError('A selected product is not eligible for this bundle', 400, 'BUNDLE_SELECTION_NOT_ELIGIBLE');
    }
    if (item.product && String(item.product) !== String(match.product)) {
      throw bundleError('A selected product is not eligible for this bundle', 400, 'BUNDLE_SELECTION_NOT_ELIGIBLE');
    }
  }
};

const quoteBundle = async ({ tenantId, bundleId, quantity = 1, selections, session, requireActive = true, enforceStock = true } = {}) => {
  if (!mongoose.isValidObjectId(bundleId)) throw bundleError('Invalid bundle identifier', 400, 'BUNDLE_ID_INVALID');
  const bundle = await Bundle.findOne({ _id: bundleId, ...tenantFilter(tenantId) }).session(session || null).lean();
  if (!bundle) throw bundleError('Bundle not found', 404, 'BUNDLE_NOT_FOUND');
  const availabilityStatus = isBundleCurrentlyAvailable(bundle);
  if (requireActive && (!bundle.isActive || bundle.lifecycleStatus !== 'active')) throw bundleError('Bundle is not available', 409, 'BUNDLE_UNAVAILABLE');
  if (requireActive) {
    if (!availabilityStatus.available) throw bundleError(availabilityStatus.message, 409, availabilityStatus.code);
  }
  const bundleQuantity = Number(quantity);
  if (!Number.isInteger(bundleQuantity) || bundleQuantity < 1 || bundleQuantity > Number(bundle.availability?.maxQuantityPerOrder || 100)) {
    throw bundleError('Bundle quantity is invalid', 400, 'BUNDLE_QUANTITY_INVALID');
  }

  const components = normalizeComponents(bundle.components);
  const offerType = offerTypeFor(bundle);
  const selectionRules = normalizeSelectionRules(bundle.selectionRules, offerType);
  const selectionGroups = normalizeSelectionGroups(bundle.selectionGroups);
  assertKnownSelections(selections, components);
  const products = await assertComponentProducts({ tenant: tenantId, components, session });
  const snapshots = [];
  let availableQuantity = Number.POSITIVE_INFINITY;
  let componentCost = 0;
  let componentSubtotal = 0;
  let shippingWeight = 0;

  for (const component of components) {
    const input = selectionInputFor(selections, component);
    const perBundleQuantity = input.quantity;
    if (!Number.isInteger(perBundleQuantity) || perBundleQuantity < component.minQuantity || perBundleQuantity > component.maxQuantity) {
      throw bundleError(`Invalid quantity for bundle component ${component.product}`, 400, 'BUNDLE_COMPONENT_SELECTION_INVALID');
    }
    if (isSelectableOffer(offerType) && !component.required && !hasExplicitSelection(selections, component)) continue;
    const product = products.get(String(component.product));
    const selected = resolveProductSelection(product, input.variant, perBundleQuantity, { requireActive: true, enforceStock });
    availableQuantity = Math.min(availableQuantity, Math.floor(selected.maxQuantity / perBundleQuantity));
    const override = component.priceOverride === null || component.priceOverride === undefined ? null : Number(component.priceOverride);
    if (override !== null && (!Number.isFinite(override) || override < 0)) throw bundleError('Bundle component price override is invalid', 400, 'BUNDLE_COMPONENT_PRICE_INVALID');
    const effectiveUnitPrice = roundMoney((override === null ? selected.unitPrice : override) + Number(component.priceAdjustment || 0));
    if (effectiveUnitPrice < 0) throw bundleError('Bundle component price cannot be negative', 400, 'BUNDLE_COMPONENT_PRICE_INVALID');
    const linePrice = roundMoney(effectiveUnitPrice * perBundleQuantity);
    const cost = roundMoney(Number(product.costPrice || 0) * perBundleQuantity);
    componentCost += cost;
    componentSubtotal += linePrice;
    shippingWeight += (Number(product.weight) > 0 ? Number(product.weight) : 0.5) * perBundleQuantity;
    snapshots.push({
      component: component._id,
      product: product._id,
      title: product.title,
      image: selected.image,
      sku: product.sku || '',
      quantity: perBundleQuantity,
      variant: selected.canonicalVariant,
      unitPrice: effectiveUnitPrice,
      lineTotal: linePrice,
      originalUnitPrice: effectiveUnitPrice,
      originalLineTotal: linePrice,
      costPrice: cost,
      hsnCode: product.hsnCode || '',
      taxRate: product.gstRate,
      category: product.category,
      group: component.group || '',
      customerSelectable: component.customerSelectable,
    });
  }
  if (!snapshots.length) throw bundleError('Bundle has no selectable components', 409, 'BUNDLE_COMPONENTS_EMPTY');
  if (isSelectableOffer(offerType)) {
    const selectedProducts = snapshots.length;
    const selectedQuantity = snapshots.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    if (selectedProducts < selectionRules.minProducts || selectedProducts > selectionRules.maxProducts) {
      throw bundleError(`Select between ${selectionRules.minProducts} and ${selectionRules.maxProducts} eligible products`, 400, 'BUNDLE_SELECTION_COUNT_INVALID');
    }
    if (selectedQuantity !== selectionRules.requiredQuantity) {
      throw bundleError(`Select exactly ${selectionRules.requiredQuantity} total product unit${selectionRules.requiredQuantity === 1 ? '' : 's'}`, 400, 'BUNDLE_SELECTION_QUANTITY_INVALID');
    }
    if (snapshots.some(item => Number(item.quantity) > selectionRules.maxQuantityPerProduct)) {
      throw bundleError(`A product cannot be selected more than ${selectionRules.maxQuantityPerProduct} time${selectionRules.maxQuantityPerProduct === 1 ? '' : 's'}`, 400, 'BUNDLE_SELECTION_PRODUCT_QUANTITY_INVALID');
    }
    for (const group of selectionGroups) {
      const groupItems = snapshots.filter(item => item.group === group.key || item.group === group.name);
      if (group.required && groupItems.length < group.minimumSelection) {
        throw bundleError(`Select at least ${group.minimumSelection} item${group.minimumSelection === 1 ? '' : 's'} from ${group.name}`, 400, 'BUNDLE_SELECTION_GROUP_INVALID');
      }
      if (groupItems.length > group.maximumSelection) {
        throw bundleError(`Select at most ${group.maximumSelection} item${group.maximumSelection === 1 ? '' : 's'} from ${group.name}`, 400, 'BUNDLE_SELECTION_GROUP_INVALID');
      }
    }
  }

  const freeRewards = [];
  let rewardCost = 0;
  if (offerType === 'buy_x_get_y_free') {
    const reward = await assertRewardProduct({ tenant: tenantId, reward: bundle.freeReward, session });
    if (components.some(component => String(component.product) === String(reward.product._id))) {
      throw bundleError('The free reward must be different from the required products', 400, 'BUNDLE_REWARD_DUPLICATE');
    }
    const selected = resolveProductSelection(reward.product, reward.variant, reward.quantity, { requireActive: true, enforceStock });
    const rewardAvailable = Math.floor(selected.maxQuantity / reward.quantity);
    availableQuantity = Math.min(availableQuantity, rewardAvailable);
    const cost = roundMoney(Number(reward.product.costPrice || 0) * reward.quantity);
    rewardCost += cost;
    shippingWeight += (Number(reward.product.weight) > 0 ? Number(reward.product.weight) : 0.5) * reward.quantity;
    freeRewards.push({
      product: reward.product._id,
      title: reward.product.title,
      image: selected.image,
      sku: reward.product.sku || '',
      quantity: reward.quantity,
      variant: selected.canonicalVariant,
      unitPrice: 0,
      lineTotal: 0,
      costPrice: cost,
      hsnCode: reward.product.hsnCode || '',
      taxRate: reward.product.gstRate,
      category: reward.product.category,
      freeReward: true,
    });
  }
  if (enforceStock && availableQuantity < bundleQuantity) throw bundleError('One or more bundle components are out of stock', 409, 'BUNDLE_STOCK_UNAVAILABLE');

  const discountType = ['none', 'percentage', 'fixed'].includes(bundle.discountType) ? bundle.discountType : 'none';
  const discountValue = Math.max(0, Number(bundle.discountValue) || 0);
  const discountAmount = discountType === 'percentage'
    ? roundMoney(componentSubtotal * Math.min(100, discountValue) / 100)
    : discountType === 'fixed'
      ? roundMoney(Math.min(componentSubtotal, discountValue))
      : 0;
  const unitPrice = discountType === 'none'
    ? roundMoney(bundle.price)
    : roundMoney(Math.max(0, componentSubtotal - discountAmount));
  const comparePrice = roundMoney(bundle.comparePrice || componentSubtotal);
  const savingsAmount = roundMoney(Math.max(0, comparePrice - unitPrice));
  const totalGross = snapshots.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
  let allocatedSelling = 0;
  snapshots.forEach((item, index) => {
    const allocatedSellingPrice = index === snapshots.length - 1
      ? roundMoney(unitPrice - allocatedSelling)
      : totalGross > 0 ? roundMoney(unitPrice * (Number(item.lineTotal || 0) / totalGross)) : 0;
    allocatedSelling = roundMoney(allocatedSelling + allocatedSellingPrice);
    item.allocatedSellingPrice = allocatedSellingPrice;
    item.allocatedDiscount = roundMoney(Number(item.lineTotal || 0) - allocatedSellingPrice);
    item.allocatedUnitPrice = item.quantity > 0 ? roundMoney(allocatedSellingPrice / item.quantity) : 0;
  });

  return {
    bundle,
    quantity: bundleQuantity,
    offerType,
    selectionRules,
    selectionGroups,
    bundleVersion: Number(bundle.version || 1),
    availabilityStatus,
    unitPrice,
    lineTotal: roundMoney(unitPrice * bundleQuantity),
    comparePrice,
    savingsAmount,
    savingsPercent: comparePrice > 0 ? Math.round((savingsAmount / comparePrice) * 100) : 0,
    componentCost: roundMoney(componentCost),
    componentSubtotal: roundMoney(componentSubtotal),
    discountAmount,
    availableQuantity,
    shippingWeight,
    components: snapshots,
    freeRewards,
    costPrice: roundMoney(Number(bundle.costPrice || (componentCost + rewardCost))),
    hsnCode: bundle.hsnCode || '',
    taxRate: bundle.gstRate,
  };
};

const publicBundle = bundle => ({
  ...bundle,
  offerType: offerTypeFor(bundle),
  componentCount: Array.isArray(bundle.components) ? bundle.components.length : 0,
});

module.exports = {
  assertComponentProducts,
  assertRewardProduct,
  bundleError,
  OFFER_TYPES,
  offerTypeFor,
  normalizeSelectionRules,
  normalizeComponents,
  normalizeSelectionGroups,
  isBundleCurrentlyAvailable,
  isSelectableOffer,
  publicBundle,
  quoteBundle,
  uniqueSlug,
};
