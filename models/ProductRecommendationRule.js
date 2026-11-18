const mongoose = require('mongoose');

const productRecommendationRuleSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  type: { type: String, enum: ['related', 'frequently_bought', 'upsell', 'cross_sell', 'add_on'], required: true, index: true },
  sourceProduct: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  targetProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true }],
  label: { type: String, trim: true, maxlength: 120, default: '' },
  enabled: { type: Boolean, default: true, index: true },
  priority: { type: Number, default: 0, min: -10000, max: 10000 },
  maxItems: { type: Number, default: 4, min: 1, max: 12 },
}, { timestamps: true });

productRecommendationRuleSchema.index({ tenant: 1, sourceProduct: 1, type: 1, priority: -1 });

module.exports = mongoose.model('ProductRecommendationRule', productRecommendationRuleSchema);
