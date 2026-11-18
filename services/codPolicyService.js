const crypto = require('crypto');
const mongoose = require('mongoose');
const CodPolicy = require('../models/CodPolicy');
const Order = require('../models/Order');
const Settings = require('../models/Settings');

const normalizePincode = value => String(value || '').replace(/\D/g, '').slice(0, 6);
const normalizePhone = value => String(value || '').replace(/\D/g, '').slice(-10);
const phoneHash = value => crypto.createHmac('sha256', process.env.COD_POLICY_SECRET || process.env.JWT_SECRET || 'tatoz-cod-policy').update(normalizePhone(value)).digest('hex');
const errorFor = (message, publicCode = 'COD_NOT_ELIGIBLE', statusCode = 422) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
};

const asList = (value, { pincode = false, max = 500 } = {}) => {
  const values = Array.isArray(value) ? value : String(value || '').split(/[\n,]/);
  const unique = [];
  values.map(item => String(item || '').trim()).filter(Boolean).forEach(item => {
    const normalized = pincode ? normalizePincode(item) : item;
    if (!normalized || unique.includes(normalized)) return;
    if (unique.length >= max) throw errorFor('COD policy contains too many list values', 'COD_POLICY_INVALID', 400);
    if (pincode && !/^\d{6}$/.test(normalized)) throw errorFor(`Invalid COD pincode: ${item}`, 'COD_POLICY_INVALID', 400);
    unique.push(normalized);
  });
  return unique;
};

const safePolicy = policy => {
  const value = policy?.toObject ? policy.toObject() : { ...(policy || {}) };
  return {
    _id: value._id,
    tenant: value.tenant,
    enabled: value.enabled !== false,
    minOrderValue: Number(value.minOrderValue || 0),
    maxOrderValue: value.maxOrderValue === null || value.maxOrderValue === undefined ? null : Number(value.maxOrderValue),
    allowedPincodes: value.allowedPincodes || [],
    blockedPincodes: value.blockedPincodes || [],
    blockedPhones: (value.blockedPhones || []).map(item => ({ last4: item.last4, label: item.label || '' })),
    blockedCustomers: value.blockedCustomers || [],
    riskScoringEnabled: value.riskScoringEnabled !== false,
    riskThreshold: Number(value.riskThreshold ?? 70),
    otpRequired: value.otpRequired !== false,
    partialAdvanceEnabled: value.partialAdvanceEnabled === true,
    partialAdvancePercent: Number(value.partialAdvancePercent || 0),
    updatedAt: value.updatedAt,
  };
};

const getPolicy = async ({ tenantId, session }) => {
  if (!tenantId) return null;
  const query = CodPolicy.findOne({ tenant: tenantId });
  if (session) query.session(session);
  return query;
};

