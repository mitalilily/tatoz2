const PageVersion = require('../models/PageVersion');

function clone(value) {
  if (value == null) return value;
  if (typeof value.toObject === 'function') return value.toObject();
  return JSON.parse(JSON.stringify(value));
}

function publishedDocumentSnapshot(page) {
  if (page.publishedDocument) return clone(page.publishedDocument);
  return {
    title: page.title || '',
    slug: page.slug || '/',
    publicSlug: page.publicSlug || '',
    layout: clone(page.publishedLayout || { sections: [] }),
    mobileLayout: clone(page.publishedMobileLayout || null),
    mobileLayoutMode: page.mobileLayoutMode || 'auto',
    seo: clone(page.seo || {}),
    pageSettings: clone(page.pageSettings || {}),
  };
}

function draftDocumentSnapshot(page) {
  return {
    title: page.title || '',
    slug: page.slug || '/',
    publicSlug: page.publicSlug || '',
    layout: clone(page.draftLayout || { sections: [] }),
    mobileLayout: page.mobileLayoutMode === 'separate' ? clone(page.mobileLayout || null) : null,
    mobileLayoutMode: page.mobileLayoutMode || 'auto',
    seo: clone(page.seo || {}),
    pageSettings: clone(page.pageSettings || {}),
  };
}

function publishPageDocument(page) {
  page.publishedDocument = draftDocumentSnapshot(page);
  page.publishedLayout = page.publishedDocument.layout;
  page.publishedMobileLayout = page.publishedDocument.mobileLayout;
  return page;
}

async function createPageVersion(page, { userId = null, changeNote = '', publishedAt } = {}) {
  return PageVersion.create({
    pageId: page._id,
    layoutSnapshot: clone(page.publishedLayout || { sections: [] }),
    mobileLayoutSnapshot: clone(page.publishedMobileLayout || null),
    documentSnapshot: publishedDocumentSnapshot(page),
    publishedAt: publishedAt || undefined,
    publishedBy: userId || null,
    changeNote: String(changeNote || '').trim().slice(0, 500),
  });
}

function applyPageVersion(page, version) {
  const document = version.documentSnapshot && typeof version.documentSnapshot === 'object'
    ? version.documentSnapshot
    : null;
  const publishedLayout = document?.layout || version.layoutSnapshot || { sections: [] };
  const publishedMobileLayout = document && Object.prototype.hasOwnProperty.call(document, 'mobileLayout')
    ? document.mobileLayout
    : (version.mobileLayoutSnapshot || null);

  page.publishedLayout = publishedLayout;
  page.publishedMobileLayout = publishedMobileLayout || null;
  page.publishedDocument = document || {
    title: page.title || '',
    slug: page.slug || '/',
    publicSlug: page.publicSlug || '',
    layout: publishedLayout,
    mobileLayout: publishedMobileLayout || null,
    mobileLayoutMode: page.mobileLayoutMode || 'auto',
    seo: page.seo || {},
    pageSettings: page.pageSettings || {},
  };
  page.draftLayout = publishedLayout;
  page.mobileLayout = publishedMobileLayout || null;
  if (document?.title !== undefined) page.title = document.title;
  if (document?.slug !== undefined) page.slug = document.slug;
  if (document?.publicSlug !== undefined) page.publicSlug = document.publicSlug;
  if (document?.mobileLayoutMode !== undefined) page.mobileLayoutMode = document.mobileLayoutMode;
  if (document?.seo !== undefined) page.seo = document.seo;
  if (document?.pageSettings !== undefined) page.pageSettings = document.pageSettings;
  page.status = 'published';
  return page;
}

module.exports = { clone, publishedDocumentSnapshot, draftDocumentSnapshot, publishPageDocument, createPageVersion, applyPageVersion };
