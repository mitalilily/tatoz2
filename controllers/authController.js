const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const { addApprovedProductFilter } = require('../services/productApprovalService');
const Product = require('../models/Product');
const { sendTokenResponse } = require('../utils/generateToken');
const { sendWelcome } = require('../services/emailService');
const otpService = require('../services/otpService');
const phoneUtil = require('../utils/phone');
const { getProviderConfig, getPublicConfig } = require('../services/integrationService');
const tenantIntegrationService = require('../services/tenantIntegrationService');
const authSessionService = require('../services/authSessionService');
const authPolicyService = require('../services/authPolicyService');
const { getTenantWishlistProducts, getTenantWishlistIds } = require('../services/wishlistService');
const crypto = require('crypto');
const { rolePermissions } = require('../services/tenantPermissionService');

const isDuplicateKey = (err, field) =>
  err && err.code === 11000 && err.keyPattern && Object.keys(err.keyPattern).includes(field);

// Test-only OTP switch. It is intentionally disabled unless both flags are
// explicitly configured in the environment, so a normal deployment continues
// to use the real SMS provider.
const isTestOtpEnabled = () => process.env.ENABLE_TEST_OTP === 'true' && Boolean(process.env.TEST_OTP);
const isTestOtp = otp => isTestOtpEnabled() && String(otp || '') === String(process.env.TEST_OTP);

const otpPurpose = value => value === 'cart_step_up' ? 'cart_step_up' : 'login';

const normalizeEmail = value => String(value || '').trim().toLowerCase();

const requestedAuthMethod = req => req.body?.authMethod || req.body?.mode;
const assertPasswordMode = async req => authPolicyService.assertPrimaryMode(req.tenant?._id, 'password', requestedAuthMethod(req));
const assertGoogleMode = async req => authPolicyService.assertPrimaryMode(req.tenant?._id, 'google', requestedAuthMethod(req));
const assertOtpMode = async (req, purpose) => {
  if (purpose === 'cart_step_up') return authPolicyService.getEffectivePolicy(req.tenant?._id);
  return authPolicyService.assertPrimaryMode(req.tenant?._id, 'otp', requestedAuthMethod(req));
};

const requireCartEmail = (req, res) => {
  const email = normalizeEmail(req.user?.email);
  if (!req.user) { res.status(401); throw new Error('Sign in before starting email cart verification'); }
  if (!/^\S+@\S+\.\S+$/.test(email)) { res.status(400); throw new Error('Add an email address to your account before using email cart verification'); }
  return email;
};

// @desc    Return the effective storefront authentication policy
// @route   GET /api/auth/config
const getAuthConfig = asyncHandler(async (req, res) => {
  res.json({ success: true, auth: await authPolicyService.getPublicConfig(req.tenant?._id) });
});

// @desc    Report whether this host has an OTP delivery path without exposing credentials
// @route   GET /api/auth/otp-readiness
const getOtpReadiness = asyncHandler(async (req, res) => {
  const purpose = otpPurpose(req.query?.purpose);
  const policy = await authPolicyService.getEffectivePolicy(req.tenant?._id);
  const activeOtpMethods = policy.activeMethods || [policy.primaryMode];
  const requestedOtpMethod = String(req.query?.authMethod || req.query?.mode || '').toLowerCase();
  const otpMethods = activeOtpMethods.filter(method => ['msg91', 'wati'].includes(method));
  const requestedMethodAllowed = requestedOtpMethod
    ? activeOtpMethods.includes(requestedOtpMethod) && ['msg91', 'wati'].includes(requestedOtpMethod)
    : otpMethods.length > 0;
  if (purpose === 'login' && !requestedMethodAllowed) {
    return res.json({
      success: false,
      tenantResolved: Boolean(req.tenant?._id),
      available: false,
      providerConfigured: false,
      provider: null,
      mode: 'auth_mode_disabled',
      activeMode: policy.primaryMode,
      code: 'AUTH_MODE_DISABLED',
    });
  }
  const state = await otpService.readiness({ tenantId: req.tenant?._id, allowTestMode: isTestOtpEnabled(), purpose, requestedMode: requestedOtpMethod || otpMethods[0] });
  res.status(state.available ? 200 : 503).json({
    success: state.available,
    tenantResolved: Boolean(req.tenant?._id),
    available: state.available,
    providerConfigured: state.providerConfigured,
    provider: state.provider,
    mode: state.mode,
    selectedProvider: state.selectedProvider,
    activeMode: policy.primaryMode,
    ...(!state.available ? { code: 'OTP_PROVIDER_UNAVAILABLE' } : {}),
  });
});

