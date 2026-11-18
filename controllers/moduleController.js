const asyncHandler = require('express-async-handler');
const moduleService = require('../services/moduleService');
const { canManageTenant, findPlatformTenant } = require('../services/tenantService');

const isPlatformModuleRoute = req => String(req.baseUrl || '').endsWith('/admin');
const targetTenant = async req => isPlatformModuleRoute(req) ? findPlatformTenant() : (req.tenant || findPlatformTenant());

const getModules = asyncHandler(async (req, res) => {
  const tenant = await targetTenant(req);
  const canManage = tenant
    ? await canManageTenant(req, tenant)
    : req.user?.role === 'superadmin';
  res.json({
    success: true,
    tenant: tenant ? { id: tenant._id, key: tenant.key, name: tenant.name } : null,
    canManage,
    modules: await moduleService.listPublic(tenant),
  });
});

const updateModule = asyncHandler(async (req, res) => {
  const tenant = await targetTenant(req);
  if (!tenant) {
    res.status(400);
    throw new Error('Tenant context is required');
  }
  const canManage = await canManageTenant(req, tenant);
  if (!canManage) {
    res.status(403);
    throw new Error('Tenant administrator access required');
  }
  if (typeof req.body?.enabled !== 'boolean') {
    res.status(400);
    throw new Error('enabled must be a boolean');
  }
  const module = await moduleService.setEnabled(tenant, req.params.module, req.body.enabled, req.user._id);
  res.json({ success: true, module });
});

module.exports = { getModules, updateModule };
