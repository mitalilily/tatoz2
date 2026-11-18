const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { loadTenant } = require('../services/tenantService');
const { requireTurnstile } = require('../middleware/turnstile');
const { registerVendor, getPublicStore, listVendors, getPublicStoreProducts } = require('../controllers/vendorController');
const { getPublicStorePage } = require('../controllers/vendorPageController');

// Public routes
router.get('/', listVendors);
router.get('/store/:slug', getPublicStore);
router.get('/store/:slug/products', getPublicStoreProducts);
router.get('/store/:slug/page', getPublicStorePage);

// Protected routes
router.post('/register', protect, loadTenant, requireTurnstile, registerVendor);

module.exports = router;
