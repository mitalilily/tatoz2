const mongoose = require('mongoose');

const integrationConnectionSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  provider: { type: String, required: true, lowercase: true, trim: true },
  accountKey: { type: String, default: 'default', trim: true },
  category: { type: String, default: 'other' },
  enabled: { type: Boolean, default: false },
  environment: { type: String, enum: ['sandbox', 'production'], default: 'sandbox' },
  status: { type: String, enum: ['untested', 'connected', 'failed', 'disabled'], default: 'untested' },
  credentialsEncrypted: { type: String, required: true, select: false },
  credentialVersion: { type: Number, default: 2 },
  credentialHints: { type: mongoose.Schema.Types.Mixed, default: {} },
  settings: { type: mongoose.Schema.Types.Mixed, default: {} },
  lastTest: {
    status: { type: String, enum: ['untested', 'connected', 'failed'], default: 'untested' },
    message: { type: String, default: '' },
    testedAt: Date,
    latencyMs: Number,
  },
  lastError: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

integrationConnectionSchema.index({ tenant: 1, provider: 1, accountKey: 1 }, { unique: true });
integrationConnectionSchema.index({ tenant: 1, enabled: 1, status: 1 });

module.exports = mongoose.model('IntegrationConnection', integrationConnectionSchema);
