const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  title: { type: String },
  thumbnail: { type: String },
  price: { type: Number },
  quantity: { type: Number, default: 1 },
  variant: { type: mongoose.Schema.Types.Mixed },
}, { _id: false });

const abandonedCartSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  sessionId: { type: String, required: true },
  items: [cartItemSchema],
  itemCount: { type: Number, default: 0 },
  subtotal: { type: Number, default: 0 },
  couponCode: { type: String },
  referralCode: { type: String },
  lastActivity: { type: Date, default: Date.now },
  recovered: { type: Boolean, default: false },
  recoveredAt: { type: Date },
  device: { type: String, enum: ['desktop', 'mobile', 'tablet', 'unknown'], default: 'unknown' },
  userAgent: { type: String },
  ip: { type: String },
}, { timestamps: true });

abandonedCartSchema.index({ sessionId: 1 }, { unique: true });
abandonedCartSchema.index({ user: 1 });
abandonedCartSchema.index({ lastActivity: -1 });
abandonedCartSchema.index({ recovered: 1 });
abandonedCartSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AbandonedCart', abandonedCartSchema);
