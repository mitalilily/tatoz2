const { tick } = require('./campaignService');

let intervalRef = null;
let running = false;

const start = ({ intervalMs = Number(process.env.CAMPAIGN_SCHEDULER_INTERVAL_MS) || 60000 } = {}) => {
  if (intervalRef) return;
  intervalRef = setInterval(async () => {
    if (running) return;
    running = true;
    try { await tick(); } catch (error) { console.error('[campaignScheduler]', error.message); } finally { running = false; }
  }, intervalMs);
  intervalRef.unref?.();
  console.log(`[campaignScheduler] started (every ${intervalMs}ms)`);
};

const stop = () => { if (intervalRef) clearInterval(intervalRef); intervalRef = null; };

module.exports = { start, stop };