const normalizePolicy = ({ payload = {}, current = {} }) => {
  const minOrderValue = payload.minOrderValue === undefined ? Number(current.minOrderValue || 0) : Number(payload.minOrderValue);
  const maxOrderValue = payload.maxOrderValue === undefined || payload.maxOrderValue === '' || payload.maxOrderValue === null ? (current.maxOrderValue ?? null) : Number(payload.maxOrderValue);
  if (!Number.isFinite(minOrderValue) || minOrderValue < 0) throw errorFor('Minimum COD order value must be non-negative', 'COD_POLICY_INVALID', 400);
  if (maxOrderValue !== null && (!Number.isFinite(maxOrderValue) || maxOrderValue < minOrderValue)) throw errorFor('Maximum COD order value must be greater than or equal to minimum value', 'COD_POLICY_INVALID', 400);
  const riskThreshold = payload.riskThreshold === undefined ? Number(current.riskThreshold ?? 70) : Number(payload.riskThreshold);
  if (!Number.isFinite(riskThreshold) || riskThreshold < 0 || riskThreshold > 100) throw errorFor('COD risk threshold must be between 0 and 100', 'COD_POLICY_INVALID', 400);
  const partialAdvancePercent = payload.partialAdvancePercent === undefined ? Number(current.partialAdvancePercent || 0) : Number(payload.partialAdvancePercent);
  if (!Number.isFinite(partialAdvancePercent) || partialAdvancePercent < 0 || partialAdvancePercent > 100) throw errorFor('Partial COD advance percentage must be between 0 and 100', 'COD_POLICY_INVALID', 400);
  const blockedPhones = payload.blockedPhones === undefined
    ? (current.blockedPhones || [])
    : (Array.isArray(payload.blockedPhones) ? payload.blockedPhones : String(payload.blockedPhones || '').split(/[\n,]/)).map(item => {
      if (item && typeof item === 'object') {
        const raw = normalizePhone(item.phone || item.number || item.value);
        if (raw.length !== 10) throw errorFor('Blocked phone must contain a valid 10-digit number', 'COD_POLICY_INVALID', 400);
        return { hash: phoneHash(raw), last4: raw.slice(-4), label: String(item.label || '').trim().slice(0, 120) };
      }
      const raw = normalizePhone(item);
      if (raw.length !== 10) throw errorFor('Blocked phone must contain a valid 10-digit number', 'COD_POLICY_INVALID', 400);
      return { hash: phoneHash(raw), last4: raw.slice(-4), label: '' };
    });
  const blockedCustomers = payload.blockedCustomers === undefined ? (current.blockedCustomers || []) : (Array.isArray(payload.blockedCustomers) ? payload.blockedCustomers : String(payload.blockedCustomers || '').split(/[\n,]/));
  if (blockedCustomers.some(id => !mongoose.isValidObjectId(id))) throw errorFor('Blocked customer list contains an invalid user id', 'COD_POLICY_INVALID', 400);
  return {
    enabled: payload.enabled === undefined ? current.enabled !== false : payload.enabled !== false && payload.enabled !== 'false',
    minOrderValue,
    maxOrderValue,
    allowedPincodes: payload.allowedPincodes === undefined ? (current.allowedPincodes || []) : asList(payload.allowedPincodes, { pincode: true }),
    blockedPincodes: payload.blockedPincodes === undefined ? (current.blockedPincodes || []) : asList(payload.blockedPincodes, { pincode: true }),
    blockedPhones,
    blockedCustomers,
    riskScoringEnabled: payload.riskScoringEnabled === undefined ? current.riskScoringEnabled !== false : payload.riskScoringEnabled !== false && payload.riskScoringEnabled !== 'false',
    riskThreshold,
    otpRequired: payload.otpRequired === undefined ? current.otpRequired !== false : payload.otpRequired !== false && payload.otpRequired !== 'false',
    partialAdvanceEnabled: payload.partialAdvanceEnabled === undefined
      ? current.partialAdvanceEnabled === true
      : payload.partialAdvanceEnabled === true || payload.partialAdvanceEnabled === 'true',
    partialAdvancePercent,
  };
};

