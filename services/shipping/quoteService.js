const Product = require('../../models/Product');
const Settings = require('../../models/Settings');
const ShippingZone = require('../../models/ShippingZone');
const ShippingRate = require('../../models/ShippingRate');
const ServiceablePincode = require('../../models/ServiceablePincode');
const { addApprovedProductFilter } = require('../productApprovalService');

const roundMoney = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const text = value => String(value ?? '').trim();
const normalized = value => text(value).toLowerCase().replace(/\s+/g, ' ');
const normalizedPincode = value => text(value).replace(/\D/g, '');

const shippingError = (message, statusCode = 422, publicCode = 'SHIPPING_UNSERVICEABLE') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
};

const asArray = value => (Array.isArray(value) ? value : []);

const listMatches = (configured, actual, { pincode = false } = {}) => {
  const values = asArray(configured).map(item => pincode ? normalizedPincode(item) : normalized(item)).filter(Boolean);
  if (!values.length) return true;
  const candidate = pincode ? normalizedPincode(actual) : normalized(actual);
  return values.includes(candidate);
};

const matchesZone = (zone, address = {}) => {
  const match = zone?.match || {};
  const pincode = normalizedPincode(address.pincode);
  const blocked = asArray(match.blockedPincodes).some(value => normalizedPincode(value) === pincode);
  if (blocked) return false;
  const prefixes = asArray(match.pincodePrefixes).map(value => normalizedPincode(value)).filter(Boolean);
  if (prefixes.length && !prefixes.some(prefix => pincode.startsWith(prefix))) return false;
  return listMatches(match.countries, address.country || 'India')
    && listMatches(match.states, address.state)
    && listMatches(match.cities, address.city)
    && listMatches(match.pincodes, pincode, { pincode: true });
};

const normalizedPaymentMethod = paymentMethod => String(paymentMethod || '').toLowerCase() === 'cod' ? 'cod' : 'prepaid';

const rateAcceptsInputs = (rate, { discountedSubtotal, weight, paymentMethod }) => {
  if (!rate?.enabled) return false;
  const subtotal = Number(discountedSubtotal || 0);
  const safeWeight = Number(weight || 0);
  if (rate.minSubtotal !== null && rate.minSubtotal !== undefined && subtotal < Number(rate.minSubtotal)) return false;
  if (rate.maxSubtotal !== null && rate.maxSubtotal !== undefined && subtotal > Number(rate.maxSubtotal)) return false;
  if (rate.minWeight !== null && rate.minWeight !== undefined && safeWeight < Number(rate.minWeight)) return false;
  if (rate.maxWeight !== null && rate.maxWeight !== undefined && safeWeight > Number(rate.maxWeight)) return false;
  return normalizedPaymentMethod(paymentMethod) === 'cod' ? rate.codEnabled !== false : rate.prepaidEnabled !== false;
};

const calculateCharge = (rate, { discountedSubtotal, weight, couponFreeShipping }) => {
  const subtotal = Math.max(0, Number(discountedSubtotal || 0));
  const safeWeight = Math.max(0, Number(weight || 0));
  let charge;
  switch (rate.chargeType) {
    case 'free':
      charge = 0;
      break;
    case 'weight':
      charge = Number(rate.baseAmount || 0)
        + Math.max(0, safeWeight - Number(rate.includedWeight || 0)) * Number(rate.amountPerKg || 0);
      break;
    case 'price':
      charge = Number(rate.baseAmount || 0)
        + Math.max(0, subtotal - Number(rate.includedSubtotal || 0)) * Number(rate.amountPerCurrency || 0);
      break;
    case 'flat':
    default:
      charge = Number(rate.baseAmount || 0);
      break;
  }
  if (rate.freeOverSubtotal !== null && rate.freeOverSubtotal !== undefined && subtotal >= Number(rate.freeOverSubtotal)) charge = 0;
  if (couponFreeShipping) charge = 0;
  return roundMoney(Math.max(0, charge));
};

const queryWithSession = (query, session) => session ? query.session(session) : query;

