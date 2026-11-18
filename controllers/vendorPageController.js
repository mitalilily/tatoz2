const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const Page = require('../models/Page');
const PageVersion = require('../models/PageVersion');
const { createPageVersion, applyPageVersion, publishPageDocument } = require('../services/pageVersionService');
const { savePageWithRevision } = require('../services/pageRevisionService');
const { validateLayout } = require('../models/sectionSchemas');
const { normalizeSlug, ensureSlugAllowed } = require('./pageController');
const { DEFAULT_DESIGN_SYSTEM, normalizeDesignSystem } = require('../utils/pageDesignSystem');
const { getTemplateVersionSeed } = require('../services/templateVersionService');

function requirePageBuilder(req, res) {
  if (req.vendor?.features?.pageBuilder === false) {
    res.status(403);
    throw new Error('Page Builder access is disabled for this vendor account');
  }
}

function requireSeoAccess(req, res, body = {}) {
  if (body.seo && req.vendor?.features?.seo === false) {
    res.status(403);
    throw new Error('SEO access is disabled for this vendor account');
  }
}

function normalizePublicSlug(value) {
  const normalized = normalizeSlug(value || '/');
  ensureSlugAllowed(normalized);
  return normalized;
}

function internalSlug(vendorId, publicSlug) {
  const suffix = publicSlug === '/' ? '/home' : publicSlug;
  return `/_vendor/${String(vendorId)}${suffix}`.toLowerCase();
}

function pageFilter(req, extra = {}) {
  return { vendor: req.vendor._id, scope: 'vendor', kind: 'page', ...extra };
}

function landingPageFilter(req, extra = {}) {
  return pageFilter(req, { ...extra, $or: [{ isStorefrontHome: true }, { publicSlug: '/' }] });
}

function rejectMultiPageAction(res) {
  res.status(403);
  throw new Error('Vendors can only manage their single store landing page');
}

function shapePage(page) {
  const result = page.toObject ? page.toObject() : page;
  return {
    ...result,
    vendorStoreSlug: result.vendor?.slug || result.vendorStoreSlug || null,
  };
}

async function templateSeed(fromTemplateId, fromTemplateVersionId) {
  if (!fromTemplateId) return { draftLayout: { sections: [] }, mobileLayout: null, mobileLayoutMode: 'auto', pageSettings: { designSystem: DEFAULT_DESIGN_SYSTEM } };
  const template = await Page.findOne({ _id: fromTemplateId, isTemplate: true, scope: { $ne: 'vendor' } }).lean();
  if (!template) {
    const error = new Error('Template not found');
    error.status = 404;
    throw error;
  }
  const versionSeed = await getTemplateVersionSeed({ templateId: template._id, versionId: fromTemplateVersionId });
  if (fromTemplateVersionId && !versionSeed) {
    const error = new Error('Template version not found');
    error.statusCode = 404;
    throw error;
  }
  return {
    draftLayout: versionSeed?.draftLayout || template.draftLayout || { sections: [] },
    mobileLayout: versionSeed?.mobileLayout || template.mobileLayout || null,
    mobileLayoutMode: versionSeed?.mobileLayoutMode || template.mobileLayoutMode || 'auto',
    pageSettings: versionSeed?.pageSettings || template.pageSettings,
    seo: versionSeed?.seo || template.seo,
  };
}

function applyMeta(page, body, req) {
  if (body.title != null) page.title = String(body.title).trim().slice(0, 160);
  if (body.publicSlug != null) page.publicSlug = normalizePublicSlug(body.publicSlug);
  if (body.draftLayout) page.draftLayout = validateLayout(body.draftLayout);
  if (body.mobileLayout !== undefined) page.mobileLayout = body.mobileLayout ? validateLayout(body.mobileLayout) : null;
  if (body.mobileLayoutMode && ['auto', 'separate'].includes(body.mobileLayoutMode)) page.mobileLayoutMode = body.mobileLayoutMode;
  if (body.seo && typeof body.seo === 'object') {
    page.seo = {
      metaTitle: body.seo.metaTitle ?? page.seo.metaTitle,
      metaDescription: body.seo.metaDescription ?? page.seo.metaDescription,
      ogImage: body.seo.ogImage ?? page.seo.ogImage,
      canonical: body.seo.canonical ?? page.seo.canonical,
      robots: body.seo.robots ?? page.seo.robots,
    };
  }
  if (body.pageSettings && typeof body.pageSettings === 'object') {
    page.pageSettings = {
      showHeader: body.pageSettings.showHeader ?? page.pageSettings.showHeader,
      showFooter: body.pageSettings.showFooter ?? page.pageSettings.showFooter,
      backgroundColor: body.pageSettings.backgroundColor ?? page.pageSettings.backgroundColor,
      designSystem: normalizeDesignSystem(body.pageSettings.designSystem, page.pageSettings.designSystem),
    };
  }
  page.updatedBy = req.user?._id || page.updatedBy;
}

