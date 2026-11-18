const mongoose = require('mongoose');

const guestCartItemSchema = new mongoose.Schema({
  itemType: { type: String, enum: ['product', 'bundle'], default: 'product' },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  bundle: { type: mongoose.Schema.Types.ObjectId, ref: 'Bundle' },
  bundleSelections: { type: mongoose.Schema.Types.Mixed, default: {} },
  variant: { type: mongoose.Schema.Types.Mixed, default: {} },
  variantKey: { type: String, default: '' },
  quantity: { type: Number, required: true, min: 1, max: 100 },
  addedAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

guestCartItemSchema.pre('validate', function (next) {
  if (this.itemType === 'bundle' && !this.bundle) return next(new Error('Bundle cart items require a bundle'));
  if (this.itemType !== 'bundle' && !this.product) return next(new Error('Product cart items require a product'));
  next();
});

const appliedMutationSchema = new mongoose.Schema({
  key: { type: String, required: true },
  requestHash: { type: String, required: true },
  appliedAt: { type: Date, default: Date.now },
}, { _id: false });

const guestCartSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  tokenHash: { type: String, required: true, select: false },
  items: { type: [guestCartItemSchema], default: [] },
  revision: { type: Number, default: 0, min: 0 },
  appliedMutations: { type: [appliedMutationSchema], default: [] },
}, { timestamps: true });

guestCartSchema.index({ tenant: 1, tokenHash: 1 }, { unique: true });
guestCartSchema.index({ tenant: 1, updatedAt: -1 });

module.exports = mongoose.model('GuestCart', guestCartSchema);
