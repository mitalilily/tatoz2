const mongoose = require('mongoose');

const priceDropAlertSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  // OTP-first customers may not have an email address. In-app notifications
  // are the required delivery channel; email is an optional enhancement.
  email: { type: String, lowercase: true, trim: true, default: '' },
  phone: { type: String, trim: true, default: '' },
  baselinePrice: { type: Number, required: true, min: 0 },
  targetPrice: { type: Number, min: 0 },
  currentPrice: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['active', 'notified', 'cancelled'], default: 'active', index: true },
  notifiedAt: Date,
  lastEvaluatedPrice: { type: Number, min: 0 },
}, { timestamps: true });

priceDropAlertSchema.index({ tenant: 1, user: 1, product: 1 }, { unique: true });
priceDropAlertSchema.index({ tenant: 1, product: 1, status: 1 });

module.exports = mongoose.model('PriceDropAlert', priceDropAlertSchema);