// @desc    Send OTP to phone number
// @route   POST /api/auth/send-otp
const sendOtp = asyncHandler(async (req, res) => {
  const purpose = otpPurpose(req.body?.purpose);
  const policy = await assertOtpMode(req, purpose);
  if (purpose === 'cart_step_up' && policy.cartOtpProvider === 'disabled') {
    return res.json({ success: true, verificationRequired: false, message: 'Cart verification is disabled' });
  }
  if (purpose === 'cart_step_up' && policy.cartOtpProvider === 'email') {
    const email = requireCartEmail(req, res);
    if (isTestOtpEnabled()) return res.json({ success: true, channel: 'email', message: 'Test OTP sent successfully' });
    await otpService.send({ email, tenantId: req.tenant?._id, purpose, authMethod: requestedAuthMethod(req) });
    return res.json({ success: true, channel: 'email', message: 'OTP sent to your email address' });
  }
  const phone = phoneUtil.assertValid(req.body.phone);
  if (isTestOtpEnabled()) {
    return res.json({ success: true, message: 'Test OTP sent successfully' });
  }
  await otpService.send({ phone, tenantId: req.tenant?._id, purpose, authMethod: requestedAuthMethod(req) });
  res.json({ success: true, message: 'OTP sent successfully' });
});

// @desc    Verify OTP and login/register user
// @route   POST /api/auth/verify-otp
const verifyOtp = asyncHandler(async (req, res) => {
  const purpose = otpPurpose(req.body?.purpose);
  const policy = await assertOtpMode(req, purpose);
  const { otp } = req.body;
  if (purpose === 'cart_step_up' && policy.cartOtpProvider === 'disabled') {
    return res.json({ success: true, verificationRequired: false, message: 'Cart verification is disabled' });
  }
  if (purpose === 'cart_step_up' && policy.cartOtpProvider === 'email') {
    const email = requireCartEmail(req, res);
    if (!otp) { res.status(400); throw new Error('OTP is required'); }
    if (!isTestOtp(otp)) await otpService.verify({ email, otp, tenantId: req.tenant?._id, purpose, authMethod: requestedAuthMethod(req) });
    const session = await authSessionService.markOtpVerified({ sessionId: req.authSession?._id, userId: req.user?._id, tenantId: req.tenant?._id });
    if (!session) { res.status(401); throw new Error('Your sign-in session cannot be verified. Please sign in again'); }
    return res.json({ success: true, channel: 'email', message: 'Email verified', session: authSessionService.publicContext(session, req.tenant?._id) });
  }
  const phone = phoneUtil.assertValid(req.body.phone);
  if (!otp) { res.status(400); throw new Error('OTP is required'); }

  if (!isTestOtp(otp)) await otpService.verify({ phone, otp, tenantId: req.tenant?._id, purpose, authMethod: requestedAuthMethod(req) });

  let user = await User.findOne({ phone });
  let isNewUser = false;

  if (!user) {
    try {
      user = await User.create({ phone, isPhoneVerified: true });
      isNewUser = true;
    } catch (err) {
      // Race: another request created this user between findOne and create — log in the winner.
      if (!isDuplicateKey(err, 'phone')) throw err;
      user = await User.findOne({ phone });
      if (!user) throw err;
    }
  }

  if (!isNewUser) {
    if (!user.isActive) { res.status(401); throw new Error('Account deactivated'); }
    user.isPhoneVerified = true;
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });
  }

  await sendTokenResponse(user, 200, res, isNewUser, {}, { method: 'otp', otpVerified: true });
});

