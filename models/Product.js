const mongoose = require('mongoose');

const variantOptionSchema = new mongoose.Schema({
  value: String,
  stock: { type: Number, default: 0, min: 0 },
  reservedStock: { type: Number, default: 0, min: 0 },
  soldStock: { type: Number, default: 0, min: 0 },
  // Backwards-compatible fallback adjustment when a variant does not have its own price.
  priceModifier: { type: Number, default: 0 },
  // Amazon-style option-level commercial data.
  price: { type: Number, min: 0 },
  comparePrice: { type: Number, min: 0 },
  discount: { type: Number, default: 0, min: 0, max: 100 },
  images: [{ url: String, alt: String, publicId: String }],
  thumbnail: String,
});

const variantSchema = new mongoose.Schema({
  name: String,
  options: [variantOptionSchema],
});

const croTestimonialSchema = new mongoose.Schema({
  name: { type: String, trim: true, maxlength: 80 },
  rating: { type: Number, min: 0, max: 5, default: 5 },
  text: { type: String, trim: true, maxlength: 500 },
  location: { type: String, trim: true, maxlength: 80 },
  verified: { type: Boolean, default: true },
}, { _id: false });

const croFaqSchema = new mongoose.Schema({
  question: { type: String, trim: true, maxlength: 180 },
  answer: { type: String, trim: true, maxlength: 1000 },
}, { _id: false });

// Product-level conversion controls. These are intentionally separate from
// inventory and review counters: admins can create a merchandising display
// without mutating operational stock, orders, or customer review data.
const croSchema = new mongoose.Schema({
  promotionalMessage: { type: String, trim: true, maxlength: 180, default: '' },
  customRating: {
    enabled: { type: Boolean, default: false },
    value: { type: Number, min: 0, max: 5, default: 5 },
    reviewCount: { type: Number, min: 0, max: 1000000000, default: 0 },
    summary: { type: String, trim: true, maxlength: 160, default: '' },
  },
  reasonsTitle: { type: String, trim: true, maxlength: 80, default: '' },
  reasonsToBuy: [{ type: String, trim: true, maxlength: 180 }],
  socialProof: {
    enabled: { type: Boolean, default: false },
    period: { type: String, enum: ['24h', '48h', '7d', 'custom'], default: '24h' },
    count: { type: Number, min: 0, max: 1000000000, default: 0 },
    min: { type: Number, min: 0, max: 1000000000, default: 0 },
    max: { type: Number, min: 0, max: 1000000000, default: 0 },
    customLabel: { type: String, trim: true, maxlength: 80, default: '' },
  },
  stockDisplay: {
    enabled: { type: Boolean, default: false },
    value: { type: Number, min: 0, max: 1000000000, default: 0 },
    min: { type: Number, min: 0, max: 1000000000, default: 0 },
    max: { type: Number, min: 0, max: 1000000000, default: 0 },
  },
  soldDisplay: {
    enabled: { type: Boolean, default: false },
    count: { type: Number, min: 0, max: 1000000000, default: 0 },
    min: { type: Number, min: 0, max: 1000000000, default: 0 },
    max: { type: Number, min: 0, max: 1000000000, default: 0 },
    label: { type: String, trim: true, maxlength: 80, default: 'sold recently' },
  },
  visitorDisplay: {
    enabled: { type: Boolean, default: false },
    count: { type: Number, min: 0, max: 1000000000, default: 0 },
    min: { type: Number, min: 0, max: 1000000000, default: 0 },
    max: { type: Number, min: 0, max: 1000000000, default: 0 },
  },
  etaText: { type: String, trim: true, maxlength: 120, default: '' },
  benefits: [{ type: String, trim: true, maxlength: 180 }],
  testimonialReviews: [croTestimonialSchema],
  faqs: [croFaqSchema],
}, { _id: false });

const productSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  title: { type: String, required: [true, 'Product title is required'], trim: true, maxlength: 200 },
  slug: { type: String, unique: true, lowercase: true },
  description: { type: String, required: [true, 'Description is required'] },
  shortDescription: { type: String, maxlength: 500 },
  price: { type: Number, required: [true, 'Price is required'], min: 0, max: 1000000000 },
  comparePrice: { type: Number, min: 0, max: 1000000000 },
  discount: { type: Number, default: 0, min: 0, max: 100 },
  images: [{ url: String, alt: String, publicId: String }],
  thumbnail: { type: String },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  brand: { type: String, trim: true },
  sku: { type: String, unique: true, sparse: true },
  hsnCode: { type: String, trim: true, maxlength: 20, default: '' },
  barcode: { type: String, trim: true, maxlength: 80, default: '' },
  gstRate: { type: Number, min: 0, max: 100, default: null },
  costPrice: { type: Number, min: 0, max: 1000000000, default: 0 },
  wholesalePrice: { type: Number, min: 0, max: 1000000000, default: null },
  bulkOrderEnabled: { type: Boolean, default: false, index: true },
  bulkOrderTiers: [{
    minQuantity: { type: Number, min: 1, max: 100000, required: true },
    price: { type: Number, min: 0.01, max: 1000000000, required: true },
    label: { type: String, trim: true, maxlength: 80 },
  }],
  stock: { type: Number, default: 0, min: 0, max: 1000000000 },
  reservedStock: { type: Number, default: 0, min: 0 },
  soldStock: { type: Number, default: 0, min: 0 },
  incomingStock: { type: Number, default: 0, min: 0, max: 1000000000 },
  lowStockThreshold: { type: Number, default: 10, min: 0, max: 1000000000 },
  preorderEnabled: { type: Boolean, default: false, index: true },
  preorderPrice: { type: Number, min: 0, default: null },
  preorderDeposit: { type: Number, min: 0, default: 0 },
  estimatedShippingDate: Date,
  backorderEnabled: { type: Boolean, default: false, index: true },
  variants: [variantSchema],
  // `variantType` describes the catalog shape while `productKind` describes
  // fulfilment. Both are additive so legacy products remain physical/simple.
  variantType: { type: String, enum: ['simple', 'variable'], default: 'simple', index: true },
  productKind: { type: String, enum: ['physical', 'digital', 'service', 'subscription'], default: 'physical', index: true },
  videos: [{ url: String, thumbnail: String, alt: String, provider: String }],
  specifications: [{ key: { type: String, trim: true }, value: { type: String, trim: true } }],
  lifecycleStatus: { type: String, enum: ['draft', 'active', 'inactive', 'archived'], default: 'active', index: true },
  approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved', index: true },
  approvalSubmittedAt: Date,
  approvalReviewedAt: Date,
  approvalReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvalNote: { type: String, trim: true, maxlength: 500, default: '' },
  rejectionReason: { type: String, trim: true, maxlength: 500, default: '' },
  tags: [String],
  isActive: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
  isFlashDeal: { type: Boolean, default: false },
  flashDealExpiry: Date,
  ratings: { average: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
  cro: { type: croSchema, default: () => ({}) },
  // AI Generated Fields
  aiGenerated: { type: Boolean, default: false },
  aiConfidenceScore: { type: Number, min: 0, max: 100 },
  aiRawData: mongoose.Schema.Types.Mixed,
  // SEO Fields
  seo: {
    metaTitle: String,
    metaDescription: String,
    keywords: [String],
    altText: String,
    focusKeyword: String,
    schema: mongoose.Schema.Types.Mixed,
    canonical: String,
    robots: { type: String, default: 'index, follow' },
    ogTitle: String,
    ogDescription: String,
    ogImage: String,
  },
  // Physical attributes detected by AI
  attributes: {
    color: [String],
    material: String,
    brand: String,
    detectedCategory: String,
    features: [String],
  },
  weight: Number,
  dimensions: { length: Number, width: Number, height: Number },
  shippingClass: { type: String, default: 'standard' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
  totalSales: { type: Number, default: 0 },
  views: { type: Number, default: 0 },
}, { timestamps: true });

productSchema.index({ category: 1 });
productSchema.index({ tenant: 1, isActive: 1, createdAt: -1 });
productSchema.index({ tenant: 1, isActive: 1, category: 1, createdAt: -1 });
productSchema.index({ tenant: 1, isActive: 1, price: 1 });
productSchema.index({ tenant: 1, isActive: 1, totalSales: -1, createdAt: -1 });
productSchema.index({ tenant: 1, isActive: 1, 'ratings.average': -1, totalSales: -1 });
productSchema.index({ tenant: 1, isActive: 1, isFeatured: 1, createdAt: -1 });
productSchema.index({ tenant: 1, isActive: 1, isFlashDeal: 1, flashDealExpiry: 1 });
productSchema.index({ price: 1 });
productSchema.index({ 'ratings.average': -1 });
productSchema.index({ isFeatured: 1 });
productSchema.index({ isActive: 1 });
productSchema.index({ vendor: 1 });
productSchema.index({ tenant: 1, lifecycleStatus: 1, createdAt: -1 });
productSchema.index({ tenant: 1, vendor: 1, approvalStatus: 1, createdAt: -1 });
productSchema.index({ tenant: 1, barcode: 1 });
productSchema.index({ title: 'text', description: 'text', tags: 'text' });

module.exports = mongoose.model('Product', productSchema);
