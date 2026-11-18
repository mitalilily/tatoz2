const mongoose = require('mongoose');

const giftCardTransactionSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  giftCard: { type: mongoose.Schema.Types.ObjectId, ref: 'GiftCard', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', index: true },
  direction: { type: String, enum: ['issue', 'redeem', 'reversal', 'adjustment', 'expire'], required: true },
  amount: { type: Number, required: true, min: 0.01 },
  balanceBefore: { type: Number, required: true, min: 0 },
  balanceAfter: { type: Number, required: true, min: 0 },
  source: { type: String, enum: ['issue', 'checkout_redeem', 'order_reversal', 'refund', 'manual', 'expiry'], required: true },
  referenceType: { type: String, trim: true, maxlength: 80 },
  referenceId: { type: String, trim: true, maxlength: 160 },
  idempotencyKey: { type: String, trim: true, maxlength: 200 },
  note: { type: String, trim: true, maxlength: 500 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

giftCardTransactionSchema.index({ tenant: 1, giftCard: 1, createdAt: -1 });
giftCardTransactionSchema.index({ tenant: 1, user: 1, createdAt: -1 });
giftCardTransactionSchema.index({ tenant: 1, order: 1, direction: 1 });
giftCardTransactionSchema.index(
  { tenant: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);

module.exports = mongoose.model('GiftCardTransaction', giftCardTransactionSchema);
