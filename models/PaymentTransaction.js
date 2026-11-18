const mongoose = require('mongoose');

// Append-only provider-neutral payment event ledger. PaymentAttempt remains
// the mutable current-state record; this model preserves every financial
// state change needed for audit/reconciliation without storing raw provider
// payloads or credentials.
const paymentTransactionSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  paymentAttempt: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentAttempt', index: true },
  provider: { type: String, required: true, lowercase: true, trim: true, index: true },
  eventType: {
    type: String,
    required: true,
    enum: [
      'attempt_created',
      'provider_order_created',
      'provider_authorized',
      'provider_captured',
      'provider_failed',
      'provider_cancelled',
      'refund_requested',
      'refunded',
      'refund_failed',
      'chargeback',
      'chargeback_reversed',
      'manual_adjustment',
    ],
    index: true,
  },
  status: { type: String, enum: ['pending', 'succeeded', 'failed', 'reversed'], default: 'succeeded', index: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, required: true, uppercase: true, trim: true, default: 'INR' },
  externalOrderId: { type: String, default: '' },
  externalPaymentId: { type: String, default: '' },
  providerEventId: { type: String, default: '' },
  idempotencyKey: { type: String, required: true, trim: true },
  source: { type: String, enum: ['checkout', 'verification', 'webhook', 'admin', 'system'], required: true },
  reason: { type: String, default: '', maxlength: 500 },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  occurredAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

paymentTransactionSchema.index({ tenant: 1, provider: 1, idempotencyKey: 1 }, { unique: true });
paymentTransactionSchema.index({ tenant: 1, provider: 1, occurredAt: -1 });
paymentTransactionSchema.index({ tenant: 1, order: 1, occurredAt: -1 });
paymentTransactionSchema.index({ tenant: 1, providerEventId: 1 }, { sparse: true });

module.exports = mongoose.model('PaymentTransaction', paymentTransactionSchema);
