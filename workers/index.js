const { Worker } = require('bullmq');
const { getConnection, closeConnection } = require('../services/queue/connection');
const { queueNames } = require('../services/queue/queues');
const OutboxEvent = require('../models/OutboxEvent');
const notificationDeliveryService = require('../services/notificationDeliveryService');
const invoiceDeliveryService = require('../services/invoiceDeliveryService');
const MarketplaceJob = require('../models/MarketplaceJob');
const { performJob: performMarketplaceJob } = require('../services/marketplace');

const processJob = async job => {
  const { outboxId, type, tenant, payload = {} } = job.data || {};

  // Marketplace jobs are persisted in MongoDB and use BullMQ only as the
  // execution transport, so they do not have an OutboxEvent to complete.
  if (type === 'marketplace.job') {
    const marketplaceJob = await MarketplaceJob.findById(payload.marketplaceJobId);
    if (!marketplaceJob) return { processed: false, missing: true };
    await performMarketplaceJob(marketplaceJob);
    return { processed: true, marketplaceJobId: String(marketplaceJob._id) };
  }

  try {
    let handled = false;
    if (type && type.startsWith('notification.')) {
      await notificationDeliveryService.process({ ...payload, tenant });
      handled = true;
    }
    if (type === 'invoice.document.email' || type === 'invoice.document.whatsapp') {
      await invoiceDeliveryService.processInvoiceDelivery({ ...payload, tenant });
      handled = true;
    }
    if (type === 'shipping.order-created') {
      if (payload.action === 'auto-create-order') await require('../controllers/paymentController').createShiprocketOrderInBackground(payload.orderId);
      handled = true;
    }
    if (type === 'search.product-upsert') {
      const product = await require('../models/Product').findById(payload.productId).lean();
      if (product) await require('../services/search/searchManager').indexProduct({ tenant, product });
      handled = true;
    }
    if (type === 'search.product-delete') {
      const selected = await require('../services/search/searchManager').resolve(tenant);
      if (selected) await selected.adapter.delete(payload.productId, selected.config);
      handled = true;
    }
    if (!handled) throw new Error(`No worker handler registered for job type: ${type || 'unknown'}`);
    await OutboxEvent.updateOne({ _id: outboxId }, { $set: { status: 'completed', publishedAt: new Date() } });
    return { processed: true };
  } catch (error) {
    await OutboxEvent.updateOne({ _id: outboxId }, { $set: { status: 'failed', lastError: String(error.message || 'Job failed').slice(0, 500), availableAt: new Date(Date.now() + 60000) }, $inc: { attempts: 1 } });
    throw error;
  }
};

const startWorkers = () => {
  const connection = getConnection();
  if (!connection) {
    console.warn('[worker] REDIS_URL is not configured; worker is disabled');
    return { workers: [], stop: async () => {} };
  }
  const workers = queueNames.map(name => {
    const worker = new Worker(name, processJob, { connection, concurrency: Number(process.env[`WORKER_CONCURRENCY_${name.toUpperCase().replace(/-/g, '_')}`]) || 10, limiter: { max: 100, duration: 1000 } });
    worker.on('failed', (job, error) => console.error(`[worker:${name}] job ${job?.id} failed: ${error.message}`));
    return worker;
  });
  return {
    workers,
    stop: async () => { await Promise.all(workers.map(worker => worker.close())); await closeConnection(); },
  };
};

module.exports = { startWorkers, processJob };
