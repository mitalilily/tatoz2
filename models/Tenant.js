const mongoose = require('mongoose');

const domainSchema = new mongoose.Schema({
  host: { type: String, required: true, lowercase: true, trim: true },
  verified: { type: Boolean, default: false },
  primary: { type: Boolean, default: false },
}, { _id: false });

const tenantSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  type: { type: String, enum: ['platform', 'store'], default: 'store', index: true },
  status: { type: String, enum: ['active', 'suspended', 'archived'], default: 'active', index: true },
  domains: { type: [domainSchema], default: [] },
  settings: { type: mongoose.Schema.Types.Mixed, default: {} },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  migratedFromVendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
}, { timestamps: true });

tenantSchema.index({ 'domains.host': 1 });
tenantSchema.index({ status: 1, type: 1 });

module.exports = mongoose.model('Tenant', tenantSchema);
