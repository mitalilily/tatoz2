const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const ShippingZone = require('../models/ShippingZone');
const ShippingRate = require('../models/ShippingRate');
const Settings = require('../models/Settings');

const controllerError = (message, statusCode = 400, publicCode = 'SHIPPING_RULE_INVALID') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
};

const tenantIdFor = req => {
  if (!req.tenant?._id) throw controllerError('Tenant context is required', 400, 'TENANT_REQUIRED');
  return req.tenant._id;
};

const text = value => String(value ?? '').trim();
const list = (value, { max = 100, maxLength = 80, pincode = false, prefix = false } = {}) => {
  const values = Array.isArray(value) ? value : text(value).split(/[,\n]/);
  const unique = [];
  for (const entry of values.map(item => text(item)).filter(Boolean)) {
    const normalized = entry;
    if (!normalized || unique.includes(normalized)) continue;
    if (unique.length >= max) throw controllerError('Shipping rule contains too many match values');
    if (normalized.length > maxLength || /[<>\u0000-\u001F\u007F]/.test(normalized)) throw controllerError('Shipping rule contains an invalid match value');
    if (pincode && !/^\d{6}$/.test(normalized)) throw controllerError(`Invalid pincode: ${entry}`);
    if (prefix && (!/^\d{1,6}$/.test(normalized) || normalized.length === 6)) throw controllerError(`Invalid pincode prefix: ${entry}`);
    unique.push(normalized);
  }
  return unique;
};

const bool = (value, fallback = true) => value === undefined ? fallback : value !== false && value !== 'false';
const number = (value, fallback = null, { min = 0, max = 100000000 } = {}) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw controllerError('Shipping rule contains an invalid number');
  return Math.round(parsed * 10000) / 10000;
};
const integer = (value, fallback = 0, max = 10000) => {
  const parsed = number(value, fallback, { min: 0, max });
  return parsed === null ? fallback : Math.round(parsed);
};
const code = (value, label) => {
  const normalized = text(value).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(normalized)) throw controllerError(`${label} must be 2-40 letters, numbers, hyphens or underscores`);
  return normalized;
};

const normalizeZone = body => {
  const match = body.match && typeof body.match === 'object' ? body.match : body;
  const name = text(body.name);
  if (!name || name.length > 100 || /[<>\u0000-\u001F\u007F]/.test(name)) throw controllerError('Zone name is required, plain text, and must be at most 100 characters');
  return {
    name,
    code: code(body.code || name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40), 'Zone code'),
    enabled: bool(body.enabled, true),
    priority: integer(body.priority, 0, 10000),
    match: {
      countries: list(match.countries, { max: 30, maxLength: 80 }),
      states: list(match.states, { max: 100, maxLength: 100 }),
      cities: list(match.cities, { max: 200, maxLength: 100 }),
      pincodes: list(match.pincodes, { max: 500, maxLength: 6, pincode: true }),
      pincodePrefixes: list(match.pincodePrefixes, { max: 100, maxLength: 5, prefix: true }),
      blockedPincodes: list(match.blockedPincodes, { max: 500, maxLength: 6, pincode: true }),
    },
  };
};