// @desc    Resend OTP
// @route   POST /api/auth/resend-otp
const resendOtp = asyncHandler(async (req, res) => {
  const purpose = otpPurpose(req.body?.purpose);
  const policy = await assertOtpMode(req, purpose);
  if (purpose === 'cart_step_up' && policy.cartOtpProvider === 'disabled') {
    return res.json({ success: true, verificationRequired: false, message: 'Cart verification is disabled' });
  }
  if (purpose === 'cart_step_up' && policy.cartOtpProvider === 'email') {
    const email = requireCartEmail(req, res);
    if (isTestOtpEnabled()) return res.json({ success: true, channel: 'email', message: 'Test OTP resent successfully' });
    await otpService.resend({ email, tenantId: req.tenant?._id, purpose, authMethod: requestedAuthMethod(req) });
    return res.json({ success: true, channel: 'email', message: 'OTP resent to your email address' });
  }
  const phone = phoneUtil.assertValid(req.body.phone);
  if (isTestOtpEnabled()) {
    return res.json({ success: true, message: 'Test OTP resent successfully' });
  }
  await otpService.resend({ phone, tenantId: req.tenant?._id, purpose, authMethod: requestedAuthMethod(req) });
  res.json({ success: true, message: 'OTP resent successfully' });
});

// @desc    Customer email/password registration
// @route   POST /api/auth/register
const register = asyncHandler(async (req, res) => {
  await assertPasswordMode(req);
  const email = normalizeEmail(req.body?.email);
  const name = String(req.body?.name || '').trim();
  const password = req.body?.password;
  if (!/^\S+@\S+\.\S+$/.test(email)) { res.status(400); throw new Error('A valid email address is required'); }
  if (typeof password !== 'string' || password.length < 6) { res.status(400); throw new Error('Password must be at least 6 characters'); }

  try {
    const user = await User.create({ name, email, password, role: 'customer' });
    await sendWelcome(user).catch(() => {});
    require('../services/orderNotificationService').sendWelcomeSms({ user, tenant: req.tenant?._id }).catch(error => console.error('[TrustSignal] welcome SMS hook failed:', error.message));
    return sendTokenResponse(user, 201, res, true, {}, { method: 'password', otpVerified: false });
  } catch (error) {
    if (isDuplicateKey(error, 'email')) { res.status(409); throw new Error('An account with this email already exists'); }
    throw error;
  }
});

// @desc    Customer email/password login
// @route   POST /api/auth/login
const passwordLogin = asyncHandler(async (req, res) => {
  await assertPasswordMode(req);
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;
  if (!email || typeof password !== 'string' || !password) { res.status(400); throw new Error('Email and password are required'); }

  const user = await User.findOne({ email, role: 'customer' }).select('+password');
  if (!user || !user.password || !(await user.matchPassword(password))) {
    res.status(401);
    throw new Error('Invalid email or password');
  }
  if (!user.isActive) { res.status(401); throw new Error('Account deactivated'); }
  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });
  return sendTokenResponse(user, 200, res, false, {}, { method: 'password', otpVerified: false });
});

// @desc    Admin login (email + password — unchanged)
// @route   POST /api/auth/admin/login
const adminLogin = asyncHandler(async (req, res) => {
  const { email, password, otp } = req.body;
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    res.status(400);
    throw new Error('Email and password are required');
  }

  const user = await User.findOne({ email: email.trim().toLowerCase(), role: { $in: ['staff', 'admin', 'superadmin'] } }).select('+password +twoFactorSecret');
  if (!user || !(await user.matchPassword(password))) {
    res.status(401);
    throw new Error('Invalid admin credentials');
  }
  if (!user.isActive) {
    res.status(401);
    throw new Error('Account is deactivated');
  }

  if (user.twoFactorEnabled) {
    const totpService = require('../services/totpService');
    if (!otp) { res.status(401); const error = new Error('Two-factor authentication code is required'); error.publicCode = 'ADMIN_2FA_REQUIRED'; throw error; }
    if (!totpService.verifyCode(user.twoFactorSecret, otp)) { res.status(401); const error = new Error('Invalid two-factor authentication code'); error.publicCode = 'ADMIN_2FA_INVALID'; throw error; }
  }

  await sendTokenResponse(user, 200, res, false, {}, { method: 'admin_password' });
});

