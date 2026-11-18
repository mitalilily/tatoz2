const mongoose = require('mongoose');
const Order = require('../models/Order');
const Coupon = require('../models/Coupon');
const CouponRedemption = require('../models/CouponRedemption');
const CustomerSegmentMembership = require('../models/CustomerSegmentMembership');

const couponError = (message, statusCode = 400, publicCode = 'COUPON_NOT_ELIGIBLE') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
};

const tenantIdOf = tenant => tenant?._id || tenant || null;

const asId = value => {
  const id = value?._id || value;
  return id && mongoose.isValidObjectId(id) ? id : null;
};

const normalized = value => String(value ?? '').trim().toLowerCase();
const normalizedPincode = value => String(value ?? '').trim().replace(/\s+/g, '').toLowerCase();

const hasConfiguredValues = values => Array.isArray(values) && values.length > 0;

const matchesOneOf = (value, allowed, normalize = normalized) => {
  if (!hasConfiguredValues(allowed)) return true;
  const candidate = normalize(value);
  return Boolean(candidate) && allowed.some(item => normalize(item) === candidate);
};

const withSession = (query, session) => (session ? query.session(session) : query);

const findPriorOrder = async ({ userId, tenantId, session }) => {
  const query = Order.findOne({
    user: userId,
    ...(tenantId ? { tenant: tenantId } : {}),
    orderStatus: { $ne: 'cancelled' },
    paymentStatus: { $ne: 'failed' },
  }).select('_id').lean();
  return withSession(query, session);
};

const userUsageCount = (coupon, userId) => (coupon.usedBy || [])
  .filter(entry => String(entry.user?._id || entry.user) === String(userId)).length;

const assertCouponEligibility = async ({
  coupon,
  user,
  tenant,
  orderAmount,
  paymentMethod,
  shippingAddress,
  channel,
  session,
} = {}) => {
  if (!coupon) throw couponError('Invalid coupon code', 404, 'COUPON_NOT_FOUND');

  const now = new Date();
  if (coupon.isActive === false) throw couponError('Coupon is inactive', 400, 'COUPON_INACTIVE');
  if (coupon.startDate && coupon.startDate > now) throw couponError('Coupon is not active yet', 400, 'COUPON_NOT_STARTED');
  if (coupon.expiresAt && coupon.expiresAt < now) throw couponError('Coupon has expired', 400, 'COUPON_EXPIRED');

  const usageLimit = coupon.usageLimit === null || coupon.usageLimit === undefined
    ? null : Number(coupon.usageLimit);
  if (usageLimit !== null && Number.isFinite(usageLimit) && Number(coupon.usageCount || 0) >= usageLimit) {
    throw couponError('Coupon usage limit reached', 409, 'COUPON_USAGE_LIMIT_REACHED');
  }
  if (orderAmount !== undefined && Number(orderAmount) < Number(coupon.minOrderAmount || 0)) {
    throw couponError(`Minimum order amount ₹${coupon.minOrderAmount} required`, 400, 'COUPON_MIN_ORDER_NOT_MET');
  }

  const userId = asId(user);
  // Legacy records can now hydrate with the schema default "all". Preserve
  // their original first-order meaning before considering the new selector.
  const eligibility = coupon.isFirstOrderOnly ? 'new' : (coupon.customerEligibility || 'all');
  const needsUser = eligibility !== 'all'
    || hasConfiguredValues(coupon.eligibleUsers)
    || hasConfiguredValues(coupon.audienceSegments);

  if (needsUser && !userId) {
    throw couponError('Sign in to use this customer-specific coupon', 401, 'COUPON_LOGIN_REQUIRED');
  }

  let priorOrder = null;
  if (userId && coupon.userLimit !== null && coupon.userLimit !== undefined
    && userUsageCount(coupon, userId) >= Number(coupon.userLimit)) {
    throw couponError('You have already used this coupon the maximum number of times', 409, 'COUPON_USER_LIMIT_REACHED');
  }

  if (eligibility !== 'all') {
    priorOrder = await findPriorOrder({ userId, tenantId: tenantIdOf(tenant), session });
    if (eligibility === 'new' && priorOrder) {
      throw couponError('This coupon is only valid on your first order', 400, 'COUPON_FIRST_ORDER_ONLY');
    }
    if (eligibility === 'existing' && !priorOrder) {
      throw couponError('This coupon is only valid for returning customers', 400, 'COUPON_EXISTING_CUSTOMER_ONLY');
    }
  }

  if (hasConfiguredValues(coupon.eligibleUsers)
    && !coupon.eligibleUsers.some(eligibleId => String(eligibleId) === String(userId))) {
    throw couponError('This coupon is not assigned to your account', 403, 'COUPON_USER_RESTRICTED');
  }

  if (hasConfiguredValues(coupon.audienceSegments)) {
    const membershipQuery = CustomerSegmentMembership.findOne({
      tenant: tenantIdOf(tenant),
      segment: { $in: coupon.audienceSegments },
      user: userId,
    }).select('_id').lean();
    const membership = await withSession(membershipQuery, session);
    if (!membership) {
      throw couponError('This coupon is not available for your customer segment', 403, 'COUPON_AUDIENCE_RESTRICTED');
    }
  }

  const paymentMethods = coupon.allowedPaymentMethods || [];
  if (hasConfiguredValues(paymentMethods) && paymentMethod !== undefined && paymentMethod !== null
    && !paymentMethods.includes(String(paymentMethod).toLowerCase())) {
    throw couponError('This coupon is not valid with the selected payment method', 400, 'COUPON_PAYMENT_RESTRICTED');
  }

  const channels = coupon.allowedChannels || [];
  if (hasConfiguredValues(channels) && channel
    && !channels.includes(String(channel).toLowerCase())) {
    throw couponError('This coupon is not valid on this shopping channel', 400, 'COUPON_CHANNEL_RESTRICTED');
  }

  const geo = coupon.geo || {};
  const hasGeoRestriction = hasConfiguredValues(geo.states)
    || hasConfiguredValues(geo.cities)
    || hasConfiguredValues(geo.pincodes);
  if (hasGeoRestriction && shippingAddress) {
    const stateMatches = matchesOneOf(shippingAddress.state, geo.states);
    const cityMatches = matchesOneOf(shippingAddress.city, geo.cities);
    const pincodeMatches = matchesOneOf(shippingAddress.pincode, geo.pincodes, normalizedPincode);
    if (!stateMatches || !cityMatches || !pincodeMatches) {
      throw couponError('This coupon is not valid for the selected delivery location', 400, 'COUPON_GEO_RESTRICTED');
    }
  }

  return { priorOrder: Boolean(priorOrder) };
};

