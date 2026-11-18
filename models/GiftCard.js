const mongoose = require('mongoose');

const giftCardSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  recipientUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  codeHash: { type: String, required: true, select: false },
  codeLast4: { type: String, required: true, trim: true, uppercase: true },
  initialAmount: { type: Number, required: true, min: 0.01 },
  balance: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'INR', trim: true, maxlength: 8 },
  status: { type: String, enum: ['active', 'disabled', 'depleted', 'expired'], default: 'active', index: true },
  expiresAt: Date,
  recipientName: { type: String, trim: true, maxlength: 120 },
  recipientEmail: { type: String, trim: true, lowercase: true, maxlength: 160 },
  recipientPhone: { type: String, trim: true, maxlength: 30 },
  senderName: { type: String, trim: true, maxlength: 120 },
  message: { type: String, trim: true, maxlength: 500 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lastUsedAt: Date,
}, { timestamps: true });

giftCardSchema.index({ tenant: 1, codeHash: 1 }, { unique: true });
giftCardSchema.index({ tenant: 1, status: 1, expiresAt: 1 });

module.exports = mongoose.model('GiftCard', giftCardSchema);
