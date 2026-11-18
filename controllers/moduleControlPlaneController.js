const asyncHandler = require('express-async-handler');
const { findPlatformTenant } = require('../services/tenantService');
const controlPlane = require('../services/moduleControlPlaneService');

const platformTenant = async () => {
  const tenant = await findPlatformTenant();
  if (!tenant) {
    const error = new Error('Platform tenant is not configured');
    error.statusCode = 503;
    throw error;
  }
  return tenant;
};

const getControlPlane = asyncHandler(async (req, res) => {
  const tenant = await platformTenant();
  res.json({ success: true, canManage: req.user?.role === 'superadmin', controlPlane: await controlPlane.getControlPlane(tenant) });
});

const updateAuthentication = asyncHandler(async (req, res) => {
  const tenant = await platformTenant();
  const result = await controlPlane.activateAuthentication(tenant, req.body || {}, req.user._id);
  res.json({ success: true, ...result, controlPlane: await controlPlane.getControlPlane(tenant) });
});

const updateShipping = asyncHandler(async (req, res) => {
  const tenant = await platformTenant();
  const result = await controlPlane.activateShipping(tenant, req.body || {}, req.user._id);
  res.json({ success: true, ...result, controlPlane: await controlPlane.getControlPlane(tenant) });
});

const updatePayment = asyncHandler(async (req, res) => {
  const tenant = await platformTenant();
  const result = await controlPlane.activatePayment(tenant, req.body || {}, req.user._id);
  res.json({ success: true, ...result, controlPlane: await controlPlane.getControlPlane(tenant) });
});

module.exports = { getControlPlane, updateAuthentication, updateShipping, updatePayment };
