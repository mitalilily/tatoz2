const mongoose = require('mongoose');
const B2BAccount = require('../models/B2BAccount');
const PriceRule = require('../models/PriceRule');
const Product = require('../models/Product');
const { addApprovedProductFilter } = require('./productApprovalService');

const idOf = value => value?._id || value?.id || value;
const tenantOf = value => idOf(value?.tenant || value);
const errorWith = (message, statusCode = 400, publicCode = 'B2B_OPERATION_INVALID') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
};
const requireTenant = value => {
  const tenant = tenantOf(value);
  if (!tenant || !mongoose.isValidObjectId(tenant)) throw errorWith('Tenant context is required', 400, 'TENANT_REQUIRED');
  return tenant;
};
const text = value => String(value ?? '').trim();
const code = value => {
  const normalized = text(value).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(normalized)) throw errorWith('Customer code must be 2-40 letters, numbers, hyphens or underscores');
  return normalized;
};
const positiveInteger = (value, label) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000000) throw errorWith(`${label} must be a positive whole number`);
  return parsed;
};
const nonNegativeNumber = (value, label) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100000000000) throw errorWith(`${label} must be a non-negative number`);
  return Math.round(parsed * 100) / 100;
};
const normalizeTiers = value => {
  if (value === undefined || value === null || value === '') return [];
  const values = Array.isArray(value) ? value : [value];
  const allowed = new Set(['wholesale', 'dealer', 'distributor', 'custom']);
  const result = [...new Set(values.map(item => text(item).toLowerCase()).filter(Boolean))];
  if (result.some(item => !allowed.has(item))) throw errorWith('Price rule contains an invalid customer tier');
  return result;
};
const validIdList = (value, label) => {
  if (value === undefined || value === null) return [];
  const list = Array.isArray(value) ? value : [value];
  if (list.length > 100) throw errorWith(`${label} contains too many entries`);
  if (list.some(item => !mongoose.isValidObjectId(item))) throw errorWith(`${label} contains an invalid identifier`);
  return [...new Set(list.map(String))];
};

const createAccount = async ({ tenant, data = {}, actor } = {}) => {
  const tenantId = requireTenant(tenant);
  const user = idOf(data.user);
  if (!mongoose.isValidObjectId(user)) throw errorWith('A valid customer user is required');
  const companyName = text(data.companyName);
  if (!companyName || companyName.length > 160) throw errorWith('Company name is required and must be at most 160 characters');
  const account = await B2BAccount.create({
    tenant: tenantId,
    user,
    customerCode: code(data.customerCode || `B2B-${String(user).slice(-8)}`),
    companyName,
    gstin: text(data.gstin).toUpperCase().slice(0, 20),
    pricingTier: text(data.pricingTier || 'wholesale').toLowerCase(),
    creditLimit: nonNegativeNumber(data.creditLimit ?? 0, 'Credit limit'),
    paymentTermsDays: Math.min(365, Math.max(0, Number(data.paymentTermsDays || 0))),
    notes: text(data.notes).slice(0, 1000),
    createdBy: idOf(actor) || null,
  });
  return account.toObject();
};

const listAccounts = async ({ tenant, status, page = 1, limit = 50 } = {}) => {
  const tenantId = requireTenant(tenant);
  const filter = { tenant: tenantId };
  if (status) filter.status = String(status);
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
  const [items, total] = await Promise.all([
    B2BAccount.find(filter).populate('user', 'name email phone').sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean(),
    B2BAccount.countDocuments(filter),
  ]);
  return { items, total, page: safePage, limit: safeLimit, pages: Math.ceil(total / safeLimit) };
};

const updateAccount = async ({ tenant, accountId, data = {}, actor } = {}) => {
  const tenantId = requireTenant(tenant);
  const account = await B2BAccount.findOne({ _id: accountId, tenant: tenantId });
  if (!account) throw errorWith('B2B account not found', 404, 'B2B_ACCOUNT_NOT_FOUND');
  if (data.companyName !== undefined) account.companyName = text(data.companyName).slice(0, 160);
  if (data.gstin !== undefined) account.gstin = text(data.gstin).toUpperCase().slice(0, 20);
  if (data.notes !== undefined) account.notes = text(data.notes).slice(0, 1000);
  if (data.pricingTier !== undefined) {
    const tier = text(data.pricingTier).toLowerCase();
    if (!['wholesale', 'dealer', 'distributor', 'custom'].includes(tier)) throw errorWith('Invalid B2B pricing tier');
    account.pricingTier = tier;
  }
  if (data.creditLimit !== undefined) account.creditLimit = nonNegativeNumber(data.creditLimit, 'Credit limit');
  if (data.paymentTermsDays !== undefined) account.paymentTermsDays = Math.min(365, Math.max(0, Number(data.paymentTermsDays)));
  if (data.status !== undefined) {
    if (!['pending', 'active', 'suspended', 'rejected'].includes(data.status)) throw errorWith('Invalid B2B account status');
    account.status = data.status;
    if (data.status === 'active') { account.approvedAt = new Date(); account.approvedBy = idOf(actor) || null; }
  }
  await account.save();
  return account.toObject();
};

