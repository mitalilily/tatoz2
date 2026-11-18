const mongoose = require('mongoose');

const bundleComponentSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true, min: 1, max: 100, default: 1 },
  required: { type: Boolean, default: true },
  customerSelectable: { type: Boolean, default: false },
  allowDuplicate: { type: Boolean, default: false },
  group: { type: String, trim: true, maxlength: 80, default: '' },
  minQuantity: { type: Number, min: 1, max: 100, default: undefined },
  maxQuantity: { type: Number, min: 1, max: 100, default: undefined },
  priceOverride: { type: Number, min: 0, default: null },
  priceAdjustment: { type: Number, default: 0 },
  sortOrder: { type: Number, min: 0, max: 1000, default: 0 },
  defaultVariant: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { _id: true });

const selectionGroupSchema = new mongoose.Schema({
  key: { type: String, trim: true, maxlength: 80 },
  name: { type: String, trim: true, maxlength: 120, required: true },
  description: { type: String, trim: true, maxlength: 300, default: '' },
  minimumSelection: { type: Number, min: 0, max: 100, default: 1 },
  maximumSelection: { type: Number, min: 0, max: 100, default: 1 },
  required: { type: Boolean, default: true },
  duplicateAllowed: { type: Boolean, default: false },
  sortOrder: { type: Number, min: 0, max: 1000, default: 0 },
}, { _id: true });

const freeRewardSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  quantity: { type: Number, min: 1, max: 100, default: 1 },
  variant: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { _id: false });

const selectionRulesSchema = new mongoose.Schema({
  minProducts: { type: Number, min: 1, max: 100, default: 1 },
  maxProducts: { type: Number, min: 1, max: 100, default: 100 },
  requiredQuantity: { type: Number, min: 1, max: 100, default: 1 },
  maxQuantityPerProduct: { type: Number, min: 1, max: 100, default: 100 },
}, { _id: false });

const bundleSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 180 },
  internalName: { type: String, trim: true, maxlength: 120, default: '' },
  slug: { type: String, required: true, trim: true, lowercase: true },
  sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 80 },
  barcode: { type: String, trim: true, maxlength: 80, default: '' },
  bundleType: { type: String, enum: ['fixed', 'custom', 'mix_match', 'multipack', 'box', 'quantity', 'promotion'], default: 'fixed', index: true },
  // `bundleType` is retained for compatibility with existing bundles and
  // clients. `offerType` carries the complete promotion semantics.
  offerType: {
    type: String,
    enum: ['fixed_combo', 'fixed_variant', 'multipack', 'mix_match', 'custom_bundle', 'custom_box', 'quantity_bundle', 'buy_x_get_y_free', 'frequently_bought_together', 'add_on'],
    default: 'fixed_combo',
    index: true,
  },
  description: { type: String, default: '' },
  shortDescription: { type: String, default: '' },
  components: { type: [bundleComponentSchema], required: true, validate: value => Array.isArray(value) && value.length > 0 },
  selectionGroups: { type: [selectionGroupSchema], default: [] },
  price: { type: Number, required: true, min: 0 },
  comparePrice: { type: Number, min: 0, default: 0 },
  pricingType: { type: String, enum: ['fixed', 'percentage', 'fixed_discount', 'dynamic', 'fixed_box', 'tiered'], default: 'fixed' },
  discountType: { type: String, enum: ['none', 'percentage', 'fixed'], default: 'none' },
  discountValue: { type: Number, min: 0, default: 0 },
  selectionRules: { type: selectionRulesSchema, default: () => ({}) },
  freeReward: { type: freeRewardSchema, default: () => ({}) },
  costPrice: { type: Number, min: 0, default: 0 },
  hsnCode: { type: String, trim: true, maxlength: 20, default: '' },
  gstRate: { type: Number, min: 0, max: 100, default: null },
  image: { type: String, default: '' },
  gallery: [{ url: String, alt: String, publicId: String }],
  tags: [String],
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
  availability: {
    startAt: Date,
    endAt: Date,
    maxQuantityPerOrder: { type: Number, min: 1, max: 100, default: 10 },
  },
  label: { type: String, trim: true, maxlength: 40, default: 'Bundle' },
  badges: [{ type: String, trim: true, maxlength: 40 }],
  displaySettings: {
    showOriginalPrice: { type: Boolean, default: true },
    showSavings: { type: Boolean, default: true },
    showDiscountBadge: { type: Boolean, default: true },
  },
  channels: [{ type: String, enum: ['website', 'mobile_app', 'pos', 'b2b', 'marketplace', 'social_commerce'] }],
  customerEligibility: { type: mongoose.Schema.Types.Mixed, default: {} },
  returnPolicy: { type: String, enum: ['entire_bundle', 'partial_components'], default: 'entire_bundle' },
  discountCombination: { type: mongoose.Schema.Types.Mixed, default: {} },
  fulfillmentStrategy: { type: String, enum: ['same_warehouse', 'split_allowed'], default: 'same_warehouse' },
  version: { type: Number, min: 1, default: 1 },
  stats: {
    views: { type: Number, min: 0, default: 0 },
    addToCart: { type: Number, min: 0, default: 0 },
    unitsSold: { type: Number, min: 0, default: 0 },
    revenue: { type: Number, min: 0, default: 0 },
    discount: { type: Number, min: 0, default: 0 },
  },
  lifecycleStatus: { type: String, enum: ['draft', 'active', 'inactive', 'archived'], default: 'draft', index: true },
  isActive: { type: Boolean, default: false, index: true },
  seo: {
    metaTitle: String,
    metaDescription: String,
    keywords: [String],
    canonical: String,
    robots: { type: String, default: 'index, follow' },
    schema: mongoose.Schema.Types.Mixed,
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

bundleSchema.index({ tenant: 1, slug: 1 }, { unique: true });
bundleSchema.index({ tenant: 1, sku: 1 }, { unique: true });
bundleSchema.index({ tenant: 1, lifecycleStatus: 1, createdAt: -1 });
bundleSchema.index({ tenant: 1, category: 1, isActive: 1 });

module.exports = mongoose.model('Bundle', bundleSchema);
