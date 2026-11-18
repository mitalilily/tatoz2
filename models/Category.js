const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  name: { type: String, required: [true, 'Category name is required'], trim: true, maxlength: 80 },
  slug: { type: String, required: true, unique: true, lowercase: true },
  description: { type: String, trim: true, maxlength: 1000 },
  image: { type: String },
  icon: { type: String },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  // Four-level taxonomy: Menu -> Submenu -> Category -> Subcategory.
  level: { type: String, enum: ['menu', 'submenu', 'category', 'subcategory'], default: 'menu', index: true },
  depth: { type: Number, min: 0, max: 3, default: 0, index: true },
  ancestors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
  masterKey: { type: String, trim: true, index: true },
  masterCode: { type: String, trim: true, index: true },
  isLegacy: { type: Boolean, default: false, index: true },
  isActive: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  seo: {
    metaTitle: String,
    metaDescription: String,
    keywords: [String],
  },
  commissionRate: { type: Number, default: 10, min: 0, max: 100 },
}, { timestamps: true });

categorySchema.index({ parent: 1 });
categorySchema.index({ tenant: 1, isActive: 1 });
categorySchema.index({ tenant: 1, parent: 1, isActive: 1 });
categorySchema.index({ tenant: 1, masterKey: 1 });
categorySchema.index({ tenant: 1, level: 1, order: 1, name: 1 });

module.exports = mongoose.model('Category', categorySchema);
