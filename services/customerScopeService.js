const Order = require('../models/Order');
const Cart = require('../models/Cart');
const ReturnRequest = require('../models/ReturnRequest');
const RefundRequest = require('../models/RefundRequest');
const TenantCustomer = require('../models/TenantCustomer');
const TenantMembership = require('../models/TenantMembership');
const Vendor = require('../models/Vendor');

const idFor = value => value?._id || value || null;

const uniqueIds = values => Array.from(new Map(
  values
    .flat()
    .filter(Boolean)
    .map(value => [String(value), value]),
).values());

// The legacy User document is global. TenantCustomer is the explicit identity
// boundary; commerce records remain included for additive compatibility with
// older accounts that existed before this membership was introduced.
const getTenantCustomerIds = async tenant => {
  const tenantId = idFor(tenant);
  if (!tenantId) return null;
  const [identity, orders, carts, returns, refunds] = await Promise.all([
    TenantCustomer.distinct('user', { tenant: tenantId, status: 'active' }),
    Order.distinct('user', { tenant: tenantId }),
    Cart.distinct('user', { tenant: tenantId }),
    ReturnRequest.distinct('user', { tenant: tenantId }),
    RefundRequest.distinct('user', { tenant: tenantId }),
  ]);
  return uniqueIds([identity, orders, carts, returns, refunds]);
};

const getTenantUserIds = async tenant => {
  const tenantId = idFor(tenant);
  if (!tenantId) return null;
  const [customers, memberships, vendors] = await Promise.all([
    getTenantCustomerIds(tenantId),
    TenantMembership.distinct('user', { tenant: tenantId, status: 'active' }),
    Vendor.distinct('owner', { tenant: tenantId }),
  ]);
  return uniqueIds([customers, memberships, vendors]);
};

const isUserInTenant = async ({ tenant, userId }) => {
  const tenantId = idFor(tenant);
  if (!tenantId) return true;
  const userIds = await getTenantUserIds(tenantId);
  return userIds.some(id => String(id) === String(userId));
};

module.exports = { getTenantCustomerIds, getTenantUserIds, isUserInTenant };
