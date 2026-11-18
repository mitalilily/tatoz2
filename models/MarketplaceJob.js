const mongoose = require('mongoose');

const marketplaceJobSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', index: true },
  connection: { type: mongoose.Schema.Types.ObjectId, ref: 'MarketplaceConnection', required: true },
  provider: { type: String, enum: ['amazon', 'flipkart'], required: true },
  type: { type: String, enum: ['test', 'publish-product', 'sync-products', 'sync-inventory', 'sync-orders', 'sync-all', 'refresh-listings'], required: true },
  status: { type: String, enum: ['queued', 'running', 'completed', 'failed'], default: 'queued' },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  stats: { type: mongoose.Schema.Types.Mixed, default: {} },
  logs: [{ level: String, message: String, meta: mongoose.Schema.Types.Mixed, at: { type: Date, default: Date.now } }],
  error: String,
  startedAt: Date,
  finishedAt: Date,
}, { timestamps: true });

marketplaceJobSchema.index({ connection: 1, createdAt: -1 });
marketplaceJobSchema.index({ status: 1, createdAt: -1 });
marketplaceJobSchema.index({ vendor: 1, createdAt: -1 });

module.exports = mongoose.model('MarketplaceJob', marketplaceJobSchema);
