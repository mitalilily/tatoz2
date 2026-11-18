const { releaseExpiredReservations } = require('./inventoryReservationService');

let intervalRef = null;
let running = false;

const tick = async () => {
  if (running) return { skipped: true };
  running = true;
  try {
    return await releaseExpiredReservations({ limit: 100 });
  } finally {
    running = false;
  }
};

const start = ({ intervalMs = Number(process.env.INVENTORY_RESERVATION_SWEEP_INTERVAL_MS) || 60000 } = {}) => {
  if (intervalRef) return;
  intervalRef = setInterval(() => tick().catch(error => console.error('[inventoryReservationScheduler]', error.message)), intervalMs);
  intervalRef.unref?.();
  console.log(`[inventoryReservationScheduler] started (every ${intervalMs}ms)`);
};

const stop = () => {
  if (!intervalRef) return;
  clearInterval(intervalRef);
  intervalRef = null;
};

module.exports = { start, stop, tick };
