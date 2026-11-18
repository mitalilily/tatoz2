const mongoose = require('mongoose');

const affiliateProfileSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'suspended'], default: 'pending', index: true },
  commissionRate: { type: Number, min: 0, max: 100 },
  applicationNote: { type: String, default: '', maxlength: 2000 },
  adminNote: { type: String, default: '', maxlength: 2000 },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  payoutDetails: {
    method: { type: String, enum: ['bank_transfer', 'upi', 'wallet', 'other'] },
    accountHolderName: String,
    accountNumber: String,
    ifscCode: String,
    upiId: String,
  },
}, { timestamps: true });

affiliateProfileSchema.index({ tenant: 1, user: 1 }, { unique: true });
affiliateProfileSchema.index({ tenant: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('AffiliateProfile', affiliateProfileSchema);
