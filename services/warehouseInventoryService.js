const crypto = require('crypto');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Warehouse = require('../models/Warehouse');
const WarehouseInventory = require('../models/WarehouseInventory');
const StockTransfer = require('../models/StockTransfer');

const idOf = value => value?._id || value?.id || value;
const tenantIdOf = value => idOf(value?.tenant || value);
const errorWith = (message, statusCode = 400, publicCode = 'WAREHOUSE_OPERATION_INVALID') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
};
const requireTenant = value => {
  const tenant = tenantIdOf(value);
  if (!tenant || !mongoose.isValidObjectId(tenant)) throw errorWith('Tenant context is required', 400, 'TENANT_REQUIRED');
  return tenant;
};
const text = value => String(value ?? '').trim();
const code = value => {
  const normalized = text(value).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(normalized)) throw errorWith('Warehouse code must be 2-40 letters, numbers, hyphens or underscores');
  return normalized;
};
const positiveInteger = (value, label) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 1000000000) throw errorWith(`${label} must be a positive whole number`);
  return number;
};
const nonNegativeInteger = (value, label) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 1000000000) throw errorWith(`${label} must be a non-negative whole number`);
  return number;
};
const runTransaction = async work => {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => { result = await work(session); });
    return result;
  } finally {
    await session.endSession();
  }
};
const transferNumber = () => `WT-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

const createWarehouse = async ({ tenant, data = {}, actor } = {}) => {
  const tenantId = requireTenant(tenant);
  const name = text(data.name);
  if (!name || name.length > 120) throw errorWith('Warehouse name is required and must be at most 120 characters');
  const document = await Warehouse.create({
    tenant: tenantId,
    code: code(data.code || name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40)),
    name,
    address: data.address && typeof data.address === 'object' ? data.address : {},
    priority: nonNegativeInteger(data.priority ?? 0, 'Warehouse priority'),
    isActive: data.isActive !== false && data.isActive !== 'false',
    manager: data.manager && mongoose.isValidObjectId(data.manager) ? data.manager : null,
    createdBy: idOf(actor) || null,
  });
  return document.toObject();
};

const updateWarehouse = async ({ tenant, warehouseId, data = {} } = {}) => {
  const tenantId = requireTenant(tenant);
  if (!mongoose.isValidObjectId(warehouseId)) throw errorWith('Warehouse identifier is invalid', 400, 'WAREHOUSE_NOT_FOUND');
  const warehouse = await Warehouse.findOne({ _id: warehouseId, tenant: tenantId });
  if (!warehouse) throw errorWith('Warehouse not found', 404, 'WAREHOUSE_NOT_FOUND');
  if (data.name !== undefined) {
    const name = text(data.name);
    if (!name || name.length > 120) throw errorWith('Warehouse name is invalid');
    warehouse.name = name;
  }
  if (data.code !== undefined) warehouse.code = code(data.code);
  if (data.priority !== undefined) warehouse.priority = nonNegativeInteger(data.priority, 'Warehouse priority');
  if (data.isActive !== undefined) warehouse.isActive = data.isActive !== false && data.isActive !== 'false';
  if (data.address !== undefined && data.address && typeof data.address === 'object') warehouse.address = data.address;
  if (data.manager !== undefined) warehouse.manager = data.manager && mongoose.isValidObjectId(data.manager) ? data.manager : null;
  await warehouse.save();
  return warehouse.toObject();
};

const listWarehouses = async ({ tenant, includeInactive = true } = {}) => {
  const tenantId = requireTenant(tenant);
  const filter = { tenant: tenantId };
  if (!includeInactive) filter.isActive = true;
  return Warehouse.find(filter).sort({ isActive: -1, priority: -1, name: 1 }).lean();
};

const assertWarehouse = async ({ tenantId, warehouseId, session, allowInactive = false }) => {
  if (!mongoose.isValidObjectId(warehouseId)) throw errorWith('Warehouse identifier is invalid', 400, 'WAREHOUSE_NOT_FOUND');
  const filter = { _id: warehouseId, tenant: tenantId };
  if (!allowInactive) filter.isActive = true;
  const warehouse = await Warehouse.findOne(filter).session(session || null).lean();
  if (!warehouse) throw errorWith('Warehouse not found or inactive', 404, 'WAREHOUSE_NOT_FOUND');
  return warehouse;
};

const assertProduct = async ({ tenantId, productId, session }) => {
  if (!mongoose.isValidObjectId(productId)) throw errorWith('Product identifier is invalid', 400, 'PRODUCT_NOT_FOUND');
  const product = await Product.findOne({ _id: productId, tenant: tenantId }).session(session || null).lean();
  if (!product) throw errorWith('Product not found for this tenant', 404, 'PRODUCT_NOT_FOUND');
  return product;
};

const listInventory = async ({ tenant, warehouseId, productId, page = 1, limit = 100 } = {}) => {
  const tenantId = requireTenant(tenant);
  const filter = { tenant: tenantId };
  if (warehouseId) filter.warehouse = warehouseId;
  if (productId) filter.product = productId;
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 100));
  const [items, total] = await Promise.all([
    WarehouseInventory.find(filter)
      .populate('warehouse', 'code name isActive')
      .populate('product', 'title sku price thumbnail stock')
      .sort({ updatedAt: -1, _id: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean({ virtuals: true }),
    WarehouseInventory.countDocuments(filter),
  ]);
  return { items, total, page: safePage, limit: safeLimit, pages: Math.ceil(total / safeLimit) };
};

const setInventory = async ({ tenant, warehouseId, productId, data = {}, actor } = {}) => {
  const tenantId = requireTenant(tenant);
  await assertWarehouse({ tenantId, warehouseId });
  const product = await assertProduct({ tenantId, productId });
  const quantity = nonNegativeInteger(data.quantity ?? 0, 'Quantity');
  const reservedQuantity = nonNegativeInteger(data.reservedQuantity ?? 0, 'Reserved quantity');
  const incomingQuantity = nonNegativeInteger(data.incomingQuantity ?? 0, 'Incoming quantity');
  const soldQuantity = nonNegativeInteger(data.soldQuantity ?? 0, 'Sold quantity');
  if (reservedQuantity > quantity) throw errorWith('Reserved quantity cannot exceed quantity');
  const updated = await WarehouseInventory.findOneAndUpdate(
    { tenant: tenantId, warehouse: warehouseId, product: productId },
    { $set: { quantity, reservedQuantity, incomingQuantity, soldQuantity, reorderLevel: nonNegativeInteger(data.reorderLevel ?? 0, 'Reorder level'), skuSnapshot: product.sku || '', lastCountedAt: new Date(), updatedBy: idOf(actor) || null } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).populate('warehouse', 'code name isActive').populate('product', 'title sku price thumbnail').lean({ virtuals: true });
  return updated;
};

const normalizeItems = async ({ tenantId, items, session }) => {
  if (!Array.isArray(items) || !items.length || items.length > 100) throw errorWith('A transfer must contain one to one hundred items');
  const seen = new Set();
  const normalized = [];
  for (const item of items) {
    const productId = String(item?.product || '').trim();
    if (seen.has(productId)) throw errorWith('A product can appear only once in a transfer');
    seen.add(productId);
    const product = await assertProduct({ tenantId, productId, session });
    normalized.push({ product: product._id, skuSnapshot: product.sku || '', quantity: positiveInteger(item.quantity, `Quantity for ${product.title}`) });
  }
  return normalized;
};

const createTransfer = async ({ tenant, data = {}, actor } = {}) => {
  const tenantId = requireTenant(tenant);
  if (String(data.fromWarehouse) === String(data.toWarehouse)) throw errorWith('Source and destination warehouses must be different');
  const [fromWarehouse, toWarehouse] = await Promise.all([
    assertWarehouse({ tenantId, warehouseId: data.fromWarehouse }),
    assertWarehouse({ tenantId, warehouseId: data.toWarehouse }),
  ]);
  const idempotencyKey = text(data.idempotencyKey);
  if (idempotencyKey.length < 8 || idempotencyKey.length > 160) throw errorWith('A valid transfer idempotency key is required');
  const existing = await StockTransfer.findOne({ tenant: tenantId, idempotencyKey }).lean();
  if (existing) return { transfer: existing, idempotent: true };
  const items = await normalizeItems({ tenantId, items: data.items });
  try {
    const transfer = await StockTransfer.create({
      tenant: tenantId,
      transferNumber: transferNumber(),
      fromWarehouse: fromWarehouse._id,
      toWarehouse: toWarehouse._id,
      items,
      idempotencyKey,
      note: text(data.note).slice(0, 500),
      requestedBy: idOf(actor) || null,
    });
    return { transfer: transfer.toObject(), idempotent: false };
  } catch (error) {
    if (error.code !== 11000) throw error;
    const raced = await StockTransfer.findOne({ tenant: tenantId, idempotencyKey }).lean();
    if (raced) return { transfer: raced, idempotent: true };
    throw error;
  }
};

const dispatchTransfer = async ({ tenant, transferId, actor } = {}) => {
  const tenantId = requireTenant(tenant);
  if (!mongoose.isValidObjectId(transferId)) throw errorWith('Transfer not found', 404, 'TRANSFER_NOT_FOUND');
  return runTransaction(async session => {
    const transfer = await StockTransfer.findOne({ _id: transferId, tenant: tenantId }).session(session);
    if (!transfer) throw errorWith('Transfer not found', 404, 'TRANSFER_NOT_FOUND');
    if (transfer.status === 'in_transit' || transfer.status === 'completed') return { transfer: transfer.toObject(), idempotent: true };
    if (transfer.status !== 'requested') throw errorWith('Only requested transfers can be dispatched', 409, 'TRANSFER_STATUS_INVALID');
    await assertWarehouse({ tenantId, warehouseId: transfer.fromWarehouse, session });
    await assertWarehouse({ tenantId, warehouseId: transfer.toWarehouse, session });
    for (const item of transfer.items) {
      const source = await WarehouseInventory.findOne({ tenant: tenantId, warehouse: transfer.fromWarehouse, product: item.product }).session(session);
      if (!source || Number(source.quantity || 0) - Number(source.reservedQuantity || 0) < item.quantity) throw errorWith('Insufficient available stock in source warehouse', 409, 'WAREHOUSE_STOCK_INSUFFICIENT');
      source.quantity -= item.quantity;
      await source.save({ session });
      await WarehouseInventory.findOneAndUpdate(
        { tenant: tenantId, warehouse: transfer.toWarehouse, product: item.product },
        { $inc: { incomingQuantity: item.quantity }, $setOnInsert: { skuSnapshot: item.skuSnapshot, reservedQuantity: 0, quantity: 0, soldQuantity: 0, reorderLevel: 0 } },
        { upsert: true, setDefaultsOnInsert: true, session }
      );
    }
    transfer.status = 'in_transit';
    transfer.dispatchedAt = new Date();
    transfer.dispatchedBy = idOf(actor) || null;
    await transfer.save({ session });
    return { transfer: transfer.toObject(), idempotent: false };
  });
};

const receiveTransfer = async ({ tenant, transferId, actor } = {}) => {
  const tenantId = requireTenant(tenant);
  if (!mongoose.isValidObjectId(transferId)) throw errorWith('Transfer not found', 404, 'TRANSFER_NOT_FOUND');
  return runTransaction(async session => {
    const transfer = await StockTransfer.findOne({ _id: transferId, tenant: tenantId }).session(session);
    if (!transfer) throw errorWith('Transfer not found', 404, 'TRANSFER_NOT_FOUND');
    if (transfer.status === 'completed') return { transfer: transfer.toObject(), idempotent: true };
    if (transfer.status !== 'in_transit') throw errorWith('Only in-transit transfers can be received', 409, 'TRANSFER_STATUS_INVALID');
    for (const item of transfer.items) {
      const destination = await WarehouseInventory.findOne({ tenant: tenantId, warehouse: transfer.toWarehouse, product: item.product }).session(session);
      if (!destination || Number(destination.incomingQuantity || 0) < item.quantity) throw errorWith('Destination incoming stock is inconsistent', 409, 'WAREHOUSE_INCOMING_INCONSISTENT');
      destination.incomingQuantity -= item.quantity;
      destination.quantity += item.quantity;
      await destination.save({ session });
    }
    transfer.status = 'completed';
    transfer.receivedAt = new Date();
    transfer.receivedBy = idOf(actor) || null;
    await transfer.save({ session });
    return { transfer: transfer.toObject(), idempotent: false };
  });
};

const listTransfers = async ({ tenant, status, page = 1, limit = 50 } = {}) => {
  const tenantId = requireTenant(tenant);
  const filter = { tenant: tenantId };
  if (status) filter.status = String(status);
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
  const [items, total] = await Promise.all([
    StockTransfer.find(filter).populate('fromWarehouse', 'code name').populate('toWarehouse', 'code name').populate('items.product', 'title sku').sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean(),
    StockTransfer.countDocuments(filter),
  ]);
  return { items, total, page: safePage, limit: safeLimit, pages: Math.ceil(total / safeLimit) };
};

module.exports = { createWarehouse, updateWarehouse, listWarehouses, listInventory, setInventory, createTransfer, dispatchTransfer, receiveTransfer, listTransfers, errorWith };
