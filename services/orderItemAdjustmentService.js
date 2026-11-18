const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const OrderAdjustment = require('../models/OrderAdjustment');
const inventoryReservationService = require('./inventoryReservationService');
const { calculateTax, resolveTaxProfile, roundMoney } = require('./taxService');
const { quoteShipping } = require('./shipping/quoteService');
const { ensureInvoiceForOrder, ensureCommercialInvoicesForOrder, supersedeInvoiceForOrder, supersedeCommercialInvoicesForOrder } = require('./invoiceService');
const { orderSnapshot } = require('./orderAdjustmentService');
const { resolveBulkOrderPrice } = require('../utils/bulkOrder');

const PRE_FULFILLMENT_STATUSES = new Set(['pending', 'confirmed']);
const TENANT_TENDER_FIELDS = ['walletAmount', 'loyaltyAmount', 'giftCardAmount'];

const tenantIdOf = tenant => tenant?._id || tenant || null;
const tenantFilter = tenant => tenant ? { tenant } : {};
const errorWith = (message, statusCode = 400, publicCode = 'ORDER_ITEM_ADJUSTMENT_INVALID') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
};

const plainObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const normalizedVariant = value => Object.entries(plainObject(value)).reduce((result, [name, option]) => {
  const key = String(name || '').trim();
  const selected = String(option ?? '').trim();
  if (key) result[key] = selected;
  return result;
}, {});
const variantKey = value => JSON.stringify(Object.entries(normalizedVariant(value)).sort(([left], [right]) => left.localeCompare(right)));
const itemKey = item => `${String(item.product)}:${variantKey(item.variant)}`;
const safeNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;

const validateVariant = (product, inputVariant) => {
  const variant = normalizedVariant(inputVariant);
  const definitions = Array.isArray(product.variants) ? product.variants : [];
  if (!definitions.length) {
    if (Object.keys(variant).length) throw errorWith(`Product ${product.title} does not accept variants`, 400, 'ORDER_ITEM_VARIANT_INVALID');
    return { variant, selectedOptions: [] };
  }
  const allowedNames = new Set(definitions.map(definition => String(definition.name)));
  if (Object.keys(variant).some(name => !allowedNames.has(name))) {
    throw errorWith(`Variant selection is invalid for ${product.title}`, 400, 'ORDER_ITEM_VARIANT_INVALID');
  }
  const selectedOptions = definitions.map(definition => definition.options?.find(option => String(option.value) === variant[String(definition.name)]));
  if (selectedOptions.some(option => !option)) {
    throw errorWith(`Select all variants for ${product.title}`, 400, 'ORDER_ITEM_VARIANT_REQUIRED');
  }
  return { variant, selectedOptions };
};

const liveProductItem = ({ product, quantity, variantInput, existing }) => {
  const quantityNumber = Number(quantity);
  if (!Number.isInteger(quantityNumber) || quantityNumber < 1 || quantityNumber > 100) {
    throw errorWith('Each order item quantity must be an integer between 1 and 100', 400, 'ORDER_ITEM_QUANTITY_INVALID');
  }
  const { variant, selectedOptions } = validateVariant(product, variantInput);
  const pricedOption = [...selectedOptions].reverse().find(option => option.price !== undefined && option.price !== null);
  const livePrice = pricedOption
    ? Number(pricedOption.price)
    : Number(product.price || 0) + selectedOptions.reduce((sum, option) => sum + Number(option.priceModifier || 0), 0);
  if (!Number.isFinite(livePrice) || livePrice < 0) throw errorWith(`Product ${product.title} has an invalid price`, 409, 'ORDER_ITEM_PRODUCT_INVALID');

  // Existing lines keep the committed unit price and cost snapshot. New lines
  // use the current tenant product price/cost; the browser never supplies
  // either value.
  const effectivePrice = resolveBulkOrderPrice(product, quantityNumber, livePrice);
  const vendorTaxProfile = product.vendor?.taxProfile
    ? { ...(product.vendor.taxProfile.toObject?.() || product.vendor.taxProfile), businessName: product.vendor.taxProfile.businessName || product.vendor.storeName || '' }
    : undefined;
  return {
    product: product._id,
    title: existing?.title || product.title,
    image: existing?.image || selectedOptions.slice().reverse().find(option => option.images?.length)?.images?.[0]?.url || product.thumbnail || product.images?.[0]?.url || '',
    price: existing ? roundMoney(existing.price) : roundMoney(effectivePrice),
    costPrice: existing?.costPrice !== undefined && existing?.costPrice !== null ? roundMoney(existing.costPrice) : Math.max(0, safeNumber(product.costPrice)),
    costPriceCaptured: existing?.costPriceCaptured !== undefined ? Boolean(existing.costPriceCaptured) : true,
    quantity: quantityNumber,
    sku: existing?.sku || product.sku || '',
    hsnCode: existing?.hsnCode || product.hsnCode || '',
    taxRate: existing?.taxRate !== undefined && existing?.taxRate !== null
      ? Number(existing.taxRate)
      : (product.gstRate === null || product.gstRate === undefined ? undefined : Number(product.gstRate)),
    taxProfile: existing?.taxProfile || vendorTaxProfile || null,
    variant,
  };
};

