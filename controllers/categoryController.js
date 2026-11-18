const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Category = require('../models/Category');
const { createUniqueCategorySlug } = require('../utils/slugify');
const publicCache = require('../services/publicCache');
const { addApprovedProductFilter } = require('../services/productApprovalService');
const { normalizeName, normalizeTrimmed, finiteNumber, validationError } = require('../utils/adminValidation');
const { tenantScope } = require('../services/adminTenantScope');
const {
  CATEGORY_LEVELS,
  levelForDepth,
  depthForLevel,
  buildCategoryTree,
  getDescendantCategoryIds,
  getCategoryAncestors,
} = require('../services/categoryHierarchyService');

const isValidObjectId = (id) => id && mongoose.Types.ObjectId.isValid(id) && String(id).length === 24;
const adminScope = req => tenantScope(req);
const duplicateNameQuery = (name, parent, req, excludeId) => ({
  name: { $regex: `^${String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
  parent: parent || null,
  ...adminScope(req),
  ...(excludeId ? { _id: { $ne: excludeId } } : {}),
});

const hierarchyScope = req => (req.tenant ? { tenant: req.tenant._id } : {});

const resolveHierarchyMetadata = async (parentId, req) => {
  if (!parentId) return { level: CATEGORY_LEVELS[0], depth: 0, ancestors: [] };
  const parent = await Category.findOne({ _id: parentId, ...adminScope(req) })
    .select('_id parent level depth ancestors')
    .lean();
  if (!parent) throw validationError('The selected parent category is invalid', 'CATEGORY_PARENT_NOT_FOUND');
  const parentDepth = Number.isInteger(parent.depth) ? parent.depth : depthForLevel(parent.level);
  const depth = parentDepth + 1;
  if (depth > 3) throw validationError('Categories can have a maximum of four levels', 'CATEGORY_MAX_DEPTH');
  return {
    level: levelForDepth(depth),
    depth,
    ancestors: [...(parent.ancestors || []), parent._id],
  };
};

const rebuildSubtreeMetadata = async (rootId, req) => {
  const rows = await Category.find(hierarchyScope(req)).select('_id parent level depth ancestors').lean();
  const childrenByParent = new Map();
  rows.forEach(row => {
    const parentId = row.parent ? String(row.parent) : '';
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    childrenByParent.get(parentId).push(row);
  });
  const operations = [];
  const visited = new Set();
  const visit = (node, parentMeta = null) => {
    const id = String(node._id);
    if (visited.has(id)) return;
    visited.add(id);
    const depth = parentMeta ? parentMeta.depth + 1 : 0;
    const ancestors = parentMeta ? [...parentMeta.ancestors, node.parent] : [];
    const level = levelForDepth(depth);
    operations.push({ updateOne: { filter: { _id: node._id, ...hierarchyScope(req) }, update: { $set: { level, depth, ancestors } } } });
    const meta = { depth, ancestors: [...ancestors, node._id] };
    (childrenByParent.get(id) || []).forEach(child => visit(child, meta));
  };
  const root = rows.find(row => String(row._id) === String(rootId));
  if (root) visit(root);
  if (operations.length) await Category.bulkWrite(operations, { ordered: true });
};

// @desc    Get all top-level categories with their subcategories
// @route   GET /api/categories
const getCategories = asyncHandler(async (req, res) => {
  const payload = await publicCache.getOrSet(req, res, {
    namespace: 'categories',
    key: 'active-tree:v2',
    loader: async () => {
      const allActive = await Category.find({ isActive: true, ...(req.tenant ? { tenant: req.tenant._id } : {}) })
        .sort({ order: 1, name: 1 })
        .lean();

      const categories = buildCategoryTree(allActive);
      return {
        success: true,
        hierarchy: CATEGORY_LEVELS,
        categories,
      };
    },
  });
  res.json(payload);
});

// @desc    Get category with subcategories and product count
// @route   GET /api/categories/:slug
const getCategory = asyncHandler(async (req, res) => {
  const category = await Category.findOne({ slug: req.params.slug, ...(req.tenant ? { tenant: req.tenant._id } : {}) }).populate('parent', 'name slug');
  if (!category) { res.status(404); throw new Error('Category not found'); }

  const Product = require('../models/Product');

  const descendantIds = await getDescendantCategoryIds(category._id, req.tenant?._id, { includeInactive: false });
  const descendants = await Category.find({ _id: { $in: descendantIds }, isActive: true, ...(req.tenant ? { tenant: req.tenant._id } : {}) })
    .sort({ depth: 1, order: 1, name: 1 })
    .lean();
  const tree = buildCategoryTree(descendants);
  const categoryTreeNode = tree.find(item => String(item._id) === String(category._id)) || { ...category.toObject(), children: [], subCategories: [] };
  const subCategories = categoryTreeNode.children || [];
  const subIds = descendants.filter(item => String(item._id) !== String(category._id)).map(item => item._id);
  const breadcrumbs = await getCategoryAncestors(category, req.tenant?._id);

  // Count products in this category + all its subcategories
  const categoryIds = [category._id, ...subIds];
  const productCountQuery = { category: { $in: categoryIds }, isActive: true, ...(req.tenant ? { tenant: req.tenant._id } : {}) };
  addApprovedProductFilter(productCountQuery);
  const productCount = await Product.countDocuments(productCountQuery);

  res.json({
    success: true,
    category: { ...category.toObject(), ...categoryTreeNode, children: subCategories, subCategories, breadcrumbs, productCount },
  });
});

// @desc    Create category (admin)
// @route   POST /api/admin/categories
const createCategory = asyncHandler(async (req, res) => {
  const name = normalizeName(req.body?.name, 'Category name', 80);
  const description = normalizeTrimmed(req.body?.description, 'Category description', { max: 1000, rejectMarkup: true });
  const image = normalizeTrimmed(req.body?.image, 'Category image', { max: 2000 });
  const icon = normalizeTrimmed(req.body?.icon, 'Category icon', { max: 2000 });
  const parent = req.body?.parent || null;
  const order = req.body?.order === undefined ? undefined : finiteNumber(req.body.order, 'Category order', { min: 0, max: 100000, integer: true, safeInteger: true });
  const commissionRate = req.body?.commissionRate === undefined ? undefined : finiteNumber(req.body.commissionRate, 'Commission rate', { min: 0, max: 100 });
  const { seo } = req.body || {};
  if (parent && !isValidObjectId(parent)) throw validationError('The selected parent category is invalid', 'CATEGORY_PARENT_NOT_FOUND');
  const hierarchy = await resolveHierarchyMetadata(parent, req);
  if (req.body?.level && String(req.body.level).toLowerCase() !== hierarchy.level) throw validationError('Category level does not match its parent', 'CATEGORY_LEVEL_INVALID');
  if (await Category.exists(duplicateNameQuery(name, parent, req))) throw validationError('A category with this name already exists under the selected parent', 'CATEGORY_NAME_DUPLICATE');
  const slug = await createUniqueCategorySlug(name);

  const category = await Category.create({ name, slug, description, image, icon, parent, ...hierarchy, order, commissionRate, seo, ...(req.tenant ? { tenant: req.tenant._id } : {}) });
  await publicCache.invalidate(req, { namespace: 'categories' });

  if (!category.seo?.metaTitle) {
    const { autoGenerateSeo } = require('../utils/autoSeoGenerator');
    autoGenerateSeo(Category, category._id, { title: name, description: description || '', category: 'Category' }).catch(() => {});
  }

  res.status(201).json({ success: true, category });
});

// @desc    Update category (admin)
// @route   PUT /api/admin/categories/:id
const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    res.status(404);
    throw new Error('Category not found');
  }
  const scope = adminScope(req);
  let category = await Category.findOne({ _id: id, ...scope });
  if (!category) { res.status(404); throw new Error('Category not found'); }

  const updates = { ...req.body };
  delete updates.level;
  delete updates.depth;
  delete updates.ancestors;
  delete updates.masterKey;
  delete updates.masterCode;
  if (Object.prototype.hasOwnProperty.call(updates, 'name')) updates.name = normalizeName(updates.name, 'Category name', 80);
  if (Object.prototype.hasOwnProperty.call(updates, 'description')) updates.description = normalizeTrimmed(updates.description, 'Category description', { max: 1000, rejectMarkup: true });
  if (Object.prototype.hasOwnProperty.call(updates, 'image')) updates.image = normalizeTrimmed(updates.image, 'Category image', { max: 2000 });
  if (Object.prototype.hasOwnProperty.call(updates, 'icon')) updates.icon = normalizeTrimmed(updates.icon, 'Category icon', { max: 2000 });
  if (Object.prototype.hasOwnProperty.call(updates, 'order')) updates.order = finiteNumber(updates.order, 'Category order', { min: 0, max: 100000, integer: true, safeInteger: true });
  if (Object.prototype.hasOwnProperty.call(updates, 'commissionRate')) updates.commissionRate = finiteNumber(updates.commissionRate, 'Commission rate', { min: 0, max: 100 });
  if (updates.name || Object.prototype.hasOwnProperty.call(updates, 'parent')) {
    const nextParent = Object.prototype.hasOwnProperty.call(updates, 'parent') ? (updates.parent || null) : category.parent;
    if (nextParent && (!isValidObjectId(nextParent) || String(nextParent) === String(category._id))) throw validationError('The selected parent category is invalid', 'CATEGORY_PARENT_NOT_FOUND');
    if (nextParent && await Category.exists({ _id: nextParent, ancestors: category._id, ...scope })) throw validationError('A category cannot be moved inside its own descendant', 'CATEGORY_PARENT_CYCLE');
    const hierarchy = await resolveHierarchyMetadata(nextParent, req);
    if (req.body?.level && String(req.body.level).toLowerCase() !== hierarchy.level) throw validationError('Category level does not match its parent', 'CATEGORY_LEVEL_INVALID');
    Object.assign(updates, hierarchy);
    if (await Category.exists(duplicateNameQuery(updates.name || category.name, nextParent, req, category._id))) throw validationError('A category with this name already exists under the selected parent', 'CATEGORY_NAME_DUPLICATE');
  }
  if (updates.name && updates.name !== category.name) {
    updates.slug = await createUniqueCategorySlug(updates.name, category._id);
  }
  // Avoid CastError: empty string is invalid for ObjectId refs
  if (Object.prototype.hasOwnProperty.call(updates, 'parent') && (updates.parent === '' || updates.parent === undefined)) {
    updates.parent = null;
    Object.assign(updates, await resolveHierarchyMetadata(null, req));
  }

  delete updates.tenant;
  category = await Category.findOneAndUpdate({ _id: id, ...scope }, updates, { new: true, runValidators: true });
  await rebuildSubtreeMetadata(category._id, req);
  await publicCache.invalidate(req, { namespace: 'categories' });

  if (!category.seo?.metaTitle) {
    const { autoGenerateSeo } = require('../utils/autoSeoGenerator');
    autoGenerateSeo(Category, category._id, { title: category.name, description: category.description || '', category: 'Category' }).catch(() => {});
  }

  res.json({ success: true, category });
});

// @desc    Delete category (admin)
// @route   DELETE /api/admin/categories/:id
const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    res.status(404);
    throw new Error('Category not found');
  }
  const category = await Category.findOne({ _id: id, ...adminScope(req) });
  if (!category) { res.status(404); throw new Error('Category not found'); }
  if (await Category.exists({ parent: category._id, ...adminScope(req) })) throw validationError('Move or delete child categories before deleting this category', 'CATEGORY_HAS_CHILDREN');
  await category.deleteOne();
  await publicCache.invalidate(req, { namespace: 'categories' });
  res.json({ success: true, message: 'Category deleted' });
});

// @desc    Get all categories (admin, including inactive)
// @route   GET /api/admin/categories
const getAdminCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find(adminScope(req)).sort({ depth: 1, order: 1, name: 1 }).populate('parent', 'name slug level depth');
  res.json({ success: true, hierarchy: CATEGORY_LEVELS, categories });
});

module.exports = { getCategories, getCategory, createCategory, updateCategory, deleteCategory, getAdminCategories };
