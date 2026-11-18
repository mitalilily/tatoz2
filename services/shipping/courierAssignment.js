const shippingManager = require('./shippingManager');
const shiprocket = require('./providers/shiprocket');
const CourierPreference = require('../../models/CourierPreference');
const CourierRule = require('../../models/CourierRule');
const CourierActivityLog = require('../../models/CourierActivityLog');
const CourierMetrics = require('../../models/CourierMetrics');
const Order = require('../../models/Order');
const cache = require('./courierSettingsCache');

const LOCK_STALE_MS = 2 * 60 * 1000; // 2 minutes

// ─── Helpers ────────────────────────────────────────────────────────────────

const _orderWeight = (order) => {
  // Naive default; admins can change via rule weight conditions or pass explicit weight
  const count = (order.items || []).reduce((n, i) => n + (i.quantity || 1), 0);
  return Math.max(0.5, count * 0.5);
};

const _normalizeCandidate = (c) => ({
  courierCompanyId: c.courier_company_id,
  courierName: c.courier_name,
  rating: c.rating,
  freight: c.freight_charge,
  cod: c.cod_charges,
  estimatedDays: c.estimated_delivery_days,
  raw: c,
});

// ─── Public ─────────────────────────────────────────────────────────────────

/**
 * Upsert CourierPreference rows for every courier returned by Shiprocket's
 * serviceability for the given parameters, and return the live candidate list.
 * This is both passive discovery AND the canonical candidate source for pickCourier.
 */
