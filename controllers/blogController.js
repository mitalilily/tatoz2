const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Blog = require('../models/Blog');
const BlogCategory = require('../models/BlogCategory');
const { createUniqueBlogSlug, createUniqueBlogCategorySlug } = require('../utils/slugify');
const { startAIUsage } = require('../services/aiUsageService');
const { AI_CREDIT_COSTS, roundCredits } = require('../config/aiCreditCosts');
const { getAIModel } = require('../services/aiService');
const { validateBlogPayload } = require('../utils/adminValidation');
const { makeValidationError } = require('../utils/settingsValidation');

const isValidObjectId = (id) => id && mongoose.Types.ObjectId.isValid(id) && String(id).length === 24;

// Helper: strip HTML tags from a string
const stripHtml = (html) => String(html || '').replace(/<[^>]*>/g, '');

const BLOG_WRITABLE_FIELDS = [
  'title', 'slug', 'content', 'excerpt', 'featuredImage', 'category', 'tags', 'status',
  'publishedAt', 'seo', 'isFeatured', 'allowComments', 'relatedProducts', 'readTime',
];

const writableBlogPayload = payload => BLOG_WRITABLE_FIELDS.reduce((result, key) => {
  if (Object.prototype.hasOwnProperty.call(payload, key)) result[key] = payload[key];
  return result;
}, {});

const assertPublishDate = (status, publishedAt) => {
  if (status === 'published' && publishedAt && new Date(publishedAt) > new Date()) {
    throw makeValidationError('Publish date cannot be in the future. Use Publish now or clear the date.', 'BLOG_PUBLISH_DATE_INVALID', [{ field: 'publishedAt', message: 'Publish date cannot be in the future' }]);
  }
};

// ============================================================
// PUBLIC ENDPOINTS
// ============================================================

