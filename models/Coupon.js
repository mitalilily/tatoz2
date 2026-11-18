const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  // Coupon codes are unique inside a storefront, not across the whole
  // platform. This keeps separate tenants free to use the same campaign code.
  code: { type: String, required: true, uppercase: true, trim: true },
  description: String,
  type: { type: String, enum: ['percentage', 'fixed', 'free_shipping', 'buy_x_get_y', 'tiered', 'bundle'], required: true },
  value: { type: Number, default: 0, min: 0 },
  // Buy X Get Y fields
  buyXGetY: {
    buyQuantity: { type: Number, default: 2 },
    getQuantity: { type: Number, default: 1 },
    getDiscount: { type: Number, default: 100 }, // percent off free items
  },
  // Tiered pricing
  tiers: [{
    minQuantity: { type: Number, required: true },
    discount: { type: Number, required: true }, // percent
  }],
  // Bundle discount
  bundleProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  bundleDiscount: { type: Number, default: 0 }, // percent off bundle
  minOrderAmount: { type: Number, default: 0 },
  maxDiscount: Number,
  usageLimit: { type: Number, default: null },
  usageCount: { type: Number, default: 0 },
  userLimit: { type: Number, default: 1 },
  usedBy: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    usedAt: Date,
  }],
  applicableProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  applicableCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
  isActive: { type: Boolean, default: true },
  showOnCheckout: { type: Boolean, default: false },
  startDate: Date,
  expiresAt: { type: Date, required: true },
  isFirstOrderOnly: { type: Boolean, default: false },
  // New eligibility controls are additive; isFirstOrderOnly remains supported
  // for existing records and is treated as customerEligibility: "new".
  customerEligibility: { type: String, enum: ['all', 'new', 'existing'], default: 'all' },
  eligibleUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  audienceSegments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CustomerSegment' }],
  allowedPaymentMethods: [{ type: String, enum: ['cod', 'razorpay', 'cashfree', 'stripe', 'wallet', 'loyalty', 'gift_card', 'manual', 'bank_transfer', 'upi'] }],
  allowedChannels: [{ type: String, enum: ['website', 'app'] }],
  geo: {
    states: [{ type: String, trim: true }],
    cities: [{ type: String, trim: true }],
    pincodes: [{ type: String, trim: true }],
  },
}, { timestamps: true });

couponSchema.index({ tenant: 1, code: 1 }, { unique: true });
couponSchema.index({ isActive: 1, expiresAt: 1 });

module.exports = mongoose.model('Coupon', couponSchema);