const updatePolicy = async ({ tenantId, userId, payload }) => {
  if (!tenantId) throw errorFor('Tenant context is required', 'TENANT_REQUIRED', 400);
  const current = await CodPolicy.findOne({ tenant: tenantId });
  const data = normalizePolicy({ payload, current: current?.toObject() || {} });
  const policy = await CodPolicy.findOneAndUpdate({ tenant: tenantId }, { ...data, tenant: tenantId, updatedBy: userId || null }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
  return safePolicy(policy);
};

const riskForCustomer = async ({ tenantId, userId, session }) => {
  if (!tenantId || !userId) return { score: 0, reasons: [] };
  const query = Order.find({ tenant: tenantId, user: userId, paymentMethod: 'cod' }).sort({ createdAt: -1 }).limit(20).select('orderStatus returnStatus shippingStatus');
  if (session) query.session(session);
  const orders = await query.lean();
  let score = 0;
  const reasons = [];
  orders.forEach(order => {
    if (order.shippingStatus && String(order.shippingStatus).toLowerCase().includes('rto')) { score += 45; reasons.push('rto_history'); }
    if (['cancelled', 'returned'].includes(order.orderStatus) || ['rejected', 'cancelled'].includes(order.returnStatus)) { score += 30; reasons.push('cancelled_or_returned'); }
  });
  return { score: Math.min(100, score), reasons: [...new Set(reasons)] };
};

const evaluate = async ({ tenantId, userId, paymentMethod, total, address = {}, session }) => {
  if (String(paymentMethod || '').toLowerCase() !== 'cod') return { eligible: true, code: 'NOT_COD', riskScore: 0, reasons: [] };
  const globalEnabled = await Settings.get('cod_enabled', true, { session });
  if (globalEnabled === false || globalEnabled === 'false') return { eligible: false, code: 'COD_DISABLED', reason: 'Cash on Delivery is currently disabled', riskScore: 0, reasons: ['global_disabled'] };
  const policy = await getPolicy({ tenantId, session });
  if (!policy) return { eligible: true, code: 'DEFAULT_POLICY', riskScore: 0, reasons: [] };
  if (policy.enabled === false) return { eligible: false, code: 'COD_DISABLED', reason: 'Cash on Delivery is disabled for this store', riskScore: 0, reasons: ['tenant_disabled'] };
  const amount = Number(total || 0);
  if (amount < Number(policy.minOrderValue || 0)) return { eligible: false, code: 'COD_MIN_ORDER_VALUE', reason: `COD is available only for orders of at least ₹${policy.minOrderValue}`, riskScore: 0, reasons: ['minimum_order_value'] };
  if (policy.maxOrderValue !== null && policy.maxOrderValue !== undefined && amount > Number(policy.maxOrderValue)) return { eligible: false, code: 'COD_MAX_ORDER_VALUE', reason: `COD is available only up to ₹${policy.maxOrderValue}`, riskScore: 0, reasons: ['maximum_order_value'] };
  const pincode = normalizePincode(address.pincode);
  if (policy.allowedPincodes?.length && !policy.allowedPincodes.includes(pincode)) return { eligible: false, code: 'COD_PINCODE_NOT_ALLOWED', reason: 'COD is not available for this pincode', riskScore: 0, reasons: ['allowlist'] };
  if (policy.blockedPincodes?.includes(pincode)) return { eligible: false, code: 'COD_PINCODE_BLOCKED', reason: 'COD is not available for this pincode', riskScore: 0, reasons: ['blocklist'] };
  const hash = phoneHash(address.phone);
  if (policy.blockedPhones?.some(item => item.hash === hash)) return { eligible: false, code: 'COD_PHONE_BLOCKED', reason: 'COD is not available for this phone number', riskScore: 0, reasons: ['phone_blocklist'] };
  if (userId && policy.blockedCustomers?.some(id => String(id) === String(userId))) return { eligible: false, code: 'COD_CUSTOMER_BLOCKED', reason: 'COD is not available for this customer', riskScore: 0, reasons: ['customer_blocklist'] };
  const risk = policy.riskScoringEnabled === false ? { score: 0, reasons: [] } : await riskForCustomer({ tenantId, userId, session });
  if (risk.score >= Number(policy.riskThreshold ?? 70)) return { eligible: false, code: 'COD_RISK_BLOCKED', reason: 'COD is temporarily unavailable because of the customer order history', riskScore: risk.score, reasons: risk.reasons };
  return { eligible: true, code: 'COD_ALLOWED', riskScore: risk.score, reasons: risk.reasons };
};

const assertEligible = async args => {
  const result = await evaluate(args);
  if (!result.eligible) throw errorFor(result.reason, result.code, 422);
  return result;
};

module.exports = { evaluate, assertEligible, getPolicy, updatePolicy, safePolicy, phoneHash, normalizePolicy, normalizePincode };
