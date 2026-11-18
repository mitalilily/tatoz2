const express = require('express');
const router = express.Router();
const { optionalAuth, protect } = require('../middleware/auth');
const { loadTenantOptional } = require('../services/tenantService');
const {
  getProducts, getProductVendors, getProductSuggestions, getProduct, getFeaturedProducts, getFlashDeals,
} = require('../controllers/productController');
const { getQuestions, askQuestion, answerQuestion } = require('../controllers/questionController');
const { subscribeAlert, unsubscribeAlert, checkAlert } = require('../controllers/stockAlertController');
const { publicRecommendations } = require('../controllers/recommendationController');

router.get('/', loadTenantOptional, getProducts);
router.get('/featured', loadTenantOptional, getFeaturedProducts);
router.get('/flash-deals', loadTenantOptional, getFlashDeals);
router.get('/suggestions', loadTenantOptional, getProductSuggestions);
router.get('/vendors', loadTenantOptional, getProductVendors);

// Q&A
router.get('/:slug/questions', getQuestions);
router.post('/:slug/questions', protect, askQuestion);
router.post('/:slug/questions/:qId/answer', protect, answerQuestion);

// Stock Alerts
router.get('/:slug/stock-alert', loadTenantOptional, optionalAuth, checkAlert);
router.post('/:slug/stock-alert', loadTenantOptional, optionalAuth, subscribeAlert);
router.delete('/:slug/stock-alert', loadTenantOptional, optionalAuth, unsubscribeAlert);

const priceDropAlerts = require('../controllers/priceDropAlertController');
router.get('/:slug/price-drop-alert', protect, loadTenantOptional, priceDropAlerts.checkAlert);
router.post('/:slug/price-drop-alert', protect, loadTenantOptional, priceDropAlerts.subscribeAlert);
router.delete('/:slug/price-drop-alert', protect, loadTenantOptional, priceDropAlerts.unsubscribeAlert);

router.get('/:slug/recommendations', loadTenantOptional, publicRecommendations);

router.get('/:slug', optionalAuth, loadTenantOptional, getProduct);

module.exports = router;
