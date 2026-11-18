const mongoose = require('mongoose');

const vendorMemberSchema = new mongoose.Schema({
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['owner', 'manager', 'staff'], default: 'staff' },
  permissions: [String],
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['active', 'inactive', 'invited'], default: 'invited' },
}, { timestamps: true });

vendorMemberSchema.index({ vendor: 1, user: 1 }, { unique: true });
vendorMemberSchema.index({ tenant: 1, vendor: 1, status: 1 });

module.exports = mongoose.model('VendorMember', vendorMemberSchema);
