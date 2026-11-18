const mongoose = require('mongoose');

const shippingRateSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  zone: { type: mongoose.Schema.Types.ObjectId, ref: 'ShippingZone', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  code: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
  serviceLevel: { type: String, enum: ['standard', 'express', 'same_day', 'local'], default: 'standard' },
  chargeType: { type: String, enum: ['flat', 'weight', 'price', 'free'], default: 'flat' },
  enabled: { type: Boolean, default: true, index: true },
  priority: { type: Number, default: 0, min: 0, max: 10000 },
  baseAmount: { type: Number, default: 0, min: 0, max: 100000000 },
  includedWeight: { type: Number, default: 0, min: 0, max: 100000 },
  amountPerKg: { type: Number, default: 0, min: 0, max: 100000 },
  includedSubtotal: { type: Number, default: 0, min: 0, max: 100000000 },
  amountPerCurrency: { type: Number, default: 0, min: 0, max: 100000 },
  freeOverSubtotal: { type: Number, default: null, min: 0, max: 100000000 },
  minSubtotal: { type: Number, default: null, min: 0, max: 100000000 },
  maxSubtotal: { type: Number, default: null, min: 0, max: 100000000 },
  minWeight: { type: Number, default: null, min: 0, max: 100000 },
  maxWeight: { type: Number, default: null, min: 0, max: 100000 },
  codEnabled: { type: Boolean, default: true },
  prepaidEnabled: { type: Boolean, default: true },
  estimatedMinDays: { type: Number, default: 3, min: 0, max: 365 },
  estimatedMaxDays: { type: Number, default: 7, min: 0, max: 365 },
  currency: { type: String, default: 'INR', trim: true, uppercase: true, maxlength: 8 },
}, { timestamps: true });

shippingRateSchema.index({ tenant: 1, code: 1 }, { unique: true });
shippingRateSchema.index({ tenant: 1, zone: 1, enabled: 1, priority: -1 });

module.exports = mongoose.model('ShippingRate', shippingRateSchema);
