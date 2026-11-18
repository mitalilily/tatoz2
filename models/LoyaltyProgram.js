const mongoose = require('mongoose');

const DEFAULT_TIERS = [
  { id: 'bronze', label: 'Bronze', minLifetimePoints: 0, earnMultiplier: 1 },
  { id: 'silver', label: 'Silver', minLifetimePoints: 1000, earnMultiplier: 1.1 },
  { id: 'gold', label: 'Gold', minLifetimePoints: 5000, earnMultiplier: 1.25 },
  { id: 'platinum', label: 'Platinum', minLifetimePoints: 15000, earnMultiplier: 1.5 },
];

const tierSchema = new mongoose.Schema({
  id: { type: String, enum: ['bronze', 'silver', 'gold', 'platinum'], required: true },
  label: { type: String, required: true, trim: true, maxlength: 40 },
  minLifetimePoints: { type: Number, required: true, min: 0, max: 100000000 },
  earnMultiplier: { type: Number, required: true, min: 0.1, max: 10 },
}, { _id: false });

const loyaltyProgramSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true, index: true },
  enabled: { type: Boolean, default: false, index: true },
  earnPointsPerCurrency: { type: Number, default: 1, min: 0, max: 1000 },
  redeemPointsPerCurrency: { type: Number, default: 100, min: 1, max: 100000 },
  minimumRedeemPoints: { type: Number, default: 100, min: 0, max: 100000000 },
  maxRedeemPercent: { type: Number, default: 50, min: 0, max: 100 },
  expiryDays: { type: Number, default: 365, min: 0, max: 3650 },
  tiers: { type: [tierSchema], default: () => DEFAULT_TIERS },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

loyaltyProgramSchema.index({ tenant: 1, updatedAt: -1 });

module.exports = mongoose.model('LoyaltyProgram', loyaltyProgramSchema);
