const mongoose = require('mongoose');

const integrationAuditLogSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  provider: { type: String, required: true, index: true },
  action: { type: String, enum: ['created', 'updated', 'tested', 'disabled', 'cleared', 'rotated'], required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  changedFields: { type: [String], default: [] },
  credentialVersion: Number,
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

integrationAuditLogSchema.index({ tenant: 1, provider: 1, createdAt: -1 });

module.exports = mongoose.model('IntegrationAuditLog', integrationAuditLogSchema);
