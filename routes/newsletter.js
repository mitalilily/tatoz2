const express = require('express');
const router = express.Router();
const { loadTenantOptional } = require('../services/tenantService');
const { subscribe, unsubscribe } = require('../controllers/newsletterController');

router.post('/subscribe', loadTenantOptional, subscribe);
router.post('/unsubscribe', loadTenantOptional, unsubscribe);

module.exports = router;
