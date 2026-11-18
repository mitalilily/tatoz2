const asyncHandler = require('express-async-handler');
const ProductQuestion = require('../models/ProductQuestion');
const Product = require('../models/Product');
const { addApprovedProductFilter } = require('../services/productApprovalService');

// ─── Customer Endpoints ────────────────────────────────────────

// @desc    Get questions for a product
// @route   GET /api/products/:slug/questions
const getQuestions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const productQuery = { slug: req.params.slug, ...(req.tenant ? { tenant: req.tenant._id } : {}) };
  addApprovedProductFilter(productQuery);
  const product = await Product.findOne(productQuery).select('_id');
  if (!product) { res.status(404); throw new Error('Product not found'); }

  const [questions, total] = await Promise.all([
    ProductQuestion.find({ product: product._id, status: 'active' })
      .populate('user', 'name')
      .populate('answers.user', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean(),
    ProductQuestion.countDocuments({ product: product._id, status: 'active' }),
  ]);

  res.json({ success: true, questions, pagination: { page: Number(page), total, pages: Math.ceil(total / limit) } });
});

// @desc    Ask a question
// @route   POST /api/products/:slug/questions
const askQuestion = asyncHandler(async (req, res) => {
  const { question } = req.body;
  if (!question || !question.trim()) { res.status(400); throw new Error('Question is required'); }

  const productQuery = { slug: req.params.slug, ...(req.tenant ? { tenant: req.tenant._id } : {}) };
  addApprovedProductFilter(productQuery);
  const product = await Product.findOne(productQuery).select('_id');
  if (!product) { res.status(404); throw new Error('Product not found'); }

  const q = await ProductQuestion.create({ product: product._id, user: req.user._id, question: question.trim() });
  res.status(201).json({ success: true, question: q });
});

// @desc    Answer a question
// @route   POST /api/products/:slug/questions/:qId/answer
const answerQuestion = asyncHandler(async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) { res.status(400); throw new Error('Answer text is required'); }

  const q = await ProductQuestion.findById(req.params.qId);
  if (!q) { res.status(404); throw new Error('Question not found'); }

  const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
  q.answers.push({ user: req.user._id, isAdmin, text: text.trim() });
  await q.save();

  res.status(201).json({ success: true, question: q });
});

// ─── Admin Endpoints ───────────────────────────────────────────

// @desc    Get all questions (admin)
// @route   GET /api/admin/questions
const getAdminQuestions = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (status) filter.status = status;

  const [questions, total] = await Promise.all([
    ProductQuestion.find(filter)
      .populate('product', 'title slug thumbnail')
      .populate('user', 'name email')
      .populate('answers.user', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean(),
    ProductQuestion.countDocuments(filter),
  ]);

  res.json({ success: true, questions, pagination: { page: Number(page), total, pages: Math.ceil(total / limit) } });
});

// @desc    Update question (admin)
// @route   PUT /api/admin/questions/:id
const updateQuestion = asyncHandler(async (req, res) => {
  const { status, answerText } = req.body;
  const q = await ProductQuestion.findById(req.params.id);
  if (!q) { res.status(404); throw new Error('Question not found'); }

  if (status) q.status = status;
  if (answerText?.trim()) {
    q.answers.push({ user: req.user._id, isAdmin: true, text: answerText.trim() });
  }
  await q.save();
  res.json({ success: true, question: q });
});

// @desc    Delete question (admin)
// @route   DELETE /api/admin/questions/:id
const deleteQuestion = asyncHandler(async (req, res) => {
  await ProductQuestion.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'Question deleted' });
});

module.exports = { getQuestions, askQuestion, answerQuestion, getAdminQuestions, updateQuestion, deleteQuestion };
