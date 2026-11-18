const mongoose = require('mongoose');

/**
 * Tiered commission rules. Resolution order at order-create time:
 * product/category/vendor CommissionRule (most specific, then lowest
 * priority) > vendor override > category default > Settings
 * `defaultCommissionRate`. Rules are versioned by effectiveFrom so rate
 * changes never rewrite history on already-placed orders.
 */
const commissionRuleSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  // Optional scoping: null means "applies to every category / vendor".
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
  percent: { type: Number, required: true, min: 0, max: 100 },
  flatFee: { type: Number, default: 0, min: 0 },
  priority: { type: Number, default: 100, min: 0, max: 1000 },
  effectiveFrom: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

commissionRuleSchema.index({ tenant: 1, isActive: 1, priority: 1 });
commissionRuleSchema.index({ tenant: 1, product: 1, category: 1, vendor: 1, isActive: 1 });

module.exports = mongoose.model('CommissionRule', commissionRuleSchema);
