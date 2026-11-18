const mongoose = require('mongoose');
const Order = require('../models/Order');
const OrderAdjustment = require('../models/OrderAdjustment');
const { calculateTax, resolveTaxProfile, roundMoney } = require('./taxService');
const { ensureInvoiceForOrder, ensureCommercialInvoicesForOrder, supersedeInvoiceForOrder, supersedeCommercialInvoicesForOrder } = require('./invoiceService');

const PRE_FULFILLMENT_STATUSES = new Set(['pending', 'confirmed']);
const TERMINAL_STATUSES = new Set(['cancelled', 'returned']);
const ALLOWED_FIELDS = new Set(['shippingAddress', 'customerNote', 'adminNote', 'notes', 'discount', 'shippingCost']);
const ADDRESS_FIELDS = ['fullName', 'phone', 'street', 'city', 'state', 'pincode', 'country'];

const tenantIdOf = tenant => tenant?._id || tenant || null;
const tenantFilter = tenant => (tenant ? { tenant } : {});

const adjustmentError = (message, statusCode = 400, publicCode = 'ORDER_DETAILS_INVALID') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
};

const boundedText = (value, field, max, { required = false } = {}) => {
  if (value === undefined || value === null) {
    if (required) throw adjustmentError(`${field} is required`, 400, 'ORDER_ADDRESS_INVALID');
    return '';
  }
  if (typeof value !== 'string') throw adjustmentError(`${field} must be text`, 400, 'ORDER_DETAILS_INVALID');
  const normalized = value.trim();
  if (required && !normalized) throw adjustmentError(`${field} is required`, 400, 'ORDER_ADDRESS_INVALID');
  if (normalized.length > max) throw adjustmentError(`${field} is too long`, 400, 'ORDER_DETAILS_INVALID');
  return normalized;
};

const normalizeAddress = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw adjustmentError('A complete shipping address is required', 400, 'ORDER_ADDRESS_INVALID');
  }
  const address = {};
  for (const field of ADDRESS_FIELDS) {
    address[field] = boundedText(value[field], `shippingAddress.${field}`, field === 'country' ? 80 : 200, { required: field !== 'country' });
  }
  address.country = address.country || 'India';
  return address;
};

const safeMoney = (value, field, maximum = 100000) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > maximum) {
    throw adjustmentError(`${field} must be a valid non-negative amount`, 400, 'ORDER_MONEY_INVALID');
  }
  return roundMoney(number);
};

const safeSnapshotAddress = address => ADDRESS_FIELDS.reduce((result, field) => {
  result[field] = String(address?.[field] || '').trim();
  return result;
}, {});

const settlementSnapshot = subOrder => ({
  vendor: String(subOrder.vendor || ''),
  subtotal: roundMoney(subOrder.subtotal),
  discount: roundMoney(subOrder.discount),
  shippingCost: roundMoney(subOrder.shippingCost),
  tax: roundMoney(subOrder.tax),
  total: roundMoney(subOrder.total),
  commissionableAmount: roundMoney(subOrder.commissionableAmount),
  commissionAmount: roundMoney(subOrder.commissionAmount),
  vendorEarnings: roundMoney(subOrder.vendorEarnings),
  status: subOrder.status,
  paymentStatus: subOrder.paymentStatus,
});

const itemSnapshot = item => ({
  product: String(item.product || ''),
  title: String(item.title || ''),
  sku: String(item.sku || ''),
  price: roundMoney(item.price),
  costPrice: item.costPrice === null || item.costPrice === undefined ? null : roundMoney(item.costPrice),
  quantity: Number(item.quantity || 0),
  variant: item.variant || {},
  taxableAmount: roundMoney(item.taxableAmount),
  taxAmount: roundMoney(item.taxAmount),
  taxRate: roundMoney(item.taxRate),
});

const orderSnapshot = order => ({
  items: (order.items || []).map(itemSnapshot),
  shippingAddress: safeSnapshotAddress(order.shippingAddress),
  customerNote: String(order.customerNote || ''),
  adminNote: String(order.adminNote || ''),
  subtotal: roundMoney(order.subtotal),
  discount: roundMoney(order.discount),
  shippingCost: roundMoney(order.shippingCost),
  tax: roundMoney(order.tax),
  taxableAmount: roundMoney(order.taxableAmount),
  cgst: roundMoney(order.cgst),
  sgst: roundMoney(order.sgst),
  igst: roundMoney(order.igst),
  otherTax: roundMoney(order.otherTax),
  total: roundMoney(order.total),
  invoiceNumber: String(order.invoiceNumber || ''),
  taxMode: order.taxMode,
  taxRegistrationType: order.taxRegistrationType,
  gstInvoiceOwner: order.gstInvoiceOwner,
  subOrders: (order.subOrders || []).map(settlementSnapshot),
});

