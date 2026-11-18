const mongoose = require('mongoose');

const clampRate = value => Math.min(100, Math.max(0, Number(value) || 0));
const finiteMoney = value => Math.max(0, Number(value) || 0);

// A rule can be scoped to a product, category and/or vendor. More specific
// matches win first; priority and recency make ties deterministic.
const matchingRule = ({ rules = [], productId, categoryId, categoryAncestors = [], vendorId } = {}) => {
  const directCategoryId = categoryId?._id || categoryId;
  const categoryIds = [directCategoryId, ...(categoryId?.ancestors || []), ...categoryAncestors]
    .filter(Boolean)
    .map(String);
  return rules
  .filter(rule => {
    if (rule.isActive === false) return false;
    if (rule.effectiveFrom && new Date(rule.effectiveFrom) > new Date()) return false;
    if (rule.product && String(rule.product) !== String(productId)) return false;
    if (rule.category && !categoryIds.includes(String(rule.category))) return false;
    if (rule.vendor && String(rule.vendor) !== String(vendorId)) return false;
    return true;
  })
  .sort((a, b) => {
    const specificity = rule => {
      const categoryDepth = rule.category ? Math.max(0, categoryIds.length - categoryIds.indexOf(String(rule.category))) : 0;
      return (rule.product ? 100 : 0) + (rule.category ? 10 + categoryDepth : 0) + (rule.vendor ? 1 : 0);
    };
    return specificity(b) - specificity(a)
      || (Number(a.priority) || 100) - (Number(b.priority) || 100)
      || new Date(b.effectiveFrom || b.createdAt || 0) - new Date(a.effectiveFrom || a.createdAt || 0)
      || String(b._id || '').localeCompare(String(a._id || ''));
  })[0] || null;
};

const resolveCommission = ({ rules, productId, categoryId, categoryAncestors, vendorId, vendorRate, categoryRate, defaultRate } = {}) => {
  const rule = matchingRule({ rules, productId, categoryId, categoryAncestors, vendorId });
  if (rule) return {
    rate: clampRate(rule.percent),
    flatFee: finiteMoney(rule.flatFee),
    source: 'rule',
    ruleId: rule._id,
    ruleName: rule.name,
  };
  if (Number(vendorRate) > 0) return { rate: clampRate(vendorRate), flatFee: 0, source: 'seller_override' };
  if (categoryRate !== null && categoryRate !== undefined && Number.isFinite(Number(categoryRate))) {
    return { rate: clampRate(categoryRate), flatFee: 0, source: 'category' };
  }
  return { rate: clampRate(defaultRate), flatFee: 0, source: 'default' };
};

const toId = value => (mongoose.isValidObjectId(value) ? String(value) : '');

module.exports = { clampRate, matchingRule, resolveCommission, toId };
