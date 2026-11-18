const asyncHandler = require('express-async-handler');
const RefundRequest = require('../models/RefundRequest');
const Order = require('../models/Order');
const ReturnRequest = require('../models/ReturnRequest');
const httpRequest = require('../utils/httpRequest');
const tenantIntegrationService = require('../services/tenantIntegrationService');
const returnLifecycleService = require('../services/returnLifecycleService');
const giftCardSettlementService = require('../services/giftCardSettlementService');
const { tenantScope } = require('../services/adminTenantScope');

const tenantFilter = req => tenantScope(req);
const escapeRegex = value => String(value || '').slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getRazorpayAuth = async tenantId => {
  const { key_id, key_secret, enabled } = await tenantIntegrationService.configFor(tenantId, 'razorpay', { allowPlatformFallback: true });
  if (!enabled || !key_id || !key_secret) throw new Error('Razorpay credentials are not configured');
  return Buffer.from(`${key_id}:${key_secret}`).toString('base64');
};

// @desc    Get all refund requests (admin)
// @route   GET /api/admin/refunds
const getRefunds = asyncHandler(async (req, res) => {
  const { status, type, search, page = 1, limit = 20, dateFrom, dateTo } = req.query;
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));

  const filter = { ...tenantFilter(req) };
  if (status) {
    const statuses = String(status).split(',').map(value => value.trim()).filter(Boolean);
    if (statuses.length === 1) filter.status = statuses[0];
    else if (statuses.length > 1) filter.status = { $in: statuses };
  }
  if (type) filter.type = type;
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) filter.createdAt.$lte = new Date(dateTo);
  }

  // Search by order number or user
  if (search) {
    const Order = require('../models/Order');
    const User = require('../models/User');
    const searchRegex = new RegExp(escapeRegex(search), 'i');
    const [orders, users] = await Promise.all([
      Order.find({ ...tenantFilter(req), orderNumber: searchRegex }).select('_id').lean(),
      User.find({ $or: [{ name: searchRegex }, { email: searchRegex }] }).select('_id').lean(),
    ]);
    filter.$or = [
      { order: { $in: orders.map(o => o._id) } },
      { user: { $in: users.map(u => u._id) } },
    ];
  }

  const [refunds, total] = await Promise.all([
    RefundRequest.find(filter)
      .populate('order', 'orderNumber total paymentMethod paymentStatus paymentId')
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    RefundRequest.countDocuments(filter),
  ]);

  res.json({
    success: true,
    refunds,
    pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) },
  });
});

// @desc    Refund stats (admin)
// @route   GET /api/admin/refunds/stats
const getRefundStats = asyncHandler(async (req, res) => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [pending, approvedToday, monthlyTotal, rejected] = await Promise.all([
    RefundRequest.countDocuments({ ...tenantFilter(req), status: 'pending' }),
    RefundRequest.countDocuments({ ...tenantFilter(req), status: { $in: ['approved', 'processed'] }, reviewedAt: { $gte: todayStart } }),
    RefundRequest.aggregate([
      { $match: { ...tenantFilter(req), status: 'processed', processedAt: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: '$approvedAmount' } } },
    ]),
    RefundRequest.countDocuments({ ...tenantFilter(req), status: 'rejected' }),
  ]);

  res.json({
    success: true,
    stats: {
      pending,
      approvedToday,
      monthlyTotal: monthlyTotal[0]?.total || 0,
      rejected,
    },
  });
});

// @desc    Get single refund (admin)
// @route   GET /api/admin/refunds/:id
const getRefund = asyncHandler(async (req, res) => {
  const refund = await RefundRequest.findOne({ _id: req.params.id, ...tenantFilter(req) })
    .populate('order', 'orderNumber total paymentMethod paymentStatus paymentId items shippingAddress createdAt orderStatus')
    .populate('user', 'name email phone')
    .populate('reviewedBy', 'name email');

  if (!refund) {
    res.status(404);
    throw new Error('Refund request not found');
  }

  res.json({ success: true, refund });
});

