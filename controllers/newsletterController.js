const asyncHandler = require('express-async-handler');
const NewsletterSubscriber = require('../models/NewsletterSubscriber');

const isEmail = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// @route POST /api/newsletter/subscribe (public)
const subscribe = asyncHandler(async (req, res) => {
  const { email, source = '' } = req.body || {};
  if (!isEmail(email)) { res.status(400); throw new Error('A valid email is required'); }
  const emailValue = email.toLowerCase().trim();
  const scope = req.tenant?._id ? { tenant: req.tenant._id } : {};
  const existing = await NewsletterSubscriber.findOne({ ...scope, email: emailValue });
  if (existing) {
    if (existing.status === 'unsubscribed') {
      existing.status = 'active';
      existing.unsubscribedAt = null;
      await existing.save();
    }
    return res.json({ success: true, alreadySubscribed: true });
  }
  await NewsletterSubscriber.create({ ...scope, email: emailValue, source: String(source || '').slice(0, 200) });
  res.status(201).json({ success: true });
});

// @route POST /api/newsletter/unsubscribe (public)
const unsubscribe = asyncHandler(async (req, res) => {
  const { email } = req.body || {};
  if (!isEmail(email)) { res.status(400); throw new Error('A valid email is required'); }
  const scope = req.tenant?._id ? { tenant: req.tenant._id } : {};
  await NewsletterSubscriber.updateOne({ ...scope, email: email.toLowerCase().trim() }, { status: 'unsubscribed', unsubscribedAt: new Date() });
  res.json({ success: true });
});

// @route GET /api/admin/newsletter (admin)
const listSubscribers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, status } = req.query;
  const filter = req.tenant?._id ? { tenant: req.tenant._id } : {};
  if (status) filter.status = status;
  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    NewsletterSubscriber.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    NewsletterSubscriber.countDocuments(filter),
  ]);
  res.json({ success: true, items, total, page: Number(page), limit: Number(limit) });
});

module.exports = { subscribe, unsubscribe, listSubscribers };
