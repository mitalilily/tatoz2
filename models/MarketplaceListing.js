const mongoose = require('mongoose');

const marketplaceListingSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', index: true },
  connection: { type: mongoose.Schema.Types.ObjectId, ref: 'MarketplaceConnection', required: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  channelSku: { type: String, required: true, trim: true },
  remoteId: String,
  remoteProductId: String,
  productType: String,
  status: { type: String, enum: ['pending', 'published', 'failed', 'inactive'], default: 'pending' },
  lastAction: String,
  lastSyncedAt: Date,
  lastError: String,
  lastResponse: mongoose.Schema.Types.Mixed,
  overridePayload: mongoose.Schema.Types.Mixed,
  metadata: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

marketplaceListingSchema.index({ connection: 1, product: 1 }, { unique: true });
marketplaceListingSchema.index({ connection: 1, channelSku: 1 }, { unique: true });
marketplaceListingSchema.index({ status: 1, lastSyncedAt: -1 });
marketplaceListingSchema.index({ vendor: 1, updatedAt: -1 });

module.exports = mongoose.model('MarketplaceListing', marketplaceListingSchema);
