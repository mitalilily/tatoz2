const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
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

cartItemSchema.pre('validate', function (next) {
  if (this.itemType === 'bundle' && !this.bundle) return next(new Error('Bundle cart items require a bundle'));
  if (this.itemType !== 'bundle' && !this.product) return next(new Error('Product cart items require a product'));
  next();
});

const appliedMutationSchema = new mongoose.Schema({
  key: { type: String, required: true },
  requestHash: { type: String, required: true },
  appliedAt: { type: Date, default: Date.now },
}, { _id: false });

const cartSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: { type: [cartItemSchema], default: [] },
  revision: { type: Number, default: 0, min: 0 },
  // This bounded ledger closes the crash window between applying a cart write
  // and completing its idempotency receipt. It contains hashes only, never a
  // request body, token, phone number, or OTP.
  appliedMutations: { type: [appliedMutationSchema], default: [] },
}, { timestamps: true });

cartSchema.index({ tenant: 1, user: 1 }, { unique: true });
cartSchema.index({ tenant: 1, updatedAt: -1 });

module.exports = mongoose.model('Cart', cartSchema);
