const mongoose = require('mongoose');

const stockAlertSchema = new mongoose.Schema({
  // New alerts are tenant-bound. This remains optional for legacy records so
  // an additive release does not invalidate old notification documents.
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  // OTP-first customers may have no email. Their verified phone account can
  // receive the alert in-app while email remains an optional enhancement.
  email: { type: String, lowercase: true, trim: true, default: '' },
  phone: { type: String, trim: true, default: '' },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notified: { type: Boolean, default: false },
  notifiedAt: { type: Date },
  notification: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification' },
  delivery: {
    inApp: { type: Boolean, default: false },
    email: { type: Boolean, default: false },
    emailSkipped: { type: Boolean, default: false },
  },
}, { timestamps: true });

// Email subscriptions are unique per product when an address exists. A
// separate user key permits multiple phone-only customers to watch the same
// product without colliding on an empty email value.
stockAlertSchema.index(
  { product: 1, email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string', $gt: '' } } },
);
stockAlertSchema.index(
  { product: 1, user: 1 },
  { unique: true, partialFilterExpression: { user: { $type: 'objectId' } } },
);
stockAlertSchema.index({ product: 1, notified: 1 });

module.exports = mongoose.model('StockAlert', stockAlertSchema);
