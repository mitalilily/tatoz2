const express = require('express');
const router = express.Router();
const { getBrands, getBrandBySlug } = require('../controllers/brandController');
const { loadTenantOptional } = require('../services/tenantService');

router.get('/', loadTenantOptional, getBrands);
router.get('/:slug', loadTenantOptional, getBrandBySlug);

module.exports = router;
