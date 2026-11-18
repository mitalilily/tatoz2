const asyncHandler = require('express-async-handler');
const service = require('../services/preorderSubscriptionService');
const tenantOf = req => { if (!req.tenant?._id) throw service.errorWith('Tenant context is required', 400, 'TENANT_REQUIRED'); return req.tenant._id; };

const createPreorder = asyncHandler(async (req, res) => { const result = await service.createPreorder({ tenant: tenantOf(req), user: req.user, data: req.body || {} }); res.status(result.idempotent ? 200 : 201).json({ success: true, ...result, tenantScoped: true }); });
const listMyPreorders = asyncHandler(async (req, res) => res.json({ success: true, ...(await service.listPreorders({ tenant: tenantOf(req), user: req.user, status: req.query.status, page: req.query.page, limit: req.query.limit })), tenantScoped: true }));
const cancelPreorder = asyncHandler(async (req, res) => res.json({ success: true, preorder: await service.updatePreorderStatus({ tenant: tenantOf(req), preorderId: req.params.id, status: 'cancelled', actor: req.user, note: 'Cancelled by customer' }), tenantScoped: true }));
const listAdminPreorders = asyncHandler(async (req, res) => res.json({ success: true, ...(await service.listPreorders({ tenant: tenantOf(req), status: req.query.status, page: req.query.page, limit: req.query.limit })), tenantScoped: true }));
const updatePreorderStatus = asyncHandler(async (req, res) => res.json({ success: true, preorder: await service.updatePreorderStatus({ tenant: tenantOf(req), preorderId: req.params.id, status: req.body?.status, actor: req.user, note: req.body?.note, order: req.body?.order }), tenantScoped: true }));
const createPlan = asyncHandler(async (req, res) => res.status(201).json({ success: true, plan: await service.createPlan({ tenant: tenantOf(req), data: req.body || {}, actor: req.user }), tenantScoped: true }));
const listPlans = asyncHandler(async (req, res) => res.json({ success: true, plans: await service.listPlans({ tenant: tenantOf(req), activeOnly: req.query.activeOnly === 'true' }), tenantScoped: true }));
const subscribe = asyncHandler(async (req, res) => { const result = await service.subscribe({ tenant: tenantOf(req), user: req.user, data: req.body || {} }); res.status(result.idempotent ? 200 : 201).json({ success: true, ...result, tenantScoped: true }); });
const listMySubscriptions = asyncHandler(async (req, res) => res.json({ success: true, ...(await service.listSubscriptions({ tenant: tenantOf(req), user: req.user, status: req.query.status, page: req.query.page, limit: req.query.limit })), tenantScoped: true }));
const updateSubscriptionStatus = asyncHandler(async (req, res) => res.json({ success: true, subscription: await service.updateSubscriptionStatus({ tenant: tenantOf(req), subscriptionId: req.params.id, status: req.body?.status, actor: req.user, user: req.user, note: req.body?.note }), tenantScoped: true }));

module.exports = { createPreorder, listMyPreorders, cancelPreorder, listAdminPreorders, updatePreorderStatus, createPlan, listPlans, subscribe, listMySubscriptions, updateSubscriptionStatus };
