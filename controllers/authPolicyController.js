const asyncHandler = require('express-async-handler');
const authPolicyService = require('../services/authPolicyService');
const { findPlatformTenant } = require('../services/tenantService');

const getPlatformTenant = async () => findPlatformTenant();

const getPlatformAuthPolicy = asyncHandler(async (req, res) => {
  const tenant = await getPlatformTenant();
  if (!tenant) {
    res.status(503);
    throw new Error('Platform tenant is not configured');
  }
  res.json({ success: true, tenant: { id: tenant._id, key: tenant.key, name: tenant.name }, canManage: req.user?.role === 'superadmin', policy: await authPolicyService.getPublicConfig(tenant._id) });
});

const updatePlatformAuthPolicy = asyncHandler(async (req, res) => {
  const tenant = await getPlatformTenant();
  if (!tenant) {
    res.status(503);
    throw new Error('Platform tenant is not configured');
  }
  res.json({ success: true, policy: await authPolicyService.setPolicy(tenant, req.body, req.user._id) });
});

const getTenantAuthPolicy = asyncHandler(async (req, res) => {
  res.json({ success: true, tenant: { id: req.tenant._id, key: req.tenant.key, name: req.tenant.name }, canManage: Boolean(req.tenantMembership && ['owner', 'admin', 'manager'].includes(req.tenantMembership.role)), policy: await authPolicyService.getPublicConfig(req.tenant._id) });
});

const updateTenantAuthPolicy = asyncHandler(async (req, res) => {
  res.json({ success: true, policy: await authPolicyService.setPolicy(req.tenant, req.body, req.user._id) });
});

module.exports = { getPlatformAuthPolicy, updatePlatformAuthPolicy, getTenantAuthPolicy, updateTenantAuthPolicy };
