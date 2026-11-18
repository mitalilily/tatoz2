const asyncHandler = require('express-async-handler');
const CourierPreference = require('../models/CourierPreference');
const CourierRule = require('../models/CourierRule');
const CourierActivityLog = require('../models/CourierActivityLog');
const CourierMetrics = require('../models/CourierMetrics');
const assignmentService = require('../services/shipping/courierAssignment');
const cache = require('../services/shipping/courierSettingsCache');

// ─── Courier Selection ──────────────────────────────────────────────────────

// GET /admin/shiprocket/couriers
const listCouriers = asyncHandler(async (req, res) => {
  const preferences = await CourierPreference.find({}).sort({ priority: 1, courierName: 1 }).lean();
  const { stressed } = await assignmentService.computeStressed();
  const couriers = preferences.map(p => ({
    ...p,
    stressed: stressed.has(p.courierCompanyId),
  }));
  res.json({ success: true, couriers, stressedCount: stressed.size });
});

// PATCH /admin/shiprocket/couriers/:id
const toggleCourier = asyncHandler(async (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    res.status(400);
    throw new Error('enabled (boolean) is required');
  }
  const pref = await CourierPreference.findByIdAndUpdate(
    req.params.id,
    { $set: { enabled } },
    { new: true },
  );
  if (!pref) { res.status(404); throw new Error('Courier preference not found'); }
  res.json({ success: true, courier: pref });
});

// PATCH /admin/shiprocket/couriers/priority
const reorderCouriers = asyncHandler(async (req, res) => {
  const { order } = req.body; // [{ id, priority }]
  if (!Array.isArray(order)) {
    res.status(400);
    throw new Error('order must be an array of { id, priority }');
  }
  await Promise.all(order.map(({ id, priority }) =>
    CourierPreference.findByIdAndUpdate(id, { $set: { priority: Number(priority) } }),
  ));
  const preferences = await CourierPreference.find({}).sort({ priority: 1, courierName: 1 }).lean();
  res.json({ success: true, couriers: preferences });
});

// POST /admin/shiprocket/couriers/refresh
// Primary path: fetch EVERY courier linked to the Shiprocket account via
// `/courier/courierListWithCounts` — independent of pincode.
// Best-effort enrichment: a serviceability call to grab ratings/ETDs for a
// sample route. Enrichment failures are non-fatal.
const refreshCouriers = asyncHandler(async (req, res) => {
  const pickupPincode = req.body.pickupPincode || await cache.getDefaultPickupPincode();
  const deliveryPincode = req.body.deliveryPincode || await cache.getDefaultDeliveryPincode();
  const weight = Number(req.body.weight) || 0.5;
  const cod = req.body.cod ? 1 : 0;

  let fullList = { discovered: 0 };
  let enrichedCount = 0;
  let fullListError = null;
  let enrichError = null;

  // 1) Full account courier list (primary)
  try {
    fullList = await assignmentService.syncAllCouriers({ tenantId: req.tenant?._id });
  } catch (err) {
    fullListError = err.message;
  }

  // 2) Serviceability enrichment (best effort — fills rating/ETD for sample route)
  try {
    const enriched = await assignmentService.syncFromServiceability({
      pickupPincode, deliveryPincode, weight, cod, tenantId: req.tenant?._id,
    });
    enrichedCount = enriched.length;
  } catch (err) {
    enrichError = err.message;
  }

  const preferences = await CourierPreference.find({}).sort({ priority: 1 }).lean();

  // If both paths failed, surface an error so the admin sees the actual cause
  if (fullListError && enrichError && preferences.length === 0) {
    res.status(502);
    throw new Error(`Refresh failed — full list: ${fullListError} | serviceability: ${enrichError}`);
  }

  res.json({
    success: true,
    discovered: fullList.discovered,
    enriched: enrichedCount,
    couriers: preferences,
    pickupPincode,
    deliveryPincode,
    warnings: [
      fullListError && `Full-list endpoint failed: ${fullListError}`,
      enrichError && `Serviceability enrichment skipped: ${enrichError}`,
    ].filter(Boolean),
  });
});

