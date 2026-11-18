const mongoose = require('mongoose');

const integrationHealthEventSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  provider: { type: String, required: true, index: true },
  connection: { type: mongoose.Schema.Types.ObjectId, ref: 'IntegrationConnection' },
  event: { type: String, enum: ['test', 'success', 'failure', 'rate_limited', 'timeout', 'disabled'], required: true },
  statusCode: Number,
  latencyMs: Number,
  message: { type: String, default: '' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  occurredAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

integrationHealthEventSchema.index({ tenant: 1, provider: 1, occurredAt: -1 });

module.exports = mongoose.model('IntegrationHealthEvent', integrationHealthEventSchema);
