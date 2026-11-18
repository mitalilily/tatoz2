/*
 * Additive, idempotent production migration for immutable invoice revisions.
 * Run only after a backup and maintenance-window verification:
 *   MONGO_URI=... node scripts/migrateInvoiceRevisions.js
 */
const mongoose = require('mongoose');

const run = async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
  await mongoose.connect(process.env.MONGO_URI);
  const collection = mongoose.connection.db.collection('invoices');
  const indexes = await collection.listIndexes().toArray();
  const legacy = indexes.find(index => index.name === 'tenant_1_order_1_documentType_1');
  if (legacy) await collection.dropIndex(legacy.name);

  await collection.updateMany(
    { revision: { $exists: false } },
    { $set: { revision: 1 } },
  );
  await collection.createIndex(
    { tenant: 1, order: 1, documentType: 1, revision: 1 },
    { unique: true, name: 'tenant_1_order_1_documentType_1_revision_1' },
  );
  console.log(JSON.stringify({ success: true, migrated: true, droppedLegacyIndex: Boolean(legacy) }));
};

run()
  .catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(async () => { await mongoose.disconnect().catch(() => {}); });
