const mongoose = require('mongoose');

const affiliateProgramSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
  enabled: { type: Boolean, default: true },
  defaultCommissionRate: { type: Number, default: 0, min: 0, max: 100 },
  minimumPayout: { type: Number, default: 500, min: 0 },
  payoutCurrency: { type: String, default: 'INR', trim: true, uppercase: true, maxlength: 3 },
  requireApproval: { type: Boolean, default: true },
  payoutMethods: { type: [String], default: ['bank_transfer', 'upi'] },
  terms: { type: String, default: '', maxlength: 5000 },
}, { timestamps: true });

affiliateProgramSchema.index({ tenant: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('AffiliateProgram', affiliateProgramSchema);