async function assertPublicSlugAvailable(vendorId, publicSlug, pageId) {
  const duplicate = await Page.findOne({
    vendor: vendorId,
    scope: 'vendor',
    publicSlug,
    _id: { $ne: pageId },
    archivedAt: null,
  }).select('_id');
  if (duplicate) {
    const error = new Error(`Another store page already uses ${publicSlug}`);
    error.status = 409;
    throw error;
  }
}

// GET /api/vendor/pages
const listVendorPages = asyncHandler(async (req, res) => {
  requirePageBuilder(req, res);
  const { page = 1, limit = 50, archived = 'exclude' } = req.query;
  const filter = landingPageFilter(req);
  if (archived === 'exclude') filter.archivedAt = null;
  if (archived === 'only') filter.archivedAt = { $ne: null };
  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    Page.find(filter)
      .select('slug publicSlug title status isStorefrontHome scheduledPublishAt archivedAt updatedAt seo pageSettings vendor scope kind')
      .populate('vendor', 'slug storeName')
      .sort({ isStorefrontHome: -1, updatedAt: -1 })
      .skip(skip).limit(Number(limit)).lean(),
    Page.countDocuments(filter),
  ]);
  res.json({ success: true, items: items.map(shapePage), total, page: Number(page), limit: Number(limit) });
});

const listVendorTemplates = asyncHandler(async (req, res) => {
  requirePageBuilder(req, res);
  const templates = await Page.find({ isTemplate: true, scope: { $ne: 'vendor' }, kind: 'page', archivedAt: null })
    .select('_id title slug updatedAt')
    .sort({ updatedAt: -1 })
    .limit(50)
    .lean();
  res.json({ success: true, items: templates });
});

// GET /api/vendor/pages/:id
const getVendorPage = asyncHandler(async (req, res) => {
  requirePageBuilder(req, res);
  const page = await Page.findOne(landingPageFilter(req, { _id: req.params.id })).populate('vendor', 'slug storeName').lean();
  if (!page) { res.status(404); throw new Error('Store page not found'); }
  res.json({ success: true, page: shapePage(page) });
});

// POST /api/vendor/pages
const createVendorPage = asyncHandler(async (req, res) => {
  requirePageBuilder(req, res);
  const { title, fromTemplateId, fromTemplateVersionId } = req.body || {};
  if (!title || !String(title).trim()) { res.status(400); throw new Error('title is required'); }
  const existingLanding = await Page.findOne(landingPageFilter(req, { archivedAt: null })).select('_id');
  if (existingLanding) {
    res.status(409);
    throw new Error('Your store landing page already exists. Edit that page instead of creating another page.');
  }
  const requested = req.body.publicSlug || '/';
  const publicSlug = normalizePublicSlug(requested);
  if (publicSlug !== '/') { res.status(400); throw new Error('A vendor store has one fixed landing page at /'); }
  const seed = await templateSeed(fromTemplateId, fromTemplateVersionId);
  const page = await Page.create({
    slug: internalSlug(req.vendor._id, publicSlug) + '-' + uuidv4().slice(0, 8),
    publicSlug,
    vendor: req.vendor._id,
    scope: 'vendor',
    title: String(title).trim().slice(0, 160),
    isHomepage: false,
    isStorefrontHome: publicSlug === '/',
    kind: 'page',
    status: 'draft',
    draftLayout: seed.draftLayout,
    mobileLayout: seed.mobileLayout,
    mobileLayoutMode: seed.mobileLayoutMode,
    pageSettings: seed.pageSettings,
    seo: seed.seo,
    updatedBy: req.user._id,
  });
  res.status(201).json({ success: true, page: shapePage(await page.populate('vendor', 'slug storeName')) });
});

