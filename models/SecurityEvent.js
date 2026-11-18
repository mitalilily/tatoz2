const mongoose = require('mongoose');

const securityEventSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  authSession: { type: mongoose.Schema.Types.ObjectId, ref: 'AuthSession' },
  eventType: {
    type: String,
    enum: ['otp_gate_denied'],
    required: true,
    index: true,
  },
  surface: {
    type: String,
    enum: ['cart', 'order', 'unknown'],
    default: 'unknown',
    index: true,
  },
  outcome: { type: String, enum: ['denied'], default: 'denied' },
  reason: { type: String, maxlength: 80, required: true },
  code: { type: String, maxlength: 80, required: true },
  method: { type: String, maxlength: 12, default: '' },
  route: { type: String, maxlength: 240, default: '' },
  requestId: { type: String, maxlength: 100, default: '', index: true },
  ipHash: { type: String, maxlength: 128, default: '' },
  userAgentHash: { type: String, maxlength: 128, default: '' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 60 * 60 * 24 * 180,
  },
}, { versionKey: false });

securityEventSchema.index({ tenant: 1, eventType: 1, createdAt: -1 });
securityEventSchema.index({ actor: 1, createdAt: -1 });

module.exports = mongoose.model('SecurityEvent', securityEventSchema);
