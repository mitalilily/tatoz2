const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Review = require('../models/Review');
const ReviewReport = require('../models/ReviewReport');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { addApprovedProductFilter } = require('../services/productApprovalService');
const { tenantScope } = require('../services/adminTenantScope');
const { optionalTenantFilter } = require('../services/publicScope');

const scopeFilter = req => (req.tenant ? { tenant: req.tenant._id } : { tenant: { $exists: false } });
const adminReviewScope = req => tenantScope(req);
const boundedList = (value, limit) => (Array.isArray(value) ? value : [])
  .map(item => String(item || '').trim())
  .filter(item => /^https?:\/\//i.test(item) || item.startsWith('/uploads/'))
  .slice(0, limit);

const recalculateProductRatings = async ({ productId, req }) => {
  const stats = await Review.aggregate([
    { $match: { product: new mongoose.Types.ObjectId(productId), status: 'approved', ...adminReviewScope(req) } },
    { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  await Product.updateOne(
    { _id: productId, ...adminReviewScope(req) },
    { $set: { ratings: { average: stats[0] ? Math.round(stats[0].average * 10) / 10 : 0, count: stats[0]?.count || 0 } } },
  );
  return stats[0] || { average: 0, count: 0 };
};

// @desc    Create review
// @route   POST /api/reviews
const createReview = asyncHandler(async (req, res) => {
  const { product, rating, title, comment, images, videos } = req.body || {};
  const numericRating = Number(rating);
  if (!mongoose.isValidObjectId(product)) { res.status(400); throw new Error('A valid product is required'); }
  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) { res.status(400); throw new Error('Rating must be between 1 and 5'); }
  if (!String(comment || '').trim()) { res.status(400); throw new Error('Review comment is required'); }
  if (String(comment).trim().length > 5000) { res.status(400); throw new Error('Review comment must be 5000 characters or fewer'); }

  const productQuery = { _id: product, ...(req.tenant ? { tenant: req.tenant._id } : {}) };
  addApprovedProductFilter(productQuery);
  const productDoc = await Product.findOne(productQuery).select('_id tenant');
  if (!productDoc) { res.status(404); throw new Error('Product not found'); }
  const existingReview = await Review.findOne({ product, user: req.user._id, ...scopeFilter(req) });
  if (existingReview) { res.status(409); throw new Error('You have already reviewed this product'); }

  const order = await Order.findOne({
    user: req.user._id,
    ...(req.tenant ? { tenant: req.tenant._id } : {}),
    'items.product': product,
    orderStatus: 'delivered',
  }).sort({ deliveredAt: -1, createdAt: -1 }).select('_id deliveredAt');

  const review = await Review.create({
    tenant: req.tenant?._id,
    product,
    user: req.user._id,
    order: order?._id,
    rating: numericRating,
    title: String(title || '').trim().slice(0, 160),
    comment: String(comment).trim().slice(0, 5000),
    images: boundedList(images, 6),
    videos: boundedList(videos, 2),
    isVerifiedPurchase: Boolean(order),
    verifiedAt: order ? (order.deliveredAt || new Date()) : undefined,
    status: 'pending',
  });
  await review.populate('user', 'name avatar');
  res.status(201).json({ success: true, review });
});

// @desc    Get product reviews
// @route   GET /api/reviews/product/:productId
const getProductReviews = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, sort = 'newest' } = req.query;
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 10));
  const productId = mongoose.isValidObjectId(req.params.productId) ? new mongoose.Types.ObjectId(req.params.productId) : req.params.productId;
  // Public reads stay tenant-agnostic when no tenant resolved (same as the
  // product catalogue) so genuine reviews are visible on every storefront host.
  const filter = { product: productId, status: 'approved', ...optionalTenantFilter(req.tenant) };
  const sortOptions = { newest: { createdAt: -1 }, highest: { rating: -1 }, lowest: { rating: 1 }, helpful: { helpful: -1, createdAt: -1 } };
  const [total, reviews, stats] = await Promise.all([
    Review.countDocuments(filter),
    Review.find(filter)
      .populate('user', 'name avatar')
      .sort(sortOptions[sort] || sortOptions.newest)
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    Review.aggregate([
      { $match: filter },
      { $group: {
        _id: null,
        average: { $avg: '$rating' },
        total: { $sum: 1 },
        five: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
        four: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
        three: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
        two: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
        one: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
      } },
    ]),
  ]);
  res.json({ success: true, reviews, stats: stats[0] || { average: 0, total: 0, five: 0, four: 0, three: 0, two: 0, one: 0 }, pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) } });
});

const findScopedReview = (req, id) => Review.findOne({ _id: id, ...scopeFilter(req) });
const findAdminScopedReview = (req, id) => Review.findOne({ _id: id, ...adminReviewScope(req) });

