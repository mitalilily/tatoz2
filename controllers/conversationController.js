const asyncHandler = require('express-async-handler');
const Conversation = require('../models/Conversation');

// @desc    Get all conversations (admin)
// @route   GET /api/admin/conversations
const getConversations = asyncHandler(async (req, res) => {
  const { status, category, search, page = 1, limit = 20, dateFrom, dateTo } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (category) filter.category = category;
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) filter.createdAt.$lte = new Date(dateTo);
  }

  let query = Conversation.find(filter)
    .populate('user', 'name email avatar')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));

  // If search, we need to find matching users first
  if (search) {
    const User = require('../models/User');
    const users = await User.find({
      $or: [
        { name: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
      ],
    }).select('_id').lean();
    filter.user = { $in: users.map(u => u._id) };
    query = Conversation.find(filter)
      .populate('user', 'name email avatar')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
  }

  const [conversations, total] = await Promise.all([
    query.lean(),
    Conversation.countDocuments(filter),
  ]);

  // Add message count to each conversation
  const results = conversations.map(c => ({
    ...c,
    messageCount: c.messages?.length || 0,
    messages: undefined, // Don't send full messages in list
  }));

  res.json({
    success: true,
    conversations: results,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

// @desc    Get single conversation (admin)
// @route   GET /api/admin/conversations/:id
const getConversation = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id)
    .populate('user', 'name email avatar phone')
    .populate('escalation.resolvedBy', 'name email')
    .lean();

  if (!conversation) {
    res.status(404);
    throw new Error('Conversation not found');
  }

  res.json({ success: true, conversation });
});

// @desc    Update conversation (admin) — resolve, add notes
// @route   PUT /api/admin/conversations/:id
const updateConversation = asyncHandler(async (req, res) => {
  const { status, adminNotes } = req.body;

  const conversation = await Conversation.findById(req.params.id);
  if (!conversation) {
    res.status(404);
    throw new Error('Conversation not found');
  }

  if (status) conversation.status = status;

  if (adminNotes !== undefined) {
    conversation.escalation.adminNotes = adminNotes;
  }

  if (status === 'resolved' && conversation.escalation?.reason) {
    conversation.escalation.resolvedBy = req.user._id;
    conversation.escalation.resolvedAt = new Date();
  }

  await conversation.save();

  res.json({ success: true, conversation });
});

// @desc    Get conversation analytics (admin)
// @route   GET /api/admin/conversations/analytics
const getAnalytics = asyncHandler(async (req, res) => {
  const { dateFrom, dateTo } = req.query;

  const dateFilter = {};
  if (dateFrom || dateTo) {
    dateFilter.createdAt = {};
    if (dateFrom) dateFilter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) dateFilter.createdAt.$lte = new Date(dateTo);
  }

  const [stats] = await Conversation.aggregate([
    { $match: dateFilter },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        totalCredits: { $sum: '$creditsCost' },
        avgMessages: { $avg: { $size: '$messages' } },
        escalated: { $sum: { $cond: [{ $eq: ['$status', 'escalated'] }, 1, 0] } },
        active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
        resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
      },
    },
  ]);

  const byCategory = await Conversation.aggregate([
    { $match: dateFilter },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
  ]);

  const defaults = { total: 0, totalCredits: 0, avgMessages: 0, escalated: 0, active: 0, resolved: 0 };
  const s = stats || defaults;

  res.json({
    success: true,
    analytics: {
      total: s.total,
      totalCredits: s.totalCredits,
      avgMessages: Math.round((s.avgMessages || 0) * 10) / 10,
      escalationRate: s.total > 0 ? Math.round((s.escalated / s.total) * 1000) / 10 : 0,
      byStatus: { active: s.active, resolved: s.resolved, escalated: s.escalated },
      byCategory: byCategory.map(c => ({ category: c._id, count: c.count })),
    },
  });
});

module.exports = { getConversations, getConversation, updateConversation, getAnalytics };
