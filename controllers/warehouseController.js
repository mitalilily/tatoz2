const asyncHandler = require('express-async-handler');
const warehouseService = require('../services/warehouseInventoryService');

const tenantOf = req => {
  if (!req.tenant?._id) throw warehouseService.errorWith('Tenant context is required', 400, 'TENANT_REQUIRED');
  return req.tenant._id;
};

const listWarehouses = asyncHandler(async (req, res) => {
  const warehouses = await warehouseService.listWarehouses({ tenant: tenantOf(req), includeInactive: req.query.includeInactive !== 'false' });
  res.json({ success: true, warehouses, tenantScoped: true });
});

const createWarehouse = asyncHandler(async (req, res) => {
  const warehouse = await warehouseService.createWarehouse({ tenant: tenantOf(req), data: req.body || {}, actor: req.user });
  res.status(201).json({ success: true, warehouse, tenantScoped: true });
});

const updateWarehouse = asyncHandler(async (req, res) => {
  const warehouse = await warehouseService.updateWarehouse({ tenant: tenantOf(req), warehouseId: req.params.id, data: req.body || {} });
  res.json({ success: true, warehouse, tenantScoped: true });
});

const listInventory = asyncHandler(async (req, res) => {
  const result = await warehouseService.listInventory({ tenant: tenantOf(req), warehouseId: req.params.id, productId: req.query.product, page: req.query.page, limit: req.query.limit });
  res.json({ success: true, ...result, tenantScoped: true });
});

const setInventory = asyncHandler(async (req, res) => {
  const inventory = await warehouseService.setInventory({ tenant: tenantOf(req), warehouseId: req.params.id, productId: req.body?.product, data: req.body || {}, actor: req.user });
  res.json({ success: true, inventory, tenantScoped: true });
});

const listTransfers = asyncHandler(async (req, res) => {
  const result = await warehouseService.listTransfers({ tenant: tenantOf(req), status: req.query.status, page: req.query.page, limit: req.query.limit });
  res.json({ success: true, ...result, tenantScoped: true });
});

const createTransfer = asyncHandler(async (req, res) => {
  const result = await warehouseService.createTransfer({ tenant: tenantOf(req), data: req.body || {}, actor: req.user });
  res.status(result.idempotent ? 200 : 201).json({ success: true, ...result, tenantScoped: true });
});

const dispatchTransfer = asyncHandler(async (req, res) => {
  const result = await warehouseService.dispatchTransfer({ tenant: tenantOf(req), transferId: req.params.id, actor: req.user });
  res.json({ success: true, ...result, tenantScoped: true });
});

const receiveTransfer = asyncHandler(async (req, res) => {
  const result = await warehouseService.receiveTransfer({ tenant: tenantOf(req), transferId: req.params.id, actor: req.user });
  res.json({ success: true, ...result, tenantScoped: true });
});

module.exports = { listWarehouses, createWarehouse, updateWarehouse, listInventory, setInventory, listTransfers, createTransfer, dispatchTransfer, receiveTransfer };
