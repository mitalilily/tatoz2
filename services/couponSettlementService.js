const Coupon = require('../models/Coupon');
const CouponRedemption = require('../models/CouponRedemption');

const activeStatuses = ['reserved', 'captured'];

const captureCouponForOrder = async ({ order, session } = {}) => {
  if (!order?.tenant || !order?.coupon) return { captured: false, idempotent: true };
  const updated = await CouponRedemption.findOneAndUpdate(
    { tenant: order.tenant, order: order._id, status: 'reserved' },
    { $set: { status: 'captured', capturedAt: new Date() } },
    { new: true, session },
  );
  if (updated) return { captured: true, idempotent: false, redemption: updated };
  const existing = await CouponRedemption.findOne({ tenant: order.tenant, order: order._id }).session(session).lean();
  return { captured: false, idempotent: Boolean(existing?.status === 'captured'), redemption: existing || null };
};

const releaseCouponForOrder = async ({ order, reason = 'order_cancelled', session } = {}) => {
  if (!order?.tenant || !order?.coupon) return { released: false, idempotent: true };
  const redemption = await CouponRedemption.findOneAndUpdate(
    { tenant: order.tenant, order: order._id, status: 'reserved' },
    { $set: { status: 'released', releasedAt: new Date(), releaseReason: String(reason).slice(0, 200) } },
    { new: true, session },
  );
  if (!redemption) {
    const existing = await CouponRedemption.findOne({ tenant: order.tenant, order: order._id }).session(session).lean();
    return { released: false, idempotent: Boolean(existing && !activeStatuses.includes(existing.status)), redemption: existing || null };
  }

  const coupon = await Coupon.findOneAndUpdate(
    { _id: redemption.coupon, tenant: order.tenant, usageCount: { $gt: 0 } },
    { $inc: { usageCount: -1 }, $pull: { usedBy: { order: order._id } } },
    { new: true, session },
  );
  if (!coupon) {
    const error = new Error('Coupon usage ledger could not be restored safely');
    error.publicCode = 'COUPON_LEDGER_INCONSISTENT';
    throw error;
  }
  return { released: true, idempotent: false, redemption, coupon };
};

module.exports = { captureCouponForOrder, releaseCouponForOrder };
