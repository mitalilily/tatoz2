const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { loadTenant } = require('../services/tenantService');
const { getTaxProfile } = require('../controllers/taxController');

router.get('/profile', protect, loadTenant, getTaxProfile);

module.exports = router;
