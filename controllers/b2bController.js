const asyncHandler = require('express-async-handler');
const b2bService = require('../services/b2bService');

const tenantOf = req => {
  if (!req.tenant?._id) throw b2bService.errorWith('Tenant context is required', 400, 'TENANT_REQUIRED');
  return req.tenant._id;
};

const listAccounts = asyncHandler(async (req, res) => res.json({ success: true, ...(await b2bService.listAccounts({ tenant: tenantOf(req), status: req.query.status, page: req.query.page, limit: req.query.limit })), tenantScoped: true }));
const createAccount = asyncHandler(async (req, res) => res.status(201).json({ success: true, account: await b2bService.createAccount({ tenant: tenantOf(req), data: req.body || {}, actor: req.user }), tenantScoped: true }));
const updateAccount = asyncHandler(async (req, res) => res.json({ success: true, account: await b2bService.updateAccount({ tenant: tenantOf(req), accountId: req.params.id, data: req.body || {}, actor: req.user }), tenantScoped: true }));
const listPriceRules = asyncHandler(async (req, res) => res.json({ success: true, rules: await b2bService.listPriceRules({ tenant: tenantOf(req), activeOnly: req.query.activeOnly === 'true' }), tenantScoped: true }));
const createPriceRule = asyncHandler(async (req, res) => res.status(201).json({ success: true, rule: await b2bService.createPriceRule({ tenant: tenantOf(req), data: req.body || {}, actor: req.user }), tenantScoped: true }));
const getMyAccount = asyncHandler(async (req, res) => res.json({ success: true, account: await b2bService.getAccount({ tenant: tenantOf(req), user: req.user }), tenantScoped: true }));
const quotePrice = asyncHandler(async (req, res) => res.json({ success: true, quote: await b2bService.quotePrice({ tenant: tenantOf(req), user: req.user, productId: req.query.productId, quantity: req.query.quantity }), tenantScoped: true }));

module.exports = { listAccounts, createAccount, updateAccount, listPriceRules, createPriceRule, getMyAccount, quotePrice };
