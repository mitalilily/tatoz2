const asyncHandler = require('express-async-handler');
const { v4: uuidv4 } = require('uuid');
const Page = require('../models/Page');
const PageVersion = require('../models/PageVersion');
const { createPageVersion, applyPageVersion, publishPageDocument } = require('../services/pageVersionService');
const { savePageWithRevision } = require('../services/pageRevisionService');
const { validateLayout } = require('../models/sectionSchemas');
const { DEFAULT_DESIGN_SYSTEM, normalizeDesignSystem } = require('../utils/pageDesignSystem');
const { getTemplateVersionSeed } = require('../services/templateVersionService');
const { makeValidationError, text } = require('../utils/settingsValidation');

const PAGE_TITLE_MAX = 120;
const PAGE_SLUG_MAX = 120;
const PAGE_SLUG_RE = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*[a-z0-9]+(?:-[a-z0-9]+)*\/?$/;

const RESERVED_SLUGS = new Set([
  'cart','checkout','login','signup','register','account','products','product',
  'categories','category','brands','brand','blog','search','wishlist','orders',
  'settings','admin','api','uploads','legal','preview','notifications','chat',
  'order-confirmation','splash','welcome','profile',
]);

function normalizeSlug(slug) {
  if (!slug) return '';
  let s = String(slug).trim().toLowerCase();
  if (s === '/') return '/';
  if (!s.startsWith('/')) s = '/' + s;
  return s.replace(/\/{2,}/g, '/').replace(/\/$/, '');
}

function ensureSlugAllowed(slug) {
  if (slug === '/') return; // homepage
  if (!slug || slug.length > PAGE_SLUG_MAX || !PAGE_SLUG_RE.test(slug)) {
    throw makeValidationError(`Slug must be a URL-safe path of at most ${PAGE_SLUG_MAX} characters`, 'PAGE_VALIDATION_ERROR', [{ field: 'slug', message: `Slug must be a URL-safe path of at most ${PAGE_SLUG_MAX} characters` }]);
  }
  const bare = slug.replace(/^\/+/, '');
  if (RESERVED_SLUGS.has(bare.split('/')[0])) {
    throw makeValidationError(`Slug "${slug}" is reserved`, 'PAGE_VALIDATION_ERROR', [{ field: 'slug', message: `Slug "${slug}" is reserved` }]);
  }
}

function normalizePageTitle(value) {
  return text(value, 'Page title', { max: PAGE_TITLE_MAX, required: true, rejectMarkup: true });
}

// @route GET /api/admin/pages
// Query:
//   search, page, limit
//   archived: 'exclude' (default) | 'only' | 'include'  — controls whether archived pages are returned
//   templates: 'exclude' (default) | 'only' | 'include'
//   kind: 'page' (default) | 'header' | 'footer' | 'chrome' (=header+footer) | 'all'
//   includeArchived: 'true'|'false' (legacy alias for archived='include'|'exclude')
const listPages = asyncHandler(async (req, res) => {
  const { search = '', page = 1, limit = 50, includeArchived, templates = 'exclude', kind = 'page' } = req.query;
  let { archived = 'exclude' } = req.query;
  if (includeArchived === 'true' && archived === 'exclude') archived = 'include';

  const filter = {};
  if (archived === 'exclude') filter.archivedAt = null;
  else if (archived === 'only') filter.archivedAt = { $ne: null };

  if (templates === 'only') filter.isTemplate = true;
  else if (templates === 'exclude') filter.isTemplate = { $ne: true };

  if (kind === 'page') filter.$and = [{ $or: [{ kind: 'page' }, { kind: { $exists: false } }] }];
  else if (kind === 'header') filter.kind = 'header';
  else if (kind === 'footer') filter.kind = 'footer';
  else if (kind === 'chrome') filter.kind = { $in: ['header', 'footer'] };
  // 'all' → no kind filter

  if (search) filter.$or = [
    { title: { $regex: search, $options: 'i' } },
    { slug: { $regex: search, $options: 'i' } },
  ];
  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    Page.find(filter).select('slug title isHomepage isTemplate kind status scheduledPublishAt archivedAt updatedAt').sort({ isHomepage: -1, updatedAt: -1 }).skip(skip).limit(Number(limit)).lean(),
    Page.countDocuments(filter),
  ]);
  res.json({ success: true, items, total, page: Number(page), limit: Number(limit) });
});

