const mongoose = require('mongoose');

const newsletterSubscriberSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true },
  source: { type: String, default: '' },
  status: { type: String, enum: ['active', 'unsubscribed'], default: 'active' },
  unsubscribedAt: { type: Date, default: null },
}, { timestamps: true });

newsletterSubscriberSchema.index({ tenant: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('NewsletterSubscriber', newsletterSubscriberSchema);
