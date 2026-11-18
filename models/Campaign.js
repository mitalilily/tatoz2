const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  objective: { type: String, enum: ['promotional', 'product_launch', 'cart_recovery', 'win_back', 'coupon', 'referral', 'transactional'], default: 'promotional' },
  channels: [{ type: String, enum: ['in_app', 'email', 'whatsapp', 'push', 'sms'] }],
  subject: { type: String, default: '', maxlength: 200 },
  title: { type: String, required: true, maxlength: 160 },
  message: { type: String, required: true, maxlength: 4000 },
  html: { type: String, default: '', maxlength: 30000 },
  templateName: { type: String, default: '', maxlength: 160 },
  couponCode: { type: String, default: '', uppercase: true, trim: true, maxlength: 80 },
  audience: {
    type: { type: String, enum: ['all', 'segment', 'customers'], default: 'all' },
    segment: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerSegment' },
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  scheduledAt: { type: Date, default: null, index: true },
  status: { type: String, enum: ['draft', 'scheduled', 'running', 'completed', 'paused', 'failed'], default: 'draft', index: true },
  metrics: {
    audience: { type: Number, default: 0 },
    queued: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    startedAt: Date,
    completedAt: Date,
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lastError: { type: String, default: '', maxlength: 500 },
}, { timestamps: true });

campaignSchema.index({ tenant: 1, status: 1, scheduledAt: 1 });

module.exports = mongoose.model('Campaign', campaignSchema);
