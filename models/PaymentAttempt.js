const mongoose = require('mongoose');

const paymentAttemptSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  provider: { type: String, required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, required: true, uppercase: true, default: 'INR' },
  idempotencyKey: { type: String, required: true },
  externalOrderId: { type: String, default: '' },
  externalPaymentId: { type: String, default: '' },
  lastWebhookEventId: { type: String, default: '' },
  lastWebhookAt: Date,
  providerStatus: { type: String, default: '' },
  status: { type: String, enum: ['creating', 'created', 'pending', 'authorized', 'captured', 'failed', 'refunded', 'cancelled'], default: 'created', index: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  failureCode: String,
  failureMessage: String,
  capturedAt: Date,
}, { timestamps: true });

paymentAttemptSchema.index({ order: 1, provider: 1 }, { unique: true });
paymentAttemptSchema.index({ provider: 1, externalOrderId: 1 });

module.exports = mongoose.model('PaymentAttempt', paymentAttemptSchema);