// @desc    Logout
// @route   POST /api/auth/logout
const logout = asyncHandler(async (req, res) => {
  if (req.authSession?._id) await authSessionService.revoke(req.authSession._id, 'logout');
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.COOKIE_SAMESITE || 'lax',
    path: '/',
  });
  res.clearCookie('csrf_token', {
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.COOKIE_SAMESITE || 'lax',
    path: '/',
  });
  res.json({ success: true, message: 'Logged out successfully' });
});

// @desc    Issue/read the browser-readable CSRF token used by cookie-authenticated mutations
// @route   GET /api/auth/csrf
const getCsrfToken = asyncHandler(async (req, res) => {
  const shouldRefresh = req.query.refresh === '1';
  const csrfToken = shouldRefresh || !req.cookies?.csrf_token
    ? crypto.randomBytes(32).toString('hex')
    : req.cookies.csrf_token;
  if (shouldRefresh || !req.cookies?.csrf_token) {
    res.cookie('csrf_token', csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.COOKIE_SAMESITE || 'lax',
      path: '/',
    });
  }
  res.json({ success: true, csrfToken });
});

// @desc    Get current user
// @route   GET /api/auth/me
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .select('-password -twoFactorSecret -emailVerificationToken')
    .populate('wishlist', 'title thumbnail price comparePrice discount slug variants stock tenant');
  if (!user) { res.status(404); throw new Error('User not found'); }
  const safeUser = user.toObject();
  if (req.tenant) safeUser.wishlist = await getTenantWishlistProducts({ user, tenant: req.tenant._id });
  if (req.tenant && req.tenantMembership) {
    safeUser.tenantMembership = {
      tenant: req.tenantMembership.tenant,
      role: req.tenantMembership.role,
      status: req.tenantMembership.status,
      permissions: req.tenantMembership.permissions || [],
      effectivePermissions: rolePermissions(req.tenantMembership),
    };
  } else if (req.tenant && ['admin', 'superadmin'].includes(user.role)) {
    safeUser.tenantMembership = { role: user.role, status: 'active', permissions: ['*'], effectivePermissions: ['*'] };
  }
  res.json({
    success: true,
    user: safeUser,
    session: authSessionService.publicContext(req.authSession, req.tenant?._id),
  });
});

// @desc    Update profile (name, email + preferences; phone has a dedicated OTP flow)
// @route   PUT /api/auth/profile
const PROFILE_ALLOWED_FIELDS = ['name', 'email', 'language', 'darkMode', 'notificationPrefs'];

const updateProfile = asyncHandler(async (req, res) => {
  if ('phone' in req.body) {
    res.status(400);
    throw new Error('Phone cannot be changed here — use /api/auth/change-phone/send-otp and /verify');
  }
  const updates = {};
  for (const field of PROFILE_ALLOWED_FIELDS) {
    if (field in req.body) updates[field] = req.body[field];
  }
  if ('email' in updates) {
    const email = normalizeEmail(updates.email);
    if (email && !/^\S+@\S+\.\S+$/.test(email)) { res.status(422); throw new Error('Enter a valid email address'); }
    if (email) {
      const duplicate = await User.exists({ email, _id: { $ne: req.user._id } });
      if (duplicate) { res.status(409); throw new Error('An account with this email already exists'); }
    }
    updates.email = email || undefined;
    updates.isEmailVerified = false;
  }

  const user = await User.findByIdAndUpdate(req.user._id, updates, {
    new: true,
    runValidators: true,
  }).select('-password -twoFactorSecret -emailVerificationToken');
  res.json({ success: true, user });
});

