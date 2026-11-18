const mongoose = require('mongoose');

const deviceTokenSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  token: { type: String, required: true },
  platform: { type: String, enum: ['web', 'android', 'ios', 'unknown'], default: 'unknown' },
  lastSeenAt: { type: Date, default: Date.now },
  invalidatedAt: Date,
}, { timestamps: true });

deviceTokenSchema.index({ tenant: 1, token: 1 }, { unique: true });
deviceTokenSchema.index({ tenant: 1, user: 1, invalidatedAt: 1 });

module.exports = mongoose.model('DeviceToken', deviceTokenSchema);
