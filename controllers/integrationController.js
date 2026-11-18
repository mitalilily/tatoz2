const asyncHandler = require('express-async-handler');
const tenantIntegrationService = require('../services/tenantIntegrationService');
const { findPlatformTenant } = require('../services/tenantService');

const platformTenant = async () => {
  const tenant = await findPlatformTenant();
  if (!tenant) {
    const error = new Error('Platform tenant is not configured');
    error.statusCode = 503;
    throw error;
  }
  return tenant;
};

const getIntegrations = asyncHandler(async (req, res) => {
  const tenant = await platformTenant();
  const integrations = await tenantIntegrationService.listPublic(tenant);
  res.json({ success: true, tenant: { id: tenant._id, key: tenant.key, name: tenant.name }, integrations, canManage: req.user?.role === 'superadmin' });
});

const updateIntegration = asyncHandler(async (req, res) => {
  const { provider } = req.params;
  const tenant = await platformTenant();
  const integration = await tenantIntegrationService.saveProvider(tenant, provider, req.body, req.user._id);
  res.json({ success: true, message: `${integration.name} configuration saved`, integration });
});

const testIntegration = asyncHandler(async (req, res) => {
  const tenant = await platformTenant();
  const result = await tenantIntegrationService.testProvider(tenant, req.params.provider, req.body || {}, req.user._id);
  res.json({ success: true, status: result.status, message: result.message, latencyMs: result.latencyMs, verificationToken: result.verificationToken });
});

const clearIntegration = asyncHandler(async (req, res) => {
  const tenant = await platformTenant();
  await tenantIntegrationService.clearProvider(tenant, req.params.provider, 'default', req.user._id);
  res.json({ success: true, message: 'Integration credentials removed' });
});

module.exports = { getIntegrations, updateIntegration, testIntegration, clearIntegration };
