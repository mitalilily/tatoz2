const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');
const InventoryLog = require('../models/InventoryLog');

// @desc    Get vendor's products with stock info (paginated)
// @route   GET /api/vendor/inventory
const getInventory = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search, status } = req.query;
  const query = { vendor: req.vendor._id };
  if (search) query.title = { $regex: search, $options: 'i' };
  if (status === 'low_stock') {
    query.$expr = { $and: [
      { $gt: ['$lowStockThreshold', 0] },
      { $lte: ['$stock', '$lowStockThreshold'] },
    ]};
  } else if (status === 'out_of_stock') {
    query.stock = 0;
  }

  const [products, total] = await Promise.all([
    Product.find(query)
      .populate('category', 'name')
      .select('title slug thumbnail images stock lowStockThreshold sku category isActive')
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit)),
    Product.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: products,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) },
  });
});

// @desc    Get low-stock products (for dashboard widget)
// @route   GET /api/vendor/inventory/low-stock
const getLowStockProducts = asyncHandler(async (req, res) => {
  const products = await Product.find({
    vendor: req.vendor._id,
    $expr: { $and: [
      { $gt: ['$lowStockThreshold', 0] },
      { $lte: ['$stock', '$lowStockThreshold'] },
    ]},
  })
    .select('title slug thumbnail images stock lowStockThreshold sku')
    .sort({ stock: 1 })
    .limit(10);

  res.json({ success: true, data: products });
});

// @desc    Update product stock/threshold (logs the change)
// @route   PATCH /api/vendor/inventory/:productId
const updateStock = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ _id: req.params.productId, vendor: req.vendor._id });
  if (!product) { res.status(404); throw new Error('Product not found'); }

  const { stock, lowStockThreshold, note } = req.body;

  let newStock = product.stock;
  let newThreshold = product.lowStockThreshold;

  if (stock !== undefined) {
    const parsed = parseInt(stock, 10);
    if (isNaN(parsed) || parsed < 0) { res.status(400); throw new Error('Stock must be a non-negative integer'); }
    newStock = parsed;
  }
  if (lowStockThreshold !== undefined) {
    const parsed = parseInt(lowStockThreshold, 10);
    if (isNaN(parsed) || parsed < 0) { res.status(400); throw new Error('Low stock threshold must be a non-negative integer'); }
    newThreshold = parsed;
  }

  const oldStock = product.stock;
  const delta = newStock - oldStock;
  const type = delta > 0 ? 'restock' : 'adjustment';

  product.stock = newStock;
  product.lowStockThreshold = newThreshold;
  await product.save();

  if (delta !== 0) {
    await InventoryLog.create({
      tenant: req.vendor.tenant,
      vendor: req.vendor._id,
      product: product._id,
      user: req.user._id,
      type,
      previousStock: oldStock,
      newStock,
      delta,
      note: note || '',
    });
  }

  res.json({ success: true, data: product });
});

// @desc    Bulk update multiple products' stock
// @route   POST /api/vendor/inventory/bulk
const bulkUpdateStock = asyncHandler(async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) { res.status(400); throw new Error('Items array is required'); }
  if (items.length > 100) { res.status(400); throw new Error('Maximum 100 products per bulk update'); }

  const updated = [];
  const failed = [];

  for (const item of items) {
    try {
      const product = await Product.findOne({ _id: item.productId, vendor: req.vendor._id });
      if (!product) { failed.push({ productId: item.productId, error: 'Not found' }); continue; }

      const parsedStock = parseInt(item.stock, 10);
      if (isNaN(parsedStock) || parsedStock < 0) { failed.push({ productId: item.productId, error: 'Invalid stock value' }); continue; }

      const oldStock = product.stock;
      const delta = parsedStock - oldStock;
      product.stock = parsedStock;
      await product.save();

      if (delta !== 0) {
        await InventoryLog.create({
          tenant: req.vendor.tenant,
          vendor: req.vendor._id,
          product: product._id,
          user: req.user._id,
          type: 'bulk_update',
          previousStock: oldStock,
          newStock: parsedStock,
          delta,
          note: item.note || 'Bulk update',
        });
      }

      updated.push({ productId: item.productId, stock: parsedStock });
    } catch (err) {
      failed.push({ productId: item.productId, error: err.message });
    }
  }

  res.json({ success: true, updated: updated.length, failed: failed.length, errors: failed.length > 0 ? failed : undefined });
});

// @desc    Get restock history for the vendor
// @route   GET /api/vendor/inventory/logs
const getInventoryLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50 } = req.query;

  const [logs, total] = await Promise.all([
    InventoryLog.find({ vendor: req.vendor._id })
      .populate('product', 'title slug sku thumbnail')
      .populate('user', 'name')
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit)),
    InventoryLog.countDocuments({ vendor: req.vendor._id }),
  ]);

  res.json({
    success: true,
    data: logs,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) },
  });
});

module.exports = { getInventory, getLowStockProducts, updateStock, bulkUpdateStock, getInventoryLogs };
