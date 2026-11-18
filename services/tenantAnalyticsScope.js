const { getTenantUserIds } = require('./customerScopeService');
const Vendor = require('../models/Vendor');
const Tenant = require('../models/Tenant');

const idFor = value => value?._id || value || null;

/**
 * Analytics and exports use a single scope object so every query can make its
 * tenant boundary explicit. User is a legacy global collection, therefore its
 * boundary is represented by the tenant membership/customer identity list.
 */
const buildTenantAnalyticsScope = async tenant => {
  const tenantId = idFor(tenant);
  if (!tenantId) return { tenantId: null, userIds: null, vendorIds: null };

  // The platform admin is the control plane for every active store. Products,
  // vendors and store-owned operational records are intentionally assigned to
  // their store tenant during migration, so querying only the platform tenant
  // makes the platform dashboard appear empty. Tenant managers still receive
  // the exact single-tenant scope below.
  const platformWide = String(tenant?.type || '').toLowerCase() === 'platform';
  const tenantIds = platformWide
    ? await Tenant.distinct('_id', { status: { $ne: 'archived' } })
    : [tenantId];
  const [userIdSets, vendorIds] = await Promise.all([
    Promise.all(tenantIds.map(id => getTenantUserIds(id))),
    Vendor.distinct('_id', { tenant: { $in: tenantIds } }),
  ]);

  return {
    tenantId,
    tenantIds,
    platformWide,
    userIds: Array.from(new Map(userIdSets.flat().filter(Boolean).map(id => [String(id), id])).values()),
    vendorIds,
  };
};

const withTenant = (scope, query = {}) => (
  scope?.tenantIds?.length
    ? { ...query, tenant: scope.tenantIds.length === 1 ? scope.tenantIds[0] : { $in: scope.tenantIds } }
    : scope?.tenantId ? { ...query, tenant: scope.tenantId } : { ...query }
);

const withTenantUsers = (scope, query = {}) => (
  scope?.userIds ? { ...query, _id: { $in: scope.userIds } } : { ...query }
);

const withTenantVendors = (scope, query = {}) => (
  scope?.vendorIds ? { ...query, vendor: { $in: scope.vendorIds } } : { ...query }
);

module.exports = { buildTenantAnalyticsScope, withTenant, withTenantUsers, withTenantVendors };