// @desc    Get published blog posts (paginated, filterable)
// @route   GET /api/blog
const getPosts = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 12;
  const { category, tag, search } = req.query;

  const query = { status: 'published', publishedAt: { $lte: new Date() } };

  if (category) {
    const blogCategory = await BlogCategory.findOne({ slug: category });
    if (blogCategory) {
      query.category = blogCategory._id;
    }
  }

  if (tag) {
    query.tags = tag;
  }

  if (search) {
    query.title = { $regex: search, $options: 'i' };
  }

  const total = await Blog.countDocuments(query);
  const posts = await Blog.find(query)
    .populate('author', 'name')
    .populate('category', 'name slug')
    .sort({ isFeatured: -1, publishedAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .select('-content');

  res.json({
    success: true,
    posts,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

// @desc    Get featured blog posts
// @route   GET /api/blog/featured
const getFeaturedPosts = asyncHandler(async (req, res) => {
  const posts = await Blog.find({
    status: 'published',
    isFeatured: true,
    publishedAt: { $lte: new Date() },
  })
    .populate('author', 'name')
    .populate('category', 'name slug')
    .sort({ publishedAt: -1 })
    .limit(5)
    .select('-content');

  res.json({ success: true, posts });
});

// @desc    Get single blog post by slug
// @route   GET /api/blog/:slug
const getPostBySlug = asyncHandler(async (req, res) => {
  const post = await Blog.findOne({ slug: req.params.slug, status: 'published' })
    .populate('author', 'name')
    .populate('category', 'name slug')
    .populate('relatedProducts', 'title slug images price comparePrice');

  if (!post) {
    res.status(404);
    throw new Error('Post not found');
  }

  // Increment viewCount (fire and forget)
  Blog.findByIdAndUpdate(post._id, { $inc: { viewCount: 1 } }).exec();

  // Related posts: same category, exclude current, published, limit 3
  const relatedPosts = post.category
    ? await Blog.find({
        category: post.category._id,
        _id: { $ne: post._id },
        status: 'published',
        publishedAt: { $lte: new Date() },
      })
        .sort({ publishedAt: -1 })
        .limit(3)
        .select('-content')
        .populate('author', 'name')
    : [];

  // Previous post (published before current)
  const prevPost = await Blog.findOne({
    status: 'published',
    publishedAt: { $lt: post.publishedAt },
  })
    .sort({ publishedAt: -1 })
    .select('title slug');

  // Next post (published after current)
  const nextPost = await Blog.findOne({
    status: 'published',
    publishedAt: { $gt: post.publishedAt },
  })
    .sort({ publishedAt: 1 })
    .select('title slug');

  res.json({ success: true, post, relatedPosts, prevPost, nextPost });
});

// @desc    Get public blog categories (active only)
// @route   GET /api/blog/categories
const getPublicCategories = asyncHandler(async (req, res) => {
  const categories = await BlogCategory.find({ isActive: true }).sort({ name: 1 });
  res.json({ success: true, categories });
});

// ============================================================
// ADMIN ENDPOINTS - POSTS
// ============================================================

// @desc    Get all blog posts (admin)
// @route   GET /api/admin/blog
const getAdminPosts = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const { status, category, search } = req.query;

  const query = {};

  if (status) {
    query.status = status;
  }

  if (category) {
    query.category = category;
  }

  if (search) {
    query.title = { $regex: search, $options: 'i' };
  }

  const total = await Blog.countDocuments(query);
  const posts = await Blog.find(query)
    .populate('author', 'name')
    .populate('category', 'name')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  res.json({
    success: true,
    posts,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

// @desc    Get single blog post (admin)
// @route   GET /api/admin/blog/:id
const getAdminPost = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    res.status(404);
    throw new Error('Post not found');
  }

  const post = await Blog.findById(id)
    .populate('category', 'name slug')
    .populate('relatedProducts', 'title slug');

  if (!post) {
    res.status(404);
    throw new Error('Post not found');
  }

  res.json({ success: true, post });
});

// @desc    Create blog post (admin)
// @route   POST /api/admin/blog
const createPost = asyncHandler(async (req, res) => {
  const payload = validateBlogPayload({ ...req.body, status: req.body.status || 'draft' }, { forCreate: true });
  assertPublishDate(payload.status, payload.publishedAt);
  const { title, content, excerpt, featuredImage, category, tags, status, publishedAt, seo, isFeatured, allowComments, relatedProducts } = payload;

  const slug = await createUniqueBlogSlug(title);

  // Auto-generate excerpt if not provided
  let finalExcerpt = excerpt;
  if (!finalExcerpt && content) {
    finalExcerpt = stripHtml(content).substring(0, 160) + '...';
  }

  // Calculate read time
  let readTime = 1;
  if (content) {
    const wordCount = stripHtml(content).split(/\s+/).filter(Boolean).length;
    readTime = Math.max(1, Math.ceil(wordCount / 200));
  }

  const postData = {
    title,
    slug,
    content,
    excerpt: finalExcerpt,
    featuredImage,
    category: (category === '' || category === undefined) ? null : category,
    tags,
    status,
    publishedAt,
    seo,
    isFeatured,
    allowComments,
    relatedProducts,
    readTime,
    author: req.user._id,
  };

  // Auto-set publishedAt if publishing now
  if (status === 'published' && !publishedAt) {
    postData.publishedAt = new Date();
  }
  if (status === 'draft') postData.publishedAt = null;

  const post = await Blog.create(postData);

  res.status(201).json({ success: true, post });
});

// @desc    Update blog post (admin)
// @route   PUT /api/admin/blog/:id
const updatePost = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    res.status(404);
    throw new Error('Post not found');
  }

  const existing = await Blog.findById(id);
  if (!existing) {
    res.status(404);
    throw new Error('Post not found');
  }

  const payload = validateBlogPayload(req.body, { forCreate: false });
  const nextStatus = payload.status || existing.status;
  const nextPublishedAt = Object.prototype.hasOwnProperty.call(payload, 'publishedAt') ? payload.publishedAt : existing.publishedAt;
  assertPublishDate(nextStatus, nextPublishedAt);

  // If title changed, re-generate slug
  if (payload.title && payload.title !== existing.title) {
    payload.slug = await createUniqueBlogSlug(payload.title, existing._id);
  }

  // If content changed, recalculate readTime
  if (payload.content && payload.content !== existing.content) {
    const wordCount = stripHtml(payload.content).split(/\s+/).filter(Boolean).length;
    payload.readTime = Math.max(1, Math.ceil(wordCount / 200));

    // Auto-generate excerpt if no manual excerpt provided
    if (!payload.excerpt) {
      payload.excerpt = stripHtml(payload.content).substring(0, 160) + '...';
    }
  }

  // If status changing to published from non-published and no publishedAt
  if (nextStatus === 'published' && existing.status !== 'published' && !payload.publishedAt) {
    payload.publishedAt = new Date();
  }

  // Handle empty category
  if (payload.category === '' || payload.category === undefined) {
    payload.category = null;
  }
  if (nextStatus === 'draft') payload.publishedAt = null;

  const post = await Blog.findByIdAndUpdate(id, writableBlogPayload(payload), { new: true, runValidators: true, context: 'query' });

  res.json({ success: true, post });
});

// @desc    Delete blog post (admin)
// @route   DELETE /api/admin/blog/:id
const deletePost = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    res.status(404);
    throw new Error('Post not found');
  }

  const post = await Blog.findById(id);
  if (!post) {
    res.status(404);
    throw new Error('Post not found');
  }

  await post.deleteOne();

  res.json({ success: true, message: 'Post deleted' });
});

// ============================================================
// ADMIN ENDPOINTS - BLOG CATEGORIES
// ============================================================

