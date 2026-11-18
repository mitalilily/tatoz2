const mongoose = require('mongoose');

const affiliateLedgerSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  affiliate: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: {
    type: String,
    enum: ['commission_earned', 'commission_reversal', 'payout_hold', 'payout_release', 'adjustment_credit', 'adjustment_debit'],
    required: true,
  },
  direction: { type: String, enum: ['credit', 'debit'], required: true },
  amount: { type: Number, required: true, min: 0 },
  balanceAfter: { type: Number, required: true },
  reference: {
    tracking: { type: mongoose.Schema.Types.ObjectId, ref: 'ReferralTracking' },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    payout: { type: mongoose.Schema.Types.ObjectId, ref: 'AffiliatePayout' },
  },
  idempotencyKey: { type: String, required: true },
  note: { type: String, default: '', maxlength: 2000 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: { createdAt: true, updatedAt: false } });

affiliateLedgerSchema.index({ tenant: 1, affiliate: 1, createdAt: -1 });
affiliateLedgerSchema.index({ tenant: 1, idempotencyKey: 1 }, { unique: true });

module.exports = mongoose.model('AffiliateLedger', affiliateLedgerSchema);
