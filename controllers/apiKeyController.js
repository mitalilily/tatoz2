const asyncHandler = require('express-async-handler');
const apiKeyService = require('../services/apiKeyService');

const list = asyncHandler(async (req, res) => res.json({ success: true, apiKeys: await apiKeyService.list(req.tenant) }));
const create = asyncHandler(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) { res.status(400); throw new Error('API key name is required'); }
  const result = await apiKeyService.create({ tenant: req.tenant, name, scopes: req.body?.scopes, expiresAt: req.body?.expiresAt, createdBy: req.user?._id });
  res.status(201).json({ success: true, apiKey: result.apiKey, key: result.key, warning: 'Copy this key now. The secret is not shown again.' });
});
const revoke = asyncHandler(async (req, res) => {
  const apiKey = await apiKeyService.revoke({ tenant: req.tenant, id: req.params.id });
  if (!apiKey) { res.status(404); throw new Error('API key not found or already revoked'); }
  res.json({ success: true, apiKey });
});

module.exports = { list, create, revoke };