// @desc    Get all blog categories (admin)
// @route   GET /api/admin/blog/categories
const getAdminBlogCategories = asyncHandler(async (req, res) => {
  const categories = await BlogCategory.find().sort({ name: 1 });
  res.json({ success: true, categories });
});

// @desc    Create blog category (admin)
// @route   POST /api/admin/blog/categories
const createBlogCategory = asyncHandler(async (req, res) => {
  const { name, description, image } = req.body;
  const slug = await createUniqueBlogCategorySlug(name);

  const category = await BlogCategory.create({ name, slug, description, image });

  res.status(201).json({ success: true, category });
});

// @desc    Update blog category (admin)
// @route   PUT /api/admin/blog/categories/:id
const updateBlogCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    res.status(404);
    throw new Error('Blog category not found');
  }

  const existing = await BlogCategory.findById(id);
  if (!existing) {
    res.status(404);
    throw new Error('Blog category not found');
  }

  if (req.body.name && req.body.name !== existing.name) {
    req.body.slug = await createUniqueBlogCategorySlug(req.body.name, existing._id);
  }

  const category = await BlogCategory.findByIdAndUpdate(id, req.body, { new: true });

  res.json({ success: true, category });
});

// @desc    Delete blog category (admin)
// @route   DELETE /api/admin/blog/categories/:id
const deleteBlogCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    res.status(404);
    throw new Error('Blog category not found');
  }

  const category = await BlogCategory.findById(id);
  if (!category) {
    res.status(404);
    throw new Error('Blog category not found');
  }

  // Unset category on all posts using this category
  await Blog.updateMany({ category: id }, { $unset: { category: 1 } });

  await category.deleteOne();

  res.json({ success: true, message: 'Blog category deleted' });
});

// @desc    AI-generate a full blog post from a topic
// @route   POST /api/admin/blog/ai-generate
const aiGenerateBlogPost = asyncHandler(async (req, res) => {
  const { topic } = req.body;
  if (!topic || !topic.trim()) {
    res.status(400);
    throw new Error('Topic is required');
  }

  const Settings = require('../models/Settings');
  const AI_CREDIT_COST = AI_CREDIT_COSTS.blog;
  const model = await getAIModel();
  const usage = startAIUsage(req, { feature: 'blog', action: 'generate_blog_post', credits: AI_CREDIT_COST, model, metadata: { topicLength: topic.trim().length } });

  // Check and deduct AI credits
  const credits = Number(await Settings.get('ai_credits', 0));
  if (credits < AI_CREDIT_COST) {
    res.status(402);
    await usage.finish({ status: 'rejected', error: `Insufficient AI credits. Need ${AI_CREDIT_COST}` });
    throw new Error(`Insufficient AI credits. You have ${credits} credits but need ${AI_CREDIT_COST}. Please top up.`);
  }
  await Settings.set('ai_credits', roundCredits(credits - AI_CREDIT_COST), 'ai');
  usage.charge(AI_CREDIT_COST);

  let aiContent;
  try {
    const { generateBlogPost } = require('../services/aiService');
    aiContent = await generateBlogPost(topic.trim());
    await usage.finish();
  } catch (err) {
    // Refund credits on AI failure
    const current = Number(await Settings.get('ai_credits', 0));
    await Settings.set('ai_credits', roundCredits(current + AI_CREDIT_COST), 'ai');
    usage.refund(AI_CREDIT_COST);
    await usage.finish({ status: 'failed', error: err.message });
    throw err;
  }

  // Create the blog post as a draft
  const slug = await createUniqueBlogSlug(aiContent.title || topic);

  let excerpt = aiContent.excerpt;
  if (!excerpt && aiContent.content) {
    excerpt = stripHtml(aiContent.content).substring(0, 160) + '...';
  }

  let readTime = 1;
  if (aiContent.content) {
    const wordCount = stripHtml(aiContent.content).split(/\s+/).filter(Boolean).length;
    readTime = Math.max(1, Math.ceil(wordCount / 200));
  }

  const post = await Blog.create({
    title: aiContent.title || topic,
    slug,
    content: aiContent.content || '',
    excerpt,
    tags: aiContent.tags || [],
    seo: aiContent.seo || {},
    isFeatured: aiContent.isFeatured || false,
    allowComments: aiContent.allowComments !== false,
    readTime,
    status: 'draft',
    author: req.user._id,
  });

  const remainingCredits = Number(await Settings.get('ai_credits', 0));

  res.status(201).json({
    success: true,
    post,
    remainingCredits,
    aiCredits: remainingCredits,
  });
});

module.exports = {
  getPosts,
  getFeaturedPosts,
  getPostBySlug,
  getPublicCategories,
  getAdminPosts,
  getAdminPost,
  createPost,
  updatePost,
  deletePost,
  getAdminBlogCategories,
  createBlogCategory,
  updateBlogCategory,
  deleteBlogCategory,
  aiGenerateBlogPost,
};
