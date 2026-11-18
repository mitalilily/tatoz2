const MarketplaceConnection = require('../models/MarketplaceConnection');
const { startJob, dispatchJob } = require('./marketplace');
const { withLock } = require('./distributedLock');

let timer = null;
let ticking = false;

const tick = async () => {
  if (ticking) return;
  ticking = true;
  try {
    await withLock('scheduler:marketplace-sync', 14 * 60 * 1000, async () => {
      const connections = await MarketplaceConnection.find({ enabled: true, status: 'connected' }).select('_id provider settings');
      for (const connection of connections) {
        if (connection.settings?.autoSync === false) continue;
        const existing = await require('../models/MarketplaceJob').findOne({ connection: connection._id, status: { $in: ['queued', 'running'] } }).select('_id');
        if (!existing) await startJob({ connectionId: connection._id, type: 'sync-all' });
      }
      // Recover work that was persisted before a process restart. performJob
      // claims each record atomically, so only one replica executes it.
      const MarketplaceJob = require('../models/MarketplaceJob');
      await MarketplaceJob.updateMany(
        { status: 'running', startedAt: { $lt: new Date(Date.now() - 60 * 60 * 1000) } },
        { $set: { status: 'queued', error: 'Recovered after worker timeout' } },
      );
      const queued = await MarketplaceJob.find({ status: 'queued' }).sort({ createdAt: 1 }).limit(10);
      for (const job of queued) void dispatchJob(job).catch(error => console.error('[marketplace] queued job failed', error.message));
    });
  } catch (error) {
    console.error('[marketplace] scheduler error:', error.message);
  } finally {
    ticking = false;
  }
};

const startMarketplaceScheduler = ({ intervalMs = Number(process.env.MARKETPLACE_SYNC_INTERVAL_MS) || 15 * 60 * 1000 } = {}) => {
  if (timer) return timer;
  timer = setInterval(tick, intervalMs);
  timer.unref?.();
  setTimeout(tick, 45000).unref?.();
  console.log(`🛒 Marketplace sync scheduler enabled (${Math.round(intervalMs / 60000)} min interval)`);
  return timer;
};

const stopMarketplaceScheduler = () => {
  if (timer) clearInterval(timer);
  timer = null;
  ticking = false;
};

module.exports = { startMarketplaceScheduler, stopMarketplaceScheduler, tick };
