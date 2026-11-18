const express = require('express');
const { protect } = require('../middleware/auth');
const { loadTenantOptional } = require('../services/tenantService');
const controller = require('../controllers/affiliateController');

const router = express.Router();
router.use(protect, loadTenantOptional);
router.post('/apply', controller.apply);
router.get('/me', controller.getMe);
router.get('/payouts', controller.getMyPayouts);
router.post('/payouts', controller.requestPayout);

module.exports = router;
