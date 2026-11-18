const crypto = require('crypto');
const mongoose = require('mongoose');
const AuthSession = require('../models/AuthSession');

const DEFAULT_SESSION_DAYS = 7;

const sessionDays = () => {
  const configured = Number(process.env.AUTH_SESSION_DAYS || DEFAULT_SESSION_DAYS);
  return Number.isFinite(configured) && configured > 0 ? Math.min(configured, 30) : DEFAULT_SESSION_DAYS;
};

const sessionTtlMs = () => sessionDays() * 24 * 60 * 60 * 1000;

const metadataHash = value => {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  return crypto.createHmac('sha256', String(process.env.SESSION_METADATA_KEY || process.env.JWT_SECRET || ''))
    .update(normalized)
    .digest('hex');
};

const requestIp = req => String(req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '')
  .split(',')[0]
  .trim();

const create = async ({ userId, tenantId, method, otpVerified = false, req }) => AuthSession.create({
  user: userId,
  ...(tenantId ? { tenant: tenantId } : {}),
  method,
  ...(otpVerified ? { otpVerifiedAt: new Date() } : {}),
  ipHash: metadataHash(requestIp(req)),
  userAgentHash: metadataHash(req?.headers?.['user-agent']),
  expiresAt: new Date(Date.now() + sessionTtlMs()),
});

const resolve = async (sessionId, userId) => {
  if (!mongoose.isValidObjectId(sessionId)) return null;
  return AuthSession.findOne({
    _id: sessionId,
    user: userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  }).lean();
};

const revoke = async (sessionId, reason = 'logout') => {
  if (!mongoose.isValidObjectId(sessionId)) return false;
  const result = await AuthSession.updateOne(
    { _id: sessionId, revokedAt: null },
    { $set: { revokedAt: new Date(), revocationReason: String(reason).slice(0, 80) } },
  );
  return result.modifiedCount > 0;
};

const markOtpVerified = async ({ sessionId, userId, tenantId }) => AuthSession.findOneAndUpdate(
  {
    _id: sessionId,
    user: userId,
    tenant: tenantId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  },
  { $set: { otpVerifiedAt: new Date() } },
  { new: true },
).lean();

const sameTenant = (session, tenantId) => {
  const sessionTenant = session?.tenant ? String(session.tenant) : '';
  const requestTenant = tenantId ? String(tenantId) : '';
  return sessionTenant === requestTenant;
};

const isOtpQualified = (session, tenantId) => Boolean(
  session
  && !session.revokedAt
  && session.expiresAt > new Date()
  && session.otpVerifiedAt
  && sameTenant(session, tenantId),
);

const publicContext = (session, tenantId) => ({
  method: session?.method || 'legacy',
  otpVerified: isOtpQualified(session, tenantId),
  expiresAt: session?.expiresAt || null,
});

module.exports = {
  create,
  resolve,
  revoke,
  markOtpVerified,
  isOtpQualified,
  publicContext,
  sessionDays,
  sessionTtlMs,
  metadataHash,
};
