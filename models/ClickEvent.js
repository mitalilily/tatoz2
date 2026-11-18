const mongoose = require('mongoose');

const clickEventSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  // What was clicked
  eventType: {
    type: String,
    required: true,
    enum: [
      'page_view', 'product_click', 'category_click', 'search',
      'add_to_cart', 'remove_from_cart', 'wishlist_toggle',
      'checkout_start', 'order_placed', 'button_click',
      'nav_click', 'filter_change', 'sort_change',
      'login', 'register', 'logout', 'other',
    ],
  },
  // Details
  page: { type: String },               // URL path
  target: { type: String },              // e.g. product slug, category slug, button label
  targetId: { type: String },            // e.g. product _id, category _id
  metadata: { type: mongoose.Schema.Types.Mixed }, // extra info (search query, filter values, etc.)
  // Who
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sessionId: { type: String },
  // Device / context
  userAgent: { type: String },
  device: { type: String, enum: ['desktop', 'mobile', 'tablet', 'unknown'], default: 'unknown' },
  referrer: { type: String },
  ip: { type: String },
}, { timestamps: true });

clickEventSchema.index({ eventType: 1, createdAt: -1 });
clickEventSchema.index({ createdAt: -1 });
// Analytics data is operational telemetry, not an eternal audit log. TTL
// keeps the collection bounded; long-term reporting belongs in a warehouse.
clickEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
clickEventSchema.index({ sessionId: 1 });
clickEventSchema.index({ userId: 1 });
clickEventSchema.index({ page: 1 });

module.exports = mongoose.model('ClickEvent', clickEventSchema);
