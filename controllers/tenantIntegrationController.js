const asyncHandler = require('express-async-handler');
const tenantIntegrationService = require('../services/tenantIntegrationService');
const { canManageTenant } = require('../services/tenantService');

const getIntegrations = asyncHandler(async (req, res) => {
  res.json({ success: true, tenant: { id: req.tenant._id, key: req.tenant.key, name: req.tenant.name }, canManage: await canManageTenant(req), integrations: await tenantIntegrationService.listPublic(req.tenant) });
});

const testIntegration = asyncHandler(async (req, res) => {
  const result = await tenantIntegrationService.testProvider(req.tenant, req.params.provider, req.body, req.user._id);
  res.json({ success: true, status: result.status, message: result.message, latencyMs: result.latencyMs, verificationToken: result.verificationToken });
});

const updateIntegration = asyncHandler(async (req, res) => {
  const integration = await tenantIntegrationService.saveProvider(req.tenant, req.params.provider, req.body, req.user._id);
  res.json({ success: true, integration });
});

const deleteIntegration = asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await tenantIntegrationService.clearProvider(req.tenant, req.params.provider, req.body?.accountKey || 'default', req.user._id)) });
});

const rotateIntegrationKey = asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await tenantIntegrationService.rotateProviderKey(req.tenant, req.params.provider, req.user._id, req.body?.accountKey || 'default')) });
});

const getHealth = asyncHandler(async (req, res) => {
  res.json({ success: true, provider: req.params.provider, events: await tenantIntegrationService.health(req.tenant, req.params.provider) });
});

const getDeliveries = asyncHandler(async (req, res) => {
  res.json({ success: true, provider: req.params.provider, deliveries: await tenantIntegrationService.deliveries(req.tenant, req.params.provider) });
});

module.exports = { getIntegrations, testIntegration, updateIntegration, deleteIntegration, rotateIntegrationKey, getHealth, getDeliveries };