const syncFromServiceability = async ({ pickupPincode, deliveryPincode, weight, cod = 0, tenantId }) => {
  if (!await shippingManager.isEnabled(tenantId)) {
    throw new Error('Shiprocket is not configured');
  }
  const config = await shippingManager.getConfig('shiprocket', tenantId);
  const res = await shiprocket.checkServiceability(
    { pickupPincode, deliveryPincode, weight, cod },
    config,
  );
  const rawCouriers = res?.data?.available_courier_companies || [];
  const candidates = rawCouriers.map(_normalizeCandidate);

  // Upsert — passive discovery
  const now = new Date();
  await Promise.all(candidates.map(c =>
    CourierPreference.findOneAndUpdate(
      { courierCompanyId: c.courierCompanyId },
      {
        $set: {
          courierName: c.courierName,
          lastSeenAt: now,
          'metadata.rating': c.rating,
          'metadata.raw': c.raw,
        },
        $setOnInsert: {
          enabled: true,
          priority: 100,
          manuallyStressed: false,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ),
  ));

  return candidates;
};

/**
 * Fetch EVERY courier linked to the Shiprocket account (not just serviceable ones)
 * and upsert into CourierPreference. This is the primary discovery path — it's
 * independent of pincode/weight/cod so it returns the full account courier list.
 *
 * Returns { discovered, preferences }.
 */
const syncAllCouriers = async ({ tenantId } = {}) => {
  if (!await shippingManager.isEnabled(tenantId)) {
    throw new Error('Shiprocket is not configured');
  }
  const config = await shippingManager.getConfig('shiprocket', tenantId);
  const list = await shiprocket.listAllCouriers(config);

  const now = new Date();
  await Promise.all(list.map(c =>
    CourierPreference.findOneAndUpdate(
      { courierCompanyId: c.courierCompanyId },
      {
        $set: {
          courierName: c.courierName,
          lastSeenAt: now,
          'metadata.rating': c.rating,
          'metadata.raw': c.raw,
        },
        $setOnInsert: {
          enabled: true,
          priority: 100,
          manuallyStressed: false,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ),
  ));

  return { discovered: list.length, list };
};

/**
 * Compute the Set of courierCompanyIds currently considered stressed.
 * Rules:
 *   - Auto-flagged if rolling-window metrics exceed any configured threshold
 *     AND sampled shipments >= minShipments
 *   - Manual override: manuallyStressed=true forces stressed
 *   - Manual override: manualStressCleared=true removes from stressed set
 */
const computeStressed = async () => {
  const thresholds = await cache.getStressedThresholds();
  const since = new Date(Date.now() - thresholds.rollingDays * 24 * 60 * 60 * 1000);

  // Aggregate metrics per courier over the rolling window
  const agg = await CourierMetrics.aggregate([
    { $match: { date: { $gte: since } } },
    {
      $group: {
        _id: '$courierCompanyId',
        shipments: { $sum: '$shipments' },
        delivered: { $sum: '$delivered' },
        rto: { $sum: '$rto' },
        ndr: { $sum: '$ndr' },
        pickupFailed: { $sum: '$pickupFailed' },
      },
    },
  ]);

  const autoFlagged = new Set();
  const details = new Map(); // courierCompanyId -> stats
  for (const row of agg) {
    const cid = row._id;
    details.set(cid, row);
    if (row.shipments < thresholds.minShipments) continue;
    const ndrPct = (row.ndr / row.shipments) * 100;
    const rtoPct = (row.rto / row.shipments) * 100;
    const pickupFailPct = (row.pickupFailed / row.shipments) * 100;
    if (ndrPct >= thresholds.ndrPct ||
        rtoPct >= thresholds.rtoPct ||
        pickupFailPct >= thresholds.pickupFailPct) {
      autoFlagged.add(cid);
    }
  }

  // Apply manual overrides
  const prefs = await CourierPreference.find({}).lean();
  const stressed = new Set();
  for (const p of prefs) {
    const auto = autoFlagged.has(p.courierCompanyId);
    if (p.manuallyStressed) {
      stressed.add(p.courierCompanyId);
    } else if (auto && !p.manualStressCleared) {
      stressed.add(p.courierCompanyId);
    }
  }

  return { stressed, autoFlagged, details };
};

/**
 * Core decision engine. Returns:
 *   { chosen, decisionPath, matchedRuleIds, outcome }
 * chosen is either the full candidate object or null.
 */
const pickCourier = async (order, { stressedSet, tenantId } = {}) => {
  const resolvedTenantId = tenantId || order?.tenant;
  const stressed = stressedSet || (await computeStressed()).stressed;

  // 1. Fetch live candidates from Shiprocket
  const pickupPincode = (await shippingManager.getConfig('shiprocket', resolvedTenantId)).default_pickup_pin || await cache.getDefaultPickupPincode();
  const deliveryPincode = order.shippingAddress?.pincode;
  if (!deliveryPincode) {
    return {
      chosen: null,
      decisionPath: [],
      matchedRuleIds: [],
      outcome: 'no-candidate',
      errorMessage: 'Order has no delivery pincode',
    };
  }
  const weight = _orderWeight(order);
  const cod = order.paymentMethod === 'cod' ? 1 : 0;

  let candidates = [];
  try {
    candidates = await syncFromServiceability({ pickupPincode, deliveryPincode, weight, cod, tenantId: resolvedTenantId });
  } catch (err) {
    return {
      chosen: null,
      decisionPath: [],
      matchedRuleIds: [],
      outcome: 'shiprocket-error',
      errorMessage: `Serviceability failed: ${err.message}`,
    };
  }

  if (!candidates.length) {
    return {
      chosen: null,
      decisionPath: [],
      matchedRuleIds: [],
      outcome: 'no-candidate',
      errorMessage: 'No serviceable couriers returned by Shiprocket',
    };
  }

  // 2. Load preferences and rules
  const [prefs, rules] = await Promise.all([
    CourierPreference.find({}).lean(),
    CourierRule.find({ enabled: true }).sort({ priority: 1 }).lean(),
  ]);
  const prefById = new Map(prefs.map(p => [p.courierCompanyId, p]));

  // 3. Build decisionPath entries for every candidate and filter
  const decisionPath = [];
  const filtered = [];
  for (const c of candidates) {
    const pref = prefById.get(c.courierCompanyId);
    let excludedReason = null;
    let ruleId = null;

    if (pref && pref.enabled === false) {
      excludedReason = 'disabled';
    } else if (stressed.has(c.courierCompanyId)) {
      excludedReason = 'stressed';
    } else {
      // Check exclude rules
      for (const r of rules) {
        if (r.action?.type !== 'exclude') continue;
        if (r.action.courierCompanyId !== c.courierCompanyId) continue;
        if (_ruleMatches(r, { weight })) {
          excludedReason = 'rule-exclude';
          ruleId = r._id;
          break;
        }
      }
    }

    const entry = {
      courierCompanyId: c.courierCompanyId,
      courierName: c.courierName,
      excludedReason,
      ruleId,
      rank: null,
    };
    decisionPath.push(entry);
    if (!excludedReason) filtered.push({ candidate: c, entry, pref });
  }

  if (!filtered.length) {
    return {
      chosen: null,
      decisionPath,
      matchedRuleIds: [],
      outcome: 'no-candidate',
      errorMessage: 'All candidates were filtered out (disabled/stressed/rule-excluded)',
    };
  }

  // 4. Apply prefer rules in priority order
  const matchedRuleIds = [];
  for (const r of rules) {
    if (r.action?.type !== 'prefer') continue;
    if (!_ruleMatches(r, { weight })) continue;
    const hit = filtered.find(f => f.candidate.courierCompanyId === r.action.courierCompanyId);
    if (hit) {
      matchedRuleIds.push(r._id);
      hit.entry.ruleId = r._id;
      hit.entry.rank = 1;
      // Mark others as priority-loser in decisionPath
      for (const other of filtered) {
        if (other !== hit && !other.entry.excludedReason) {
          other.entry.excludedReason = 'priority-loser';
        }
      }
      return {
        chosen: hit.candidate,
        decisionPath,
        matchedRuleIds,
        outcome: 'assigned',
      };
    }
  }

  // 5. No prefer rule matched — sort by CourierPreference.priority asc, then rating desc, then freight asc
  filtered.sort((a, b) => {
    const ap = a.pref?.priority ?? 100;
    const bp = b.pref?.priority ?? 100;
    if (ap !== bp) return ap - bp;
    const ar = a.candidate.rating ?? 0;
    const br = b.candidate.rating ?? 0;
    if (ar !== br) return br - ar;
    const af = Number(a.candidate.freight) || Infinity;
    const bf = Number(b.candidate.freight) || Infinity;
    return af - bf;
  });

  // Mark ranks
  filtered.forEach((f, i) => {
    f.entry.rank = i + 1;
    if (i > 0) f.entry.excludedReason = 'priority-loser';
  });

  return {
    chosen: filtered[0].candidate,
    decisionPath,
    matchedRuleIds,
    outcome: 'assigned',
  };
};

const _ruleMatches = (rule, { weight }) => {
  const { weightMin, weightMax } = rule.conditions || {};
  if (weightMin != null && weight < weightMin) return false;
  if (weightMax != null && weight > weightMax) return false;
  return true;
};

/**
 * Acquire a per-order conditional lock so two parallel auto-assignments can't both
 * fire for the same order. Returns the locked order doc or null.
 */
const _acquireLock = async (orderId) => {
  const staleCutoff = new Date(Date.now() - LOCK_STALE_MS);
  return Order.findOneAndUpdate(
    {
      _id: orderId,
      $and: [
        { $or: [{ awbCode: null }, { awbCode: '' }, { awbCode: { $exists: false } }] },
        { $or: [
          { courierAssignmentLock: { $ne: true } },
          { courierAssignmentLockedAt: { $lt: staleCutoff } },
        ] },
      ],
    },
    {
      $set: {
        courierAssignmentLock: true,
        courierAssignmentLockedAt: new Date(),
      },
    },
    { new: true },
  );
};

const _releaseLock = async (orderId) => {
  await Order.updateOne(
    { _id: orderId },
    { $set: { courierAssignmentLock: false }, $unset: { courierAssignmentLockedAt: '' } },
  );
};

/**
 * Lock the order, call pickCourier, call Shiprocket assignCourier, update Order,
 * write activity log. Always writes an activity log (even for failure and lock-miss).
 */
const assignCourierToOrder = async (order, triggeredBy = 'manual', opts = {}) => {
  const tenantId = opts.tenantId || order?.tenant;
  // Lock
  const locked = await _acquireLock(order._id);
  if (!locked) {
    await CourierActivityLog.create({
      orderId: order._id,
      orderNumber: order.orderNumber,
      triggeredBy,
      outcome: 'locked',
      errorMessage: 'Order is already being auto-assigned or has an AWB',
      decisionPath: [],
    });
    return { outcome: 'locked' };
  }

  try {
    const decision = await pickCourier(locked, { ...opts, tenantId });
    const {
      chosen, decisionPath, matchedRuleIds, outcome, errorMessage,
    } = decision;

    // No candidate or service error — log and bail
    if (outcome !== 'assigned' || !chosen) {
      await CourierActivityLog.create({
        orderId: locked._id,
        orderNumber: locked.orderNumber,
        triggeredBy,
        matchedRuleIds,
        decisionPath,
        outcome,
        errorMessage,
      });
      return { outcome, errorMessage, decisionPath };
    }

    if (opts.dryRun) {
      await CourierActivityLog.create({
        orderId: locked._id,
        orderNumber: locked.orderNumber,
        chosenCourierCompanyId: chosen.courierCompanyId,
        chosenCourierName: chosen.courierName,
        triggeredBy: 'dry-run',
        matchedRuleIds,
        decisionPath,
        outcome: 'dry-run',
      });
      return { outcome: 'dry-run', chosen, decisionPath };
    }

    if (!locked.shiprocketShipmentId) {
      await CourierActivityLog.create({
        orderId: locked._id,
        orderNumber: locked.orderNumber,
        chosenCourierCompanyId: chosen.courierCompanyId,
        chosenCourierName: chosen.courierName,
        triggeredBy,
        matchedRuleIds,
        decisionPath,
        outcome: 'shiprocket-error',
        errorMessage: 'Order has no shiprocketShipmentId; cannot assign AWB',
      });
      return { outcome: 'shiprocket-error', errorMessage: 'Missing shipmentId' };
    }

    // Call Shiprocket
    try {
      const config = await shippingManager.getConfig('shiprocket', tenantId);
      const assignRes = await shiprocket.assignCourier(
        { shipmentId: locked.shiprocketShipmentId, courierId: chosen.courierCompanyId },
        config,
      );

      const awbCode = assignRes?.response?.data?.awb_code || null;
      const courierName = assignRes?.response?.data?.courier_name || chosen.courierName;

      await Order.updateOne(
        { _id: locked._id },
        {
          $set: {
            awbCode,
            courierName,
            courierCompanyId: chosen.courierCompanyId,
            trackingNumber: awbCode,
            shiprocketLastSync: new Date(),
          },
          $push: {
            statusHistory: {
              status: 'shipped',
              note: `Auto-assigned courier: ${courierName} (AWB: ${awbCode || 'pending'})`,
              updatedAt: new Date(),
            },
          },
        },
      );

      await CourierActivityLog.create({
        orderId: locked._id,
        orderNumber: locked.orderNumber,
        chosenCourierCompanyId: chosen.courierCompanyId,
        chosenCourierName: courierName,
        triggeredBy,
        matchedRuleIds,
        decisionPath,
        outcome: 'assigned',
      });

      return { outcome: 'assigned', chosen, awbCode, decisionPath };
    } catch (err) {
      await CourierActivityLog.create({
        orderId: locked._id,
        orderNumber: locked.orderNumber,
        chosenCourierCompanyId: chosen.courierCompanyId,
        chosenCourierName: chosen.courierName,
        triggeredBy,
        matchedRuleIds,
        decisionPath,
        outcome: 'shiprocket-error',
        errorMessage: err.message,
      });
      return { outcome: 'shiprocket-error', errorMessage: err.message, decisionPath };
    }
  } finally {
    await _releaseLock(order._id);
  }
};

/**
 * Bulk-run auto-assignment over unshipped orders with a shipment but no AWB.
 * Inline semaphore (no dep) caps concurrency at 5.
 */
const runBulkAutoAssign = async ({ dryRun = false, concurrency = 5, limit = 200, tenantId } = {}) => {
  // Snapshot stressed set once
  const { stressed } = await computeStressed();

  const orders = await Order.find({
    ...(tenantId ? { tenant: tenantId } : {}),
    shiprocketShipmentId: { $ne: null },
    $or: [{ awbCode: null }, { awbCode: '' }, { awbCode: { $exists: false } }],
  }).limit(limit);

  const summary = {
    startedAt: new Date().toISOString(),
    dryRun,
    processed: 0,
    assigned: 0,
    failed: 0,
    locked: 0,
    noCandidate: 0,
    details: [],
  };

  // Simple inline semaphore
  let idx = 0;
  const runners = new Array(Math.min(concurrency, orders.length)).fill(0).map(async () => {
    while (idx < orders.length) {
      const myIdx = idx++;
      const order = orders[myIdx];
      try {
        const result = await assignCourierToOrder(order, dryRun ? 'dry-run' : 'bulk-run', {
          dryRun,
          stressedSet: stressed,
          tenantId: tenantId || order.tenant,
        });
        summary.processed += 1;
        if (result.outcome === 'assigned' || result.outcome === 'dry-run') summary.assigned += 1;
        else if (result.outcome === 'locked') summary.locked += 1;
        else if (result.outcome === 'no-candidate') summary.noCandidate += 1;
        else summary.failed += 1;
        summary.details.push({
          orderNumber: order.orderNumber,
          outcome: result.outcome,
          chosen: result.chosen?.courierName || null,
          errorMessage: result.errorMessage || null,
        });
      } catch (err) {
        summary.failed += 1;
        summary.processed += 1;
        summary.details.push({
          orderNumber: order.orderNumber,
          outcome: 'shiprocket-error',
          errorMessage: err.message,
        });
      }
    }
  });
  await Promise.all(runners);

  summary.finishedAt = new Date().toISOString();
  await cache.setLastRun(summary);
  return summary;
};

/**
 * Rebuild CourierMetrics for the given rolling window from the Order collection.
 * Idempotent — re-runs safely (uses upsert with $set, not $inc).
 */
const recomputeMetrics = async ({ days = 7 } = {}) => {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Group by (courierCompanyId, day) and count statuses of interest
  const buckets = await Order.aggregate([
    {
      $match: {
        courierCompanyId: { $ne: null },
        updatedAt: { $gte: since },
      },
    },
    {
      $project: {
        courierCompanyId: 1,
        courierName: 1,
        status: { $toUpper: { $ifNull: ['$shiprocketStatus', ''] } },
        day: {
          $dateFromParts: {
            year: { $year: '$updatedAt' },
            month: { $month: '$updatedAt' },
            day: { $dayOfMonth: '$updatedAt' },
          },
        },
      },
    },
    {
      $group: {
        _id: { courierCompanyId: '$courierCompanyId', day: '$day' },
        courierName: { $first: '$courierName' },
        shipments: { $sum: 1 },
        delivered: {
          $sum: { $cond: [{ $eq: ['$status', 'DELIVERED'] }, 1, 0] },
        },
        rto: {
          $sum: {
            $cond: [
              { $in: ['$status', ['RTO INITIATED', 'RTO DELIVERED', 'RTO IN TRANSIT']] },
              1, 0,
            ],
          },
        },
        ndr: {
          $sum: { $cond: [{ $eq: ['$status', 'NDR'] }, 1, 0] },
        },
        pickupFailed: {
          $sum: { $cond: [{ $eq: ['$status', 'PICKUP ERROR'] }, 1, 0] },
        },
      },
    },
  ]);

  // Upsert each bucket
  await Promise.all(buckets.map(b =>
    CourierMetrics.findOneAndUpdate(
      { courierCompanyId: b._id.courierCompanyId, date: b._id.day },
      {
        $set: {
          courierName: b.courierName,
          shipments: b.shipments,
          delivered: b.delivered,
          rto: b.rto,
          ndr: b.ndr,
          pickupFailed: b.pickupFailed,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ),
  ));

  await cache.setMetricsLastRecomputedAt(new Date().toISOString());
  return { bucketsUpdated: buckets.length };
};

/**
 * Bump a single counter for today's metric bucket. Called from the webhook.
 * Caller is responsible for dedupe.
 */
const bumpCourierMetric = async (courierCompanyId, srStatus, courierName) => {
  if (!courierCompanyId) return;
  const statusUpper = (srStatus || '').toUpperCase();

  // Map status → which counter to bump
  const inc = { shipments: 0 }; // shipments is bumped only on "first event" (handled via dedupe key)
  if (statusUpper === 'DELIVERED') inc.delivered = 1;
  else if (['RTO INITIATED', 'RTO DELIVERED', 'RTO IN TRANSIT'].includes(statusUpper)) inc.rto = 1;
  else if (statusUpper === 'NDR') inc.ndr = 1;
  else if (statusUpper === 'PICKUP ERROR') inc.pickupFailed = 1;
  else return; // status we don't care about

  const day = CourierMetrics.dayBucket();
  await CourierMetrics.findOneAndUpdate(
    { courierCompanyId, date: day },
    {
      $inc: inc,
      $setOnInsert: { courierName: courierName || null },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
};

module.exports = {
  syncFromServiceability,
  syncAllCouriers,
  computeStressed,
  pickCourier,
  assignCourierToOrder,
  runBulkAutoAssign,
  recomputeMetrics,
  bumpCourierMetric,
};
