const mongoose = require('mongoose');

const authSessionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  method: {
    type: String,
    enum: ['otp', 'password', 'google', 'admin_password'],
    required: true,
    index: true,
  },
  otpVerifiedAt: Date,
  ipHash: { type: String, default: '' },
  userAgentHash: { type: String, default: '' },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
  revocationReason: { type: String, default: '' },
}, { timestamps: true });

authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
authSessionSchema.index({ user: 1, revokedAt: 1, expiresAt: -1 });
authSessionSchema.index({ tenant: 1, user: 1, revokedAt: 1 });

module.exports = mongoose.model('AuthSession', authSessionSchema);
