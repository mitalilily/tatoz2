const express = require('express');
const { optionalAuth } = require('../middleware/auth');
const { loadTenantOptional } = require('../services/tenantService');
const { listBundles, getBundle, quotePublicBundle } = require('../controllers/bundleController');

const router = express.Router();
router.get('/', loadTenantOptional, listBundles);
router.get('/:slug', optionalAuth, loadTenantOptional, getBundle);
router.post('/:id/quote', optionalAuth, loadTenantOptional, quotePublicBundle);

module.exports = router;
