const mongoose = require('mongoose');

const webhookEventSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  provider: { type: String, required: true },
  eventId: { type: String, required: true },
  eventType: String,
  status: { type: String, enum: ['received', 'processing', 'processed', 'ignored', 'failed'], default: 'received', index: true },
  externalOrderId: String,
  paymentId: String,
  payloadHash: String,
  failureReason: String,
  ignoredReason: String,
  receivedAt: { type: Date, default: Date.now },
  processedAt: Date,
}, { timestamps: true });

webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
webhookEventSchema.index({ tenant: 1, provider: 1, receivedAt: -1 });
webhookEventSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('WebhookEvent', webhookEventSchema);