const normalizeRate = (body, existing = {}) => {
  const zoneId = body.zoneId || body.zone || existing.zone;
  if (!zoneId || !mongoose.isValidObjectId(zoneId)) throw controllerError('A valid shipping zone is required');
  const name = text(body.name ?? existing.name);
  if (!name || name.length > 100 || /[<>\u0000-\u001F\u007F]/.test(name)) throw controllerError('Rate name is required, plain text, and must be at most 100 characters');
  const serviceLevel = text(body.serviceLevel ?? existing.serviceLevel ?? 'standard').toLowerCase();
  const chargeType = text(body.chargeType ?? existing.chargeType ?? 'flat').toLowerCase();
  if (!['standard', 'express', 'same_day', 'local'].includes(serviceLevel)) throw controllerError('Invalid shipping service level');
  if (!['flat', 'weight', 'price', 'free'].includes(chargeType)) throw controllerError('Invalid shipping charge type');
  const minSubtotal = number(body.minSubtotal ?? existing.minSubtotal);
  const maxSubtotal = number(body.maxSubtotal ?? existing.maxSubtotal);
  const minWeight = number(body.minWeight ?? existing.minWeight, null, { max: 100000 });
  const maxWeight = number(body.maxWeight ?? existing.maxWeight, null, { max: 100000 });
  if (minSubtotal !== null && maxSubtotal !== null && minSubtotal > maxSubtotal) throw controllerError('Minimum subtotal cannot exceed maximum subtotal');
  if (minWeight !== null && maxWeight !== null && minWeight > maxWeight) throw controllerError('Minimum weight cannot exceed maximum weight');
  const estimatedMinDays = integer(body.estimatedMinDays ?? existing.estimatedMinDays, 3, 365);
  const estimatedMaxDays = integer(body.estimatedMaxDays ?? existing.estimatedMaxDays, 7, 365);
  if (estimatedMinDays > estimatedMaxDays) throw controllerError('Minimum delivery days cannot exceed maximum days');
  const currency = text(body.currency ?? existing.currency ?? 'INR').toUpperCase() || 'INR';
  if (!/^[A-Z]{3}$/.test(currency)) throw controllerError('Shipping currency must be a three-letter code');
  return {
    zone: zoneId,
    name,
    code: code(body.code || existing.code || name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40), 'Rate code'),
    serviceLevel,
    chargeType,
    enabled: bool(body.enabled ?? existing.enabled, true),
    priority: integer(body.priority ?? existing.priority, 0, 10000),
    baseAmount: number(body.baseAmount ?? existing.baseAmount, 0),
    includedWeight: number(body.includedWeight ?? existing.includedWeight, 0, { max: 100000 }),
    amountPerKg: number(body.amountPerKg ?? existing.amountPerKg, 0, { max: 100000 }),
    includedSubtotal: number(body.includedSubtotal ?? existing.includedSubtotal, 0),
    amountPerCurrency: number(body.amountPerCurrency ?? existing.amountPerCurrency, 0, { max: 100000 }),
    freeOverSubtotal: number(body.freeOverSubtotal ?? existing.freeOverSubtotal),
    minSubtotal,
    maxSubtotal,
    minWeight,
    maxWeight,
    codEnabled: bool(body.codEnabled ?? existing.codEnabled, true),
    prepaidEnabled: bool(body.prepaidEnabled ?? existing.prepaidEnabled, true),
    estimatedMinDays,
    estimatedMaxDays,
    currency,
  };
};

const safeZone = zone => ({
  _id: zone._id,
  name: zone.name,
  code: zone.code,
  enabled: zone.enabled,
  priority: zone.priority,
  match: zone.match || {},
  createdAt: zone.createdAt,
  updatedAt: zone.updatedAt,
});

const safeRate = rate => ({
  _id: rate._id,
  zone: rate.zone,
  name: rate.name,
  code: rate.code,
  serviceLevel: rate.serviceLevel,
  chargeType: rate.chargeType,
  enabled: rate.enabled,
  priority: rate.priority,
  baseAmount: rate.baseAmount,
  includedWeight: rate.includedWeight,
  amountPerKg: rate.amountPerKg,
  includedSubtotal: rate.includedSubtotal,
  amountPerCurrency: rate.amountPerCurrency,
  freeOverSubtotal: rate.freeOverSubtotal,
  minSubtotal: rate.minSubtotal,
  maxSubtotal: rate.maxSubtotal,
  minWeight: rate.minWeight,
  maxWeight: rate.maxWeight,
  codEnabled: rate.codEnabled,
  prepaidEnabled: rate.prepaidEnabled,
  estimatedMinDays: rate.estimatedMinDays,
  estimatedMaxDays: rate.estimatedMaxDays,
  currency: rate.currency,
  createdAt: rate.createdAt,
  updatedAt: rate.updatedAt,
});

