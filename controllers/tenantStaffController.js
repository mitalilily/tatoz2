const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const User = require('../models/User');
const TenantMembership = require('../models/TenantMembership');
const {
  STAFF_ROLES,
  PERMISSION_CATALOG,
  ROLE_DEFAULTS,
  rolePermissions,
  validateStaffRole,
  validatePermissions,
} = require('../services/tenantPermissionService');

const STAFF_USER_ROLES = ['staff', 'admin', 'superadmin'];

const staffError = (message, statusCode = 400, publicCode = 'STAFF_INVALID') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
};

const requireTenant = req => {
  if (!req.tenant?._id) throw staffError('Tenant context is required', 400, 'TENANT_REQUIRED');
  return req.tenant._id;
};

const isPlatformAdmin = req => ['admin', 'superadmin'].includes(req.user?.role);

const requireStaffManager = req => {
  if (isPlatformAdmin(req)) return;
  if (!['owner', 'admin', 'manager'].includes(req.tenantMembership?.role) || req.tenantMembership?.status !== 'active') {
    throw staffError('Only a tenant owner, administrator or manager can manage staff', 403, 'STAFF_MANAGE_FORBIDDEN');
  }
};

const safeUser = user => {
  if (!user) return null;
  return {
    _id: user._id,
    name: user.name || '',
    email: user.email || '',
    role: user.role,
    isActive: user.isActive !== false,
    lastLogin: user.lastLogin || null,
  };
};

const serializeMembership = membership => ({
  _id: membership._id,
  tenant: membership.tenant,
  role: membership.role,
  permissions: membership.permissions || [],
  effectivePermissions: rolePermissions(membership),
  status: membership.status,
  invitedBy: membership.invitedBy || null,
  lastUsedAt: membership.lastUsedAt || null,
  createdAt: membership.createdAt,
  updatedAt: membership.updatedAt,
  user: safeUser(membership.user),
});

const findMembership = async (req, id) => {
  const tenantId = requireTenant(req);
  if (!mongoose.isValidObjectId(id)) throw staffError('Staff membership not found', 404, 'STAFF_NOT_FOUND');
  const membership = await TenantMembership.findOne({ tenant: tenantId, _id: id }).populate('user', 'name email role isActive lastLogin');
  if (!membership || !membership.user || !STAFF_USER_ROLES.includes(membership.user.role)) {
    throw staffError('Staff membership not found', 404, 'STAFF_NOT_FOUND');
  }
  return membership;
};

const ensureOwnerCoverage = async (membership, { nextRole = membership.role, nextStatus = membership.status } = {}) => {
  const remainsPrivileged = nextStatus === 'active' && ['owner', 'admin'].includes(nextRole);
  if (remainsPrivileged || !['owner', 'admin'].includes(membership.role) || membership.status !== 'active') return;
  const count = await TenantMembership.countDocuments({
    tenant: membership.tenant,
    _id: { $ne: membership._id },
    status: 'active',
    role: { $in: ['owner', 'admin'] },
  });
  if (!count) throw staffError('The tenant must retain at least one active owner or administrator', 400, 'STAFF_LAST_ADMIN');
};

const listStaff = asyncHandler(async (req, res) => {
  const tenantId = requireTenant(req);
  const staffUserIds = await User.find({ role: { $in: STAFF_USER_ROLES } }).distinct('_id');
  const memberships = await TenantMembership.find({ tenant: tenantId, user: { $in: staffUserIds } })
    .populate('user', 'name email role isActive lastLogin')
    .sort({ status: 1, createdAt: -1 });
  const tenantStaff = memberships.filter(membership => membership.user).map(serializeMembership);
  // A platform super administrator owns the control plane even without a
  // tenant-membership document. Show that account as a non-editable system
  // row instead of hiding the highest-privilege access from the directory.
  const rootUser = req.user?.role === 'superadmin' ? safeUser(req.user) : null;
  const rootRow = rootUser && !tenantStaff.some(member => String(member.user?._id) === String(rootUser._id))
    ? {
      _id: `root-${rootUser._id}`,
      tenant: tenantId,
      role: 'superadmin',
      permissions: ['*'],
      effectivePermissions: ['*'],
      status: 'system',
      isRoot: true,
      nonEditable: true,
      invitedBy: null,
      lastUsedAt: null,
      createdAt: null,
      updatedAt: null,
      user: rootUser,
    }
    : null;
  res.json({
    success: true,
    tenantScoped: true,
    staff: rootRow ? [rootRow, ...tenantStaff] : tenantStaff,
    roles: STAFF_ROLES,
    permissionCatalog: PERMISSION_CATALOG,
    roleDefaults: ROLE_DEFAULTS,
  });
});

