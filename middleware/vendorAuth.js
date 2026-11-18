const asyncHandler = require('express-async-handler');
const Vendor = require('../models/Vendor');
const VendorMember = require('../models/VendorMember');
const { resolveTenant } = require('../services/tenantService');

const vendorAuth = asyncHandler(async (req, res, next) => {
  // The platform's official catalog vendor is owned by the superadmin user.
  // Keep that account's admin role intact while allowing access only through
  // its own active vendor profile and resolved tenant below.
  if (!req.user) {
    res.status(403);
    throw new Error('Vendor access required');
  }
  const tenant = await resolveTenant(req, { required: true });
  // Owner path (unchanged): vendor + superadmin roles resolve their own store.
  if (['vendor', 'superadmin'].includes(req.user.role)) {
    const vendor = await Vendor.findOne({ owner: req.user._id, tenant: tenant._id });
    if (vendor) {
      if (vendor.status !== 'active') {
        res.status(403);
        throw new Error(`Vendor account is ${vendor.status}. Contact admin.`);
      }
      req.vendor = vendor;
      req.vendorMembership = null;
      next();
      return;
    }
  }
  // Team path: invited staff act on the store through an active membership.
  // Memberships are tenant-scoped so one login can serve several stores.
  const membership = await VendorMember.findOne({
    user: req.user._id, tenant: tenant._id, status: 'active',
  }).populate('vendor');
  if (!membership || !membership.vendor) {
    res.status(404);
    throw new Error('Vendor profile not found');
  }
  if (membership.vendor.status !== 'active') {
    res.status(403);
    throw new Error(`Vendor account is ${membership.vendor.status}. Contact admin.`);
  }
  req.vendor = membership.vendor;
  req.vendorMembership = membership;
  next();
});

module.exports = vendorAuth;
