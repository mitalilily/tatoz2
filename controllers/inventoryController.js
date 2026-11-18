const asyncHandler = require('express-async-handler');
const ExcelJS = require('exceljs');
const { Readable } = require('stream');
const Product = require('../models/Product');
const InventoryReservation = require('../models/InventoryReservation');
const InventoryMovement = require('../models/InventoryMovement');
const { parsePagination } = require('../utils/pagination');
const { recordManualStockAdjustment, inventoryError } = require('../services/productInventoryGuard');
const { tenantScope } = require('../services/adminTenantScope');

const scoped = req => tenantScope(req);
const productFilter = (req, query = {}) => {
  const filter = { ...scoped(req) };
  if (query.search) {
    const escaped = String(query.search).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ title: new RegExp(escaped, 'i') }, { sku: new RegExp(escaped, 'i') }];
  }
  if (query.status === 'low_stock') filter.$expr = { $lte: [{ $ifNull: ['$stock', 0] }, { $ifNull: ['$lowStockThreshold', 0] }] };
  if (query.status === 'out_of_stock') filter.stock = { $lte: 0 };
  return filter;
};

const getInventoryOverview = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const filter = productFilter(req, req.query);
  const [total, products, summary, reservationSummary, recentMovements] = await Promise.all([
    Product.countDocuments(filter),
    Product.find(filter)
      .populate('category', 'name slug')
      .sort({ stock: 1, updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('title sku thumbnail images category stock reservedStock soldStock incomingStock lowStockThreshold price isActive variants'),
    Product.aggregate([
      { $match: { ...scoped(req), isActive: true } },
      { $group: {
        _id: null,
        products: { $sum: 1 },
        availableStock: { $sum: { $ifNull: ['$stock', 0] } },
        reservedStock: { $sum: { $ifNull: ['$reservedStock', 0] } },
        soldStock: { $sum: { $ifNull: ['$soldStock', 0] } },
        incomingStock: { $sum: { $ifNull: ['$incomingStock', 0] } },
        stockValue: { $sum: { $multiply: [{ $ifNull: ['$stock', 0] }, { $ifNull: ['$price', 0] }] } },
        lowStock: { $sum: { $cond: [{ $and: [{ $lte: [{ $ifNull: ['$stock', 0] }, { $ifNull: ['$lowStockThreshold', 0] }] }, { $gt: [{ $ifNull: ['$stock', 0] }, 0] }] }, 1, 0] } },
        outOfStock: { $sum: { $cond: [{ $lte: [{ $ifNull: ['$stock', 0] }, 0] }, 1, 0] } },
      } },
    ]),
    InventoryReservation.aggregate([
      { $match: { ...scoped(req), status: 'active' } },
      { $unwind: '$items' },
      { $group: { _id: '$_id', units: { $sum: '$items.quantity' } } },
      { $group: { _id: null, reservations: { $sum: 1 }, units: { $sum: '$units' } } },
    ]),
    InventoryMovement.find(scoped(req)).sort({ createdAt: -1 }).limit(10).populate('product', 'title sku').select('product order type quantity availableAfter reservedAfter soldAfter reason createdAt').lean(),
  ]);

  const summaryRow = summary[0] || {};
  const reservations = reservationSummary[0] || {};
  res.json({
    success: true,
    products: products.map(product => ({
      ...product.toObject(),
      availableStock: Number(product.stock || 0),
      reservedStock: Number(product.reservedStock || 0),
      soldStock: Number(product.soldStock || 0),
      incomingStock: Number(product.incomingStock || 0),
    })),
    summary: {
      products: Number(summaryRow.products || 0),
      availableStock: Number(summaryRow.availableStock || 0),
      reservedStock: Number(summaryRow.reservedStock || 0),
      soldStock: Number(summaryRow.soldStock || 0),
      incomingStock: Number(summaryRow.incomingStock || 0),
      stockValue: Number(summaryRow.stockValue || 0),
      lowStock: Number(summaryRow.lowStock || 0),
      outOfStock: Number(summaryRow.outOfStock || 0),
      activeReservations: Number(reservations.reservations || 0),
      reservedUnits: Number(reservations.units || 0),
    },
    recentMovements,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

const getInventoryReservations = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const filter = { ...scoped(req) };
  if (req.query.status) filter.status = String(req.query.status);
  const [total, reservations] = await Promise.all([
    InventoryReservation.countDocuments(filter),
    InventoryReservation.find(filter)
      .populate('order', 'orderNumber paymentStatus orderStatus total createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-items.variant'),
  ]);
  res.json({ success: true, reservations, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const getInventoryMovements = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });
  const filter = { ...scoped(req) };
  if (req.query.type) filter.type = String(req.query.type);
  if (req.query.product) filter.product = req.query.product;
  const [total, movements] = await Promise.all([
    InventoryMovement.countDocuments(filter),
    InventoryMovement.find(filter)
      .populate('product', 'title sku')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);
  res.json({ success: true, movements, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const writeInventoryCsv = async (res, rows, filename) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Inventory');
  sheet.columns = [
    { header: 'SKU', key: 'sku', width: 20 },
    { header: 'Title', key: 'title', width: 40 },
    { header: 'Stock', key: 'stock', width: 12 },
    { header: 'Reserved Stock', key: 'reservedStock', width: 18 },
    { header: 'Sold Stock', key: 'soldStock', width: 14 },
    { header: 'Incoming Stock', key: 'incomingStock', width: 18 },
    { header: 'Low Stock Threshold', key: 'lowStockThreshold', width: 22 },
  ];
  sheet.getRow(1).font = { bold: true };
  rows.forEach(row => sheet.addRow(row));
  const buffer = await workbook.csv.writeBuffer();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
};

const exportInventory = asyncHandler(async (req, res) => {
  const products = await Product.find({ ...scoped(req) })
    .sort({ createdAt: -1 })
    .select('sku title stock reservedStock soldStock incomingStock lowStockThreshold')
    .lean();
  return writeInventoryCsv(res, products.map(product => ({
    sku: product.sku || '',
    title: product.title,
    stock: Number(product.stock || 0),
    reservedStock: Number(product.reservedStock || 0),
    soldStock: Number(product.soldStock || 0),
    incomingStock: Number(product.incomingStock || 0),
    lowStockThreshold: Number(product.lowStockThreshold || 0),
  })), `inventory-export-${Date.now()}.csv`);
});

const downloadInventoryTemplate = asyncHandler(async (req, res) => (
  writeInventoryCsv(res, [{ sku: 'SKU001', title: 'Example Product', stock: 50, reservedStock: 0, soldStock: 0, incomingStock: 0, lowStockThreshold: 10 }], 'inventory-import-template.csv')
));

const importInventory = asyncHandler(async (req, res) => {
  if (!req.file) { res.status(400); throw new Error('CSV file is required'); }
  const workbook = new ExcelJS.Workbook();
  await workbook.csv.read(Readable.from(req.file.buffer));
  const sheet = workbook.worksheets[0];
  if (!sheet) { res.status(400); throw new Error('Empty CSV file'); }
  const headers = [];
  sheet.getRow(1).eachCell((cell, index) => { headers[index] = String(cell.value || '').trim().toLowerCase(); });
  const skuIndex = headers.findIndex(header => header === 'sku');
  const stockIndex = headers.findIndex(header => header === 'stock');
  const reasonIndex = headers.findIndex(header => header === 'reason');
  if (skuIndex < 1 || stockIndex < 1) { res.status(400); throw new Error('Inventory CSV must contain SKU and Stock columns'); }
  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    rows.push({
      rowNumber,
      sku: String(row.getCell(skuIndex).value || '').trim(),
      stock: row.getCell(stockIndex).value,
      reason: reasonIndex > 0 ? String(row.getCell(reasonIndex).value || '').trim() : 'csv_inventory_import',
    });
  });
  if (rows.length > 500) { res.status(400); throw new Error('Inventory CSV may contain at most 500 rows'); }
  const results = { updated: 0, unchanged: 0, errors: [] };
  const scope = scoped(req);
  for (const row of rows) {
    try {
      if (!row.sku) throw inventoryError('SKU is required', 400, 'INVENTORY_CSV_ROW_INVALID');
      const stock = Number(row.stock);
      if (!Number.isInteger(stock) || stock < 0) throw inventoryError('Stock must be a non-negative integer', 400, 'INVENTORY_CSV_ROW_INVALID');
      const product = await Product.findOne({ ...scope, sku: row.sku });
      if (!product) throw inventoryError(`SKU "${row.sku}" was not found in this store`, 404, 'INVENTORY_PRODUCT_NOT_FOUND');
      if (stock < Number(product.reservedStock || 0)) throw inventoryError(`Stock cannot be lower than reserved stock for SKU "${row.sku}"`, 409, 'INVENTORY_RESERVED_STOCK_PROTECTED');
      if (stock === Number(product.stock || 0)) { results.unchanged++; continue; }
      const updated = await Product.findOneAndUpdate(
        { _id: product._id, ...scope, stock: product.stock },
        { $set: { stock } },
        { new: true, runValidators: true },
      );
      if (!updated) throw inventoryError(`SKU "${row.sku}" changed while importing; retry this row`, 409, 'INVENTORY_CONCURRENT_UPDATE');
      await recordManualStockAdjustment({ productBefore: product, productAfter: updated, tenant: updated.tenant || product.tenant || req.tenant?._id, reason: row.reason || 'csv_inventory_import' });
      results.updated++;
    } catch (error) {
      results.errors.push({ row: row.rowNumber, message: error.message });
    }
  }
  res.json({ success: true, ...results });
});

module.exports = { getInventoryOverview, getInventoryReservations, getInventoryMovements, exportInventory, downloadInventoryTemplate, importInventory };
