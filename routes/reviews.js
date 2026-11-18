const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { loadTenantOptional } = require('../services/tenantService');
const { createReview, getProductReviews, markHelpful, reportReview } = require('../controllers/reviewController');

router.post('/', protect, loadTenantOptional, createReview);
router.get('/product/:productId', loadTenantOptional, getProductReviews);
router.post('/:id/helpful', protect, loadTenantOptional, markHelpful);
router.post('/:id/report', protect, loadTenantOptional, reportReview);

module.exports = router;
