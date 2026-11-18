const mongoose = require('mongoose');

const loyaltyTransactionSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  account: { type: mongoose.Schema.Types.ObjectId, ref: 'LoyaltyAccount', required: true, index: true },
  direction: { type: String, enum: ['earn', 'redeem', 'expire', 'reversal'], required: true },
  points: { type: Number, required: true, min: 1 },
  balanceAfter: { type: Number, required: true, min: 0 },
  source: { type: String, enum: ['purchase', 'referral', 'review', 'manual', 'checkout_redeem', 'order_reversal', 'expiry'], required: true },
  referenceType: { type: String, trim: true, maxlength: 80 },
  referenceId: { type: String, trim: true, maxlength: 160 },
  idempotencyKey: { type: String, trim: true, maxlength: 200 },
  note: { type: String, trim: true, maxlength: 500 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  expiresAt: Date,
  remainingPoints: { type: Number, min: 0 },
  consumes: [{ transaction: { type: mongoose.Schema.Types.ObjectId, ref: 'LoyaltyTransaction' }, points: { type: Number, min: 0 } }],
}, { timestamps: true });

loyaltyTransactionSchema.index({ tenant: 1, user: 1, createdAt: -1 });
loyaltyTransactionSchema.index({ tenant: 1, user: 1, direction: 1, expiresAt: 1 });
loyaltyTransactionSchema.index(
  { tenant: 1, user: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);

module.exports = mongoose.model('LoyaltyTransaction', loyaltyTransactionSchema);