// @route GET /api/admin/pages/:id
const getPage = asyncHandler(async (req, res) => {
  const page = await Page.findById(req.params.id).lean();
  if (!page) { res.status(404); throw new Error('Page not found'); }
  res.json({ success: true, page });
});

// @route POST /api/admin/pages
// Body: { title, slug?, fromTemplateId?, fromTemplateVersionId? }
const createPage = asyncHandler(async (req, res) => {
  const { title, slug, fromTemplateId, fromTemplateVersionId } = req.body;
  const normalizedTitle = normalizePageTitle(title);
  const normalized = normalizeSlug(slug || ('/' + normalizedTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')));
  if (normalized === '/') { res.status(400); throw new Error('Cannot create homepage; it is seeded automatically'); }
  if (!normalized) throw makeValidationError('A valid slug could not be generated from the title', 'PAGE_VALIDATION_ERROR', [{ field: 'slug', message: 'Provide a valid URL-safe slug' }]);
  ensureSlugAllowed(normalized);
  const exists = await Page.findOne({ slug: normalized });
  if (exists) {
    const error = makeValidationError('A page with that slug already exists', 'PAGE_SLUG_TAKEN', [{ field: 'slug', message: 'A page with that slug already exists' }]);
    error.statusCode = 409;
    throw error;
  }

  // Optionally seed from a template
  let seedDraft = { sections: [] };
  let seedMobile = null;
  let seedMobileMode = 'auto';
  let seedSettings = { showHeader: true, showFooter: true, backgroundColor: '', designSystem: DEFAULT_DESIGN_SYSTEM };
  let seedSeo = {};
  if (fromTemplateId) {
    const template = await Page.findOne({ _id: fromTemplateId, isTemplate: true }).lean();
    if (!template) { res.status(404); throw new Error('Template not found'); }
    const versionSeed = await getTemplateVersionSeed({ templateId: template._id, versionId: fromTemplateVersionId });
    if (fromTemplateVersionId && !versionSeed) { res.status(404); throw new Error('Template version not found'); }
    seedDraft = versionSeed?.draftLayout || template.draftLayout || { sections: [] };
    seedMobile = versionSeed?.mobileLayout || template.mobileLayout || null;
    seedMobileMode = versionSeed?.mobileLayoutMode || template.mobileLayoutMode || 'auto';
    seedSettings = versionSeed?.pageSettings || template.pageSettings || seedSettings;
    seedSeo = versionSeed?.seo || template.seo || {};
  }

  const created = await Page.create({
    title: normalizedTitle, slug: normalized, isHomepage: false, status: 'draft',
    draftLayout: seedDraft,
    mobileLayout: seedMobile,
    mobileLayoutMode: seedMobileMode,
    pageSettings: seedSettings,
    seo: seedSeo,
    updatedBy: req.user?._id || null,
  });
  res.status(201).json({ success: true, page: created.toObject() });
});

// @route PUT /api/admin/pages/:id
// Body: partial Page fields — most importantly `draftLayout`, `mobileLayout`, `seo`, `pageSettings`, `mobileLayoutMode`, `title`.
// builderRevision is an optimistic compare-and-swap token emitted by the
// Page Builder. Legacy callers may omit it; builder saves must provide it.
// Slug changes are allowed only when isHomepage === false.
const updatePage = asyncHandler(async (req, res) => {
  const page = await Page.findById(req.params.id);
  if (!page) { res.status(404); throw new Error('Page not found'); }

  const hasRevision = req.body.builderRevision != null;
  const expectedRevision = hasRevision ? Number(req.body.builderRevision) : null;
  if (hasRevision && (!Number.isInteger(expectedRevision) || expectedRevision < 0)) {
    res.status(400); throw new Error('builderRevision must be a non-negative integer');
  }

  if (req.body.title != null) page.title = normalizePageTitle(req.body.title);
  if (req.body.slug != null && !page.isHomepage && page.kind === 'page') {
    const normalized = normalizeSlug(req.body.slug);
    ensureSlugAllowed(normalized);
    if (normalized !== page.slug) {
      const dup = await Page.findOne({ slug: normalized, _id: { $ne: page._id } });
      if (dup) {
        const error = makeValidationError('Another page already uses that slug', 'PAGE_SLUG_TAKEN', [{ field: 'slug', message: 'Another page already uses that slug' }]);
        error.statusCode = 409;
        throw error;
      }
      page.slug = normalized;
    }
  }
  if (req.body.draftLayout) page.draftLayout = validateLayout(req.body.draftLayout);
  if (req.body.mobileLayout !== undefined) {
    page.mobileLayout = req.body.mobileLayout ? validateLayout(req.body.mobileLayout) : null;
  }
  if (req.body.mobileLayoutMode != null && ['auto', 'separate'].includes(req.body.mobileLayoutMode)) {
    page.mobileLayoutMode = req.body.mobileLayoutMode;
  }
  if (req.body.seo && typeof req.body.seo === 'object') {
    page.seo = {
      metaTitle: req.body.seo.metaTitle ?? page.seo.metaTitle,
      metaDescription: req.body.seo.metaDescription ?? page.seo.metaDescription,
      ogImage: req.body.seo.ogImage ?? page.seo.ogImage,
      canonical: req.body.seo.canonical ?? page.seo.canonical,
      robots: req.body.seo.robots ?? page.seo.robots,
    };
  }
  if (req.body.pageSettings && typeof req.body.pageSettings === 'object') {
    page.pageSettings = {
      showHeader: req.body.pageSettings.showHeader ?? page.pageSettings.showHeader,
      showFooter: req.body.pageSettings.showFooter ?? page.pageSettings.showFooter,
      backgroundColor: req.body.pageSettings.backgroundColor ?? page.pageSettings.backgroundColor,
      designSystem: normalizeDesignSystem(req.body.pageSettings.designSystem, page.pageSettings.designSystem),
    };
  }
  if (typeof req.body.isTemplate === 'boolean' && !page.isHomepage) {
    page.isTemplate = req.body.isTemplate;
  }
  page.updatedBy = req.user?._id || page.updatedBy;
  if (hasRevision) {
    const currentRevision = page.builderRevision || 0;
    const revisionFilter = expectedRevision === 0
      ? { $or: [{ builderRevision: 0 }, { builderRevision: { $exists: false } }] }
      : { builderRevision: expectedRevision };
    // The revision predicate is part of the write itself. A read/check/save
    // sequence would still allow two concurrent tabs to pass the check.
    const saved = await Page.findOneAndUpdate(
      { _id: page._id, ...revisionFilter },
      {
        $set: {
          title: page.title,
          slug: page.slug,
          draftLayout: page.draftLayout,
          mobileLayout: page.mobileLayout,
          mobileLayoutMode: page.mobileLayoutMode,
          seo: page.seo,
          pageSettings: page.pageSettings,
          isTemplate: page.isTemplate,
          updatedBy: page.updatedBy,
        },
        $inc: { builderRevision: 1 },
      },
      { new: true, runValidators: true },
    );
    if (!saved) {
      const latest = await Page.findById(page._id).select('builderRevision').lean();
      if (!latest) { res.status(404); throw new Error('Page not found'); }
      return res.status(409).json({
        success: false,
        code: 'PAGE_REVISION_CONFLICT',
        message: 'This page changed in another editor. Reload the latest draft before saving again.',
        latestRevision: latest.builderRevision || 0,
      });
    }
    return res.json({ success: true, page: saved.toObject() });
  }
  const saved = await savePageWithRevision(page);
  res.json({ success: true, page: saved.toObject() });
});

// @route POST /api/admin/pages/:id/publish
const publishPage = asyncHandler(async (req, res) => {
  const page = await Page.findById(req.params.id);
  if (!page) { res.status(404); throw new Error('Page not found'); }
  // Snapshot existing publishedLayout (if any) before overwriting — guarantees rollback target exists.
  if (page.publishedLayout) {
    await createPageVersion(page, { publishedAt: page.updatedAt, userId: page.updatedBy, changeNote: req.body?.changeNote || '' });
  }
  publishPageDocument(page);
  page.status = 'published';
  page.scheduledPublishAt = null;
  page.updatedBy = req.user?._id || page.updatedBy;
  const saved = await savePageWithRevision(page, req.body?.builderRevision ?? page.builderRevision ?? 0);
  res.json({ success: true, page: saved.toObject() });
});

// @route POST /api/admin/pages/:id/discard-draft
const discardDraft = asyncHandler(async (req, res) => {
  const page = await Page.findById(req.params.id);
  if (!page) { res.status(404); throw new Error('Page not found'); }
  if (!page.publishedLayout) {
    page.draftLayout = { sections: [] };
    page.mobileLayout = null;
  } else {
    page.draftLayout = page.publishedLayout;
    page.mobileLayout = page.publishedMobileLayout || null;
  }
  if (page.publishedDocument) {
    page.title = page.publishedDocument.title ?? page.title;
    page.slug = page.publishedDocument.slug ?? page.slug;
    page.publicSlug = page.publishedDocument.publicSlug ?? page.publicSlug;
    page.mobileLayoutMode = page.publishedDocument.mobileLayoutMode || 'auto';
    page.seo = page.publishedDocument.seo || page.seo;
    page.pageSettings = page.publishedDocument.pageSettings || page.pageSettings;
  }
  const saved = await savePageWithRevision(page, req.body?.builderRevision ?? page.builderRevision ?? 0);
  res.json({ success: true, page: saved.toObject() });
});

// @route POST /api/admin/pages/:id/duplicate
const duplicatePage = asyncHandler(async (req, res) => {
  const original = await Page.findById(req.params.id).lean();
  if (!original) { res.status(404); throw new Error('Page not found'); }
  if (original.isHomepage) { res.status(400); throw new Error('Cannot duplicate the homepage'); }
  if (original.kind === 'header' || original.kind === 'footer') { res.status(400); throw new Error(`Cannot duplicate the site ${original.kind}`); }
  let baseSlug = original.slug + '-copy';
  let i = 1;
  while (await Page.findOne({ slug: baseSlug })) {
    i += 1;
    baseSlug = original.slug + '-copy-' + i;
  }
  const copy = await Page.create({
    title: original.title + ' (copy)',
    slug: baseSlug,
    isHomepage: false,
    status: 'draft',
    draftLayout: original.draftLayout || { sections: [] },
    publishedLayout: null,
    seo: original.seo,
    pageSettings: original.pageSettings,
    mobileLayoutMode: original.mobileLayoutMode,
    mobileLayout: original.mobileLayout,
    updatedBy: req.user?._id || null,
  });
  res.status(201).json({ success: true, page: copy.toObject() });
});

// @route DELETE /api/admin/pages/:id  (soft-archive)
const archivePage = asyncHandler(async (req, res) => {
  const page = await Page.findById(req.params.id);
  if (!page) { res.status(404); throw new Error('Page not found'); }
  if (page.isHomepage) { res.status(400); throw new Error('Cannot archive the homepage'); }
  if (page.kind === 'header' || page.kind === 'footer') { res.status(400); throw new Error(`Cannot archive the site ${page.kind}`); }
  page.archivedAt = new Date();
  await page.save();
  res.json({ success: true });
});

// @route POST /api/admin/pages/:id/unarchive
const unarchivePage = asyncHandler(async (req, res) => {
  const page = await Page.findById(req.params.id);
  if (!page) { res.status(404); throw new Error('Page not found'); }
  if (!page.archivedAt) { res.json({ success: true, alreadyActive: true, page: page.toObject() }); return; }
  // If a non-archived page already owns the slug, force the restored page into draft + suggest renaming.
  const slugConflict = page.slug !== '/' && await Page.findOne({ slug: page.slug, archivedAt: null, _id: { $ne: page._id } });
  if (slugConflict) {
    page.slug = page.slug + '-restored-' + Date.now();
    page.status = 'draft';
  }
  page.archivedAt = null;
  await page.save();
  res.json({ success: true, page: page.toObject() });
});

// @route DELETE /api/admin/pages/:id/permanent
// Permanently deletes the page and all its version snapshots. Cannot be undone.
const hardDeletePage = asyncHandler(async (req, res) => {
  const page = await Page.findById(req.params.id);
  if (!page) { res.status(404); throw new Error('Page not found'); }
  if (page.isHomepage) { res.status(400); throw new Error('Cannot permanently delete the homepage'); }
  if (page.kind === 'header' || page.kind === 'footer') { res.status(400); throw new Error(`Cannot permanently delete the site ${page.kind}`); }
  await PageVersion.deleteMany({ pageId: page._id });
  await page.deleteOne();
  res.json({ success: true });
});

// @route GET /api/admin/pages/:id/versions
const listVersions = asyncHandler(async (req, res) => {
  const versions = await PageVersion.find({ pageId: req.params.id })
    .select('publishedAt publishedBy changeNote createdAt')
    .sort({ publishedAt: -1 })
    .limit(50)
    .lean();
  res.json({ success: true, versions });
});

const getVersion = asyncHandler(async (req, res) => {
  const version = await PageVersion.findOne({ _id: req.params.versionId, pageId: req.params.id }).lean();
  if (!version) { res.status(404); throw new Error('Version not found'); }
  res.json({ success: true, version });
});

// @route POST /api/admin/pages/:id/rollback/:versionId
const rollbackVersion = asyncHandler(async (req, res) => {
  const page = await Page.findById(req.params.id);
  if (!page) { res.status(404); throw new Error('Page not found'); }
  const version = await PageVersion.findOne({ _id: req.params.versionId, pageId: page._id });
  if (!version) { res.status(404); throw new Error('Version not found'); }
  // Snapshot current published before rollback so the rollback itself is reversible
  if (page.publishedLayout) {
    await createPageVersion(page, { userId: req.user?._id, changeNote: 'Pre-rollback snapshot' });
  }
  applyPageVersion(page, version);
  const saved = await savePageWithRevision(page);
  res.json({ success: true, page: saved.toObject() });
});

// @route POST /api/admin/pages/:id/schedule
const schedulePublish = asyncHandler(async (req, res) => {
  const { publishAt } = req.body;
  const page = await Page.findById(req.params.id);
  if (!page) { res.status(404); throw new Error('Page not found'); }
  if (publishAt) {
    const d = new Date(publishAt);
    if (Number.isNaN(d.getTime()) || d <= new Date()) {
      res.status(400); throw new Error('publishAt must be a future date');
    }
    page.scheduledPublishAt = d;
  } else {
    page.scheduledPublishAt = null;
  }
  await page.save();
  res.json({ success: true, page: page.toObject() });
});

// @route GET /api/admin/pages/preview-token/:id  → short-lived signed token
const jwt = require('jsonwebtoken');
const previewToken = asyncHandler(async (req, res) => {
  const page = await Page.findById(req.params.id).select('_id');
  if (!page) { res.status(404); throw new Error('Page not found'); }
  const token = jwt.sign({ pageId: String(page._id), kind: 'preview' }, process.env.JWT_SECRET, { expiresIn: '24h' });
  res.json({ success: true, token });
});

// === PUBLIC ROUTES ===

// @route GET /api/pages/by-slug/:slug
const getPageBySlug = asyncHandler(async (req, res) => {
  const slug = '/' + req.params.slug.replace(/^\/+/, '');
  // Defense in depth: never serve reserved slugs as page-builder pages,
  // even if a stale Page somehow exists for one (e.g. legacy DB).
  const bare = slug.replace(/^\/+/, '').split('/')[0];
  if (RESERVED_SLUGS.has(bare)) { res.status(404); throw new Error('Page not found'); }
  const page = await Page.findOne({
    $or: [{ slug }, { 'publishedDocument.slug': slug }],
    vendor: null,
    scope: { $ne: 'vendor' },
    archivedAt: null,
    isTemplate: { $ne: true },
    kind: { $nin: ['header', 'footer'] },
  }).lean();
  if (!page) { res.status(404); throw new Error('Page not found'); }
  // Honor preview token (read draft) if provided and valid
  const token = req.query.token;
  let useDraft = false;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.kind === 'preview' && decoded.pageId === String(page._id)) useDraft = true;
    } catch (_) { /* invalid token → fall through */ }
  }
  if (!useDraft && !page.publishedLayout) {
    res.status(404); throw new Error('Page not yet published');
  }
  const published = page.publishedDocument || {
    title: page.title,
    slug: page.slug,
    layout: page.publishedLayout,
    mobileLayout: page.publishedMobileLayout,
    mobileLayoutMode: page.mobileLayoutMode,
    seo: page.seo,
    pageSettings: page.pageSettings,
  };
  if (!useDraft && published.slug !== slug) {
    res.status(404); throw new Error('Page not found');
  }
  res.json({
    success: true,
    page: {
      _id: page._id,
      slug: useDraft ? page.slug : published.slug,
      title: useDraft ? page.title : published.title,
      isHomepage: page.isHomepage,
      layout: useDraft ? page.draftLayout : published.layout,
      mobileLayout: (useDraft ? page.mobileLayoutMode : published.mobileLayoutMode) === 'separate'
        ? (useDraft ? page.mobileLayout : published.mobileLayout)
        : null,
      mobileLayoutMode: useDraft ? page.mobileLayoutMode : published.mobileLayoutMode,
      seo: useDraft ? page.seo : published.seo,
      pageSettings: useDraft ? page.pageSettings : published.pageSettings,
    },
  });
});

