const mongoose = require('mongoose');

const tenantModuleSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  module: { type: String, required: true, lowercase: true, trim: true },
  enabled: { type: Boolean, default: false },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

tenantModuleSchema.index({ tenant: 1, module: 1 }, { unique: true });

module.exports = mongoose.model('TenantModule', tenantModuleSchema);
