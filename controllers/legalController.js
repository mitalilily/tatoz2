const asyncHandler = require('express-async-handler');
const LegalPage = require('../models/LegalPage');

const DEFAULT_PAGES = [
  { slug: 'returns-refunds', title: 'Returns & Refunds' },
  { slug: 'faq', title: 'FAQ' },
  { slug: 'privacy-policy', title: 'Privacy Policy' },
  { slug: 'terms-of-service', title: 'Terms of Service' },
  { slug: 'shipping-policy', title: 'Shipping Policy' },
];

// Ensure all default pages exist
async function ensureDefaults() {
  for (const page of DEFAULT_PAGES) {
    await LegalPage.findOneAndUpdate(
      { slug: page.slug },
      { $setOnInsert: page },
      { upsert: true }
    );
  }
}

// @desc    Get all legal pages (admin)
// @route   GET /api/admin/legal-pages
const getAllLegalPages = asyncHandler(async (req, res) => {
  await ensureDefaults();
  const pages = await LegalPage.find().sort({ title: 1 }).populate('updatedBy', 'name');
  res.json({ success: true, pages });
});

// @desc    Update a legal page (admin)
// @route   PUT /api/admin/legal-pages/:slug
const updateLegalPage = asyncHandler(async (req, res) => {
  const { title, content, isActive } = req.body;
  const page = await LegalPage.findOneAndUpdate(
    { slug: req.params.slug },
    { title, content, isActive, updatedBy: req.user._id },
    { new: true }
  );
  if (!page) {
    res.status(404);
    throw new Error('Legal page not found');
  }
  res.json({ success: true, page });
});

// @desc    Get a legal page by slug (public)
// @route   GET /api/legal/:slug
const getLegalPage = asyncHandler(async (req, res) => {
  const page = await LegalPage.findOne({ slug: req.params.slug, isActive: true });
  if (!page) {
    res.status(404);
    throw new Error('Page not found');
  }
  res.json({ success: true, page });
});

module.exports = { getAllLegalPages, updateLegalPage, getLegalPage };