// PUT /api/vendor/pages/:id
const updateVendorPage = asyncHandler(async (req, res) => {
  requirePageBuilder(req, res);
  requireSeoAccess(req, res, req.body || {});
  const page = await Page.findOne(landingPageFilter(req, { _id: req.params.id }));
  if (!page) { res.status(404); throw new Error('Store page not found'); }
  const hasRevision = req.body.builderRevision != null;
  const expectedRevision = hasRevision ? Number(req.body.builderRevision) : null;
  if (hasRevision && (!Number.isInteger(expectedRevision) || expectedRevision < 0)) {
    res.status(400); throw new Error('builderRevision must be a non-negative integer');
  }
  if (hasRevision && (page.builderRevision || 0) !== expectedRevision) {
    return res.status(409).json({
      success: false,
      code: 'PAGE_REVISION_CONFLICT',
      message: 'This page changed in another editor. Reload the latest draft before saving again.',
      latestRevision: page.builderRevision || 0,
    });
  }
  const nextPublicSlug = req.body.publicSlug != null ? normalizePublicSlug(req.body.publicSlug) : page.publicSlug;
  if (nextPublicSlug !== '/') { res.status(400); throw new Error('The store landing page URL is fixed to /'); }
  applyMeta(page, { ...req.body, publicSlug: '/' }, req);
  page.publicSlug = '/';
  page.isStorefrontHome = true;
  page.slug = internalSlug(req.vendor._id, '/') + '-' + String(page._id).slice(-8);
  const saved = await savePageWithRevision(page, hasRevision ? expectedRevision : page.builderRevision || 0);
  res.json({ success: true, page: shapePage(await saved.populate('vendor', 'slug storeName')) });
});

// POST /api/vendor/pages/:id/publish
const publishVendorPage = asyncHandler(async (req, res) => {
  requirePageBuilder(req, res);
  const page = await Page.findOne(landingPageFilter(req, { _id: req.params.id }));
  if (!page) { res.status(404); throw new Error('Store page not found'); }
  if (page.publishedLayout) {
    await createPageVersion(page, { publishedAt: page.updatedAt, userId: page.updatedBy, changeNote: req.body?.changeNote || '' });
  }
  publishPageDocument(page);
  page.publishedMobileLayout = page.mobileLayoutMode === 'separate' ? page.mobileLayout : null;
  page.status = 'published';
  page.scheduledPublishAt = null;
  page.updatedBy = req.user._id;
  const saved = await savePageWithRevision(page, req.body?.builderRevision ?? page.builderRevision ?? 0);
  res.json({ success: true, page: shapePage(await saved.populate('vendor', 'slug storeName')) });
});

const discardVendorDraft = asyncHandler(async (req, res) => {
  requirePageBuilder(req, res);
  const page = await Page.findOne(landingPageFilter(req, { _id: req.params.id }));
  if (!page) { res.status(404); throw new Error('Store page not found'); }
  page.draftLayout = page.publishedLayout || { sections: [] };
  page.mobileLayout = page.publishedMobileLayout || null;
  if (page.publishedDocument) {
    page.title = page.publishedDocument.title ?? page.title;
    page.publicSlug = page.publishedDocument.publicSlug ?? page.publicSlug;
    page.mobileLayoutMode = page.publishedDocument.mobileLayoutMode || 'auto';
    page.seo = page.publishedDocument.seo || page.seo;
    page.pageSettings = page.publishedDocument.pageSettings || page.pageSettings;
  }
  const saved = await savePageWithRevision(page, req.body?.builderRevision ?? page.builderRevision ?? 0);
  res.json({ success: true, page: shapePage(await saved.populate('vendor', 'slug storeName')) });
});

