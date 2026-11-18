const Settings = require('../../models/Settings');

// In-process 60s cache for courier.* Settings keys.
// Cleared on any update via invalidate().

const TTL_MS = 60 * 1000;
const _cache = new Map(); // key -> { value, expiresAt }

const _getCached = async (key, defaultValue) => {
  const now = Date.now();
  const entry = _cache.get(key);
  if (entry && entry.expiresAt > now) return entry.value;
  const value = await Settings.get(key, defaultValue);
  _cache.set(key, { value, expiresAt: now + TTL_MS });
  return value;
};

const invalidate = (key) => {
  if (key) _cache.delete(key);
  else _cache.clear();
};

const DEFAULT_AUTO_ASSIGN = { enabled: false, onOrderCreate: false };
const DEFAULT_STRESSED_THRESHOLDS = {
  ndrPct: 15,
  rtoPct: 12,
  pickupFailPct: 8,
  minShipments: 10,
  rollingDays: 7,
};

const getAutoAssignConfig = async () => {
  const cfg = await _getCached('courier.autoAssign.config', DEFAULT_AUTO_ASSIGN);
  return { ...DEFAULT_AUTO_ASSIGN, ...(cfg || {}) };
};

const setAutoAssignConfig = async (cfg) => {
  const merged = { ...DEFAULT_AUTO_ASSIGN, ...(cfg || {}) };
  await Settings.set('courier.autoAssign.config', merged, 'courier');
  invalidate('courier.autoAssign.config');
  return merged;
};

const getStressedThresholds = async () => {
  const t = await _getCached('courier.stressed.thresholds', DEFAULT_STRESSED_THRESHOLDS);
  return { ...DEFAULT_STRESSED_THRESHOLDS, ...(t || {}) };
};

const setStressedThresholds = async (t) => {
  const merged = { ...DEFAULT_STRESSED_THRESHOLDS, ...(t || {}) };
  await Settings.set('courier.stressed.thresholds', merged, 'courier');
  invalidate('courier.stressed.thresholds');
  return merged;
};

const getDefaultPickupPincode = async () => {
  return _getCached('courier.defaults.pickupPincode', '110001');
};

const getDefaultDeliveryPincode = async () => {
  return _getCached('courier.defaults.deliveryPincode', '560001');
};

const getLastRun = async () => _getCached('courier.autoAssign.lastRun', null);

const setLastRun = async (summary) => {
  await Settings.set('courier.autoAssign.lastRun', summary, 'courier');
  invalidate('courier.autoAssign.lastRun');
  return summary;
};

const getMetricsLastRecomputedAt = async () => _getCached('courier.metrics.lastRecomputedAt', null);

const setMetricsLastRecomputedAt = async (iso) => {
  await Settings.set('courier.metrics.lastRecomputedAt', iso, 'courier');
  invalidate('courier.metrics.lastRecomputedAt');
  return iso;
};

module.exports = {
  invalidate,
  getAutoAssignConfig,
  setAutoAssignConfig,
  getStressedThresholds,
  setStressedThresholds,
  getDefaultPickupPincode,
  getDefaultDeliveryPincode,
  getLastRun,
  setLastRun,
  getMetricsLastRecomputedAt,
  setMetricsLastRecomputedAt,
  DEFAULT_AUTO_ASSIGN,
  DEFAULT_STRESSED_THRESHOLDS,
};
