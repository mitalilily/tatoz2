const express = require('express');
const router = express.Router();
const { getPublicCustomization } = require('../controllers/customizationController');
const { loadTenantOptional } = require('../services/tenantService');

router.get('/', loadTenantOptional, getPublicCustomization);

module.exports = router;
