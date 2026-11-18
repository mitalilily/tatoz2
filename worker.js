require('dotenv').config();
const connectDB = require('./config/db');
const { startWorkers } = require('./workers');
const { republishPending } = require('./services/outboxService');
const { hydrateIntegrationKey } = require('./services/secrets/secretProvider');

let runtime;
const start = async () => {
  await hydrateIntegrationKey();
  await connectDB();
  runtime = startWorkers();
  await republishPending();
  console.log('[worker] Tatoz integration workers started');
};

const stop = async signal => {
  console.log(`[worker] stopping on ${signal}`);
  await runtime?.stop?.();
  const mongoose = require('mongoose');
  await mongoose.disconnect().catch(() => {});
  process.exit(0);
};

if (require.main === module) {
  start().catch(error => { console.error('[worker] startup failed', error); process.exit(1); });
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
}

module.exports = { start, stop };