const legacyQuote = async ({ subtotal, discount, couponFreeShipping, session }) => {
  const [freeShippingThreshold, standardShippingCost] = await Promise.all([
    queryWithSession(Settings.findOne({ key: 'free_shipping_threshold' }), session).then(row => row ? row.value : 999),
    queryWithSession(Settings.findOne({ key: 'standard_shipping_cost' }), session).then(row => row ? row.value : 49),
  ]);
  const grossSubtotal = Math.max(0, Number(subtotal || 0));
  const safeDiscount = Math.min(grossSubtotal, Math.max(0, Number(discount || 0)));
  const discountedSubtotal = roundMoney(grossSubtotal - safeDiscount);
  const threshold = Math.max(0, Number.isFinite(Number(freeShippingThreshold)) ? Number(freeShippingThreshold) : 999);
  const standardCost = Math.max(0, Number.isFinite(Number(standardShippingCost)) ? Number(standardShippingCost) : 49);
  return {
    source: 'legacy',
    serviceable: true,
    shippingCost: couponFreeShipping || discountedSubtotal >= threshold ? 0 : roundMoney(standardCost),
    shippingMethod: 'standard',
    serviceLevel: 'standard',
    zone: null,
    rate: null,
    weight: roundMoney(0),
    subtotal: roundMoney(grossSubtotal),
    discount: roundMoney(safeDiscount),
    discountedSubtotal,
    estimatedMinDays: 3,
    estimatedMaxDays: 7,
    currency: 'INR',
  };
};

const activeZonesFor = ({ tenantId, session }) => queryWithSession(
  ShippingZone.find({ tenant: tenantId, enabled: true }).sort({ priority: -1, createdAt: 1 }),
  session,
);

const activeRatesFor = ({ tenantId, zoneId, session }) => queryWithSession(
  ShippingRate.find({ tenant: tenantId, zone: zoneId, enabled: true }).sort({ priority: -1, createdAt: 1 }),
  session,
);

const configuredServiceability = async ({ tenantId, address = {}, paymentMethod = 'prepaid', session }) => {
  if (!tenantId) return null;
  const registry = await queryWithSession(ServiceablePincode.findOne({ tenant: tenantId, pincode: normalizedPincode(address.pincode), active: true }), session);
  if (registry) return { configured: true, serviceable: registry.serviceable === true && (normalizedPaymentMethod(paymentMethod) !== 'cod' || registry.codEnabled !== false), zone: null, methods: registry.serviceable ? [{ name: 'Pincode delivery', estimatedMinDays: registry.estimatedMinDays, estimatedMaxDays: registry.estimatedMaxDays }] : [], registry: { _id: registry._id, pincode: registry.pincode, warehouse: registry.warehouse } };
  const zones = await activeZonesFor({ tenantId, session });
  if (!zones.length) return null;
  const zone = zones.find(candidate => matchesZone(candidate, address));
  if (!zone) return { configured: true, serviceable: false, zone: null, methods: [] };
  const rates = await activeRatesFor({ tenantId, zoneId: zone._id, session });
  const methods = rates.filter(rate => rateAcceptsInputs(rate, { discountedSubtotal: 0, weight: 0.5, paymentMethod }))
    .map(rate => ({
      _id: rate._id,
      code: rate.code,
      name: rate.name,
      serviceLevel: rate.serviceLevel,
      estimatedMinDays: rate.estimatedMinDays,
      estimatedMaxDays: rate.estimatedMaxDays,
    }));
  return {
    configured: true,
    serviceable: methods.length > 0,
    zone: { _id: zone._id, code: zone.code, name: zone.name },
    methods,
  };
};

