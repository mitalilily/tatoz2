const mongoose = require('mongoose');
const crypto = require('crypto');

const affiliatePayoutSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  affiliate: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['pending', 'processing', 'paid', 'rejected', 'cancelled'], default: 'pending', index: true },
  payoutMethod: { type: String, default: 'bank_transfer' },
  payoutSnapshot: {
    accountHolderName: String,
    accountNumber: String,
    ifscCode: String,
    upiId: String,
  },
  transactionRef: String,
  requestedAt: { type: Date, default: Date.now },
  processedAt: Date,
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  note: { type: String, default: '', maxlength: 2000 },
  idempotencyKey: { type: String, default: () => crypto.randomUUID() },
}, { timestamps: true });

affiliatePayoutSchema.index({ tenant: 1, affiliate: 1, status: 1, createdAt: -1 });
affiliatePayoutSchema.index({ tenant: 1, idempotencyKey: 1 }, { unique: true });

module.exports = mongoose.model('AffiliatePayout', affiliatePayoutSchema);