// ─── Rules ──────────────────────────────────────────────────────────────────

// GET /admin/shiprocket/couriers/rules
const listRules = asyncHandler(async (req, res) => {
  const rules = await CourierRule.find({}).sort({ priority: 1, createdAt: -1 }).lean();
  res.json({ success: true, rules });
});

// POST /admin/shiprocket/couriers/rules
const createRule = asyncHandler(async (req, res) => {
  const { name, enabled, priority, conditions, action } = req.body;
  if (!name || !action?.type || !action?.courierCompanyId) {
    res.status(400);
    throw new Error('name, action.type and action.courierCompanyId are required');
  }
  const rule = await CourierRule.create({
    name,
    enabled: enabled !== false,
    priority: Number(priority) || 100,
    conditions: {
      weightMin: conditions?.weightMin != null ? Number(conditions.weightMin) : null,
      weightMax: conditions?.weightMax != null ? Number(conditions.weightMax) : null,
    },
    action: {
      type: action.type,
      courierCompanyId: Number(action.courierCompanyId),
      courierName: action.courierName,
    },
  });
  res.status(201).json({ success: true, rule });
});

// PATCH /admin/shiprocket/couriers/rules/:id
const updateRule = asyncHandler(async (req, res) => {
  const update = {};
  const { name, enabled, priority, conditions, action } = req.body;
  if (name !== undefined) update.name = name;
  if (enabled !== undefined) update.enabled = !!enabled;
  if (priority !== undefined) update.priority = Number(priority);
  if (conditions !== undefined) {
    update.conditions = {
      weightMin: conditions.weightMin != null ? Number(conditions.weightMin) : null,
      weightMax: conditions.weightMax != null ? Number(conditions.weightMax) : null,
    };
  }
  if (action !== undefined) {
    update.action = {
      type: action.type,
      courierCompanyId: Number(action.courierCompanyId),
      courierName: action.courierName,
    };
  }
  const rule = await CourierRule.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
  if (!rule) { res.status(404); throw new Error('Rule not found'); }
  res.json({ success: true, rule });
});

// DELETE /admin/shiprocket/couriers/rules/:id
const deleteRule = asyncHandler(async (req, res) => {
  const rule = await CourierRule.findByIdAndDelete(req.params.id);
  if (!rule) { res.status(404); throw new Error('Rule not found'); }
  res.json({ success: true, message: 'Rule deleted' });
});

// ─── Activity Logs ──────────────────────────────────────────────────────────

