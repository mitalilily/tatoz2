const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Bundle = require('../models/Bundle');
const { parsePagination } = require('../utils/pagination');
const { addApprovedProductFilter } = require('../services/productApprovalService');
const { CATEGORY_LEVELS, buildCategoryTree } = require('../services/categoryHierarchyService');

const catalog = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const filter = { tenant: req.tenant._id, isActive: true };
  addApprovedProductFilter(filter);
  if (req.query.search) filter.title = { $regex: String(req.query.search).slice(0, 80), $options: 'i' };
  const [products, total] = await Promise.all([Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).select('-costPrice').lean(), Product.countDocuments(filter)]);
  res.json({ success: true, products, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const categories = asyncHandler(async (req, res) => {
  const rows = await Category.find({ tenant: req.tenant._id, isActive: true }).sort({ depth: 1, order: 1, name: 1 }).lean();
  res.json({ success: true, hierarchy: CATEGORY_LEVELS, categories: buildCategoryTree(rows) });
});
const bundles = asyncHandler(async (req, res) => res.json({ success: true, bundles: await Bundle.find({ tenant: req.tenant._id, isActive: true, lifecycleStatus: 'active' }).sort({ createdAt: -1 }).lean() }));

module.exports = { catalog, categories, bundles };