const quoteShipping = async ({ tenantId, shippingAddress = {}, subtotal = 0, discount = 0, weight = 0.5, paymentMethod = 'prepaid', couponFreeShipping = false, session }) => {
  const grossSubtotal = Math.max(0, Number(subtotal || 0));
  const safeDiscount = Math.min(grossSubtotal, Math.max(0, Number(discount || 0)));
  const discountedSubtotal = roundMoney(grossSubtotal - safeDiscount);
  if (!tenantId) return legacyQuote({ subtotal: grossSubtotal, discount: safeDiscount, couponFreeShipping, session });

  const registry = await queryWithSession(ServiceablePincode.findOne({ tenant: tenantId, pincode: normalizedPincode(shippingAddress.pincode), active: true }), session);
  if (registry) {
    if (!registry.serviceable) throw shippingError('This pincode is not serviceable by the store', 422, 'SHIPPING_PINCODE_UNSERVICEABLE');
    if (normalizedPaymentMethod(paymentMethod) === 'cod' && registry.codEnabled === false) throw shippingError('Cash on Delivery is not available for this pincode', 422, 'COD_PINCODE_NOT_ALLOWED');
    const freeThresholdRow = await queryWithSession(Settings.findOne({ key: 'free_shipping_threshold' }), session);
    const freeThreshold = Number(freeThresholdRow?.value ?? 999);
    const charge = couponFreeShipping || discountedSubtotal >= freeThreshold ? 0 : roundMoney(registry.shippingCharge);
    return { source: 'pincode_registry', serviceable: true, shippingCost: charge, shippingMethod: 'pincode-standard', serviceLevel: 'standard', zone: null, rate: null, registry: { _id: registry._id, pincode: registry.pincode, warehouse: registry.warehouse }, weight: roundMoney(weight), subtotal: roundMoney(grossSubtotal), discount: roundMoney(safeDiscount), discountedSubtotal, estimatedMinDays: registry.estimatedMinDays, estimatedMaxDays: registry.estimatedMaxDays, currency: 'INR' };
  }

  const zones = await activeZonesFor({ tenantId, session });
  if (!zones.length) return legacyQuote({ subtotal: grossSubtotal, discount: safeDiscount, couponFreeShipping, session });
  const zone = zones.find(candidate => matchesZone(candidate, shippingAddress));
  if (!zone) throw shippingError('This pincode is not serviceable by the store', 422, 'SHIPPING_PINCODE_UNSERVICEABLE');

  const rates = await activeRatesFor({ tenantId, zoneId: zone._id, session });
  const rate = rates.find(candidate => rateAcceptsInputs(candidate, { discountedSubtotal, weight, paymentMethod }));
  if (!rate) throw shippingError('No shipping method is available for this address and order', 422, 'SHIPPING_METHOD_UNAVAILABLE');
  const shippingCost = calculateCharge(rate, { discountedSubtotal, weight, couponFreeShipping });
  return {
    source: 'configured',
    serviceable: true,
    shippingCost,
    shippingMethod: rate.code || rate.serviceLevel,
    serviceLevel: rate.serviceLevel,
    zone: { _id: zone._id, code: zone.code, name: zone.name },
    rate: { _id: rate._id, code: rate.code, name: rate.name, chargeType: rate.chargeType },
    weight: roundMoney(weight),
    subtotal: roundMoney(grossSubtotal),
    discount: roundMoney(safeDiscount),
    discountedSubtotal,
    estimatedMinDays: rate.estimatedMinDays,
    estimatedMaxDays: rate.estimatedMaxDays,
    currency: rate.currency || 'INR',
  };
};

const resolveVariantSelection = (product, variant = {}) => {
  if (!product.variants?.length) return [];
  const selected = product.variants.map(definition => definition.options.find(option => option.value === variant?.[definition.name])).filter(Boolean);
  if (selected.length !== product.variants.length) throw shippingError(`Select all variants for ${product.title}`, 400, 'SHIPPING_VARIANT_REQUIRED');
  return selected;
};

const calculateCartShippingInputs = async ({ items = [], tenantId, session }) => {
  if (!Array.isArray(items) || !items.length || items.length > 50) throw shippingError('Shipping quote requires between 1 and 50 items', 400, 'SHIPPING_ITEMS_INVALID');
  let subtotal = 0;
  let weight = 0;
  const seen = new Set();
  for (const item of items) {
    const productId = item.product || item.productId;
    const quantity = Number(item.quantity);
    if (!productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw shippingError('Shipping quote contains an invalid item', 400, 'SHIPPING_ITEMS_INVALID');
    const variantKey = item.variant && typeof item.variant === 'object' ? JSON.stringify(item.variant) : '';
    const key = `${productId}:${variantKey}`;
    if (seen.has(key)) throw shippingError('Shipping quote contains duplicate product variants', 400, 'SHIPPING_ITEMS_INVALID');
    seen.add(key);
    const productQuery = { _id: productId, isActive: true, ...(tenantId ? { tenant: tenantId } : {}) };
    addApprovedProductFilter(productQuery);
    const query = Product.findOne(productQuery);
    const product = await queryWithSession(query, session);
    if (!product) throw shippingError('One or more products are no longer available', 404, 'SHIPPING_PRODUCT_NOT_FOUND');
    const selected = resolveVariantSelection(product, item.variant);
    const pricedOption = [...selected].reverse().find(option => option.price !== undefined && option.price !== null);
    const price = pricedOption
      ? Number(pricedOption.price)
      : Number(product.price || 0) + selected.reduce((sum, option) => sum + Number(option.priceModifier || 0), 0);
    if (!Number.isFinite(price) || price < 0) throw shippingError('One or more products has an invalid price', 400, 'SHIPPING_PRODUCT_INVALID');
    subtotal += price * quantity;
    const itemWeight = Number(product.weight);
    weight += (Number.isFinite(itemWeight) && itemWeight > 0 ? itemWeight : 0.5) * quantity;
  }
  return { subtotal: roundMoney(subtotal), weight: roundMoney(weight) };
};

module.exports = {
  calculateCartShippingInputs,
  calculateCharge,
  configuredServiceability,
  matchesZone,
  quoteShipping,
  shippingError,
};