// @desc    Toggle a helpful vote
// @route   POST /api/reviews/:id/helpful
const markHelpful = asyncHandler(async (req, res) => {
  const review = await findScopedReview(req, req.params.id);
  if (!review) { res.status(404); throw new Error('Review not found'); }
  const voter = String(req.user._id);
  const alreadyVoted = review.helpfulVotes.some(id => String(id) === voter);
  review.helpfulVotes = alreadyVoted
    ? review.helpfulVotes.filter(id => String(id) !== voter)
    : [...review.helpfulVotes, req.user._id];
  review.helpful = review.helpfulVotes.length;
  await review.save();
  res.json({ success: true, helpful: review.helpful, voted: !alreadyVoted });
});

// @desc    Report a review
// @route   POST /api/reviews/:id/report
const reportReview = asyncHandler(async (req, res) => {
  if (!req.tenant) { res.status(400); throw new Error('Tenant context is required to report a review'); }
  const review = await findScopedReview(req, req.params.id);
  if (!review) { res.status(404); throw new Error('Review not found'); }
  const reason = String(req.body?.reason || '').trim().slice(0, 120);
  if (!reason) { res.status(400); throw new Error('Report reason is required'); }
  const details = String(req.body?.details || '').trim().slice(0, 500);
  const existing = await ReviewReport.findOne({ tenant: req.tenant?._id, review: review._id, reporter: req.user._id });
  if (existing) return res.json({ success: true, report: existing, idempotent: true });
  const report = await ReviewReport.create({ tenant: req.tenant?._id, review: review._id, product: review.product, reporter: req.user._id, reason, details });
  res.status(201).json({ success: true, report, idempotent: false });
});

// @desc    Get all reviews (admin)
// @route   GET /api/admin/reviews
const getAllReviews = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const query = { ...adminReviewScope(req) };
  if (status) query.status = status;
  const [total, reviews] = await Promise.all([
    Review.countDocuments(query),
    Review.find(query).populate('user', 'name email').populate('product', 'title thumbnail').sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit),
  ]);
  res.json({ success: true, reviews, pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) } });
});

// @desc    Update review moderation/reply (admin)
// @route   PUT /api/admin/reviews/:id
const updateReview = asyncHandler(async (req, res) => {
  const { status, adminReply } = req.body || {};
  if (status !== undefined && !['pending', 'approved', 'rejected'].includes(status)) { res.status(400); throw new Error('Invalid review status'); }
  const review = await findAdminScopedReview(req, req.params.id);
  if (!review) { res.status(404); throw new Error('Review not found'); }
  if (status !== undefined) review.status = status;
  if (adminReply !== undefined) {
    const normalizedReply = String(adminReply || '').trim();
    if (!normalizedReply) { res.status(400); const error = new Error('Review reply is required'); error.publicCode = 'REVIEW_REPLY_REQUIRED'; throw error; }
    if (normalizedReply.length > 2000) { res.status(400); const error = new Error('Review reply must be 2000 characters or fewer'); error.publicCode = 'REVIEW_REPLY_TOO_LONG'; throw error; }
    review.adminReply = normalizedReply;
    review.adminReplyAt = review.adminReply ? new Date() : null;
  }
  await review.save();
  await recalculateProductRatings({ productId: review.product, req });
  await review.populate('user', 'name');
  await review.populate('product', 'title');
  res.json({ success: true, review });
});

const getReviewReports = asyncHandler(async (req, res) => {
  if (!req.tenant) { res.status(400); throw new Error('Tenant context is required to list review reports'); }
  const { page = 1, limit = 20, status } = req.query;
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const filter = { ...adminReviewScope(req) };
  if (status) filter.status = status;
  const [total, reports] = await Promise.all([
    ReviewReport.countDocuments(filter),
    ReviewReport.find(filter)
      .populate('review', 'rating title comment status')
      .populate('product', 'title thumbnail')
      .populate('reporter', 'name email')
      .sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean(),
  ]);
  res.json({ success: true, reports, pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) } });
});

const updateReviewReport = asyncHandler(async (req, res) => {
  if (!req.tenant) { res.status(400); throw new Error('Tenant context is required to update a review report'); }
  const { status, resolutionNote } = req.body || {};
  if (!['open', 'reviewed', 'dismissed', 'actioned'].includes(status)) { res.status(400); throw new Error('Invalid report status'); }
  const report = await ReviewReport.findOne({ _id: req.params.id, ...adminReviewScope(req) });
  if (!report) { res.status(404); throw new Error('Review report not found'); }
  report.status = status;
  report.resolutionNote = String(resolutionNote || '').trim().slice(0, 500);
  report.resolvedBy = req.user._id;
  report.resolvedAt = new Date();
  await report.save();
  if (status === 'actioned') {
    await Review.updateOne({ _id: report.review, ...adminReviewScope(req) }, { $set: { status: 'rejected' } });
    await recalculateProductRatings({ productId: report.product, req });
  }
  res.json({ success: true, report });
});

module.exports = { createReview, getProductReviews, markHelpful, reportReview, getAllReviews, updateReview, getReviewReports, updateReviewReport };