// @desc    Start phone change: send OTP to the new phone.
//         OTP is proof of SIM ownership — we never pre-reject based on who owns
//         the number. The verify step decides the outcome.
// @route   POST /api/auth/change-phone/send-otp
const changePhoneSendOtp = asyncHandler(async (req, res) => {
  const newPhone = phoneUtil.assertValid(req.body.phone);

  if (req.user.phone === newPhone) {
    res.status(400);
    throw new Error('This is already your registered phone number');
  }

  await otpService.send({ phone: newPhone, tenantId: req.tenant?._id, purpose: 'change-phone' });
  res.json({ success: true, message: 'OTP sent to new number' });
});

// @desc    Confirm phone change.
//         After OTP is verified the caller has proven ownership of the SIM.
//         Three outcomes:
//           1. Phone is unowned        → migrate it onto the current user.
//           2. Phone is current user's → no-op, refresh verification flag.
//           3. Phone owned by someone  → log caller INTO that account
//                                        (SIM-swap / account-recovery path).
// @route   POST /api/auth/change-phone/verify
const changePhoneVerify = asyncHandler(async (req, res) => {
  const { otp } = req.body;
  const newPhone = phoneUtil.assertValid(req.body.phone);
  if (!otp) { res.status(400); throw new Error('OTP is required'); }

  await otpService.verify({ phone: newPhone, otp, tenantId: req.tenant?._id, purpose: 'change-phone' });

  const owner = await User.findOne({ phone: newPhone });

  // Case 3: phone owned by a different user → account switch.
  if (owner && !owner._id.equals(req.user._id)) {
    if (!owner.isActive) { res.status(401); throw new Error('Account deactivated'); }
    owner.isPhoneVerified = true;
    owner.lastLogin = new Date();
    await owner.save({ validateBeforeSave: false });
    return sendTokenResponse(owner, 200, res, false, {
      switchedAccount: true,
      message: 'This number is linked to an existing account — you are now logged in as that account.',
    }, { method: 'otp', otpVerified: true });
  }

  // Case 2: phone already owned by the current user → no-op.
  if (owner && owner._id.equals(req.user._id)) {
    if (!owner.isPhoneVerified) {
      owner.isPhoneVerified = true;
      await owner.save({ validateBeforeSave: false });
    }
    return sendTokenResponse(owner, 200, res, false, { message: 'Phone verified' }, { method: 'otp', otpVerified: true });
  }

  // Case 1: unowned phone → migrate onto current user.
  const user = await User.findById(req.user._id);
  user.phone = newPhone;
  user.isPhoneVerified = true;
  try {
    await user.save();
  } catch (err) {
    if (!isDuplicateKey(err, 'phone')) throw err;
    // Race: somebody claimed this phone between our lookup and save.
    // Treat as an account switch to the winner.
    const racedOwner = await User.findOne({ phone: newPhone });
    if (racedOwner && !racedOwner._id.equals(req.user._id)) {
      return sendTokenResponse(racedOwner, 200, res, false, {
        switchedAccount: true,
        message: 'This number is linked to an existing account — you are now logged in as that account.',
      }, { method: 'otp', otpVerified: true });
    }
    throw err;
  }

  await sendTokenResponse(user, 200, res, false, { message: 'Phone number updated' }, { method: 'otp', otpVerified: true });
});

// @desc    Add/update address
// @route   POST /api/auth/addresses
const addAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const { label, fullName, phone, street, city, state, pincode, country, isDefault } = req.body;

  if (isDefault) {
    user.addresses.forEach(a => a.isDefault = false);
  }

  user.addresses.push({ label, fullName, phone, street, city, state, pincode, country, isDefault });
  await user.save();
  res.json({ success: true, addresses: user.addresses });
});

