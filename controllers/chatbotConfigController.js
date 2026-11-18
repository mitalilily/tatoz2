const asyncHandler = require('express-async-handler');
const { getChatbotConfig, updateChatbotConfig, toPublicConfig } = require('../services/chatbotConfigService');

// @desc    Get full chatbot config (admin)
// @route   GET /api/admin/chatbot/config
const getConfig = asyncHandler(async (req, res) => {
  const config = await getChatbotConfig({ skipCache: true });
  res.json({ success: true, config });
});

// @desc    Update chatbot config (admin)
// @route   PUT /api/admin/chatbot/config
const updateConfig = asyncHandler(async (req, res) => {
  const config = await updateChatbotConfig(req.body || {});
  res.json({ success: true, config });
});

// @desc    Get public chatbot config for the storefront widget (no auth)
// @route   GET /api/chat/config
const getPublicConfig = asyncHandler(async (req, res) => {
  const config = await getChatbotConfig();
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ success: true, config: toPublicConfig(config) });
});

module.exports = { getConfig, updateConfig, getPublicConfig };
