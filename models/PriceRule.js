const mongoose = require('mongoose');

const priceRuleSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  customerTiers: { type: [String], enum: ['wholesale', 'dealer', 'distributor', 'custom'], default: [] },
  products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
  discountType: { type: String, enum: ['percentage', 'fixed_discount', 'fixed_price'], required: true },
  value: { type: Number, required: true, min: 0 },
  minQuantity: { type: Number, default: 1, min: 1, max: 1000000 },
  priority: { type: Number, default: 0, min: 0, max: 10000 },
  startsAt: Date,
  endsAt: Date,
  isActive: { type: Boolean, default: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

priceRuleSchema.index({ tenant: 1, isActive: 1, priority: -1 });
priceRuleSchema.index({ tenant: 1, products: 1 });
priceRuleSchema.index({ tenant: 1, categories: 1 });

module.exports = mongoose.model('PriceRule', priceRuleSchema);
