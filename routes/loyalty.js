const express = require('express');
const { protect } = require('../middleware/auth');
const { loadTenant } = require('../services/tenantService');
const controller = require('../controllers/loyaltyController');

const router = express.Router();
router.use(protect, loadTenant);
router.get('/', controller.getMyLoyalty);

module.exports = router;
