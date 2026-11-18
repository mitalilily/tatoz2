const mongoose = require('mongoose');

const loyaltyAccountSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  pointsBalance: { type: Number, default: 0, min: 0 },
  lifetimeEarned: { type: Number, default: 0, min: 0 },
  lifetimeRedeemed: { type: Number, default: 0, min: 0 },
  tier: { type: String, enum: ['bronze', 'silver', 'gold', 'platinum'], default: 'bronze', index: true },
  status: { type: String, enum: ['active', 'blocked'], default: 'active', index: true },
  lastTransactionAt: Date,
}, { timestamps: true });

loyaltyAccountSchema.index({ tenant: 1, user: 1 }, { unique: true });
loyaltyAccountSchema.index({ tenant: 1, pointsBalance: -1, updatedAt: -1 });

module.exports = mongoose.model('LoyaltyAccount', loyaltyAccountSchema);
