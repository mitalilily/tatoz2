const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const authSessionService = require('../services/authSessionService');
const { ensureTenantCustomer } = require('../services/customerIdentityService');
const { getTenantWishlistIds } = require('../services/wishlistService');

const generateToken = (id, claims = {}) => {
  return jwt.sign({ id, ...claims }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

const sendTokenResponse = async (user, statusCode, res, isNewUser = false, extras = {}, auth = {}) => {
  const method = auth.method || 'google';
  const tenantId = auth.tenantId || res.req?.tenant?._id;
  if (user.role === 'customer' && tenantId) {
    const identitySource = ['otp', 'password', 'google', 'phone_change'].includes(method) ? method : 'commerce';
    await ensureTenantCustomer({ tenantId, userId: user._id, source: identitySource });
  }
  const session = await authSessionService.create({
    userId: user._id,
    tenantId,
    method,
    otpVerified: Boolean(auth.otpVerified),
    req: res.req,
  });
  const wishlist = user.role === 'customer' && tenantId
    ? await getTenantWishlistIds({ user, tenant: tenantId })
    : (user.wishlist || []);
  const token = generateToken(user._id, {
    sid: String(session._id),
    amr: auth.otpVerified ? ['otp'] : [method],
  });
  // Browser clients keep the JWT in an HttpOnly cookie. Native clients cannot
  // reliably persist browser cookies, so explicitly opt them into a response
  // token and store it in the platform's secure credential storage.
  const isNativeClient = String(res.req?.headers?.['x-client-platform'] || '').toLowerCase() === 'mobile';

  const cookieOptions = {
    expires: session.expiresAt,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.COOKIE_SAMESITE || 'lax',
    path: '/',
  };
  const csrfToken = crypto.randomBytes(32).toString('hex');

  res.status(statusCode)
    .cookie('token', token, cookieOptions)
    .cookie('csrf_token', csrfToken, { ...cookieOptions, httpOnly: false })
    .json({
    success: true,
    isNewUser,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      phone: user.phone,
      addresses: user.addresses || [],
      wishlist,
    },
    session: authSessionService.publicContext(session.toObject(), tenantId),
    ...(isNativeClient ? { token } : {}),
    ...extras,
  });
};

module.exports = { generateToken, sendTokenResponse };
