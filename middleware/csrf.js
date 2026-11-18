const crypto = require('crypto');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXEMPT_PATHS = new Set([
  '/api/auth/send-otp',
  '/api/auth/verify-otp',
  '/api/auth/resend-otp',
  '/api/auth/google',
  '/api/auth/admin/login',
  '/api/auth/logout',
  // Public, optional-auth telemetry does not mutate an account or session;
  // requiring a cookie CSRF token here makes anonymous page analytics race
  // with auth transitions without adding meaningful CSRF protection.
  '/api/track',
]);

const sameToken = (provided, expected) => {
  const a = Buffer.from(String(provided || ''), 'utf8');
  const b = Buffer.from(String(expected || ''), 'utf8');
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
};

const csrfProtection = (req, res, next) => {
  const usesBearerAuth = /^Bearer\s+/i.test(String(req.headers.authorization || ''));
  if (SAFE_METHODS.has(req.method) || usesBearerAuth || !req.cookies?.token || EXEMPT_PATHS.has(req.path) || req.path.startsWith('/api/webhooks/')) {
    return next();
  }
  if (!sameToken(req.headers['x-csrf-token'], req.cookies.csrf_token)) {
    return res.status(403).json({ success: false, message: 'Invalid CSRF token' });
  }
  return next();
};

module.exports = { csrfProtection };
