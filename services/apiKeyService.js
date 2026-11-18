const crypto = require('crypto');
const ApiKey = require('../models/ApiKey');

const hash = value => crypto.createHash('sha256').update(String(value || '')).digest('hex');
const idOf = value => value?._id || value;

const create = async ({ tenant, name, scopes, expiresAt, createdBy }) => {
  const tenantId = idOf(tenant);
  const raw = `abs_live_${crypto.randomBytes(28).toString('base64url')}`;
  const prefix = raw.slice(0, 16);
  const allowed = new Set(['catalog.read', 'orders.read', 'orders.write', 'webhooks.manage']);
  const safeScopes = Array.from(new Set((Array.isArray(scopes) ? scopes : ['catalog.read']).filter(scope => allowed.has(scope))));
  if (!safeScopes.length) throw new Error('At least one API key scope is required');
  const document = await ApiKey.create({ tenant: tenantId, name: String(name || '').trim().slice(0, 120), prefix, secretHash: hash(raw), scopes: safeScopes, expiresAt: expiresAt ? new Date(expiresAt) : undefined, createdBy });
  return { key: raw, apiKey: document.toObject() };
};

const list = tenant => ApiKey.find({ tenant: idOf(tenant) }).sort({ createdAt: -1 }).select('-secretHash').lean();

const revoke = ({ tenant, id }) => ApiKey.findOneAndUpdate({ _id: id, tenant: idOf(tenant), revokedAt: null }, { $set: { revokedAt: new Date() } }, { new: true }).select('-secretHash').lean();

const authenticate = async rawKey => {
  const value = String(rawKey || '').trim();
  if (!/^abs_live_[A-Za-z0-9_-]{20,}$/.test(value)) return null;
  const document = await ApiKey.findOne({ prefix: value.slice(0, 16) }).select('+secretHash');
  if (!document || document.revokedAt || (document.expiresAt && document.expiresAt <= new Date())) return null;
  const expected = Buffer.from(document.secretHash);
  const actual = Buffer.from(hash(value));
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  await ApiKey.updateOne({ _id: document._id }, { $set: { lastUsedAt: new Date() } });
  return document;
};

module.exports = { create, list, revoke, authenticate, hash };
