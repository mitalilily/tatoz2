const mongoose = require('mongoose');
const Product = require('../models/Product');
const Order = require('../models/Order');
const InventoryReservation = require('../models/InventoryReservation');
const InventoryMovement = require('../models/InventoryMovement');

const makeError = (message, statusCode = 409, publicCode = 'INVENTORY_RESERVATION_ERROR') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
};

const number = value => Math.max(0, Number(value) || 0);
const variantObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const variantKey = value => JSON.stringify(Object.entries(variantObject(value)).sort(([left], [right]) => left.localeCompare(right)));
const tenantFilter = tenant => tenant ? { tenant } : {};

const modeConfig = Object.freeze({
  reserve: {
    productDelta: quantity => ({ stock: -quantity, reservedStock: quantity }),
    variantDelta: quantity => ({ stock: -quantity, reservedStock: quantity }),
    productFilter: quantity => ({ stock: { $gte: quantity } }),
    variantFilter: quantity => ({ stock: { $gte: quantity } }),
    movement: 'reserve',
  },
  sale: {
    productDelta: quantity => ({ stock: -quantity, soldStock: quantity, totalSales: quantity }),
    variantDelta: quantity => ({ stock: -quantity, soldStock: quantity }),
    productFilter: quantity => ({ stock: { $gte: quantity } }),
    variantFilter: quantity => ({ stock: { $gte: quantity } }),
    movement: 'sale',
  },
  convert: {
    productDelta: quantity => ({ reservedStock: -quantity, soldStock: quantity, totalSales: quantity }),
    variantDelta: quantity => ({ reservedStock: -quantity, soldStock: quantity }),
    productFilter: quantity => ({ reservedStock: { $gte: quantity } }),
    variantFilter: quantity => ({ reservedStock: { $gte: quantity } }),
    movement: 'convert',
  },
  release: {
    productDelta: quantity => ({ stock: quantity, reservedStock: -quantity }),
    variantDelta: quantity => ({ stock: quantity, reservedStock: -quantity }),
    productFilter: quantity => ({ reservedStock: { $gte: quantity } }),
    variantFilter: quantity => ({ reservedStock: { $gte: quantity } }),
    movement: 'release',
  },
  restock: {
    productDelta: quantity => ({ stock: quantity, soldStock: -quantity, totalSales: -quantity }),
    variantDelta: quantity => ({ stock: quantity, soldStock: -quantity }),
    productFilter: quantity => ({ soldStock: { $gte: quantity } }),
    variantFilter: quantity => ({ soldStock: { $gte: quantity } }),
    movement: 'restock',
  },
});

const assertMode = mode => {
  if (!modeConfig[mode]) throw makeError(`Unsupported inventory allocation mode: ${mode}`, 400, 'INVENTORY_MODE_INVALID');
  return modeConfig[mode];
};

const inventoryItem = item => ({
  product: item.product,
  quantity: Number(item.quantity),
  variant: variantObject(item.variant),
  variantKey: variantKey(item.variant),
  unitPrice: number(item.price),
  freeReward: Boolean(item.freeReward),
  title: String(item.title || ''),
  sku: String(item.sku || ''),
});