// @desc    Approve refund (admin)
// @route   PUT /api/admin/refunds/:id/approve
const approveRefund = asyncHandler(async (req, res) => {
  const { approvedAmount, adminNote } = req.body;

  const refund = await RefundRequest.findOne({ _id: req.params.id, ...tenantFilter(req) });
  if (!refund) {
    res.status(404);
    throw new Error('Refund request not found');
  }
  if (refund.status !== 'pending') {
    res.status(400);
    throw new Error(`Refund is already ${refund.status}`);
  }

  const order = await Order.findOne({ _id: refund.order, ...tenantFilter(req) });
  const finalAmount = approvedAmount === undefined || approvedAmount === null || approvedAmount === ''
    ? refund.amount
    : Number(approvedAmount);
  if (!Number.isFinite(finalAmount) || finalAmount <= 0 || !order || finalAmount > order.total) {
    res.status(400);
    throw new Error(`Refund amount must be greater than 0 and no more than ₹${order?.total || refund.amount}`);
  }

  // Physical returns must complete the RMA inspection gate before money is
  // released. The legacy refunds screen remains available for cancellation,
  // partial, goodwill, and already-approved RMA refunds.
  if (refund.returnRequest) {
    const returnRequest = await ReturnRequest.findOne({ _id: refund.returnRequest, ...tenantFilter(req) }).lean();
    if (!returnRequest) {
      res.status(409);
      throw new Error('Linked return request is missing');
    }
    if (returnRequest.status !== 'approved_for_refund') {
      res.status(409);
      throw new Error(`RMA must reach approved_for_refund before refund processing (current: ${returnRequest.status})`);
    }
  }
  refund.approvedAmount = finalAmount;
  refund.reviewedBy = req.user._id;
  refund.reviewedAt = new Date();
  if (adminNote) refund.adminNote = adminNote;

  // Process Razorpay refund if applicable
  if (order && order.paymentMethod === 'razorpay' && order.paymentId) {
    try {
      const auth = await getRazorpayAuth(order.tenant || req.tenant?._id);
      const { data } = await httpRequest({
        url: `https://api.razorpay.com/v1/payments/${order.paymentId}/refund`,
        headers: { Authorization: `Basic ${auth}` },
        method: 'POST',
        body: { amount: Math.round(finalAmount * 100) },
      });
      refund.razorpayRefundId = data.id;
      refund.status = 'processed';
      refund.processedAt = new Date();

      // Update order payment status
      order.paymentStatus = finalAmount >= order.total ? 'refunded' : 'partially_refunded';
      await order.save();
    } catch (err) {
      // Razorpay failed — mark as approved, admin can retry
      refund.status = 'approved';
      refund.adminNote = (refund.adminNote || '') + ` [Razorpay refund failed: ${err.message}]`;
    }
  } else {
    // COD or no payment ID — just approve (admin handles offline)
    refund.status = 'approved';
  }

  // Gift-card value is restored to the issuing card only after the refund is
  // authoritative. A provider-backed refund must be processed first; a
  // gift-card/COD refund has no external provider gate.
  if (order.giftCardAmount > 0
    && ['captured', 'debited', 'partially_refunded'].includes(order.giftCardSettlementStatus)
    && (refund.status === 'processed' || order.paymentMethod === 'gift_card' || !order.paymentId)) {
    if (order.paymentMethod === 'gift_card' || !order.paymentId) {
      refund.status = 'processed';
      refund.processedAt = new Date();
    }
    await giftCardSettlementService.reverseGiftCardForOrder({
      order,
      source: 'refund',
      amount: finalAmount,
      reason: 'Gift card amount restored after admin refund approval',
      createdBy: req.user._id,
    });
    await order.save();
  }

  await refund.save();

  if (refund.returnRequest && refund.status === 'processed') {
    await returnLifecycleService.transitionReturn({
      returnId: refund.returnRequest,
      to: 'refunded',
      tenant: order.tenant || req.tenant?._id,
      actorId: req.user._id,
      note: 'Refund processed by payment provider',
      approvedAmount: refund.approvedAmount,
      settlementConfirmed: true,
    });
  }

  res.json({ success: true, refund });
});

// @desc    Reject refund (admin)
// @route   PUT /api/admin/refunds/:id/reject
const rejectRefund = asyncHandler(async (req, res) => {
  const { adminNote } = req.body;

  const refund = await RefundRequest.findOne({ _id: req.params.id, ...tenantFilter(req) });
  if (!refund) {
    res.status(404);
    throw new Error('Refund request not found');
  }
  if (refund.status !== 'pending') {
    res.status(400);
    throw new Error(`Refund is already ${refund.status}`);
  }

  refund.status = 'rejected';
  refund.reviewedBy = req.user._id;
  refund.reviewedAt = new Date();
  if (adminNote) refund.adminNote = adminNote;

  await refund.save();

  if (refund.returnRequest) {
    const returnRequest = await ReturnRequest.findOne({ _id: refund.returnRequest, ...tenantFilter(req) }).lean();
    if (returnRequest?.status === 'requested') {
      await returnLifecycleService.transitionReturn({
        returnId: refund.returnRequest,
        to: 'rejected',
        tenant: refund.tenant || req.tenant?._id,
        actorId: req.user._id,
        note: adminNote || 'Refund request rejected',
      });
    }
  }

  res.json({ success: true, refund });
});

module.exports = { getRefunds, getRefundStats, getRefund, approveRefund, rejectRefund };
