const mongoose = require('mongoose');

const payoutSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  amount: { type: Number, required: true, min: 0 },
  commissionDeducted: { type: Number, default: 0, min: 0 },
  netAmount: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'], default: 'pending' },
  bankSnapshot: {
    accountHolderName: String,
    accountNumber: { type: String, select: false },
    ifscCode: { type: String, select: false },
    bankName: String,
  },
  transactionRef: String,
  utrNumber: String,
  periodStart: Date,
  periodEnd: Date,
  requestedAt: { type: Date, default: Date.now },
  // Client-supplied idempotency key: repeat POSTs with the same key return
  // the original payout instead of locking the wallet twice.
  idempotencyKey: { type: String, default: '', index: true },
  processedAt: Date,
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes: String,
  failureReason: String,
}, { timestamps: true });

payoutSchema.index({ vendor: 1, status: 1 });
payoutSchema.index({ tenant: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Payout', payoutSchema);
