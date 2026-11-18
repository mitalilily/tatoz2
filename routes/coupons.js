const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');
const { loadTenantOptional } = require('../services/tenantService');
const { validateCoupon, getAvailableCoupons } = require('../controllers/couponController');

router.get('/available', optionalAuth, loadTenantOptional, getAvailableCoupons);
router.post('/validate', optionalAuth, loadTenantOptional, validateCoupon);

module.exports = router;
