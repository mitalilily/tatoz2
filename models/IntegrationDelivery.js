const mongoose = require('mongoose');

const integrationDeliverySchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  provider: { type: String, required: true, index: true },
  connection: { type: mongoose.Schema.Types.ObjectId, ref: 'IntegrationConnection' },
  kind: { type: String, enum: ['notification', 'marketing', 'webhook', 'sync', 'accounting', 'search'], required: true },
  eventType: { type: String, required: true },
  idempotencyKey: { type: String, required: true },
  status: { type: String, enum: ['queued', 'processing', 'sent', 'delivered', 'failed', 'dead_letter'], default: 'queued', index: true },
  attempts: { type: Number, default: 0 },
  externalId: { type: String, default: '' },
  response: { type: mongoose.Schema.Types.Mixed, default: {} },
  error: { type: String, default: '' },
  nextAttemptAt: Date,
  sentAt: Date,
  deliveredAt: Date,
  payloadHash: String,
}, { timestamps: true });

integrationDeliverySchema.index({ tenant: 1, provider: 1, idempotencyKey: 1 }, { unique: true });
integrationDeliverySchema.index({ tenant: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('IntegrationDelivery', integrationDeliverySchema);
