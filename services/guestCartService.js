const crypto = require('crypto');
const asyncHandler = require('express-async-handler');
const GuestCart = require('../models/GuestCart');
const GuestCartMutationReceipt = require('../models/GuestCartMutationReceipt');
const authPolicyService = require('./authPolicyService');

const COOKIE_NAME = 'tatoz_guest_cart';
const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

const hashToken = token => crypto.createHash('sha256').update(String(token)).digest('hex');

const guestCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: '/',
});

const resolveCartContext = asyncHandler(async (req, res, next) => {
  if (req.user) {
    req.cartContext = { tenantId: req.tenant._id, userId: req.user._id };
    return next();
  }

  const policy = await authPolicyService.getEffectivePolicy(req.tenant?._id);
  if (policy.cartOtpProvider !== 'disabled') {
    res.status(401);
    throw new Error('Not authorized, no customer session');
  }

  let token = String(req.cookies?.[COOKIE_NAME] || '');
  if (!TOKEN_PATTERN.test(token)) {
    token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
    res.cookie(COOKIE_NAME, token, guestCookieOptions());
  }
  req.cartContext = {
    tenantId: req.tenant._id,
    tokenHash: hashToken(token),
    cartModel: GuestCart,
    receiptModel: GuestCartMutationReceipt,
    guest: true,
  };
  return next();
});

module.exports = { COOKIE_NAME, hashToken, resolveCartContext };
