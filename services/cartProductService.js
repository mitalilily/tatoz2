const mongoose = require('mongoose');
const Product = require('../models/Product');
const { resolveBulkOrderPrice } = require('../utils/bulkOrder');
const { addApprovedProductFilter, isProductApproved } = require('./productApprovalService');

const makeError = (message, statusCode, publicCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
};

const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const assertQuantity = value => {
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !value.trim())) {
    throw makeError('Quantity must be an integer between 1 and 100', 400, 'CART_QUANTITY_INVALID');
  }
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
    throw makeError('Quantity must be an integer between 1 and 100', 400, 'CART_QUANTITY_INVALID');
  }
  return quantity;
};

const variantObject = input => {
  if (input === undefined || input === null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw makeError('Variant selections must be an object', 400, 'CART_VARIANT_INVALID');
  }
  return input;
};

const optionSelectionValue = selection => {
  if (selection && typeof selection === 'object' && !Array.isArray(selection)) {
    return selection._id || selection.id || selection.value;
  }
  return selection;
};

const resolveProductSelection = (product, inputVariant, quantity = 1, options = {}) => {
  const { requireActive = true, enforceStock = true } = options;
  if (requireActive && (!product.isActive || !isProductApproved(product))) {
    throw makeError('Product is not available', 409, 'CART_PRODUCT_UNAVAILABLE');
  }

  const requested = variantObject(inputVariant);
  const variants = Array.isArray(product.variants) ? product.variants.filter(variant => Array.isArray(variant.options) && variant.options.length) : [];
  const names = variants.map(variant => String(variant.name || '').trim());
  if (names.some(name => !name) || new Set(names).size !== names.length) {
    throw makeError('Product variant configuration is invalid', 409, 'CART_VARIANT_CONFIGURATION_INVALID');
  }

  const allowedNames = new Set(names);
  const unexpectedNames = Object.keys(requested).filter(name => !allowedNames.has(name));
  if (unexpectedNames.length) {
    throw makeError('One or more variant selections are invalid', 400, 'CART_VARIANT_INVALID');
  }

  if (!variants.length && Object.keys(requested).length) {
    throw makeError('This product does not have variants', 400, 'CART_VARIANT_INVALID');
  }

  const canonicalVariant = {};
  const selectedOptions = [];
  for (const variant of variants) {
    const name = String(variant.name).trim();
    const selection = optionSelectionValue(requested[name]);
    if (selection === undefined || selection === null || String(selection).trim() === '') {
      throw makeError(`Select ${name}`, 400, 'CART_VARIANT_REQUIRED');
    }
    const selected = variant.options.find(option => (
      String(option._id) === String(selection)
      || String(option.value) === String(selection)
    ));
    if (!selected) {
      throw makeError(`Invalid ${name} selection`, 400, 'CART_VARIANT_INVALID');
    }
    canonicalVariant[name] = String(selected.value);
    selectedOptions.push(selected);
  }

  const productStock = Math.max(0, Math.floor(Number(product.stock) || 0));
  const optionStocks = selectedOptions.map(option => {
    const stock = Number(option.stock);
    return Number.isFinite(stock) ? Math.max(0, Math.floor(stock)) : productStock;
  });
  const maxQuantity = optionStocks.length ? Math.min(productStock, ...optionStocks) : productStock;
  const checkedQuantity = assertQuantity(quantity);
  if (enforceStock && maxQuantity < checkedQuantity) {
    throw makeError('Requested quantity is not available', 409, 'CART_STOCK_UNAVAILABLE');
  }

  const pricedOption = [...selectedOptions].reverse().find(option => option.price !== undefined && option.price !== null);
  const rawPrice = pricedOption
    ? Number(pricedOption.price)
    : Number(product.price || 0) + selectedOptions.reduce((sum, option) => sum + Number(option.priceModifier || 0), 0);
  if (!Number.isFinite(rawPrice) || rawPrice < 0) {
    throw makeError('Product price is invalid', 409, 'CART_PRODUCT_PRICE_INVALID');
  }

  const rawComparePrice = pricedOption?.comparePrice !== undefined && pricedOption?.comparePrice !== null
    ? Number(pricedOption.comparePrice)
    : Number(product.comparePrice || 0);
  const baseUnitPrice = roundMoney(rawPrice);
  const unitPrice = resolveBulkOrderPrice(product, checkedQuantity, baseUnitPrice);
  const comparePrice = Number.isFinite(rawComparePrice) && rawComparePrice >= 0 ? roundMoney(rawComparePrice) : 0;
  const explicitDiscount = pricedOption?.discount !== undefined && pricedOption?.discount !== null
    ? Number(pricedOption.discount)
    : null;
  const discount = Number.isFinite(explicitDiscount)
    ? Math.max(0, Math.min(100, Math.round(explicitDiscount)))
    : comparePrice > unitPrice
      ? Math.round(((comparePrice - unitPrice) / comparePrice) * 100)
      : Math.max(0, Math.min(100, Math.round(Number(product.discount) || 0)));
  const imageOption = [...selectedOptions].reverse().find(option => option.images?.length || option.thumbnail);
  const image = imageOption?.images?.[0]?.url
    || imageOption?.thumbnail
    || product.thumbnail
    || product.images?.[0]?.url
    || '';

  return {
    canonicalVariant,
    variantKey: JSON.stringify(names.map(name => [name, canonicalVariant[name]])),
    unitPrice,
    comparePrice,
    discount,
    maxQuantity,
    image,
    sku: product.sku || '',
  };
};

