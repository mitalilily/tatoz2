const mongoose = require('mongoose');

const tenantMembershipSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  role: { type: String, enum: ['owner', 'admin', 'manager', 'finance', 'operations', 'readonly'], default: 'readonly' },
  permissions: { type: [String], default: [] },
  status: { type: String, enum: ['active', 'invited', 'suspended'], default: 'active' },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lastUsedAt: Date,
}, { timestamps: true });

tenantMembershipSchema.index({ tenant: 1, user: 1 }, { unique: true });
tenantMembershipSchema.index({ user: 1, status: 1 });

module.exports = mongoose.model('TenantMembership', tenantMembershipSchema);
