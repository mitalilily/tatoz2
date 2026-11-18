const mongoose = require('mongoose');

const blockedPhoneSchema = new mongoose.Schema({
  hash: { type: String, required: true },
  last4: { type: String, required: true, maxlength: 4 },
  label: { type: String, trim: true, maxlength: 120, default: '' },
}, { _id: false });

const codPolicySchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true, index: true },
  enabled: { type: Boolean, default: true },
  minOrderValue: { type: Number, default: 0, min: 0 },
  maxOrderValue: { type: Number, default: null, min: 0 },
  allowedPincodes: [{ type: String, match: /^\d{6}$/ }],
  blockedPincodes: [{ type: String, match: /^\d{6}$/ }],
  blockedPhones: { type: [blockedPhoneSchema], default: [] },
  blockedCustomers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  riskScoringEnabled: { type: Boolean, default: true },
  riskThreshold: { type: Number, default: 70, min: 0, max: 100 },
  otpRequired: { type: Boolean, default: true },
  partialAdvanceEnabled: { type: Boolean, default: false },
  partialAdvancePercent: { type: Number, default: 0, min: 0, max: 100 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

module.exports = mongoose.model('CodPolicy', codPolicySchema);