const loadValidatedProduct = async ({ tenantId, productId, variant, quantity }) => {
  if (!mongoose.isValidObjectId(productId)) {
    throw makeError('Invalid product identifier', 400, 'CART_PRODUCT_ID_INVALID');
  }
  const productQuery = { _id: productId, tenant: tenantId };
  addApprovedProductFilter(productQuery);
  const product = await Product.findOne(productQuery).lean();
  if (!product) throw makeError('Product not found', 404, 'CART_PRODUCT_NOT_FOUND');
  const selection = resolveProductSelection(product, variant, quantity);
  return { product, selection };
};

const loadValidatedBundle = async ({ tenantId, bundleId, quantity, selections }) => {
  if (!mongoose.isValidObjectId(bundleId)) throw makeError('Invalid bundle identifier', 400, 'CART_BUNDLE_ID_INVALID');
  const { quoteBundle } = require('./bundleService');
  return quoteBundle({ tenantId, bundleId, quantity, selections, requireActive: true, enforceStock: true });
};

const publicProduct = (product, selection) => ({
  _id: String(product._id),
  title: product.title,
  slug: product.slug,
  sku: selection?.sku || product.sku || '',
  image: selection?.image || product.thumbnail || product.images?.[0]?.url || '',
  price: selection?.unitPrice ?? null,
  comparePrice: selection?.comparePrice ?? null,
  discount: selection?.discount ?? null,
  hsnCode: product.hsnCode || '',
  gstRate: product.gstRate === null || product.gstRate === undefined ? null : Number(product.gstRate),
  stock: selection?.maxQuantity ?? 0,
  isActive: Boolean(product.isActive && isProductApproved(product)),
  bulkOrderEnabled: Boolean(product.bulkOrderEnabled),
  bulkOrderTiers: product.bulkOrderEnabled
    ? (product.bulkOrderTiers || []).map(tier => ({
      minQuantity: Number(tier.minQuantity),
      price: roundMoney(tier.price),
      ...(tier.label ? { label: tier.label } : {}),
    }))
    : [],
});

const emptyCart = () => ({
  id: null,
  revision: 0,
  items: [],
  distinctItemCount: 0,
  itemCount: 0,
  subtotal: 0,
  hasUnavailableItems: false,
  currency: 'INR',
  updatedAt: null,
});

