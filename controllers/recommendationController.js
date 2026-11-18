const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');
const recommendationService = require('../services/recommendationService');
const { addApprovedProductFilter } = require('../services/productApprovalService');

const adminList = asyncHandler(async (req, res) => {
  const rules = await recommendationService.listRules({ tenant: req.tenant._id, type: req.query.type });
  res.json({ success: true, rules });
});

const adminCreate = asyncHandler(async (req, res) => {
  const rule = await recommendationService.createRule({ tenant: req.tenant._id, data: req.body });
  res.status(201).json({ success: true, rule });
});

const adminUpdate = asyncHandler(async (req, res) => {
  const rule = await recommendationService.updateRule({ tenant: req.tenant._id, id: req.params.id, data: req.body });
  res.json({ success: true, rule });
});

const adminDelete = asyncHandler(async (req, res) => {
  const result = await recommendationService.deleteRule({ tenant: req.tenant._id, id: req.params.id });
  res.json({ success: true, ...result });
});

const publicRecommendations = asyncHandler(async (req, res) => {
  const productQuery = { slug: req.params.slug, isActive: true, ...(req.tenant ? { tenant: req.tenant._id } : {}) };
  addApprovedProductFilter(productQuery);
  const product = await Product.findOne(productQuery).select('_id');
  if (!product) { res.status(404); throw new Error('Product not found'); }
  const result = await recommendationService.listRecommendations({ tenant: req.tenant?._id, productId: product._id, type: req.query.type, limit: req.query.limit });
  res.json({ success: true, ...result });
});

module.exports = { adminList, adminCreate, adminUpdate, adminDelete, publicRecommendations };