const createStaff = asyncHandler(async (req, res) => {
  requireTenant(req);
  requireStaffManager(req);
  const name = String(req.body?.name || '').trim().slice(0, 120);
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = req.body?.password;
  const role = validateStaffRole(req.body?.role || 'readonly');
  const permissions = validatePermissions(req.body?.permissions);

  if (!name) throw staffError('Staff name is required', 400, 'STAFF_NAME_REQUIRED');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw staffError('A valid staff email is required', 400, 'STAFF_EMAIL_INVALID');
  if (typeof password !== 'string' || password.length < 10) throw staffError('Staff password must be at least 10 characters', 400, 'STAFF_PASSWORD_WEAK');
  if (role === 'owner') throw staffError('Owner transfer must be performed as a separate audited action', 400, 'STAFF_OWNER_TRANSFER_REQUIRED');

  const existing = await User.findOne({ email }).select('_id role');
  if (existing) throw staffError('This email is already registered. Use the existing membership instead of creating a duplicate account.', 409, 'STAFF_EMAIL_EXISTS');

  let user;
  try {
    user = await User.create({ name, email, password, role: 'staff', isActive: true });
    const membership = await TenantMembership.create({
      tenant: req.tenant._id,
      user: user._id,
      role,
      permissions,
      status: 'active',
      invitedBy: req.user?._id,
    });
    const populated = await membership.populate('user', 'name email role isActive lastLogin');
    res.status(201).json({ success: true, tenantScoped: true, staff: serializeMembership(populated) });
  } catch (error) {
    if (user?._id) await User.deleteOne({ _id: user._id }).catch(() => {});
    if (error?.code === 11000) throw staffError('This staff account already exists in the tenant', 409, 'STAFF_ALREADY_EXISTS');
    throw error;
  }
});

const updateStaff = asyncHandler(async (req, res) => {
  requireTenant(req);
  requireStaffManager(req);
  const membership = await findMembership(req, req.params.id);
  const nextRole = req.body?.role === undefined ? membership.role : validateStaffRole(req.body.role);
  const nextStatus = req.body?.status === undefined ? membership.status : String(req.body.status).trim().toLowerCase();
  if (!['active', 'invited', 'suspended'].includes(nextStatus)) throw staffError('Invalid staff membership status', 400, 'STAFF_STATUS_INVALID');
  if (nextRole === 'owner' && membership.role !== 'owner') throw staffError('Owner transfer must be performed as a separate audited action', 400, 'STAFF_OWNER_TRANSFER_REQUIRED');
  if (String(membership.user._id) === String(req.user._id) && nextStatus !== 'active') throw staffError('You cannot suspend your own active staff access', 400, 'STAFF_SELF_SUSPEND');
  await ensureOwnerCoverage(membership, { nextRole, nextStatus });

  membership.role = nextRole;
  membership.status = nextStatus;
  if (req.body?.permissions !== undefined) membership.permissions = validatePermissions(req.body.permissions);
  await membership.save();
  res.json({ success: true, tenantScoped: true, staff: serializeMembership(membership) });
});

const resetStaffPassword = asyncHandler(async (req, res) => {
  requireTenant(req);
  requireStaffManager(req);
  const membership = await findMembership(req, req.params.id);
  const password = req.body?.password;
  if (typeof password !== 'string' || password.length < 10) throw staffError('Staff password must be at least 10 characters', 400, 'STAFF_PASSWORD_WEAK');
  const user = await User.findById(membership.user._id).select('+password');
  if (!user) throw staffError('Staff user not found', 404, 'STAFF_NOT_FOUND');
  user.password = password;
  user.isActive = true;
  await user.save();
  res.json({ success: true, tenantScoped: true, message: 'Staff password reset successfully' });
});

module.exports = { listStaff, createStaff, updateStaff, resetStaffPassword, serializeMembership };
