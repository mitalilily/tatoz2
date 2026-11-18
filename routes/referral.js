const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');
const { loadTenantOptional } = require('../services/tenantService');
const { trackReferralClick } = require('../controllers/referralController');

router.post('/track', loadTenantOptional, optionalAuth, trackReferralClick);

module.exports = router;
