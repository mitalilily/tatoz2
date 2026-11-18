const mongoose = require('mongoose');

const cartMutationReceiptSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
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

cartMutationReceiptSchema.index({ tenant: 1, user: 1, key: 1 }, { unique: true });
cartMutationReceiptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('CartMutationReceipt', cartMutationReceiptSchema);
