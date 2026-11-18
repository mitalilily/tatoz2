const mongoose = require('mongoose');

const brandSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  name: {
    type: String,
    required: [true, 'Brand name is required'],
    trim: true,
    minlength: [2, 'Brand name must contain at least 2 characters'],
    maxlength: 80,
    validate: {
      validator: value => /^[\p{L}\p{N}][\p{L}\p{N} .&+()\/-]*$/u.test(String(value || '')),
      message: 'Brand name contains unsupported characters',
    },
  },
  slug: { type: String, required: true, unique: true, lowercase: true },
  description: { type: String, trim: true, maxlength: 1000 },
  image: { type: String },
  isActive: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  seo: {
    metaTitle: String,
    metaDescription: String,
    keywords: [String],
  },
}, { timestamps: true });

brandSchema.index({ tenant: 1, isActive: 1 });

module.exports = mongoose.model('Brand', brandSchema);
