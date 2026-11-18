const SecurityEvent = require('../models/SecurityEvent');
const authSessionService = require('./authSessionService');

const cleanText = (value, maxLength) => String(value || '')
  .replace(/[\r\n\t]/g, ' ')
  .slice(0, maxLength);

const surfaceFromRequest = (req) => {
  const route = String(req?.originalUrl || req?.baseUrl || '');
  if (route.startsWith('/api/cart')) return 'cart';
  if (route.startsWith('/api/orders')) return 'order';
  return 'unknown';
};

const requestIp = req => String(req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '')
  .split(',')[0]
  .trim();

// Security records deliberately use an allowlist. Request bodies, cookies,
// authorization headers, OTP values, phone numbers, and raw IP/user-agent data
// are never persisted here.
const recordOtpGateDenied = async (req, reason) => {
  try {
    return await SecurityEvent.create({
      ...(req?.tenant?._id ? { tenant: req.tenant._id } : {}),
      ...(req?.user?._id ? { actor: req.user._id } : {}),
      ...(req?.authSession?._id ? { authSession: req.authSession._id } : {}),
      eventType: 'otp_gate_denied',
      surface: surfaceFromRequest(req),
      outcome: 'denied',
      reason: cleanText(reason, 80),
      code: 'OTP_VERIFICATION_REQUIRED',
      method: cleanText(req?.method, 12),
      route: cleanText(String(req?.originalUrl || '').split('?')[0], 240),
      requestId: cleanText(req?.requestId, 100),
      ipHash: authSessionService.metadataHash(requestIp(req)),
      userAgentHash: authSessionService.metadataHash(req?.headers?.['user-agent']),
      metadata: {
        authMethod: cleanText(req?.authSession?.method || 'legacy', 32),
        clientPlatform: cleanText(req?.headers?.['x-client-platform'], 32),
      },
    });
  } catch (_) {
    // Audit persistence must never turn a denial into an availability incident.
    return null;
  }
};

module.exports = { recordOtpGateDenied, surfaceFromRequest };