// GET /admin/shiprocket/couriers/activity
const listActivity = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 20);
  const filter = {};
  if (req.query.courierCompanyId) filter.chosenCourierCompanyId = Number(req.query.courierCompanyId);
  if (req.query.outcome) filter.outcome = req.query.outcome;
  if (req.query.triggeredBy) filter.triggeredBy = req.query.triggeredBy;
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
  }

  const [logs, total] = await Promise.all([
    CourierActivityLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    CourierActivityLog.countDocuments(filter),
  ]);

  res.json({
    success: true,
    logs,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// ─── Auto-Assignment Settings ───────────────────────────────────────────────

// GET /admin/shiprocket/couriers/auto-assign
const getAutoAssignSettings = asyncHandler(async (req, res) => {
  const config = await cache.getAutoAssignConfig();
  const lastRun = await cache.getLastRun();
  res.json({ success: true, config, lastRun });
});

// PATCH /admin/shiprocket/couriers/auto-assign
const updateAutoAssignSettings = asyncHandler(async (req, res) => {
  const { enabled, onOrderCreate } = req.body;
  const current = await cache.getAutoAssignConfig();
  const next = {
    enabled: enabled !== undefined ? !!enabled : current.enabled,
    onOrderCreate: onOrderCreate !== undefined ? !!onOrderCreate : current.onOrderCreate,
  };
  await cache.setAutoAssignConfig(next);
  res.json({ success: true, config: next });
});

// POST /admin/shiprocket/couriers/auto-assign/run
const runAutoAssignNow = asyncHandler(async (req, res) => {
  const { dryRun = false, limit } = req.body || {};
  const summary = await assignmentService.runBulkAutoAssign({
    dryRun: !!dryRun,
    limit: limit ? Number(limit) : undefined,
    tenantId: req.tenant?._id,
  });
  res.json({ success: true, summary });
});

// ─── Stressed Couriers ──────────────────────────────────────────────────────

// GET /admin/shiprocket/couriers/stressed
const getStressedCouriers = asyncHandler(async (req, res) => {
  // Auto-recompute if stale
  const lastRecomputedAt = await cache.getMetricsLastRecomputedAt();
  const stale = !lastRecomputedAt || (Date.now() - new Date(lastRecomputedAt).getTime()) > 6 * 60 * 60 * 1000;
  if (stale) {
    try { await assignmentService.recomputeMetrics({ days: 7 }); } catch (_) { /* non-fatal */ }
  }

  const thresholds = await cache.getStressedThresholds();
  const { stressed, autoFlagged, details } = await assignmentService.computeStressed();
  const preferences = await CourierPreference.find({}).lean();

  const rows = preferences.map(p => {
    const stats = details.get(p.courierCompanyId) || { shipments: 0, delivered: 0, rto: 0, ndr: 0, pickupFailed: 0 };
    const pct = (n) => stats.shipments ? (n / stats.shipments) * 100 : 0;
    return {
      _id: p._id,
      courierCompanyId: p.courierCompanyId,
      courierName: p.courierName,
      enabled: p.enabled,
      manuallyStressed: p.manuallyStressed,
      manualStressCleared: p.manualStressCleared,
      autoFlagged: autoFlagged.has(p.courierCompanyId),
      effectiveStressed: stressed.has(p.courierCompanyId),
      shipments: stats.shipments,
      delivered: stats.delivered,
      rto: stats.rto,
      ndr: stats.ndr,
      pickupFailed: stats.pickupFailed,
      deliveredPct: pct(stats.delivered),
      rtoPct: pct(stats.rto),
      ndrPct: pct(stats.ndr),
      pickupFailPct: pct(stats.pickupFailed),
    };
  });

  res.json({
    success: true,
    rows,
    thresholds,
    lastRecomputedAt: await cache.getMetricsLastRecomputedAt(),
    totalStressed: stressed.size,
    totalAutoFlagged: autoFlagged.size,
  });
});

// PATCH /admin/shiprocket/couriers/stressed/thresholds
const updateStressThresholds = asyncHandler(async (req, res) => {
  const updated = await cache.setStressedThresholds(req.body || {});
  res.json({ success: true, thresholds: updated });
});

// PATCH /admin/shiprocket/couriers/stressed/:id
const toggleManualStress = asyncHandler(async (req, res) => {
  const { manuallyStressed, manualStressCleared } = req.body;
  const update = {};
  if (manuallyStressed !== undefined) update.manuallyStressed = !!manuallyStressed;
  if (manualStressCleared !== undefined) update.manualStressCleared = !!manualStressCleared;
  const pref = await CourierPreference.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
  if (!pref) { res.status(404); throw new Error('Courier preference not found'); }
  res.json({ success: true, courier: pref });
});

// POST /admin/shiprocket/couriers/metrics/recompute
const recomputeMetrics = asyncHandler(async (req, res) => {
  const days = Number(req.body?.days) || 7;
  const result = await assignmentService.recomputeMetrics({ days });
  res.json({
    success: true,
    ...result,
    lastRecomputedAt: await cache.getMetricsLastRecomputedAt(),
  });
});

module.exports = {
  listCouriers,
  toggleCourier,
  reorderCouriers,
  refreshCouriers,
  listRules,
  createRule,
  updateRule,
  deleteRule,
  listActivity,
  getAutoAssignSettings,
  updateAutoAssignSettings,
  runAutoAssignNow,
  getStressedCouriers,
  updateStressThresholds,
  toggleManualStress,
  recomputeMetrics,
};
