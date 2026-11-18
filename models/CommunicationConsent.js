const mongoose = require('mongoose');

const communicationConsentSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  channel: { type: String, enum: ['email', 'push', 'whatsapp', 'sms'], required: true },
  purpose: { type: String, enum: ['transactional', 'marketing'], default: 'transactional' },
  optedIn: { type: Boolean, default: true },
  source: { type: String, default: 'account_settings' },
  optedAt: { type: Date, default: Date.now },
}, { timestamps: true });

communicationConsentSchema.index({ tenant: 1, user: 1, channel: 1, purpose: 1 }, { unique: true });

module.exports = mongoose.model('CommunicationConsent', communicationConsentSchema);