const consumeCouponUsage = async ({ coupon, userId, orderId, tenant, discountAmount = 0, status = 'reserved', session } = {}) => {
  const normalizedUserId = asId(userId);
  if (!coupon?._id || !normalizedUserId) {
    throw couponError('A signed-in customer is required to redeem this coupon', 401, 'COUPON_LOGIN_REQUIRED');
  }

  const filter = { _id: coupon._id, isActive: true };
  if (coupon.usageLimit !== null && coupon.usageLimit !== undefined) {
    filter.usageCount = { $lt: Number(coupon.usageLimit) };
  }
  if (coupon.userLimit !== null && coupon.userLimit !== undefined) {
    filter.$expr = {
      $lt: [
        {
          $size: {
            $filter: {
              input: { $ifNull: ['$usedBy', []] },
              as: 'usage',
              cond: { $eq: ['$$usage.user', normalizedUserId] },
            },
          },
        },
        Number(coupon.userLimit),
      ],
    };
  }

  const query = Coupon.findOneAndUpdate(
    filter,
    { $inc: { usageCount: 1 }, $push: { usedBy: { user: normalizedUserId, ...(orderId ? { order: orderId } : {}), usedAt: new Date() } } },
    { new: true, session },
  );
  const updated = await query;
  if (!updated) throw couponError('Coupon usage limit has been reached', 409, 'COUPON_USAGE_LIMIT_REACHED');
  if (orderId && tenant) {
    try {
      await CouponRedemption.create([{
        tenant,
        coupon: updated._id,
        order: orderId,
        user: normalizedUserId,
        code: updated.code,
        discountAmount: Math.max(0, Number(discountAmount || 0)),
        status: ['reserved', 'captured'].includes(status) ? status : 'reserved',
        ...(status === 'captured' ? { capturedAt: new Date() } : {}),
      }], { session });
    } catch (error) {
      if (error.code !== 11000) throw error;
      const existing = await CouponRedemption.findOne({ tenant, order: orderId }).session(session).lean();
      if (!existing) throw error;
    }
  }
  return updated;
};

module.exports = { assertCouponEligibility, consumeCouponUsage, couponError };
