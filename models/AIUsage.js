const mongoose = require('mongoose');

const aiUsageSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  feature: { type: String, required: true, index: true },
  action: { type: String, required: true, index: true },
  endpoint: { type: String, default: '' },
  provider: { type: String, default: 'meta' },
  model: { type: String, default: '' },
  status: { type: String, enum: ['success', 'failed', 'rejected'], default: 'success', index: true },
  credits: { type: Number, default: 0, min: 0 },
  creditsRefunded: { type: Number, default: 0, min: 0 },
  netCredits: { type: Number, default: 0, min: 0 },
  durationMs: { type: Number, default: 0, min: 0 },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  userSnapshot: {
    name: { type: String, default: '' },
    email: { type: String, default: '' },
    role: { type: String, default: '' },
  },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null, index: true },
  vendorSnapshot: {
    name: { type: String, default: '' },
    slug: { type: String, default: '' },
  },
  requestId: { type: String, default: '', index: true },
  error: { type: String, default: '' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  tokenUsage: {
    prompt: { type: Number, default: 0 },
    completion: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
}, { timestamps: true });

aiUsageSchema.index({ createdAt: -1 });
aiUsageSchema.index({ feature: 1, createdAt: -1 });
aiUsageSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('AIUsage', aiUsageSchema);
