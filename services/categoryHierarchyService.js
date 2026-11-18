const mongoose = require('mongoose');
const Category = require('../models/Category');

const CATEGORY_LEVELS = ['menu', 'submenu', 'category', 'subcategory'];

const levelForDepth = depth => CATEGORY_LEVELS[Math.max(0, Math.min(3, Number(depth) || 0))];
const depthForLevel = level => Math.max(0, CATEGORY_LEVELS.indexOf(String(level || '').toLowerCase()));
const idOf = value => value?._id || value;

const tenantFilter = tenantId => (tenantId ? { tenant: tenantId } : {});

/**
 * Turns the flat category collection into a recursive tree. `subCategories`
 * is retained as an alias for older storefront consumers while `children` is
 * the canonical 4-level response field.
 */
const buildCategoryTree = (categories = []) => {
  const nodes = categories.map(category => ({
    ...category,
    children: [],
  }));
  const byId = new Map(nodes.map(node => [String(node._id), node]));
  const roots = [];

  nodes.forEach(node => {
    const parentId = idOf(node.parent);
    const parent = parentId ? byId.get(String(parentId)) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });

  const finalize = node => {
    node.children.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.name).localeCompare(String(b.name)));
    node.children.forEach(finalize);
    node.subCategories = node.children;
    return node;
  };
  roots.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.name).localeCompare(String(b.name)));
  return roots.map(finalize);
};

const flattenCategoryTree = (tree = [], output = []) => {
  tree.forEach(node => {
    output.push(node);
    flattenCategoryTree(node.children || node.subCategories || [], output);
  });
  return output;
};

const getDescendantCategoryIds = async (categoryId, tenantId, { includeInactive = true } = {}) => {
  if (!mongoose.isValidObjectId(categoryId)) return [];
  const scope = { _id: categoryId, ...tenantFilter(tenantId) };
  if (!includeInactive) scope.isActive = true;
  const exists = await Category.exists(scope);
  if (!exists) return [];

  const ids = [new mongoose.Types.ObjectId(categoryId)];
  let frontier = ids.slice();
  while (frontier.length) {
    const children = await Category.find({
      parent: { $in: frontier },
      ...tenantFilter(tenantId),
      ...(includeInactive ? {} : { isActive: true }),
    }).select('_id').lean();
    frontier = children.map(child => child._id);
    ids.push(...frontier);
  }
  return ids;
};

const getCategoryAncestors = async (category, tenantId) => {
  const ancestorIds = (category?.ancestors || []).map(idOf).filter(Boolean);
  if (!ancestorIds.length) return [];
  const rows = await Category.find({ _id: { $in: ancestorIds }, ...tenantFilter(tenantId) })
    .select('_id name slug level depth parent')
    .lean();
  const order = new Map(ancestorIds.map((id, index) => [String(id), index]));
  return rows.sort((a, b) => order.get(String(a._id)) - order.get(String(b._id)));
};

module.exports = {
  CATEGORY_LEVELS,
  levelForDepth,
  depthForLevel,
  buildCategoryTree,
  flattenCategoryTree,
  getDescendantCategoryIds,
  getCategoryAncestors,
};
