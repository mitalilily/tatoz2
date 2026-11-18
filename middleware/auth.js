const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const authSessionService = require('../services/authSessionService');
const securityEventService = require('../services/securityEventService');
const authPolicyService = require('../services/authPolicyService');

const tokenFromRequest = req => {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    return req.headers.authorization.split(' ')[1];
  }
  return req.cookies?.token || null;
};

const authenticate = async token => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user = await User.findById(decoded.id).select('-password');
  if (!user) throw new Error('User not found');
  if (!user.isActive) throw new Error('Account is deactivated');
  const session = decoded.sid ? await authSessionService.resolve(decoded.sid, decoded.id) : null;
  if (decoded.sid && !session) throw new Error('Session expired or revoked');
  return { user, session, decoded };
};

const protect = asyncHandler(async (req, res, next) => {
  const token = tokenFromRequest(req);

  if (!token) {
    res.status(401);
    throw new Error('Not authorized, no token');
  }

  try {
    const authenticated = await authenticate(token);
    req.user = authenticated.user;
    req.authSession = authenticated.session;
    req.authToken = authenticated.decoded;
    next();
  } catch (error) {
    res.status(401);
    throw new Error('Not authorized, token failed');
  }
});

const optionalAuth = asyncHandler(async (req, res, next) => {
  const token = tokenFromRequest(req);
  if (token) {
    try {
      const authenticated = await authenticate(token);
      req.user = authenticated.user;
      req.authSession = authenticated.session;
      req.authToken = authenticated.decoded;
    } catch (e) {
      // Guest checkout remains public when no credentials are supplied, but a
      // caller that explicitly presents a bearer token must not be downgraded
      // to anonymous access when that session is expired or revoked.
      if (req.headers?.authorization?.startsWith('Bearer')) {
        res.status(401);
        throw new Error('Not authorized, token failed');
      }
    }
  }
  next();
});

const admin = (req, res, next) => {
  const tenantStaff = req.user?.role === 'staff'
    && req.tenantMembership
    && req.tenantMembership.status === 'active'
    && ['owner', 'admin', 'manager', 'finance', 'operations', 'readonly'].includes(req.tenantMembership.role);
  if (req.user && (req.user.role === 'admin' || req.user.role === 'superadmin' || tenantStaff)) {
    next();
  } else {
    res.status(403);
    throw new Error('Admin access required');
  }
};

const superAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'superadmin') {
    next();
  } else {
    res.status(403);
    throw new Error('Super admin access required');
  }
};

const requirePermission = (...roles) => (req, res, next) => {
  if (req.user && roles.includes(req.user.role)) return next();
  res.status(403);
  throw new Error('Insufficient permissions');
};

const otpDenialReason = (session, tenantId) => {
  if (!session) return 'missing_server_session';
  if (session.revokedAt) return 'session_revoked';
  if (session.expiresAt <= new Date()) return 'session_expired';
  if (!session.otpVerifiedAt) return 'session_not_otp_verified';
  if (!authSessionService.isOtpQualified(session, tenantId)) return 'tenant_mismatch';
  return 'not_qualified';
};

const requireOtpQualified = asyncHandler(async (req, res, next) => {
  const policy = await authPolicyService.getEffectivePolicy(req.tenant?._id);
  if (policy.cartOtpProvider === 'disabled') return next();
  if (authSessionService.isOtpQualified(req.authSession, req.tenant?._id)) return next();
  const isOrder = String(req.originalUrl || '').startsWith('/api/orders');
  await securityEventService.recordOtpGateDenied(req, otpDenialReason(req.authSession, req.tenant?._id));
  const identity = policy.cartOtpProvider === 'email' ? 'email address' : 'phone number';
  const action = isOrder ? 'placing an order' : 'changing the cart';
  const error = new Error(`Verify your ${identity} before ${action}`);
  error.statusCode = 403;
  error.publicCode = 'OTP_VERIFICATION_REQUIRED';
  next(error);
});

module.exports = { protect, optionalAuth, admin, superAdmin, requirePermission, requireOtpQualified, tokenFromRequest, authenticate };
