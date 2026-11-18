const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  wallet: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerWallet', required: true, index: true },
  direction: { type: String, enum: ['credit', 'debit'], required: true },
  bucket: { type: String, enum: ['cash', 'promotional'], required: true },
  amount: { type: Number, required: true, min: 0.01 },
  balanceAfter: { type: Number, required: true, min: 0 },
  cashBalanceAfter: { type: Number, required: true, min: 0 },
  promotionalBalanceAfter: { type: Number, required: true, min: 0 },
  source: {
    type: String,
    enum: ['manual', 'promotional', 'cashback', 'refund', 'loyalty', 'gift_card', 'order_payment', 'order_reversal', 'expiry'],
    required: true,
  },
  referenceType: { type: String, trim: true, maxlength: 80 },
  referenceId: { type: String, trim: true, maxlength: 160 },
  idempotencyKey: { type: String, trim: true, maxlength: 200 },
  note: { type: String, trim: true, maxlength: 500 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  expiresAt: Date,
  // Credit rows retain the unspent portion so promotional credits can expire
  // or be consumed FIFO without relying on a mutable balance-only snapshot.
  remainingAmount: { type: Number, min: 0 },
  consumes: [{ transaction: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletTransaction' }, amount: { type: Number, min: 0 } }],
}, { timestamps: true });

walletTransactionSchema.index({ tenant: 1, user: 1, createdAt: -1 });
walletTransactionSchema.index({ tenant: 1, user: 1, bucket: 1, direction: 1, expiresAt: 1 });
walletTransactionSchema.index(
  { tenant: 1, user: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
