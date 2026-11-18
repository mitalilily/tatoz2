const mongoose = require('mongoose');

const guestCartMutationReceiptSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  tokenHash: { type: String, required: true, select: false },
  key: { type: String, required: true },
  requestHash: { type: String, required: true },
  operation: { type: String, required: true, maxlength: 40 },
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  response: { type: mongoose.Schema.Types.Mixed, default: null },
  error: {
    statusCode: Number,
    code: String,
    message: String,
  },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

guestCartMutationReceiptSchema.index({ tenant: 1, tokenHash: 1, key: 1 }, { unique: true });
guestCartMutationReceiptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('GuestCartMutationReceipt', guestCartMutationReceiptSchema);
