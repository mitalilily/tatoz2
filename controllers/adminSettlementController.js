const asyncHandler = require('express-async-handler');
const SettlementRun = require('../models/SettlementRun');
const { runSettlement } = require('../services/settlementService');

const tenantIdFor = (req) => {
  if (!req.tenant?._id) {
    const error = new Error('Tenant context is required');
    error.statusCode = 400;
    error.publicCode = 'TENANT_REQUIRED';
    throw error;
  }
  return req.tenant._id;
};

// @desc    Close a settlement period (idempotent per period)
// @route   POST /api/admin/settlements/run
const runSettlementHandler = asyncHandler(async (req, res) => {
  const { periodStart, periodEnd } = req.body || {};
  if (!periodStart || !periodEnd) {
    res.status(422);
    throw new Error('periodStart and periodEnd are required');
  }
  const run = await runSettlement({ tenantId: tenantIdFor(req), periodStart, periodEnd, actorId: req.user._id });
  res.status(201).json({ success: true, data: run });
});

// @desc    List settlement runs (newest first)
// @route   GET /api/admin/settlements
const listSettlements = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const [runs, total] = await Promise.all([
    SettlementRun.find({ tenant: tenantIdFor(req) })
      .populate('lines.vendor', 'storeName slug')
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit)),
    SettlementRun.countDocuments({ tenant: tenantIdFor(req) }),
  ]);
  res.json({
    success: true,
    data: runs,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) },
  });
});

module.exports = { runSettlement: runSettlementHandler, listSettlements };
