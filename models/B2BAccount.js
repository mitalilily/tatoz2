const mongoose = require('mongoose');

const b2bAccountSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  customerCode: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
  companyName: { type: String, required: true, trim: true, maxlength: 160 },
  gstin: { type: String, default: '', trim: true, uppercase: true, maxlength: 20 },
  pricingTier: { type: String, enum: ['wholesale', 'dealer', 'distributor', 'custom'], default: 'wholesale', index: true },
  status: { type: String, enum: ['pending', 'active', 'suspended', 'rejected'], default: 'pending', index: true },
  creditLimit: { type: Number, default: 0, min: 0 },
  creditUsed: { type: Number, default: 0, min: 0 },
  paymentTermsDays: { type: Number, default: 0, min: 0, max: 365 },
  notes: { type: String, default: '', maxlength: 1000 },
  approvedAt: Date,
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

b2bAccountSchema.index({ tenant: 1, user: 1 }, { unique: true });
b2bAccountSchema.index({ tenant: 1, customerCode: 1 }, { unique: true });
b2bAccountSchema.index({ tenant: 1, status: 1, pricingTier: 1 });

module.exports = mongoose.model('B2BAccount', b2bAccountSchema);