const createPriceRule = async ({ tenant, data = {}, actor } = {}) => {
  const tenantId = requireTenant(tenant);
  const name = text(data.name);
  if (!name || name.length > 120) throw errorWith('Price rule name is required and must be at most 120 characters');
  const discountType = text(data.discountType || 'percentage').toLowerCase();
  if (!['percentage', 'fixed_discount', 'fixed_price'].includes(discountType)) throw errorWith('Invalid price rule type');
  const value = nonNegativeNumber(data.value, 'Price rule value');
  if (discountType === 'percentage' && value > 100) throw errorWith('Percentage discount cannot exceed 100');
  const rule = await PriceRule.create({
    tenant: tenantId, name, customerTiers: normalizeTiers(data.customerTiers), products: validIdList(data.products, 'Products'), categories: validIdList(data.categories, 'Categories'),
    discountType, value, minQuantity: positiveInteger(data.minQuantity || 1, 'Minimum quantity'), priority: Math.max(0, Math.min(10000, Number(data.priority || 0))),
    startsAt: data.startsAt ? new Date(data.startsAt) : undefined, endsAt: data.endsAt ? new Date(data.endsAt) : undefined, isActive: data.isActive !== false && data.isActive !== 'false', createdBy: idOf(actor) || null,
  });
  return rule.toObject();
};

const listPriceRules = async ({ tenant, activeOnly = false } = {}) => {
  const tenantId = requireTenant(tenant);
  const filter = { tenant: tenantId };
  if (activeOnly) filter.isActive = true;
  return PriceRule.find(filter).sort({ priority: -1, createdAt: -1 }).lean();
};

const getAccount = async ({ tenant, user } = {}) => {
  const tenantId = requireTenant(tenant);
  if (!mongoose.isValidObjectId(idOf(user))) return null;
  return B2BAccount.findOne({ tenant: tenantId, user: idOf(user) }).populate('user', 'name email phone').lean();
};

const quotePrice = async ({ tenant, user, productId, quantity = 1 } = {}) => {
  const tenantId = requireTenant(tenant);
  const qty = positiveInteger(quantity, 'Quantity');
  if (!mongoose.isValidObjectId(productId)) throw errorWith('Product identifier is invalid', 400, 'PRODUCT_NOT_FOUND');
  const productQuery = { _id: productId, tenant: tenantId, isActive: true };
  addApprovedProductFilter(productQuery);
  const product = await Product.findOne(productQuery).select('price title category').lean();
  if (!product) throw errorWith('Product not found for this tenant', 404, 'PRODUCT_NOT_FOUND');
  const account = await getAccount({ tenant: tenantId, user });
  const now = new Date();
  const rules = account?.status === 'active' ? await PriceRule.find({
    tenant: tenantId, isActive: true, minQuantity: { $lte: qty },
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
      { $or: [{ products: { $size: 0 } }, { products: product._id }] },
      { $or: [{ categories: { $size: 0 } }, { categories: product.category }] },
    ],
    $or: [{ customerTiers: { $size: 0 } }, { customerTiers: account.pricingTier }],
  }).sort({ priority: -1, createdAt: -1 }).lean() : [];
  const rule = rules[0] || null;
  const retailPrice = Math.round(Number(product.price || 0) * 100) / 100;
  let finalPrice = retailPrice;
  if (rule) {
    if (rule.discountType === 'percentage') finalPrice = retailPrice * (1 - Number(rule.value) / 100);
    if (rule.discountType === 'fixed_discount') finalPrice = retailPrice - Number(rule.value);
    if (rule.discountType === 'fixed_price') finalPrice = Number(rule.value);
  }
  finalPrice = Math.max(0, Math.round(finalPrice * 100) / 100);
  return { product: { id: product._id, title: product.title }, quantity: qty, retailPrice, price: finalPrice, total: Math.round(finalPrice * qty * 100) / 100, account: account ? { id: account._id, customerCode: account.customerCode, companyName: account.companyName, pricingTier: account.pricingTier, status: account.status, creditLimit: account.creditLimit, creditUsed: account.creditUsed, paymentTermsDays: account.paymentTermsDays } : null, appliedRule: rule ? { id: rule._id, name: rule.name, discountType: rule.discountType, value: rule.value } : null };
};

module.exports = { createAccount, listAccounts, updateAccount, createPriceRule, listPriceRules, getAccount, quotePrice, errorWith };
