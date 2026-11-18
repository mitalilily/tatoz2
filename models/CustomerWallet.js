const mongoose = require('mongoose');

const customerWalletSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  currency: { type: String, default: 'INR', uppercase: true, trim: true, maxlength: 3 },
  cashBalance: { type: Number, default: 0, min: 0 },
  promotionalBalance: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['active', 'blocked'], default: 'active', index: true },
  lastTransactionAt: Date,
}, { timestamps: true });

customerWalletSchema.index({ tenant: 1, user: 1 }, { unique: true });
customerWalletSchema.index({ tenant: 1, updatedAt: -1 });

module.exports = mongoose.model('CustomerWallet', customerWalletSchema);