const duplicateVendorPage = asyncHandler(async (req, res) => {
  requirePageBuilder(req, res);
  rejectMultiPageAction(res);
  const original = await Page.findOne(landingPageFilter(req, { _id: req.params.id })).lean();
  if (!original) { res.status(404); throw new Error('Store page not found'); }
  let publicSlug = normalizePublicSlug(`${original.publicSlug === '/' ? '/home' : original.publicSlug}-copy`);
  let i = 1;
  while (await Page.findOne(pageFilter(req, { publicSlug, archivedAt: null }))) {
    i += 1;
    publicSlug = normalizePublicSlug(`${original.publicSlug === '/' ? '/home' : original.publicSlug}-copy-${i}`);
  }
  const copy = await Page.create({
    slug: internalSlug(req.vendor._id, publicSlug) + '-' + uuidv4().slice(0, 8), publicSlug,
    vendor: req.vendor._id, scope: 'vendor', title: `${original.title} (copy)`, kind: 'page',
    status: 'draft', draftLayout: original.draftLayout || { sections: [] },
    mobileLayout: original.mobileLayout || null, mobileLayoutMode: original.mobileLayoutMode || 'auto',
    seo: original.seo, pageSettings: original.pageSettings, updatedBy: req.user._id,
  });
  res.status(201).json({ success: true, page: shapePage(await copy.populate('vendor', 'slug storeName')) });
});

const archiveVendorPage = asyncHandler(async (req, res) => {
  requirePageBuilder(req, res);
  rejectMultiPageAction(res);
  const page = await Page.findOne(landingPageFilter(req, { _id: req.params.id }));
  if (!page) { res.status(404); throw new Error('Store page not found'); }
  page.archivedAt = new Date();
  if (page.isStorefrontHome) {
    await require('../models/Vendor').findByIdAndUpdate(req.vendor._id, { $set: { 'storefront.homepagePage': null } });
  }
  await page.save();
  res.json({ success: true });
});

const unarchiveVendorPage = asyncHandler(async (req, res) => {
  requirePageBuilder(req, res);
  rejectMultiPageAction(res);
  const page = await Page.findOne(landingPageFilter(req, { _id: req.params.id }));
  if (!page) { res.status(404); throw new Error('Store page not found'); }
  if (!page.archivedAt) return res.json({ success: true, page: shapePage(page) });
  await assertPublicSlugAvailable(req.vendor._id, page.publicSlug, page._id);
  page.archivedAt = null;
  page.status = page.publishedLayout ? 'published' : 'draft';
  await page.save();
  res.json({ success: true, page: shapePage(await page.populate('vendor', 'slug storeName')) });
});

const scheduleVendorPage = asyncHandler(async (req, res) => {
  requirePageBuilder(req, res);
  const page = await Page.findOne(landingPageFilter(req, { _id: req.params.id }));
  if (!page) { res.status(404); throw new Error('Store page not found'); }
  if (req.body.publishAt) {
    const date = new Date(req.body.publishAt);
    if (Number.isNaN(date.getTime()) || date <= new Date()) { res.status(400); throw new Error('publishAt must be a future date'); }
    page.scheduledPublishAt = date;
  } else page.scheduledPublishAt = null;
  await page.save();
  res.json({ success: true, page: shapePage(await page.populate('vendor', 'slug storeName')) });
});

const listVendorVersions = asyncHandler(async (req, res) => {
  requirePageBuilder(req, res);
  const page = await Page.findOne(landingPageFilter(req, { _id: req.params.id })).select('_id');
  if (!page) { res.status(404); throw new Error('Store page not found'); }
  const versions = await PageVersion.find({ pageId: page._id }).select('publishedAt publishedBy changeNote createdAt').sort({ publishedAt: -1 }).limit(50).lean();
  res.json({ success: true, versions });
});

const getVendorVersion = asyncHandler(async (req, res) => {
  requirePageBuilder(req, res);
  const page = await Page.findOne(landingPageFilter(req, { _id: req.params.id })).select('_id');
  if (!page) { res.status(404); throw new Error('Store page not found'); }
  const version = await PageVersion.findOne({ _id: req.params.versionId, pageId: page._id }).lean();
  if (!version) { res.status(404); throw new Error('Version not found'); }
  res.json({ success: true, version });
});

