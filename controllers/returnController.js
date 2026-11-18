const asyncHandler = require('express-async-handler');
const ReturnRequest = require('../models/ReturnRequest');
const Order = require('../models/Order');
const User = require('../models/User');
const { parsePagination } = require('../utils/pagination');
const returnLifecycleService = require('../services/returnLifecycleService');
const { tenantScope, isGlobalAdmin } = require('../services/adminTenantScope');

const tenantFilter = req => tenantScope(req);

const saveImages = async files => {
  if (!Array.isArray(files) || files.length === 0) return [];
  const { saveFileToDisk } = require('../middleware/upload');
  const path = require('path');
  const images = [];
  for (const file of files) {
    const ext = path.extname(file.originalname) || '.jpg';
    const result = await saveFileToDisk(file.buffer, { ext, originalname: file.originalname, mimetype: file.mimetype });
    images.push({ url: result.url, publicId: result.filename });
  }
  return images;
};

// @desc    Create a customer return/replacement request
// @route   POST /api/orders/:id/returns
const createCustomerReturn = asyncHandler(async (req, res) => {
  const { type, reason, description, items } = req.body || {};
  const images = await saveImages(req.files);
  const result = await returnLifecycleService.createReturnRequest({
    orderId: req.params.id,
    userId: req.user._id,
    tenant: req.tenant?._id,
    type: type || 'return',
    reason,
    description,
    items,
    images,
  });

  res.status(201).json({
    success: true,
    message: 'Return request submitted for review',
    returnRequest: result.request,
    order: result.order,
  });
});

// @desc    Get return requests for one customer order
// @route   GET /api/orders/:id/returns
const getCustomerReturns = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, user: req.user._id, ...tenantFilter(req) }).select('_id');
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }
  const returns = await ReturnRequest.find({ order: order._id, user: req.user._id, ...tenantFilter(req) })
    .sort({ createdAt: -1 })
    .lean();
  res.json({ success: true, returns });
});

// @desc    List return requests (admin)
// @route   GET /api/admin/returns
const getReturns = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const { status, type, search } = req.query || {};
  const filter = { ...tenantFilter(req) };
  if (status) filter.status = status;
  if (type) filter.type = type;
  if (search) {
    const safeSearch = String(search).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const [orders, users] = await Promise.all([
      Order.find({ ...tenantFilter(req), orderNumber: { $regex: safeSearch, $options: 'i' } }).select('_id').lean(),
      User.find({ $or: [{ name: { $regex: safeSearch, $options: 'i' } }, { email: { $regex: safeSearch, $options: 'i' } }] }).select('_id').lean(),
    ]);
    filter.$or = [
      { requestNumber: { $regex: safeSearch, $options: 'i' } },
      { order: { $in: orders.map(item => item._id) } },
      { user: { $in: users.map(item => item._id) } },
    ];
  }

  const [returns, total] = await Promise.all([
    ReturnRequest.find(filter)
      .populate('order', 'orderNumber orderStatus paymentStatus total createdAt')
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ReturnRequest.countDocuments(filter),
  ]);
  res.json({ success: true, returns, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

// @desc    Get one return request (admin)
// @route   GET /api/admin/returns/:id
const getReturn = asyncHandler(async (req, res) => {
  const request = await ReturnRequest.findOne({ _id: req.params.id, ...tenantFilter(req) })
    .populate('order')
    .populate('user', 'name email phone')
    .populate('reviewedBy', 'name email');
  if (!request) {
    res.status(404);
    throw new Error('Return request not found');
  }
  res.json({ success: true, returnRequest: request });
});

// @desc    Move an RMA through its controlled state machine (admin)
// @route   PUT /api/admin/returns/:id/status
const updateReturnStatus = asyncHandler(async (req, res) => {
  const { status, note, approvedAmount, trackingNumber, courierName } = req.body || {};
  let transitionTenant = req.tenant?._id;
  if (isGlobalAdmin(req)) {
    const request = await ReturnRequest.findOne({ _id: req.params.id, ...tenantScope(req) }).select('tenant');
    if (!request) {
      res.status(404);
      throw new Error('Return request not found');
    }
    transitionTenant = request.tenant;
  }
  const result = await returnLifecycleService.transitionReturn({
    returnId: req.params.id,
    to: status,
    tenant: transitionTenant,
    actorId: req.user._id,
    note,
    approvedAmount,
    trackingNumber,
    courierName,
  });
  res.json({ success: true, returnRequest: result.request, order: result.order, idempotent: result.idempotent });
});

module.exports = { createCustomerReturn, getCustomerReturns, getReturns, getReturn, updateReturnStatus };
