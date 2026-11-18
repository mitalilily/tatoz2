const express = require('express');
const { protect } = require('../middleware/auth');
const { loadTenantOptional } = require('../services/tenantService');
const controller = require('../controllers/preorderSubscriptionController');
const router = express.Router();
// This router is mounted at /api, so keep the auth middleware scoped to its
// own customer resources. An unscoped router.use would protect every later
// /api route (including public SEO and telemetry) because Express executes
// router middleware before it checks the child route path.
router.use(['/preorders', '/subscriptions'], protect, loadTenantOptional);
// Active plans are safe to discover before checkout. The tenant resolver keeps
// this public read scoped to the storefront host; inactive/admin plans never
// leave the control plane when `activeOnly=true` is supplied by the customer UI.
router.get('/subscription-plans', loadTenantOptional, controller.listPlans);
router.get('/preorders', controller.listMyPreorders);
router.post('/preorders', controller.createPreorder);
router.post('/preorders/:id/cancel', controller.cancelPreorder);
router.get('/subscriptions', controller.listMySubscriptions);
router.post('/subscriptions', controller.subscribe);
router.put('/subscriptions/:id/status', controller.updateSubscriptionStatus);
module.exports = router;