const applyProductInventory = async ({ item, mode, tenant, session }) => {
  const config = assertMode(mode);
  const quantity = Number(item.quantity);
  if (!mongoose.isValidObjectId(item.product) || !Number.isInteger(quantity) || quantity < 1) {
    throw makeError('Invalid inventory line', 400, 'INVENTORY_LINE_INVALID');
  }

  const filter = { _id: item.product, ...tenantFilter(tenant), ...config.productFilter(quantity) };
  const updated = await Product.findOneAndUpdate(filter, { $inc: config.productDelta(quantity) }, { new: true, session });
  if (!updated) throw makeError(`Inventory changed; ${item.title || 'product'} is no longer available`, 409, 'INVENTORY_STOCK_CONFLICT');

  const variant = variantObject(item.variant);
  for (const [name, value] of Object.entries(variant)) {
    const optionValue = String(value);
    const variantFilter = {
      _id: item.product,
      ...tenantFilter(tenant),
      variants: { $elemMatch: { name, options: { $elemMatch: { value: optionValue, ...config.variantFilter(quantity) } } } },
    };
    const variantUpdated = await Product.findOneAndUpdate(
      variantFilter,
      { $inc: Object.fromEntries(Object.entries(config.variantDelta(quantity)).map(([key, delta]) => [`variants.$[variant].options.$[option].${key}`, delta])) },
      {
        new: true,
        session,
        arrayFilters: [{ 'variant.name': name }, { 'option.value': optionValue, ...Object.fromEntries(Object.entries(config.variantFilter(quantity)).map(([key, valueFilter]) => [`option.${key}`, valueFilter])) }],
      },
    );
    if (!variantUpdated) throw makeError(`Variant inventory changed; ${item.title || 'product'} is no longer available`, 409, 'INVENTORY_VARIANT_CONFLICT');
  }

  const after = {
    available: number(updated.stock),
    reserved: number(updated.reservedStock),
    sold: number(updated.soldStock),
  };
  const before = {
    available: after.available - Number(config.productDelta(quantity).stock || 0),
    reserved: after.reserved - Number(config.productDelta(quantity).reservedStock || 0),
    sold: after.sold - Number(config.productDelta(quantity).soldStock || 0),
  };
  return { before, after };
};

const recordMovement = async ({ order, reservation, item, mode, reason, before, after, session, movementIdempotencyKey }) => {
  const config = assertMode(mode);
  await InventoryMovement.create([{
    tenant: order.tenant,
    product: item.product,
    order: order._id,
    reservation: reservation?._id || reservation,
    type: config.movement,
    quantity: item.quantity,
    variant: item.variant,
    variantKey: item.variantKey,
    availableBefore: before.available,
    availableAfter: after.available,
    reservedBefore: before.reserved,
    reservedAfter: after.reserved,
    soldBefore: before.sold,
    soldAfter: after.sold,
    reason,
    idempotencyKey: movementIdempotencyKey || `inventory:${order._id}:${item.product}:${item.variantKey}:${config.movement}`,
  }], { session });
};

const reservationForOrder = async (orderId, session) => InventoryReservation.findOne({ order: orderId }).session(session || null);

const allocationForOrder = async ({ order, mode = 'reserve', session, reason = '' }) => {
  if (!order?._id || !order?.user) throw makeError('Order context is required', 400, 'INVENTORY_ORDER_INVALID');
  const config = assertMode(mode);
  if (mode === 'reserve') {
    const existing = await reservationForOrder(order._id, session);
    if (existing) {
      if (existing.status === 'active') return { reservation: existing, idempotent: true };
      throw makeError(`Inventory reservation is already ${existing.status}`, 409, 'INVENTORY_RESERVATION_NOT_ACTIVE');
    }
  }

  const items = (order.inventoryItems?.length ? order.inventoryItems : order.items || []).map(inventoryItem);
  if (!items.length) throw makeError('Order has no inventory items', 400, 'INVENTORY_ORDER_EMPTY');

  const movements = [];
  for (const item of items) {
    const transition = await applyProductInventory({ item, mode, tenant: order.tenant, session });
    movements.push({ item, transition });
  }

  let reservation = null;
  if (mode === 'reserve') {
    const reservationMinutes = Math.max(1, Number(process.env.INVENTORY_RESERVATION_MINUTES) || 15);
    const created = await InventoryReservation.create([{
      tenant: order.tenant,
      order: order._id,
      user: order.user,
      status: 'active',
      items,
      expiresAt: new Date(Date.now() + reservationMinutes * 60 * 1000),
    }], { session });
    reservation = created[0];
  }

  for (const movement of movements) {
    await recordMovement({ order, reservation, item: movement.item, mode, reason, ...movement.transition, session });
  }

  await Order.updateOne(
    { _id: order._id },
    { $set: { inventoryStatus: mode === 'reserve' ? 'reserved' : 'sold', ...(reservation ? { inventoryReservation: reservation._id } : {}) } },
    { session },
  );
  return { reservation, idempotent: false, status: mode === 'reserve' ? 'active' : 'sold' };
};

