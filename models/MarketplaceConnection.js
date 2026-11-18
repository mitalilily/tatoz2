const mongoose = require('mongoose');

const marketplaceConnectionSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', index: true },
  provider: { type: String, enum: ['amazon', 'flipkart'], required: true },
  name: { type: String, required: true, trim: true },
  environment: { type: String, enum: ['production', 'sandbox'], default: 'production' },
  enabled: { type: Boolean, default: true },
  status: { type: String, enum: ['disconnected', 'connected', 'error', 'paused'], default: 'disconnected' },
  region: { type: String, default: 'eu-west-1' },
  marketplaceId: String,
  sellerId: String,
  credentialsEncrypted: { type: String, select: false },
  credentialHints: { type: mongoose.Schema.Types.Mixed, default: {} },
  settings: { type: mongoose.Schema.Types.Mixed, default: {} },
  lastTestAt: Date,
  lastSyncAt: Date,
  lastError: String,
  connectedAt: Date,
  oauthState: { type: String, select: false },
  oauthStateExpiresAt: { type: Date, select: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

marketplaceConnectionSchema.index({ provider: 1, enabled: 1 });
marketplaceConnectionSchema.index({ status: 1 });
marketplaceConnectionSchema.index({ tenant: 1, provider: 1, name: 1 });
marketplaceConnectionSchema.index({ vendor: 1, provider: 1, enabled: 1 });

module.exports = mongoose.model('MarketplaceConnection', marketplaceConnectionSchema);
