const mongoose = require('mongoose');
const TenantCustomer = require('../models/TenantCustomer');

const makeError = (message, statusCode = 403, publicCode = 'TENANT_CUSTOMER_BLOCKED') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
};

const ensureTenantCustomer = async ({ tenantId, userId, source = 'commerce' }) => {
  if (!tenantId || !mongoose.isValidObjectId(tenantId) || !userId || !mongoose.isValidObjectId(userId)) return null;
  const now = new Date();
  const validSources = new Set(['otp', 'password', 'google', 'phone_change', 'commerce']);
  const resolvedSource = validSources.has(source) ? source : 'commerce';
  let customer;
  try {
    customer = await TenantCustomer.findOneAndUpdate(
      { tenant: tenantId, user: userId },
      { $setOnInsert: { tenant: tenantId, user: userId, source: resolvedSource, firstSeenAt: now }, $set: { lastSeenAt: now } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    // Two concurrent auth requests can race the unique tenant/user index.
    if (error?.code !== 11000) throw error;
    customer = await TenantCustomer.findOne({ tenant: tenantId, user: userId });
  }
  if (!customer) return null;
  if (customer.status !== 'active') throw makeError('Customer account is blocked for this store');
  return customer;
};

module.exports = { ensureTenantCustomer };
