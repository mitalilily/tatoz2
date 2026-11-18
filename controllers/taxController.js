const asyncHandler = require('express-async-handler');
const TaxProfile = require('../models/TaxProfile');
const { normalizeTaxProfile, publicTaxProfile, resolveTaxProfile } = require('../services/taxService');
const { validateTaxProfile } = require('../utils/vendorValidation');

const MUTABLE_FIELDS = new Set([
  'enabled', 'registrationType', 'pricingMode', 'defaultRate', 'originState', 'sellerGstin',
  'gstInvoiceOwner', 'businessName', 'businessAddress', 'invoicePrefix', 'shippingTaxable', 'invoiceNote', 'gstComponents',
]);

const validatePayload = body => {
  const payload = {};
  for (const [key, value] of Object.entries(body || {})) {
    if (MUTABLE_FIELDS.has(key)) payload[key] = value;
  }
  // Validate the caller's raw values before normalization. Normalization is
  // intentionally forgiving for checkout reads, but an admin write must not
  // turn an invalid rate such as 101 into a different valid value silently.
  const validation = validateTaxProfile(payload);
  const normalized = validation.value;
  if (validation.errors.length) {
    const error = new Error(validation.errors[0].message);
    error.statusCode = 422;
    error.publicCode = 'TAX_PROFILE_INVALID';
    error.details = validation.errors;
    throw error;
  }
  return {
    ...normalized,
    businessAddress: {
      line1: normalized.businessAddress.line1 || '',
      line2: normalized.businessAddress.line2 || '',
      city: normalized.businessAddress.city || '',
      state: normalized.businessAddress.state || '',
      pincode: normalized.businessAddress.pincode || '',
      country: normalized.businessAddress.country || 'India',
    },
  };
};

const getTaxProfile = asyncHandler(async (req, res) => {
  const profile = await resolveTaxProfile({ tenant: req.tenant });
  res.json({ success: true, profile: publicTaxProfile(profile) });
});

const getAdminTaxProfile = asyncHandler(async (req, res) => {
  const profile = await resolveTaxProfile({ tenant: req.tenant });
  res.json({
    success: true,
    profile: {
      ...profile,
      _id: profile._id || null,
      tenant: profile.tenant || req.tenant?._id || null,
      source: profile.source,
    },
  });
});

const updateAdminTaxProfile = asyncHandler(async (req, res) => {
  if (!req.tenant?._id) {
    res.status(400);
    const error = new Error('Tenant context is required');
    error.publicCode = 'TENANT_REQUIRED';
    throw error;
  }
  const update = validatePayload(req.body);
  const profile = await TaxProfile.findOneAndUpdate(
    { tenant: req.tenant._id },
    { $set: { ...update, tenant: req.tenant._id } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();
  res.json({ success: true, profile: { ...profile, source: 'tenant_profile' } });
});

module.exports = { getTaxProfile, getAdminTaxProfile, updateAdminTaxProfile };
