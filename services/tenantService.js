const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');
const TenantMembership = require('../models/TenantMembership');
const Vendor = require('../models/Vendor');

const isSuperAdmin = user => user && user.role === 'superadmin';
const isPlatformAdmin = user => user && ['admin', 'superadmin'].includes(user.role);

const findPlatformTenant = () => Tenant.findOne({ type: 'platform', status: { $ne: 'archived' } });
const findVerifiedTenantByHost = host => Tenant.findOne({
  status: 'active',
  domains: { $elemMatch: { host, verified: true } },
});

const requestHost = req => {
  const forwarded = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim().toLowerCase();
  const raw = forwarded || String(req.headers.host || '').split(',')[0].trim().toLowerCase();
  if (raw.startsWith('[')) {
    const end = raw.indexOf(']');
    return end > 0 ? raw.slice(1, end) : raw;
  }
  // An unbracketed IPv6 host has multiple colons and no port delimiter.
  return raw.split(':').length > 2 ? raw : raw.split(':')[0];
};

const isLoopbackRequest = req => {
  if (req.headers['x-forwarded-host']) return false;
  const remoteAddress = String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
  return ['127.0.0.1', '::1'].includes(remoteAddress);
};

const resolveTenant = async (req, { required = true } = {}) => {
  if (req.tenant) return req.tenant;

  let tenant = null;
  const requestedId = req.headers['x-tenant-id'];
  if (requestedId && isSuperAdmin(req.user)) {
    if (!mongoose.isValidObjectId(requestedId)) { const error = new Error('Invalid tenant identifier'); error.statusCode = 400; throw error; }
    tenant = await Tenant.findOne({ _id: requestedId, status: { $ne: 'archived' } });
  }

  if (!tenant && req.vendor?.tenant) {
    tenant = await Tenant.findOne({ _id: req.vendor.tenant, status: { $ne: 'archived' } });
  }

  const host = requestHost(req);
  if (!tenant && host) tenant = await findVerifiedTenantByHost(host);

  // The local production server is commonly opened at localhost:8000 while
  // the real tenant domain is configured for deployment. Resolve only the
  // platform tenant for direct loopback requests; never use this fallback for
  // forwarded/public traffic, where an unmapped host must remain isolated.
  if (!tenant && ['localhost', '127.0.0.1', '::1'].includes(host) && isLoopbackRequest(req)) {
    tenant = await findPlatformTenant();
  }

  if (!tenant && req.user) {
    const membership = await TenantMembership.findOne({ user: req.user._id, status: 'active' }).sort({ updatedAt: -1 });
    if (membership) {
      tenant = await Tenant.findOne({ _id: membership.tenant, status: { $ne: 'archived' } });
      req.tenantMembership = membership;
    }
  }

  if (!tenant && isPlatformAdmin(req.user)) tenant = await findPlatformTenant();

  // Host/header/vendor resolution can identify the tenant before the
  // membership branch runs. Hydrate the membership for that resolved tenant
  // as well so tenant managers retain scoped write access.
  if (tenant && req.user && !req.tenantMembership && !isSuperAdmin(req.user)) {
    req.tenantMembership = await TenantMembership.findOne({ user: req.user._id, tenant: tenant._id, status: 'active' });
  }

  if (!tenant && required) {
    const error = new Error('Tenant context is required');
    error.statusCode = 400;
    throw error;
  }
  req.tenant = tenant;
  return tenant;
};

const loadTenant = async (req, res, next) => {
  try {
    await resolveTenant(req);
    next();
  } catch (error) {
    next(error);
  }
};

const loadTenantOptional = async (req, res, next) => {
  try {
    await resolveTenant(req, { required: false });
    next();
  } catch (error) {
    next(error);
  }
};

const canManageTenant = async (req, tenant = req.tenant) => {
  if (!tenant || !req.user) return false;
  if (isSuperAdmin(req.user)) return true;
  if (req.tenantMembership && ['owner', 'admin', 'manager'].includes(req.tenantMembership.role)) return true;
  if (req.user.role === 'vendor') {
    const vendor = req.vendor || await Vendor.findOne({ owner: req.user._id, tenant: tenant._id }).select('_id owner tenant');
    return Boolean(vendor && String(vendor.tenant) === String(tenant._id));
  }
  return false;
};

const requireTenantManager = async (req, res, next) => {
  try {
    const tenant = await resolveTenant(req);
    if (!(await canManageTenant(req, tenant))) {
      res.status(403);
      throw new Error('Tenant administrator access required');
    }
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { resolveTenant, loadTenant, loadTenantOptional, canManageTenant, requireTenantManager, findPlatformTenant, findVerifiedTenantByHost, isSuperAdmin };
