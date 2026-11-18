const mongoose = require('mongoose');

const apiKeySchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  prefix: { type: String, required: true, trim: true, index: true },
  secretHash: { type: String, required: true, select: false },
  scopes: [{ type: String, enum: ['catalog.read', 'orders.read', 'orders.write', 'webhooks.manage'] }],
  lastUsedAt: Date,
  expiresAt: Date,
  revokedAt: Date,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

apiKeySchema.index({ tenant: 1, prefix: 1 }, { unique: true });

module.exports = mongoose.model('ApiKey', apiKeySchema);
