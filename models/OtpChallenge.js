const mongoose = require('mongoose');

const otpChallengeSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  phone: { type: String, index: true },
  email: { type: String, lowercase: true, trim: true, index: true },
  channel: { type: String, enum: ['phone', 'email'], default: 'phone', index: true },
  purpose: { type: String, enum: ['login', 'change-phone', 'cart_step_up'], required: true },
  codeHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
}, { timestamps: true });

otpChallengeSchema.path('phone').required(function requiredPhone() { return this.channel !== 'email'; });
otpChallengeSchema.path('email').required(function requiredEmail() { return this.channel === 'email'; });

otpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
otpChallengeSchema.index({ tenant: 1, phone: 1, purpose: 1, createdAt: -1 });
otpChallengeSchema.index({ tenant: 1, email: 1, purpose: 1, createdAt: -1 });

module.exports = mongoose.model('OtpChallenge', otpChallengeSchema);
