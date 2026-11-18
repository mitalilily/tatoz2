const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const { normalizeHsnCode } = require('../utils/adminValidation');
const { tenantScope } = require('../services/adminTenantScope');

const taxError = (message, code = 'PRODUCT_TAX_INVALID') => {
  const error = new Error(message);
  error.statusCode = 422;
  error.publicCode = code;
  return error;
};

const normalizeRate = value => {
  if (value === '' || value === null || value === undefined) return null;
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw taxError('GST rate must be between 0 and 100');
  return Math.round(rate * 100) / 100;
};

const normalizeHsn = value => {
  try { return normalizeHsnCode(value); } catch (error) { throw taxError(error.message); }
};

const tenantFilter = req => tenantScope(req);

const getProductTaxes = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const query = tenantFilter(req);
  const search = String(req.query.search || '').trim().slice(0, 80);
  if (search) query.$or = [
    { title: { $regex: search, $options: 'i' } },
    { sku: { $regex: search, $options: 'i' } },
    { hsnCode: { $regex: search, $options: 'i' } },
  ];
  const [products, total] = await Promise.all([
    Product.find(query)
      .select('_id title sku hsnCode gstRate price isActive lifecycleStatus vendor category')
      .populate('category', 'name')
      .populate('vendor', 'storeName')
      .sort({ title: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Product.countDocuments(query),
  ]);
  res.json({ success: true, products, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const updateProductTax = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw taxError('Invalid product id', 'PRODUCT_NOT_FOUND');
  const update = { gstRate: normalizeRate(req.body?.gstRate), hsnCode: normalizeHsn(req.body?.hsnCode) };
  const product = await Product.findOneAndUpdate(
    { _id: req.params.id, ...tenantFilter(req) },
    { $set: update },
    { new: true, runValidators: true },
  ).select('_id title sku hsnCode gstRate price isActive lifecycleStatus vendor category').lean();
  if (!product) { res.status(404); throw new Error('Product not found'); }
  res.json({ success: true, product });
});

const bulkUpdateProductTaxes = asyncHandler(async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length || items.length > 200) throw taxError('Provide between 1 and 200 product tax rows');
  const operations = [];
  for (const item of items) {
    if (!mongoose.isValidObjectId(item?.id || item?._id)) throw taxError('Every tax row must contain a valid product id');
    operations.push({
      updateOne: {
        filter: { _id: item.id || item._id, ...tenantFilter(req) },
        update: { $set: { gstRate: normalizeRate(item.gstRate), hsnCode: normalizeHsn(item.hsnCode) } },
      },
    });
  }
  const result = await Product.bulkWrite(operations, { ordered: true });
  res.json({ success: true, matched: result.matchedCount, modified: result.modifiedCount });
});

module.exports = { getProductTaxes, updateProductTax, bulkUpdateProductTaxes };
