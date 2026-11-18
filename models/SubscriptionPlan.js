const mongoose = require('mongoose');

const subscriptionPlanSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null, index: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  frequency: { type: String, enum: ['weekly', 'monthly', 'custom'], required: true },
  interval: { type: Number, default: 1, min: 1, max: 52 },
  price: { type: Number, required: true, min: 0 },
  discountPercentage: { type: Number, default: 0, min: 0, max: 100 },
  isActive: { type: Boolean, default: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

subscriptionPlanSchema.index({ tenant: 1, product: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
