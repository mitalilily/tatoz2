const mongoose = require('mongoose');

const outboxEventSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  type: { type: String, required: true, index: true },
  aggregateType: { type: String, required: true },
  aggregateId: { type: String, required: true },
  idempotencyKey: { type: String, required: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  status: { type: String, enum: ['pending', 'published', 'processing', 'completed', 'failed', 'dead_letter'], default: 'pending', index: true },
  attempts: { type: Number, default: 0 },
  availableAt: { type: Date, default: Date.now, index: true },
  publishedAt: Date,
  lastError: { type: String, default: '' },
}, { timestamps: true });

outboxEventSchema.index({ tenant: 1, idempotencyKey: 1 }, { unique: true });
outboxEventSchema.index({ status: 1, availableAt: 1 });

module.exports = mongoose.model('OutboxEvent', outboxEventSchema);