const loadProduct = async ({ productId, tenant, existing, session }) => {
  if (!mongoose.isValidObjectId(productId)) throw errorWith('Invalid product id', 400, 'ORDER_ITEM_PRODUCT_INVALID');
  const query = { _id: productId, ...tenantFilter(tenant) };
  if (!existing) query.isActive = true;
  const product = await Product.findOne(query).populate('vendor', 'taxProfile storeName').session(session);
  if (!product) throw errorWith('Product is not available in this store', 404, 'ORDER_ITEM_PRODUCT_NOT_FOUND');
  return product;
};

const changedSummary = (beforeItems, afterItems) => {
  const before = new Map(beforeItems.map(item => [itemKey(item), item]));
  const after = new Map(afterItems.map(item => [itemKey(item), item]));
  const added = [];
  const removed = [];
  const changed = [];
  for (const [key, oldItem] of before.entries()) {
    if (!after.has(key)) removed.push({ product: String(oldItem.product), title: oldItem.title, quantity: oldItem.quantity });
    else if (Number(after.get(key).quantity) !== Number(oldItem.quantity)) changed.push({ product: String(oldItem.product), title: oldItem.title, from: oldItem.quantity, to: after.get(key).quantity });
  }
  for (const [key, nextItem] of after.entries()) {
    if (!before.has(key)) added.push({ product: String(nextItem.product), title: nextItem.title, quantity: nextItem.quantity });
  }
  return { added, removed, changed };
};

const updateTaxFields = (order, taxQuote) => {
  const itemTaxLines = new Map(taxQuote.lines.filter(line => line.lineType === 'item').map(line => [line.itemIndex, line]));
  (order.items || []).forEach((item, index) => {
    const line = itemTaxLines.get(index);
    if (!line) return;
    item.taxableAmount = line.taxableAmount;
    item.taxAmount = line.tax;
    item.taxRate = line.rate;
  });
};

const rebuildSubOrders = async (order, session, taxQuote) => {
  if (!order.subOrders?.length) return;
  const { buildSubOrders } = require('../controllers/orderController');
  const items = (order.items || []).map(item => (typeof item.toObject === 'function' ? item.toObject() : item));
  const rebuilt = await buildSubOrders(items, session, order.tenant, {
    discount: order.discount,
    shippingCost: order.shippingCost,
    tax: taxQuote.tax,
    taxForTotal: taxQuote.taxIncluded ? 0 : taxQuote.tax,
    paymentStatus: order.paymentStatus,
    orderStatus: order.orderStatus,
    coupon: order.coupon,
    couponCode: order.couponCode,
  });
  if (!rebuilt.length) throw errorWith('Vendor settlement could not be rebuilt safely', 409, 'ORDER_SETTLEMENT_REBUILD_FAILED');
  order.subOrders = rebuilt;
};