const transitionReservation = async ({ orderId, reservationId, mode, reason = '', session }) => {
  assertMode(mode);
  const terminalStatus = mode === 'convert' ? 'converted' : 'released';
  const order = await Order.findById(orderId).session(session || null);
  if (!order) throw makeError('Order not found for inventory transition', 404, 'INVENTORY_ORDER_NOT_FOUND');
  if (order.inventoryStatus !== 'reserved') return { idempotent: true, status: order.inventoryStatus || 'legacy' };

  const reservation = await InventoryReservation.findOne({ _id: reservationId || order.inventoryReservation || undefined, order: order._id }).session(session || null);
  if (!reservation) throw makeError('Active inventory reservation is missing', 409, 'INVENTORY_RESERVATION_MISSING');
  if (reservation.status === terminalStatus) return { idempotent: true, status: reservation.status };
  if (reservation.status !== 'active') throw makeError(`Inventory reservation is already ${reservation.status}`, 409, 'INVENTORY_RESERVATION_NOT_ACTIVE');

  for (const item of reservation.items) {
    const plainItem = item.toObject ? item.toObject() : item;
    const transition = await applyProductInventory({ item: plainItem, mode, tenant: order.tenant, session });
    await recordMovement({ order, reservation, item: plainItem, mode, reason, ...transition, session });
  }

  const nextStatus = terminalStatus;
  reservation.status = nextStatus;
  if (nextStatus === 'converted') reservation.convertedAt = new Date();
  else { reservation.releasedAt = new Date(); reservation.releaseReason = reason; }
  await reservation.save({ session });
  await Order.updateOne({ _id: order._id, inventoryStatus: 'reserved' }, { $set: { inventoryStatus: nextStatus } }, { session });
  return { idempotent: false, status: nextStatus, reservation };
};

const convertReservation = args => transitionReservation({ ...args, mode: 'convert' });
const releaseReservation = args => transitionReservation({ ...args, mode: 'release' });

const restockSoldOrder = async ({ order, session, reason = 'order_cancelled' }) => {
  if (!order?._id) throw makeError('Order context is required', 400, 'INVENTORY_ORDER_INVALID');
  if (!['sold', 'converted'].includes(order.inventoryStatus)) return { idempotent: true, status: order.inventoryStatus || 'legacy' };
  const items = (order.inventoryItems?.length ? order.inventoryItems : order.items || []).map(inventoryItem);
  for (const item of items) {
    const transition = await applyProductInventory({ item, mode: 'restock', tenant: order.tenant, session });
    await recordMovement({ order, item, mode: 'restock', reason, ...transition, session });
  }
  await Order.updateOne({ _id: order._id, inventoryStatus: { $in: ['sold', 'converted'] } }, { $set: { inventoryStatus: 'released' } }, { session });
  return { idempotent: false, status: 'released' };
};

const itemKey = item => `${String(item.product)}:${variantKey(item.variant)}`;

