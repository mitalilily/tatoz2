const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Brand = require('../models/Brand');
const Product = require('../models/Product');
const { createUniqueBrandSlug } = require('../utils/slugify');
const publicCache = require('../services/publicCache');
const { addApprovedProductFilter } = require('../services/productApprovalService');
const { normalizeBrandName, normalizeTrimmed, finiteNumber, validationError } = require('../utils/adminValidation');
const { tenantScope } = require('../services/adminTenantScope');

const isValidObjectId = (id) => id && mongoose.Types.ObjectId.isValid(id) && String(id).length === 24;
const adminScope = req => tenantScope(req);
const duplicateNameQuery = (name, req, excludeId) => ({
  name: { $regex: `^${String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
  ...adminScope(req),
  ...(excludeId ? { _id: { $ne: excludeId } } : {}),
});

// @desc    Get all brands (public, active only)
// @route   GET /api/brands
const getBrands = asyncHandler(async (req, res) => {
  const payload = await publicCache.getOrSet(req, res, {
    namespace: 'brands',
    key: 'active-list:v1',
    loader: async () => ({
      success: true,
      brands: await Brand.find({ isActive: true, ...(req.tenant ? { tenant: req.tenant._id } : {}) })
        .sort({ order: 1, name: 1 })
        .lean(),
    }),
  });
  res.json(payload);
});

// @desc    Get brand by slug with product count
// @route   GET /api/brands/:slug
const getBrandBySlug = asyncHandler(async (req, res) => {
  const brand = await Brand.findOne({ slug: req.params.slug, isActive: true, ...(req.tenant ? { tenant: req.tenant._id } : {}) });
  if (!brand) {
    res.status(404);
    throw new Error('Brand not found');
  }
  const productCountQuery = {
    brand: new RegExp(`^${brand.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    isActive: true,
    ...(req.tenant ? { tenant: req.tenant._id } : {}),
  };
  addApprovedProductFilter(productCountQuery);
  const productCount = await Product.countDocuments(productCountQuery);
  res.json({ success: true, brand: { ...brand.toObject(), productCount } });
});

// @desc    Create brand (admin)
// @route   POST /api/admin/brands
const createBrand = asyncHandler(async (req, res) => {
  const name = normalizeBrandName(req.body?.name);
  const description = normalizeTrimmed(req.body?.description, 'Brand description', { max: 1000, rejectMarkup: true });
  const image = normalizeTrimmed(req.body?.image, 'Brand image', { max: 2000 });
  const order = req.body?.order === undefined ? undefined : finiteNumber(req.body.order, 'Brand order', { min: 0, max: 100000, integer: true, safeInteger: true });
  const { seo } = req.body || {};
  if (await Brand.exists(duplicateNameQuery(name, req))) throw validationError('A brand with this name already exists in this store', 'BRAND_NAME_DUPLICATE');
  const slug = await createUniqueBrandSlug(name);
  const brand = await Brand.create({ name, slug, description, image, order, seo, ...(req.tenant ? { tenant: req.tenant._id } : {}) });
  await publicCache.invalidate(req, { namespace: 'brands' });

  if (!brand.seo?.metaTitle) {
    const { autoGenerateSeo } = require('../utils/autoSeoGenerator');
    autoGenerateSeo(Brand, brand._id, { title: name, description: description || '', category: 'Brand' }).catch(() => {});
  }

  res.status(201).json({ success: true, brand });
});

// @desc    Update brand (admin)
// @route   PUT /api/admin/brands/:id
const updateBrand = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    res.status(404);
    throw new Error('Brand not found');
  }
  const scope = adminScope(req);
  let brand = await Brand.findOne({ _id: id, ...scope });
  if (!brand) {
    res.status(404);
    throw new Error('Brand not found');
  }
  const updates = { ...req.body };
  if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
    updates.name = normalizeBrandName(updates.name);
    if (await Brand.exists(duplicateNameQuery(updates.name, req, brand._id))) throw validationError('A brand with this name already exists in this store', 'BRAND_NAME_DUPLICATE');
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'description')) updates.description = normalizeTrimmed(updates.description, 'Brand description', { max: 1000, rejectMarkup: true });
  if (Object.prototype.hasOwnProperty.call(updates, 'image')) updates.image = normalizeTrimmed(updates.image, 'Brand image', { max: 2000 });
  if (Object.prototype.hasOwnProperty.call(updates, 'order')) updates.order = finiteNumber(updates.order, 'Brand order', { min: 0, max: 100000, integer: true, safeInteger: true });
  if (updates.name && updates.name !== brand.name) {
    updates.slug = await createUniqueBrandSlug(updates.name, brand._id);
  }
  delete updates.tenant;
  brand = await Brand.findOneAndUpdate({ _id: id, ...scope }, updates, { new: true, runValidators: true });
  await publicCache.invalidate(req, { namespace: 'brands' });

  if (!brand.seo?.metaTitle) {
    const { autoGenerateSeo } = require('../utils/autoSeoGenerator');
    autoGenerateSeo(Brand, brand._id, { title: brand.name, description: brand.description || '', category: 'Brand' }).catch(() => {});
  }

  res.json({ success: true, brand });
});

// @desc    Delete brand (admin)
// @route   DELETE /api/admin/brands/:id
const deleteBrand = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    res.status(404);
    throw new Error('Brand not found');
  }
  const brand = await Brand.findOne({ _id: id, ...adminScope(req) });
  if (!brand) {
    res.status(404);
    throw new Error('Brand not found');
  }
  await brand.deleteOne();
  await publicCache.invalidate(req, { namespace: 'brands' });
  res.json({ success: true, message: 'Brand deleted' });
});

// @desc    Get all brands (admin, including inactive)
// @route   GET /api/admin/brands
const getAdminBrands = asyncHandler(async (req, res) => {
  const brands = await Brand.find(adminScope(req)).sort({ order: 1, name: 1 });
  res.json({ success: true, brands });
});

module.exports = {
  getBrands,
  getBrandBySlug,
  createBrand,
  updateBrand,
  deleteBrand,
  getAdminBrands,
};