const updateItemTaxSnapshot = (order, taxQuote) => {
  const itemTaxLines = new Map(taxQuote.lines
    .filter(line => line.lineType === 'item')
    .map(line => [line.itemIndex, line]));
  (order.items || []).forEach((item, index) => {
    const line = itemTaxLines.get(index);
    if (!line) return;
    item.taxableAmount = line.taxableAmount;
    item.taxAmount = line.tax;
    item.taxRate = line.rate;
  });
};

const rebuildSubOrders = async (order, session, financials) => {
  // Require lazily to avoid the controller/service cycle at module load time.
  const { buildSubOrders } = require('../controllers/orderController');
  // Mongoose subdocuments expose their persisted fields through toObject(); a
  // spread of the subdocument itself would otherwise drop price/quantity and
  // silently create zero-value settlements.
  const items = (order.items || []).map(item => (typeof item.toObject === 'function' ? item.toObject() : item));
  const rebuilt = await buildSubOrders(items, session, order.tenant, financials);
  if ((order.subOrders || []).length && !rebuilt.length) {
    throw adjustmentError('Vendor settlement could not be rebuilt safely', 409, 'ORDER_SETTLEMENT_REBUILD_FAILED');
  }
  return rebuilt;
};

const updateOrderDetails = async ({ orderId, tenant, actorId, data = {}, idempotencyKey } = {}) => {
  const tenantId = tenantIdOf(tenant);
  if (!mongoose.isValidObjectId(orderId)) throw adjustmentError('Order not found', 404, 'ORDER_NOT_FOUND');
  if (!mongoose.isValidObjectId(actorId)) throw adjustmentError('A valid admin actor is required', 401, 'ORDER_ACTOR_INVALID');
  if (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length < 8 || idempotencyKey.trim().length > 128) {
    throw adjustmentError('Idempotency-Key must be between 8 and 128 characters', 400, 'ORDER_IDEMPOTENCY_REQUIRED');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw adjustmentError('Order details payload must be an object');
  }
  const unknownField = Object.keys(data).find(field => !ALLOWED_FIELDS.has(field));
  if (unknownField) throw adjustmentError(`Unsupported order detail: ${unknownField}`, 400, 'ORDER_DETAILS_FIELD_INVALID');

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const adjustmentFilter = { order: orderId, idempotencyKey: idempotencyKey.trim(), ...tenantFilter(tenantId) };
      const existing = await OrderAdjustment.findOne(adjustmentFilter).session(session);
      const order = await Order.findOne({ _id: orderId, ...tenantFilter(tenantId) }).session(session);
      if (!order) throw adjustmentError('Order not found', 404, 'ORDER_NOT_FOUND');
      if (existing) {
        result = { order, adjustment: existing, idempotent: true };
        return;
      }

      const hasAddress = data.shippingAddress !== undefined;
      const hasCustomerNote = data.customerNote !== undefined || data.notes !== undefined;
      const hasAdminNote = data.adminNote !== undefined;
      const requestedDiscount = data.discount === undefined ? roundMoney(order.discount) : safeMoney(data.discount, 'Discount', roundMoney(order.subtotal));
      const requestedShipping = data.shippingCost === undefined ? roundMoney(order.shippingCost) : safeMoney(data.shippingCost, 'Shipping charge');
      const discountChanged = requestedDiscount !== roundMoney(order.discount);
      const shippingChanged = requestedShipping !== roundMoney(order.shippingCost);
      const financeChanged = discountChanged || shippingChanged;
      const address = hasAddress ? normalizeAddress(data.shippingAddress) : safeSnapshotAddress(order.shippingAddress);
      const addressChanged = hasAddress && JSON.stringify(address) !== JSON.stringify(safeSnapshotAddress(order.shippingAddress));
      const noteChanged = hasCustomerNote || hasAdminNote;

      if (TERMINAL_STATUSES.has(order.orderStatus)) {
        throw adjustmentError('Terminal orders cannot be edited', 409, 'ORDER_EDIT_LOCKED');
      }
      if ((addressChanged || financeChanged) && !PRE_FULFILLMENT_STATUSES.has(order.orderStatus)) {
        throw adjustmentError('Address and financial edits are locked after confirmation', 409, 'ORDER_EDIT_LOCKED');
      }
      if (financeChanged && order.paymentStatus !== 'pending') {
        throw adjustmentError('Financial edits require a pending payment', 409, 'ORDER_FINANCE_LOCKED');
      }
      if (discountChanged && order.coupon) {
        throw adjustmentError('Coupon-backed discounts cannot be manually changed', 409, 'ORDER_COUPON_ADJUSTMENT_LOCKED');
      }
      if (!hasAddress && !financeChanged && !noteChanged) {
        throw adjustmentError('No order changes were supplied', 400, 'ORDER_DETAILS_EMPTY');
      }

      const before = orderSnapshot(order);
      if (hasAddress) order.shippingAddress = address;
      if (hasCustomerNote) order.customerNote = boundedText(data.customerNote !== undefined ? data.customerNote : data.notes, 'Customer note', 2000);
      if (hasAdminNote) order.adminNote = boundedText(data.adminNote, 'Admin note', 2000);

      if (financeChanged) {
        const profile = await resolveTaxProfile({ tenant: order.tenant, session });
        const profileForItem = item => order.gstInvoiceOwner === 'admin' ? profile : (item.taxProfile || profile);
        const taxQuote = calculateTax({
          items: order.items,
          discount: requestedDiscount,
          shippingCost: requestedShipping,
          shippingAddress: order.shippingAddress,
          profile,
          profileForItem,
        });
        const taxOnTop = taxQuote.taxIncluded ? 0 : taxQuote.tax;
        updateItemTaxSnapshot(order, taxQuote);
        order.discount = requestedDiscount;
        order.shippingCost = requestedShipping;
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
        order.total = roundMoney(Number(order.subtotal || 0) - requestedDiscount + requestedShipping + taxOnTop);
        if (order.subOrders?.length) {
          order.subOrders = await rebuildSubOrders(order, session, {
            discount: requestedDiscount,
            shippingCost: requestedShipping,
            tax: taxQuote.tax,
            taxForTotal: taxOnTop,
            paymentStatus: order.paymentStatus,
            orderStatus: order.orderStatus,
            coupon: order.coupon,
            couponCode: order.couponCode,
          });
        }
      }

      order.statusHistory.push({
        status: order.orderStatus,
        note: 'Admin order details updated',
        updatedBy: actorId,
        updatedAt: new Date(),
      });
      await order.save({ session });
      if (addressChanged || financeChanged) {
        await supersedeInvoiceForOrder({
          orderId: order._id,
          tenant: order.tenant || tenantId,
          reason: 'Superseded by admin order detail adjustment',
          session,
        });
        await supersedeCommercialInvoicesForOrder({ orderId: order._id, tenant: order.tenant || tenantId, reason: 'Superseded by admin order detail adjustment', session });
        await ensureInvoiceForOrder({ order, tenant: order.tenant || tenantId, source: 'admin', session });
        await ensureCommercialInvoicesForOrder({ order, tenant: order.tenant || tenantId, source: 'admin', session });
        await order.save({ session });
      }
      const after = orderSnapshot(order);
      const [adjustment] = await OrderAdjustment.create([{
        tenant: order.tenant || tenantId || undefined,
        order: order._id,
        actor: actorId,
        idempotencyKey: idempotencyKey.trim(),
        type: 'details',
        changes: {
          ...(hasAddress ? { shippingAddress: true } : {}),
          ...(hasCustomerNote ? { customerNote: true } : {}),
          ...(hasAdminNote ? { adminNote: true } : {}),
          ...(discountChanged ? { discount: requestedDiscount } : {}),
          ...(shippingChanged ? { shippingCost: requestedShipping } : {}),
        },
        before,
        after,
      }], { session });
      result = { order, adjustment, idempotent: false };
    });
  } catch (error) {
    // A concurrent request may win the unique adjustment key. Treat that
    // exact replay as idempotent after the transaction has been aborted.
    if (error?.code === 11000) {
      const existing = await OrderAdjustment.findOne({ order: orderId, idempotencyKey: idempotencyKey.trim(), ...tenantFilter(tenantId) });
      const order = await Order.findOne({ _id: orderId, ...tenantFilter(tenantId) });
      if (existing && order) return { order, adjustment: existing, idempotent: true };
    }
    throw error;
  } finally {
    await session.endSession();
  }
  return result;
};

module.exports = {
  PRE_FULFILLMENT_STATUSES,
  updateOrderDetails,
  orderSnapshot,
};