// Reconcile the stock allocation for an order whose line quantities or
// variants are being edited. The negative deltas run first so a variant swap
// can release inventory before the replacement consumes it. Every movement
// receives the order-adjustment idempotency key, so repeated edits cannot hit
// the global InventoryMovement unique key for the original checkout.
const reconcileOrderItems = async ({ order, beforeItems = [], afterItems = [], session, reason = 'admin_order_item_adjustment', idempotencyKey } = {}) => {
  if (!order?._id) throw makeError('Order context is required', 400, 'INVENTORY_ORDER_INVALID');
  if (!['reserved', 'sold', 'converted'].includes(order.inventoryStatus)) {
    throw makeError('This order has no safe inventory allocation to edit', 409, 'INVENTORY_ITEM_EDIT_UNSUPPORTED');
  }
  const before = new Map(beforeItems.map(item => [itemKey(item), inventoryItem(item)]));
  const after = new Map(afterItems.map(item => [itemKey(item), inventoryItem(item)]));
  const changes = [];
  for (const [key, oldItem] of before.entries()) {
    const nextItem = after.get(key);
    const delta = Number(nextItem?.quantity || 0) - Number(oldItem.quantity || 0);
    if (delta < 0) changes.push({ item: { ...oldItem, quantity: Math.abs(delta) }, delta, direction: 'remove', key });
  }
  for (const [key, nextItem] of after.entries()) {
    const oldItem = before.get(key);
    const delta = Number(nextItem.quantity || 0) - Number(oldItem?.quantity || 0);
    if (delta > 0) changes.push({ item: { ...nextItem, quantity: delta }, delta, direction: 'add', key });
  }
  if (!changes.length) throw makeError('No order item changes were supplied', 400, 'INVENTORY_ITEM_EDIT_EMPTY');

  let reservation = null;
  if (order.inventoryStatus === 'reserved') {
    reservation = await InventoryReservation.findOne({ _id: order.inventoryReservation, order: order._id, ...tenantFilter(order.tenant) }).session(session || null);
    if (!reservation || reservation.status !== 'active') throw makeError('Active inventory reservation is missing', 409, 'INVENTORY_RESERVATION_MISSING');
    if (reservation.expiresAt <= new Date()) throw makeError('Inventory reservation has expired; create a new order', 409, 'INVENTORY_RESERVATION_EXPIRED');
  }

  const modeFor = direction => {
    if (order.inventoryStatus === 'reserved') return direction === 'add' ? 'reserve' : 'release';
    return direction === 'add' ? 'sale' : 'restock';
  };
  const movementKeyBase = String(idempotencyKey || `${Date.now()}`).slice(0, 96);
  for (const [index, change] of changes.entries()) {
    const mode = modeFor(change.direction);
    const transition = await applyProductInventory({ item: change.item, mode, tenant: order.tenant, session });
    await recordMovement({
      order,
      reservation,
      item: change.item,
      mode,
      reason,
      ...transition,
      session,
      movementIdempotencyKey: `inventory:${order._id}:items:${movementKeyBase}:${index}`,
    });
  }

  if (reservation) {
    reservation.items = afterItems.map(inventoryItem);
    await reservation.save({ session });
  }
  return { reservation, changes: changes.length, status: order.inventoryStatus };
};

const assertReservationActive = async ({ orderId, session }) => {
  const order = await Order.findById(orderId).select('inventoryStatus inventoryReservation').session(session || null);
  if (!order) throw makeError('Order not found', 404, 'ORDER_NOT_FOUND');
  if (order.inventoryStatus !== 'reserved') return { order, reservation: null, legacy: true };
  const reservation = await InventoryReservation.findOne({ _id: order.inventoryReservation, order: order._id }).session(session || null);
  if (!reservation) throw makeError('Active inventory reservation is missing', 409, 'INVENTORY_RESERVATION_MISSING');
  if (reservation.status !== 'active') throw makeError(`Inventory reservation is ${reservation.status}`, 409, 'INVENTORY_RESERVATION_NOT_ACTIVE');
  if (reservation.expiresAt <= new Date()) throw makeError('Inventory reservation has expired; create a new order', 409, 'INVENTORY_RESERVATION_EXPIRED');
  return { order, reservation, legacy: false };
};

const releaseExpiredReservations = async ({ limit = 100, now = new Date() } = {}) => {
  const candidates = await InventoryReservation.find({ status: 'active', expiresAt: { $lte: now } }).sort({ expiresAt: 1 }).limit(limit).select('_id order').lean();
  let released = 0;
  for (const candidate of candidates) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const result = await releaseReservation({ orderId: candidate.order, reservationId: candidate._id, reason: 'expired', session });
        if (!result.idempotent) released += 1;
      });
    } finally {
      await session.endSession();
    }
  }
  return { scanned: candidates.length, released };
};

module.exports = {
  allocationForOrder,
  assertReservationActive,
  convertReservation,
  releaseExpiredReservations,
  releaseReservation,
  reconcileOrderItems,
  restockSoldOrder,
  makeError,
};