const hydrateCart = async (cart, tenantId) => {
  if (!cart) return emptyCart();
  const plain = typeof cart.toObject === 'function' ? cart.toObject() : cart;
  const productIds = [...new Set((plain.items || []).filter(item => item.itemType !== 'bundle' && !item.bundle).map(item => String(item.product)))];
  const productQuery = { _id: { $in: productIds }, tenant: tenantId };
  addApprovedProductFilter(productQuery);
  const products = productIds.length
    ? await Product.find(productQuery).lean()
    : [];
  const byId = new Map(products.map(product => [String(product._id), product]));
  const { quoteBundle } = require('./bundleService');

  const items = [];
  let subtotal = 0;
  let hasUnavailableItems = false;
  for (const item of plain.items || []) {
    if (item.itemType === 'bundle' || item.bundle) {
      const quantity = Number(item.quantity) || 0;
      try {
        const quote = await quoteBundle({ tenantId, bundleId: item.bundle, quantity: 1, selections: item.bundleSelections, requireActive: false, enforceStock: false });
        const available = quote.bundle.isActive
          && quote.bundle.lifecycleStatus === 'active'
          && quote.availabilityStatus?.available !== false
          && quote.availableQuantity >= quantity;
        if (!available) hasUnavailableItems = true;
        const lineTotal = roundMoney(quote.unitPrice * quantity);
        subtotal = roundMoney(subtotal + lineTotal);
        items.push({
          id: String(item._id),
          itemType: 'bundle',
          bundle: { ...quote.bundle, _id: String(quote.bundle._id), title: quote.bundle.name, image: quote.bundle.image },
          bundleSelections: item.bundleSelections || {},
          quantity,
          unitPrice: quote.unitPrice,
          lineTotal,
          maxQuantity: quote.availableQuantity,
          availability: available ? 'available' : 'out_of_stock',
          components: quote.components,
          freeRewards: quote.freeRewards || [],
        });
      } catch (error) {
        hasUnavailableItems = true;
        items.push({ id: String(item._id), itemType: 'bundle', bundle: { _id: String(item.bundle), title: 'Unavailable bundle', isActive: false }, bundleSelections: item.bundleSelections || {}, quantity, unitPrice: null, lineTotal: null, maxQuantity: 0, availability: 'unavailable' });
      }
      continue;
    }
    const product = byId.get(String(item.product));
    const quantity = Number(item.quantity) || 0;
    if (!product) {
      hasUnavailableItems = true;
      items.push({
        id: String(item._id),
        product: { _id: String(item.product), title: 'Unavailable product', isActive: false },
        variant: item.variant || {},
        quantity,
        unitPrice: null,
        lineTotal: null,
        maxQuantity: 0,
        availability: 'unavailable',
      });
      continue;
    }

    try {
      const selection = resolveProductSelection(product, item.variant, quantity, { requireActive: false, enforceStock: false });
      const availability = !product.isActive || !isProductApproved(product)
        ? 'inactive'
        : selection.maxQuantity < quantity
          ? 'out_of_stock'
          : 'available';
      if (availability !== 'available') hasUnavailableItems = true;
      const lineTotal = roundMoney(selection.unitPrice * quantity);
      subtotal = roundMoney(subtotal + lineTotal);
      items.push({
        id: String(item._id),
        product: publicProduct(product, selection),
        variant: selection.canonicalVariant,
        quantity,
        unitPrice: selection.unitPrice,
        lineTotal,
        maxQuantity: selection.maxQuantity,
        availability,
      });
    } catch (error) {
      hasUnavailableItems = true;
      items.push({
        id: String(item._id),
        product: publicProduct(product),
        variant: item.variant || {},
        quantity,
        unitPrice: null,
        lineTotal: null,
        maxQuantity: 0,
        availability: 'invalid_variant',
      });
    }
  }

  return {
    id: String(plain._id),
    revision: Number(plain.revision) || 0,
    items,
    distinctItemCount: items.length,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal,
    hasUnavailableItems,
    currency: 'INR',
    updatedAt: plain.updatedAt || null,
  };
};

module.exports = {
  assertQuantity,
  emptyCart,
  hydrateCart,
  loadValidatedProduct,
  loadValidatedBundle,
  makeError,
  resolveProductSelection,
};