const rollbackVendorVersion = asyncHandler(async (req, res) => {
  requirePageBuilder(req, res);
  const page = await Page.findOne(landingPageFilter(req, { _id: req.params.id }));
  if (!page) { res.status(404); throw new Error('Store page not found'); }
  const version = await PageVersion.findOne({ _id: req.params.versionId, pageId: page._id });
  if (!version) { res.status(404); throw new Error('Version not found'); }
  if (page.publishedLayout) await createPageVersion(page, { userId: req.user._id, changeNote: 'Pre-rollback snapshot' });
  applyPageVersion(page, version);
  const saved = await savePageWithRevision(page);
  res.json({ success: true, page: shapePage(await saved.populate('vendor', 'slug storeName')) });
});

const vendorPreviewToken = asyncHandler(async (req, res) => {
  requirePageBuilder(req, res);
  const page = await Page.findOne(landingPageFilter(req, { _id: req.params.id })).select('_id');
  if (!page) { res.status(404); throw new Error('Store page not found'); }
  const token = jwt.sign({ pageId: String(page._id), vendorId: String(req.vendor._id), kind: 'vendor-preview' }, process.env.JWT_SECRET, { expiresIn: '24h' });
  res.json({ success: true, token });
});

// GET /api/vendors/store/:slug/page?path=/about&token=...
const getPublicStorePage = asyncHandler(async (req, res) => {
  const Vendor = require('../models/Vendor');
  const vendor = await Vendor.findOne({ slug: req.params.slug, status: 'active' }).lean();
  if (!vendor) { res.status(404); throw new Error('Store not found'); }
  const path = normalizePublicSlug(req.query.path || '/');
  if (path !== '/') { res.status(404); throw new Error('Vendor stores only expose their landing page'); }
  let page = await Page.findOne({ vendor: vendor._id, scope: 'vendor', kind: 'page', archivedAt: null, isTemplate: { $ne: true }, $or: [{ isStorefrontHome: true }, { publicSlug: '/' }] }).sort({ isStorefrontHome: -1, updatedAt: -1 }).lean();
  if (!page) { res.status(404); throw new Error('Store page not found'); }
  let useDraft = false;
  if (req.query.token) {
    try {
      const decoded = jwt.verify(req.query.token, process.env.JWT_SECRET);
      useDraft = decoded.kind === 'vendor-preview' && decoded.pageId === String(page._id) && decoded.vendorId === String(vendor._id);
    } catch (_) { /* invalid preview token falls back to published content */ }
  }
  if (!useDraft && !page.publishedLayout) { res.status(404); throw new Error('Store page not yet published'); }
  const published = page.publishedDocument || {
    title: page.title,
    publicSlug: page.publicSlug,
    layout: page.publishedLayout,
    mobileLayout: page.publishedMobileLayout,
    mobileLayoutMode: page.mobileLayoutMode,
    seo: page.seo,
    pageSettings: page.pageSettings,
  };
  res.json({ success: true, page: { _id: page._id, title: useDraft ? page.title : published.title, publicSlug: useDraft ? page.publicSlug : published.publicSlug, layout: useDraft ? page.draftLayout : published.layout, mobileLayout: (useDraft ? page.mobileLayoutMode : published.mobileLayoutMode) === 'separate' ? (useDraft ? page.mobileLayout : published.mobileLayout) : null, mobileLayoutMode: useDraft ? page.mobileLayoutMode : published.mobileLayoutMode, seo: useDraft ? page.seo : published.seo, pageSettings: useDraft ? page.pageSettings : published.pageSettings, vendor: { _id: vendor._id, storeName: vendor.storeName, slug: vendor.slug } }, preview: useDraft });
});

module.exports = {
  listVendorPages, listVendorTemplates, getVendorPage, createVendorPage, updateVendorPage,
  publishVendorPage, discardVendorDraft, duplicateVendorPage, archiveVendorPage, unarchiveVendorPage,
  scheduleVendorPage, listVendorVersions, getVendorVersion, rollbackVendorVersion, vendorPreviewToken,
  getPublicStorePage,
};
