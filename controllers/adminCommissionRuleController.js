const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const CommissionRule = require('../models/CommissionRule');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Vendor = require('../models/Vendor');
const { writeAudit } = require('../services/vendorAuditService');

const tenantIdFor = (req) => {
  if (!req.tenant?._id) {
    const error = new Error('Tenant context is required');
    error.statusCode = 400;
    error.publicCode = 'TENANT_REQUIRED';
    throw error;
  }
  return req.tenant._id;
};

const validateRule = (body = {}) => {
  const errors = [];
  const name = String(body.name || '').trim().slice(0, 120);
  const percent = Number(body.percent);
  const flatFee = body.flatFee === undefined ? 0 : Number(body.flatFee);
  const priority = body.priority === undefined ? 100 : Number(body.priority);
  if (!name) errors.push('Name is required');
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) errors.push('Percent must be between 0 and 100');
  if (!Number.isFinite(flatFee) || flatFee < 0) errors.push('Flat fee must be zero or more');
  if (!Number.isFinite(priority) || priority < 0 || priority > 1000) errors.push('Priority must be between 0 and 1000');
  return {
    errors,
    value: {
      name,
      percent,
      flatFee,
      priority,
      product: body.product || null,
      category: body.category || null,
      vendor: body.vendor || null,
      effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : new Date(),
      isActive: body.isActive !== false,
    },
  };
};

const validateScope = async (value, tenant) => {
  for (const [field, Model] of [['product', Product], ['category', Category], ['vendor', Vendor]]) {
    if (!value[field]) continue;
    if (!mongoose.isValidObjectId(value[field])) throw new Error(`Invalid ${field} scope`);
    const exists = await Model.exists({ _id: value[field], tenant });
    if (!exists) throw new Error(`${field[0].toUpperCase()}${field.slice(1)} is not part of this workspace`);
  }
};

// @desc    List commission rules (lowest priority number wins on match)
// @route   GET /api/admin/commission-rules
const listCommissionRules = asyncHandler(async (req, res) => {
  const rules = await CommissionRule.find({ tenant: tenantIdFor(req) })
    .populate('product', 'title slug')
    .populate('category', 'name')
    .populate('vendor', 'storeName slug')
    .sort({ priority: 1, createdAt: -1 });
  res.json({ success: true, data: rules });
});

// @desc    Create a commission rule
// @route   POST /api/admin/commission-rules
const createCommissionRule = asyncHandler(async (req, res) => {
  const { errors, value } = validateRule(req.body);
  if (errors.length) {
    res.status(422);
    throw new Error(errors[0]);
  }
  await validateScope(value, tenantIdFor(req));
  const rule = await CommissionRule.create({ ...value, tenant: tenantIdFor(req), createdBy: req.user._id });
  res.status(201).json({ success: true, data: rule });
});

// @desc    Update a commission rule (rate history on orders is untouched)
// @route   PUT /api/admin/commission-rules/:id
const updateCommissionRule = asyncHandler(async (req, res) => {
  const rule = await CommissionRule.findOne({ _id: req.params.id, tenant: tenantIdFor(req) });
  if (!rule) { res.status(404); throw new Error('Commission rule not found'); }
  const { errors, value } = validateRule({ ...rule.toObject(), ...req.body });
  if (errors.length) {
    res.status(422);
    throw new Error(errors[0]);
  }
  await validateScope(value, tenantIdFor(req));
  Object.assign(rule, value);
  await rule.save();
  res.json({ success: true, data: rule });
});

// @desc    Delete a commission rule (falls back to vendor override / default)
// @route   DELETE /api/admin/commission-rules/:id
const deleteCommissionRule = asyncHandler(async (req, res) => {
  const rule = await CommissionRule.findOneAndDelete({ _id: req.params.id, tenant: tenantIdFor(req) });
  if (!rule) { res.status(404); throw new Error('Commission rule not found'); }
  await writeAudit({
    tenant: rule.tenant, vendorId: rule.vendor || undefined, actorId: req.user._id,
    action: 'commission', note: `Rule "${rule.name}" deleted`,
  });
  res.json({ success: true, message: 'Commission rule deleted' });
});

module.exports = { listCommissionRules, createCommissionRule, updateCommissionRule, deleteCommissionRule };
