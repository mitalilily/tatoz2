const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  rating: { type: Number, required: true, min: 1, max: 5 },
  title: { type: String, trim: true },
  comment: { type: String, required: true, trim: true },
  images: [String],
  videos: [String],
  isVerifiedPurchase: { type: Boolean, default: false },
  verifiedAt: Date,
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  adminReply: { type: String, trim: true, maxlength: 2000 },
  adminReplyAt: Date,
  vendorReply: { type: String, trim: true, maxlength: 2000 },
  vendorReplyAt: Date,
  vendorReplyBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  helpful: { type: Number, default: 0 },
  helpfulVotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

// New reviews are unique within a storefront. The legacy product/user index
// is retained as a compatibility fallback for tenantless historical records;
// a production migration can remove that old index after backfilling tenant.
reviewSchema.index({ tenant: 1, product: 1, user: 1 }, { unique: true, partialFilterExpression: { tenant: { $type: 'objectId' } } });
reviewSchema.index({ product: 1, user: 1 }, { unique: true, partialFilterExpression: { tenant: { $exists: false } } });
reviewSchema.index({ product: 1, status: 1 });
reviewSchema.index({ tenant: 1, product: 1, status: 1 });
reviewSchema.index({ tenant: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Review', reviewSchema);
