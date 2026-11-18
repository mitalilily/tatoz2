const mongoose = require('mongoose');
const User = require('../models/User');
const { getTenantCustomerIds } = require('./customerScopeService');
const { getSegmentMemberIds } = require('./customerSegmentService');

const MAX_BULK_CUSTOMERS = 500;

const audienceError = (message, statusCode = 400, publicCode = 'CUSTOMER_AUDIENCE_INVALID') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
};

const tenantIdOf = tenant => tenant?._id || tenant || null;

const ensureTenant = tenant => {
  const tenantId = tenantIdOf(tenant);
  if (!mongoose.isValidObjectId(tenantId)) throw audienceError('Tenant context is required', 400, 'TENANT_REQUIRED');
  return tenantId;
};

const uniqueStrings = values => Array.from(new Set(
  (Array.isArray(values) ? values : [values])
    .filter(Boolean)
    .map(value => String(value)),
));

const segmentIdsFrom = ({ segmentId, segmentIds } = {}) => uniqueStrings([
  ...(Array.isArray(segmentIds) ? segmentIds : []),
  segmentId,
]);

const intersectIds = (left, right) => {
  const allowed = new Set((right || []).map(value => String(value)));
  return (left || []).filter(value => allowed.has(String(value)));
};

const getCustomerScopeIds = async ({ tenant, segmentId, segmentIds } = {}) => {
  const tenantId = ensureTenant(tenant);
  const tenantCustomerIds = await getTenantCustomerIds(tenantId);
  const requestedSegments = segmentIdsFrom({ segmentId, segmentIds });
  if (!requestedSegments.length) return tenantCustomerIds || [];

  let scopedIds = tenantCustomerIds || [];
  for (const requestedSegment of requestedSegments) {
    if (!mongoose.isValidObjectId(requestedSegment)) {
      throw audienceError('Customer group is invalid', 400, 'CUSTOMER_SEGMENT_INVALID');
    }
    const memberIds = await getSegmentMemberIds({ tenant: tenantId, segmentId: requestedSegment });
    if (memberIds === null) throw audienceError('Customer group was not found in this tenant', 404, 'CUSTOMER_SEGMENT_NOT_FOUND');
    scopedIds = intersectIds(scopedIds, memberIds);
  }
  return scopedIds;
};

const resolveCustomerAudience = async ({ tenant, userIds = [], segmentId, segmentIds, max = MAX_BULK_CUSTOMERS } = {}) => {
  const tenantId = ensureTenant(tenant);
  const tenantCustomerIds = await getTenantCustomerIds(tenantId) || [];
  const allowed = new Set(tenantCustomerIds.map(value => String(value)));
  const requestedUsers = uniqueStrings(userIds);
  const requestedSegments = segmentIdsFrom({ segmentId, segmentIds });
  const targetIds = new Set();

  requestedUsers.forEach(userId => {
    if (!mongoose.isValidObjectId(userId) || !allowed.has(userId)) {
      throw audienceError('One or more selected customers are outside this tenant', 404, 'CUSTOMER_OUTSIDE_TENANT');
    }
    targetIds.add(userId);
  });

  if (requestedSegments.length) {
    const scopedIds = await getCustomerScopeIds({ tenant: tenantId, segmentIds: requestedSegments });
    scopedIds.forEach(userId => targetIds.add(String(userId)));
  }

  if (!targetIds.size) throw audienceError('Select at least one customer or customer group', 400, 'CUSTOMER_AUDIENCE_REQUIRED');
  if (targetIds.size > max) throw audienceError(`A bulk operation can include at most ${max} customers`, 400, 'CUSTOMER_AUDIENCE_TOO_LARGE');

  const users = await User.find({ _id: { $in: Array.from(targetIds) }, role: 'customer' })
    .select('_id name email phone isActive')
    .lean();
  if (users.length !== targetIds.size) throw audienceError('One or more selected records are not customers', 404, 'CUSTOMER_NOT_FOUND');

  const userById = new Map(users.map(user => [String(user._id), user]));
  return {
    tenant: tenantId,
    userIds: Array.from(targetIds).map(id => userById.get(id)._id),
    users: Array.from(targetIds).map(id => userById.get(id)),
    segmentIds: requestedSegments,
  };
};

module.exports = {
  MAX_BULK_CUSTOMERS,
  audienceError,
  getCustomerScopeIds,
  resolveCustomerAudience,
};