// @desc    Toggle wishlist
// @route   POST /api/auth/wishlist/:productId
const toggleWishlist = asyncHandler(async (req, res) => {
  if (!req.tenant) { res.status(400); throw new Error('Tenant context is required'); }
  const productQuery = { _id: req.params.productId, tenant: req.tenant._id, isActive: true };
  addApprovedProductFilter(productQuery);
  const product = await Product.findOne(productQuery).select('_id');
  if (!product) { res.status(404); throw new Error('Product not found in this store'); }
  const user = await User.findById(req.user._id);
  const productId = req.params.productId;
  const idx = user.wishlist.findIndex(item => String(item) === String(productId));

  if (idx > -1) {
    user.wishlist.splice(idx, 1);
  } else {
    user.wishlist.push(productId);
  }

  await user.save();
  const wishlist = await getTenantWishlistIds({ user, tenant: req.tenant._id });
  res.json({ success: true, wishlist, inWishlist: idx === -1 });
});

// @desc    Google OAuth login/register
// @route   GET /api/auth/google-config
const googleConfig = asyncHandler(async (req, res) => {
  const policy = await authPolicyService.getEffectivePolicy(req.tenant?._id);
  if (!(policy.activeMethods || [policy.primaryMode]).includes('google')) return res.json({ success: true, google: { enabled: false, clientId: '' }, activeMode: policy.primaryMode });
  if (req.tenant?._id) {
    const config = await tenantIntegrationService.configFor(req.tenant._id, 'googleauth', { allowPlatformFallback: true });
    return res.json({ success: true, google: { enabled: Boolean(config.enabled), clientId: config.client_id || '' } });
  }
  res.json({ success: true, google: await getPublicConfig('googleAuth') });
});

// @route   POST /api/auth/google
const googleAuth = asyncHandler(async (req, res) => {
  await assertGoogleMode(req);
  const { credential } = req.body;
  if (!credential) { res.status(400); throw new Error('Google credential is required'); }

  const google = req.tenant?._id
    ? await tenantIntegrationService.configFor(req.tenant._id, 'googleauth', { allowPlatformFallback: true })
    : await getProviderConfig('googleAuth');
  const clientId = google.client_id;
  if (!google.enabled || !clientId) { res.status(503); throw new Error('Google login is not configured. Add it in Admin → Modules.'); }

  const httpRequest = require('../utils/httpRequest');
  const { data: payload } = await httpRequest({
    url: `https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`,
  });

  if (payload.aud !== clientId) {
    res.status(401);
    throw new Error('Invalid Google token');
  }

  const { sub: googleId, email, name, picture } = payload;

  let user = await User.findOne({ $or: [{ googleId }, { email }] });

  if (user) {
    if (!user.googleId) {
      user.googleId = googleId;
      if (picture && !user.avatar) user.avatar = picture;
      await user.save();
    }
    user.lastLogin = new Date();
    await user.save();
  } else {
    try {
      user = await User.create({
        name,
        email,
        googleId,
        avatar: picture || '',
        isEmailVerified: true,
      });
      await sendWelcome(user).catch(() => {});
    } catch (err) {
      // Race: another request created the user in between — re-fetch and log in.
      if (!isDuplicateKey(err, 'email') && !isDuplicateKey(err, 'googleId')) throw err;
      user = await User.findOne({ $or: [{ googleId }, { email }] });
      if (!user) throw err;
    }
  }

  if (!user.isActive) { res.status(401); throw new Error('Account deactivated'); }

  await sendTokenResponse(user, 200, res, false, {}, { method: 'google' });
});

module.exports = {
  getAuthConfig,
  getOtpReadiness,
  sendOtp,
  verifyOtp,
  resendOtp,
  register,
  passwordLogin,
  adminLogin,
  logout,
  getCsrfToken,
  getMe,
  updateProfile,
  addAddress,
  toggleWishlist,
  googleAuth,
  googleConfig,
  changePhoneSendOtp,
  changePhoneVerify,
};
