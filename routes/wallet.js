const express = require('express');
const { protect } = require('../middleware/auth');
const { loadTenant } = require('../services/tenantService');
const controller = require('../controllers/walletController');

const router = express.Router();
router.use(protect, loadTenant);
router.get('/', controller.getMyWallet);

module.exports = router;