const updateOrderItems = async ({ orderId, tenant, actorId, data = {}, idempotencyKey } = {}) => {
  const tenantId = tenantIdOf(tenant);
  if (!mongoose.isValidObjectId(orderId)) throw errorWith('Order not found', 404, 'ORDER_NOT_FOUND');
  if (!mongoose.isValidObjectId(actorId)) throw errorWith('A valid admin actor is required', 401, 'ORDER_ACTOR_INVALID');
  const key = String(idempotencyKey || '').trim();
  if (key.length < 8 || key.length > 128) throw errorWith('Idempotency-Key must be between 8 and 128 characters', 400, 'ORDER_IDEMPOTENCY_REQUIRED');
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.items)) throw errorWith('Order items must be supplied as an array', 400, 'ORDER_ITEMS_REQUIRED');
  if (data.items.length < 1 || data.items.length > 50) throw errorWith('Order must contain between 1 and 50 items', 400, 'ORDER_ITEMS_INVALID');

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const adjustment = await OrderAdjustment.findOne({ order: orderId, idempotencyKey: key, ...tenantFilter(tenantId) }).session(session);
      const order = await Order.findOne({ _id: orderId, ...tenantFilter(tenantId) }).session(session);
      if (!order) throw errorWith('Order not found', 404, 'ORDER_NOT_FOUND');
      if (adjustment) {
        if (adjustment.type !== 'items') throw errorWith('Idempotency key was already used for another order adjustment', 409, 'ORDER_IDEMPOTENCY_CONFLICT');
        result = { order, adjustment, idempotent: true };
        return;
      }
      if (!PRE_FULFILLMENT_STATUSES.has(order.orderStatus)) throw errorWith('Order items cannot be edited after fulfilment starts', 409, 'ORDER_EDIT_LOCKED');
      if (order.paymentStatus !== 'pending') throw errorWith('Order item edits require a pending payment', 409, 'ORDER_FINANCE_LOCKED');
      if (order.coupon) throw errorWith('Coupon-backed orders cannot change their item set', 409, 'ORDER_COUPON_ITEM_LOCKED');
      if (order.shippingCreationLock || order.shiprocketOrderId || order.shiprocketShipmentId || order.awbCode) throw errorWith('Order items are locked after shipping preparation', 409, 'ORDER_SHIPPING_LOCKED');
      if (TENANT_TENDER_FIELDS.some(field => safeNumber(order[field]) > 0) || ['debited', 'captured', 'partially_refunded'].some(status => [order.walletSettlementStatus, order.loyaltySettlementStatus, order.giftCardSettlementStatus].includes(status))) {
        throw errorWith('Stored-tender orders must be settled before item edits', 409, 'ORDER_ITEM_TENDER_LOCKED');
      }

      const beforeItems = (order.items || []).map(item => (typeof item.toObject === 'function' ? item.toObject() : item));
      const before = orderSnapshot(order);
      const existingByKey = new Map(beforeItems.map(item => [itemKey(item), item]));
      const afterItems = [];
      const productByKey = new Map();
      for (const input of data.items) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw errorWith('Each order item must be an object', 400, 'ORDER_ITEM_INVALID');
        const allowed = new Set(['product', 'productId', 'quantity', 'variant']);
        const unknown = Object.keys(input).find(field => !allowed.has(field));
        if (unknown) throw errorWith(`Unsupported order item field: ${unknown}`, 400, 'ORDER_ITEM_FIELD_INVALID');
        const productId = input.product || input.productId;
        const provisionalKey = `${String(productId || '')}:${variantKey(input.variant)}`;
        if (productByKey.has(provisionalKey)) throw errorWith('Duplicate product/variant in order items', 400, 'ORDER_ITEM_DUPLICATE');
        const existing = existingByKey.get(provisionalKey);
        const product = await loadProduct({ productId, tenant: tenantId, existing, session });
        const item = liveProductItem({ product, quantity: input.quantity, variantInput: input.variant, existing });
        const keyForItem = itemKey(item);
        if (productByKey.has(keyForItem)) throw errorWith('Duplicate product/variant in order items', 400, 'ORDER_ITEM_DUPLICATE');
        productByKey.set(provisionalKey, product);
        productByKey.set(keyForItem, product);
        afterItems.push(item);
      }

      const summary = changedSummary(beforeItems, afterItems);
      if (!summary.added.length && !summary.removed.length && !summary.changed.length) throw errorWith('No order item changes were supplied', 400, 'ORDER_ITEM_EDIT_EMPTY');

      const profile = await resolveTaxProfile({ tenant: order.tenant, session });
      const subtotal = roundMoney(afterItems.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0));
      const discount = roundMoney(Math.min(Math.max(0, safeNumber(order.discount)), subtotal));
      const shippingWeight = afterItems.reduce((sum, item) => {
        const product = productByKey.get(itemKey(item));
        const weight = safeNumber(product?.weight);
        return sum + (weight > 0 ? weight : 0.5) * Number(item.quantity || 0);
      }, 0);
      const shippingQuote = await quoteShipping({
        tenantId: order.tenant,
        shippingAddress: order.shippingAddress,
        subtotal,
        discount,
        weight: shippingWeight,
        paymentMethod: order.paymentMethod,
        session,
      });
      const profileForItem = item => order.gstInvoiceOwner === 'admin' ? profile : (item.taxProfile || profile);
      const taxQuote = calculateTax({ items: afterItems, discount, shippingCost: shippingQuote.shippingCost, shippingAddress: order.shippingAddress, profile, profileForItem });
      const taxOnTop = taxQuote.taxIncluded ? 0 : taxQuote.tax;
      order.items = afterItems;
      updateTaxFields(order, taxQuote);
      order.subtotal = subtotal;
      order.discount = discount;
      order.shippingCost = roundMoney(shippingQuote.shippingCost);
      order.shippingQuote = shippingQuote;
      order.shippingMethod = shippingQuote.shippingMethod || 'standard';
      order.estimatedDelivery = new Date(Date.now() + Number(shippingQuote.estimatedMaxDays || 7) * 24 * 60 * 60 * 1000);
      order.tax = roundMoney(taxQuote.tax);
      order.taxableAmount = roundMoney(taxQuote.taxableAmount);
      order.cgst = roundMoney(taxQuote.cgst);
      order.sgst = roundMoney(taxQuote.sgst);
      order.igst = roundMoney(taxQuote.igst);
      order.otherTax = roundMoney(taxQuote.otherTax);
      order.taxMode = taxQuote.pricingMode;
      order.taxRegistrationType = taxQuote.registrationType;
      order.taxProfile = taxQuote.profileId || undefined;
      order.taxBreakdown = taxQuote.lines;
      order.sellerGstin = taxQuote.sellerGstin || undefined;
      order.sellerState = taxQuote.originState || undefined;
      order.taxBusinessName = taxQuote.businessName || undefined;
      order.taxBusinessAddress = taxQuote.businessAddress || {};
      order.invoiceNote = taxQuote.invoiceNote || '';
      order.total = roundMoney(subtotal - discount + shippingQuote.shippingCost + taxOnTop);
      order.externalPaymentAmount = order.total;
      await inventoryReservationService.reconcileOrderItems({ order, beforeItems, afterItems, session, idempotencyKey: key });
      await rebuildSubOrders(order, session, taxQuote);

      order.statusHistory.push({ status: order.orderStatus, note: 'Admin order items updated', updatedBy: actorId, updatedAt: new Date() });
      await order.save({ session });
      await supersedeInvoiceForOrder({ orderId: order._id, tenant: order.tenant || tenantId, reason: 'Superseded by admin order item adjustment', session });
      await supersedeCommercialInvoicesForOrder({ orderId: order._id, tenant: order.tenant || tenantId, reason: 'Superseded by admin order item adjustment', session });
      await ensureInvoiceForOrder({ order, tenant: order.tenant || tenantId, source: 'admin', session });
      await ensureCommercialInvoicesForOrder({ order, tenant: order.tenant || tenantId, source: 'admin', session });
      await order.save({ session });
      const after = orderSnapshot(order);
      const [createdAdjustment] = await OrderAdjustment.create([{
        tenant: order.tenant || tenantId || undefined,
        order: order._id,
        actor: actorId,
        idempotencyKey: key,
        type: 'items',
        changes: { ...summary, subtotal: order.subtotal, discount: order.discount, shippingCost: order.shippingCost, total: order.total },
        before,
        after,
      }], { session });
      result = { order, adjustment: createdAdjustment, idempotent: false };
    });
  } catch (error) {
    if (error?.code === 11000) {
      const existing = await OrderAdjustment.findOne({ order: orderId, idempotencyKey: key, ...tenantFilter(tenantId) });
      const order = await Order.findOne({ _id: orderId, ...tenantFilter(tenantId) });
      if (existing?.type === 'items' && order) return { order, adjustment: existing, idempotent: true };
    }
    throw error;
  } finally {
    await session.endSession();
  }
  return result;
};

module.exports = { updateOrderItems, errorWith };