// @route GET /api/pages/homepage
const getHomepage = asyncHandler(async (req, res) => {
  req.params.slug = '/';
  return getPageBySlug(req, res);
});

// @route GET /api/pages/chrome/:kind   (public)
// Returns the published layout for the global header or footer chrome page.
// Returns 200 with empty layout when none is published yet (so the layout
// component can render nothing without 404 noise in the console).
const getChrome = asyncHandler(async (req, res) => {
  const kind = req.params.kind;
  if (kind !== 'header' && kind !== 'footer') { res.status(400); throw new Error('kind must be header or footer'); }
  const page = await Page.findOne({ kind, archivedAt: null }).lean();
  if (!page || !page.publishedLayout || !Array.isArray(page.publishedLayout.sections) || page.publishedLayout.sections.length === 0) {
    return res.json({ success: true, kind, layout: { sections: [] }, empty: true });
  }
  res.json({
    success: true,
    kind,
    layout: page.publishedLayout,
    empty: false,
  });
});

module.exports = {
  listPages, getPage, createPage, updatePage,
  publishPage, discardDraft, duplicatePage, archivePage, unarchivePage, hardDeletePage,
  listVersions, getVersion, rollbackVersion, schedulePublish, previewToken,
  getPageBySlug, getHomepage, getChrome,
  normalizeSlug, ensureSlugAllowed, RESERVED_SLUGS,
};
