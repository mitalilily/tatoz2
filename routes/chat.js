const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { loadTenant, loadTenantOptional } = require('../services/tenantService');
const { startConversation, sendMessage, getHistory, getMyConversation } = require('../controllers/chatController');
const { getPublicConfig } = require('../controllers/chatbotConfigController');

// Public widget config (no auth — safe subset only)
router.get('/config', loadTenantOptional, getPublicConfig);

// Login-only chat (unchanged auth model)
router.get('/history', protect, loadTenant, getHistory);
router.get('/:id', protect, loadTenant, getMyConversation);
router.post('/start', protect, loadTenant, startConversation);
router.post('/:id/message', protect, loadTenant, sendMessage);

module.exports = router;
