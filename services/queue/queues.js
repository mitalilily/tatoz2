const { Queue } = require('bullmq');
const { getConnection } = require('./connection');
const queueNames = ['notifications', 'payments', 'shipping', 'marketplace-sync', 'ai-generation', 'media-processing', 'abandoned-cart', 'analytics-events', 'accounting-sync', 'search-index'];
const queues = new Map();

const getQueue = name => {
  const connection = getConnection();
  if (!connection) return null;
  if (!queueNames.includes(name)) throw new Error(`Unknown queue: ${name}`);
  if (!queues.has(name)) queues.set(name, new Queue(name, { connection, defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: { age: 86400, count: 10000 }, removeOnFail: { age: 604800, count: 50000 } } }));
  return queues.get(name);
};

const closeQueues = async () => {
  await Promise.all([...queues.values()].map(queue => queue.close().catch(() => {})));
  queues.clear();
};

module.exports = { queueNames, getQueue, closeQueues };
