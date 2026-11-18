const Tenant = require('../models/Tenant');

const isGlobalAdmin = req => Boolean(
  req?.adminGlobalScope
  && req.user?.role === 'superadmin'
  && Array.isArray(req.adminTenantIds)
  && req.adminTenantIds.length,
);

const tenantScope = (req, fallbackToCurrent = true) => {
  if (isGlobalAdmin(req)) return { tenant: { $in: req.adminTenantIds } };
  if (fallbackToCurrent && req?.tenant?._id) return { tenant: req.tenant._id };
  return {};
};

const loadAdminTenantScope = async (req, res, next) => {
  try {
    const explicitTenant = String(req.headers['x-tenant-id'] || '').trim();
    if (req.user?.role === 'superadmin' && req.tenant?.type === 'platform' && !explicitTenant) {
      req.adminGlobalScope = true;
      req.adminTenantIds = await Tenant.distinct('_id', { status: { $ne: 'archived' } });
    }
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { isGlobalAdmin, tenantScope, loadAdminTenantScope };