const getShippingRules = asyncHandler(async (req, res) => {
  const tenant = tenantIdFor(req);
  const [zones, rates, freeShippingThreshold, standardShippingCost] = await Promise.all([
    ShippingZone.find({ tenant }).sort({ priority: -1, createdAt: 1 }).lean(),
    ShippingRate.find({ tenant }).sort({ priority: -1, createdAt: 1 }).lean(),
    Settings.get('free_shipping_threshold', 999),
    Settings.get('standard_shipping_cost', 49),
  ]);
  res.json({ success: true, zones: zones.map(safeZone), rates: rates.map(safeRate), legacy: { freeShippingThreshold, standardShippingCost } });
});

const createShippingZone = asyncHandler(async (req, res) => {
  const tenant = tenantIdFor(req);
  const zone = await ShippingZone.create({ tenant, ...normalizeZone(req.body || {}) });
  res.status(201).json({ success: true, zone: safeZone(zone.toObject()) });
});

const updateShippingZone = asyncHandler(async (req, res) => {
  const tenant = tenantIdFor(req);
  const current = await ShippingZone.findOne({ _id: req.params.id, tenant });
  if (!current) { res.status(404); throw controllerError('Shipping zone not found', 404, 'SHIPPING_ZONE_NOT_FOUND'); }
  Object.assign(current, normalizeZone({ ...current.toObject(), ...req.body, match: { ...(current.match?.toObject?.() || current.match || {}), ...(req.body?.match || {}) } }));
  await current.save();
  res.json({ success: true, zone: safeZone(current.toObject()) });
});

const deleteShippingZone = asyncHandler(async (req, res) => {
  const tenant = tenantIdFor(req);
  const zone = await ShippingZone.findOne({ _id: req.params.id, tenant });
  if (!zone) { res.status(404); throw controllerError('Shipping zone not found', 404, 'SHIPPING_ZONE_NOT_FOUND'); }
  const rateCount = await ShippingRate.countDocuments({ tenant, zone: zone._id });
  if (rateCount > 0) throw controllerError('Remove or move all rates before deleting this zone', 409, 'SHIPPING_ZONE_HAS_RATES');
  await zone.deleteOne();
  res.json({ success: true, deleted: true });
});

const createShippingRate = asyncHandler(async (req, res) => {
  const tenant = tenantIdFor(req);
  const normalizedRate = normalizeRate(req.body || {});
  const zone = await ShippingZone.findOne({ _id: normalizedRate.zone, tenant });
  if (!zone) { res.status(404); throw controllerError('Shipping zone not found in this tenant', 404, 'SHIPPING_ZONE_NOT_FOUND'); }
  const rate = await ShippingRate.create({ tenant, ...normalizedRate });
  res.status(201).json({ success: true, rate: safeRate(rate.toObject()) });
});

const updateShippingRate = asyncHandler(async (req, res) => {
  const tenant = tenantIdFor(req);
  const current = await ShippingRate.findOne({ _id: req.params.id, tenant });
  if (!current) { res.status(404); throw controllerError('Shipping rate not found', 404, 'SHIPPING_RATE_NOT_FOUND'); }
  const normalizedRate = normalizeRate({ ...current.toObject(), ...req.body }, current.toObject());
  const zone = await ShippingZone.findOne({ _id: normalizedRate.zone, tenant });
  if (!zone) { res.status(404); throw controllerError('Shipping zone not found in this tenant', 404, 'SHIPPING_ZONE_NOT_FOUND'); }
  Object.assign(current, normalizedRate);
  await current.save();
  res.json({ success: true, rate: safeRate(current.toObject()) });
});

const deleteShippingRate = asyncHandler(async (req, res) => {
  const tenant = tenantIdFor(req);
  const rate = await ShippingRate.findOneAndDelete({ _id: req.params.id, tenant });
  if (!rate) { res.status(404); throw controllerError('Shipping rate not found', 404, 'SHIPPING_RATE_NOT_FOUND'); }
  res.json({ success: true, deleted: true });
});

module.exports = {
  getShippingRules,
  createShippingZone,
  updateShippingZone,
  deleteShippingZone,
  createShippingRate,
  updateShippingRate,
  deleteShippingRate,
};
