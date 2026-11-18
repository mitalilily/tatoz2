const express = require('express');
const { protect } = require('../middleware/auth');
const { loadTenant } = require('../services/tenantService');
const controller = require('../controllers/giftCardController');

const router = express.Router();
router.use(protect, loadTenant);
router.get('/', controller.getMyGiftCardHistory);
router.post('/validate', controller.validateGiftCard);

module.exports = router;
