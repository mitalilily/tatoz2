const StorefrontLocaleConfig = require('../models/StorefrontLocaleConfig');
const storefrontLocaleService = require('./storefrontLocaleService');
const { withLock } = require('./distributedLock');

let intervalRef = null;
let initialRef = null;

async function tick() {
  return withLock('scheduler:currency-rates', 30 * 60 * 1000, async () => {
    const configs = await StorefrontLocaleConfig.find({}).select('tenant').lean();
    const summary = { attempted: configs.length, refreshed: 0, failed: 0 };
    for (const config of configs) {
      try {
        await storefrontLocaleService.refreshRates({ tenantId: config.tenant, now: new Date() });
        summary.refreshed += 1;
      } catch (error) {
        summary.failed += 1;
        console.error(`[currencyRateScheduler] Tenant ${config.tenant} failed:`, error.message);
      }
    }
    return summary;
  });
}

function start({ intervalMs = Number(process.env.CURRENCY_RATE_REFRESH_INTERVAL_MS) || 24 * 60 * 60 * 1000 } = {}) {
  if (intervalRef) return;
  initialRef = setTimeout(() => { tick().catch(error => console.error('[currencyRateScheduler]', error.message)); }, 1000);
  initialRef.unref?.();
  intervalRef = setInterval(() => { tick().catch(error => console.error('[currencyRateScheduler]', error.message)); }, intervalMs);
  intervalRef.unref?.();
  console.log(`[currencyRateScheduler] started (every ${intervalMs}ms)`);
}

function stop() {
  if (initialRef) clearTimeout(initialRef);
  if (intervalRef) clearInterval(intervalRef);
  initialRef = null;
  intervalRef = null;
}

module.exports = { start, stop, tick };
