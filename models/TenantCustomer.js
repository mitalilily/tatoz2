const mongoose = require('mongoose');

const tenantCustomerSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: { type: String, enum: ['active', 'blocked'], default: 'active', index: true },
  source: { type: String, enum: ['otp', 'password', 'google', 'phone_change', 'commerce'], default: 'commerce' },
  firstSeenAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
}, { timestamps: true });

tenantCustomerSchema.index({ tenant: 1, user: 1 }, { unique: true });
tenantCustomerSchema.index({ tenant: 1, status: 1, lastSeenAt: -1 });

module.exports = mongoose.model('TenantCustomer', tenantCustomerSchema);
