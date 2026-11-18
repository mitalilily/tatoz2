const asyncHandler = require('express-async-handler');
const ServiceablePincode = require('../models/ServiceablePincode');

const errorFor = (message, statusCode = 400, publicCode = 'PINCODE_INVALID') => { const error = new Error(message); error.statusCode = statusCode; error.publicCode = publicCode; return error; };
const tenantFor = req => { if (!req.tenant?._id) throw errorFor('Tenant context is required', 400, 'TENANT_REQUIRED'); return req.tenant._id; };
const normalize = body => {
  const pincode = String(body.pincode || '').replace(/\D/g, '');
  if (!/^\d{6}$/.test(pincode)) throw errorFor('Pincode must be a valid 6-digit value');
  const estimatedMinDays = Math.max(0, Math.min(365, Math.round(Number(body.estimatedMinDays ?? 3))));
  const estimatedMaxDays = Math.max(estimatedMinDays, Math.min(365, Math.round(Number(body.estimatedMaxDays ?? 7))));
  return {
    pincode,
    city: String(body.city || '').trim().slice(0, 100),
    state: String(body.state || '').trim().slice(0, 100),
    country: String(body.country || 'India').trim().slice(0, 50),
    serviceable: body.serviceable !== false && body.serviceable !== 'false',
    codEnabled: body.codEnabled !== false && body.codEnabled !== 'false',
    shippingCharge: Math.max(0, Number(body.shippingCharge || 0)),
    estimatedMinDays,
    estimatedMaxDays,
    warehouse: body.warehouse || undefined,
    notes: String(body.notes || '').trim().slice(0, 500),
    active: body.active !== false && body.active !== 'false',
  };
};

const list = asyncHandler(async (req, res) => {
  const tenant = tenantFor(req);
  const query = { tenant };
  if (req.query.search) query.pincode = { $regex: String(req.query.search).replace(/\D/g, '').slice(0, 6) };
  res.json({ success: true, pincodes: await ServiceablePincode.find(query).sort({ pincode: 1 }).limit(1000).lean() });
});

const create = asyncHandler(async (req, res) => {
  const pincode = await ServiceablePincode.create({ tenant: tenantFor(req), ...normalize(req.body || {}) });
  res.status(201).json({ success: true, pincode });
});

const update = asyncHandler(async (req, res) => {
  const tenant = tenantFor(req);
  const current = await ServiceablePincode.findOne({ _id: req.params.id, tenant });
  if (!current) { res.status(404); throw errorFor('Pincode rule not found', 404, 'PINCODE_NOT_FOUND'); }
  Object.assign(current, normalize({ ...current.toObject(), ...req.body }));
  await current.save();
  res.json({ success: true, pincode: current });
});

const remove = asyncHandler(async (req, res) => {
  const result = await ServiceablePincode.findOneAndDelete({ _id: req.params.id, tenant: tenantFor(req) });
  if (!result) { res.status(404); throw errorFor('Pincode rule not found', 404, 'PINCODE_NOT_FOUND'); }
  res.json({ success: true, deleted: true });
});

module.exports = { list, create, update, remove, normalize };
