const express = require('express');
const { protect } = require('../middleware/auth');
const { loadTenantOptional } = require('../services/tenantService');
const controller = require('../controllers/b2bController');

const router = express.Router();
router.use(protect, loadTenantOptional);
router.get('/me', controller.getMyAccount);
router.get('/price-quote', controller.quotePrice);

module.exports = router;
