const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');
const { loadTenantOptional } = require('../services/tenantService');
const { getActiveGateways, createPaymentOrder, releaseWallet, verifyPayment } = require('../controllers/paymentController');

// Public: get active gateways
router.get('/gateways', loadTenantOptional, getActiveGateways);

// Auth required: create payment order & verify
router.post('/order', optionalAuth, loadTenantOptional, createPaymentOrder);
router.post('/release-wallet', optionalAuth, loadTenantOptional, releaseWallet);
router.post('/verify', optionalAuth, loadTenantOptional, verifyPayment);

module.exports = router;
