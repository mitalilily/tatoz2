const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  title: { type: String, required: [true, 'Blog title is required'], trim: true, maxlength: 200 },
  slug: { type: String, required: true, unique: true, lowercase: true },
  content: { type: String, default: '', maxlength: 100000 },
  excerpt: { type: String, trim: true, maxlength: 1000 },
  featuredImage: { type: String, maxlength: 2048 },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'BlogCategory', default: null },
  tags: [{ type: String, trim: true, maxlength: 50 }],
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
  publishedAt: { type: Date },
  seo: {
    metaTitle: String,
    metaDescription: String,
    keywords: [String],
    ogImage: String,
  },
  viewCount: { type: Number, default: 0 },
  readTime: { type: Number, default: 1 },
  isFeatured: { type: Boolean, default: false },
  allowComments: { type: Boolean, default: true },
  relatedProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
}, { timestamps: true });

blogSchema.index({ status: 1, publishedAt: -1 });
blogSchema.index({ category: 1 });
blogSchema.index({ tags: 1 });

module.exports = mongoose.model('Blog', blogSchema);
