const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Invoice = require('../models/Invoice');

const run = async () => {
  await connectDB();
  const indexes = await Invoice.collection.listIndexes().toArray();
  const legacy = indexes.find(index => index.unique
    && index.key?.tenant === 1
    && index.key?.order === 1
    && index.key?.documentType === 1
    && index.key?.revision === 1
    && !index.key?.vendor);
  if (legacy) await Invoice.collection.dropIndex(legacy.name);
  const current = await Invoice.collection.listIndexes().toArray();
  const hasNew = current.some(index => index.unique
    && JSON.stringify(index.key) === JSON.stringify({ tenant: 1, order: 1, vendor: 1, documentType: 1, revision: 1 }));
  if (!hasNew) await Invoice.collection.createIndex(
    { tenant: 1, order: 1, vendor: 1, documentType: 1, revision: 1 },
    { unique: true, name: 'tenant_order_vendor_document_revision_unique' },
  );
  console.log('Invoice index migration complete');
  await mongoose.disconnect();
};

run().catch(async error => {
  console.error('Invoice index migration failed:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
