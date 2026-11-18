const asyncHandler = require('express-async-handler');
const { authenticate } = require('../services/apiKeyService');

const requireApiKey = (...requiredScopes) => asyncHandler(async (req, res, next) => {
  const key = await authenticate(req.headers['x-api-key'] || req.headers.authorization?.replace(/^ApiKey\s+/i, ''));
  if (!key) { res.status(401); throw new Error('A valid API key is required'); }
  if (requiredScopes.some(scope => !(key.scopes || []).includes(scope))) { res.status(403); throw new Error('API key does not have the required scope'); }
  req.apiKey = key;
  req.tenant = await require('../models/Tenant').findById(key.tenant);
  if (!req.tenant || req.tenant.status === 'archived') { res.status(403); throw new Error('API key tenant is unavailable'); }
  next();
});

module.exports = { requireApiKey };
