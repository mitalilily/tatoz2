const mongoose = require('mongoose');

const authPolicySchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  // primaryMode remains the compatibility/default entry point. activeMethods
  // allows the storefront to expose more than one tested login method.
  primaryMode: { type: String, enum: ['password', 'msg91', 'wati', 'google'], default: 'msg91' },
  activeMethods: { type: [{ type: String, enum: ['password', 'msg91', 'wati', 'google'] }], default: undefined },
  // Cart verification is opt-in. When enabled, the selected provider is
  // independent from the primary login mode.
  cartOtpProvider: { type: String, enum: ['disabled', 'email', 'msg91', 'wati'], default: 'disabled' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

authPolicySchema.index({ tenant: 1 }, { unique: true });

module.exports = mongoose.model('AuthPolicy', authPolicySchema);
