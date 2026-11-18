const mongoose = require('mongoose');

const couponRedemptionSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  coupon: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', required: true, index: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  code: { type: String, required: true, uppercase: true, trim: true },
  discountAmount: { type: Number, required: true, min: 0 },
  status: {
    type: String,
    enum: ['reserved', 'captured', 'released', 'refunded'],
    default: 'reserved',
    index: true,
  },
  reservedAt: { type: Date, default: Date.now },
  capturedAt: Date,
  releasedAt: Date,
  refundedAt: Date,
  releaseReason: String,
}, { timestamps: true });

// One order can have only one coupon redemption, even when a transaction is
// retried or a payment callback races the browser callback.
couponRedemptionSchema.index({ tenant: 1, order: 1 }, { unique: true });
couponRedemptionSchema.index({ tenant: 1, coupon: 1, status: 1, createdAt: -1 });
couponRedemptionSchema.index({ tenant: 1, user: 1, createdAt: -1 });

module.exports = mongoose.model('CouponRedemption', couponRedemptionSchema);
