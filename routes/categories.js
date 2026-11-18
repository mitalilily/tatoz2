const express = require('express');
const router = express.Router();
const { getCategories, getCategory } = require('../controllers/categoryController');
const { loadTenantOptional } = require('../services/tenantService');

router.get('/', loadTenantOptional, getCategories);
router.get('/:slug', loadTenantOptional, getCategory);

module.exports = router;
