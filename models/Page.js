const mongoose = require('mongoose');

// A single section inside a layout
const sectionSchema = new mongoose.Schema({
  id: { type: String, required: true }, // uuid
  type: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  // Keep section-level presentation settings extensible. The page builder
  // stores spacing, borders, alignment and other inspector controls here;
  // using Mixed prevents newer controls from being silently stripped by
  // Mongoose when a page is saved.
  settings: { type: mongoose.Schema.Types.Mixed, default: {} },
  responsiveOverrides: {
    // Auto-responsive overrides are kept explicitly in the schema so
    // Mongoose does not discard the tablet/mobile controls added by the
    // builder when a draft is persisted.
    tablet: { type: mongoose.Schema.Types.Mixed, default: {} },
    mobile: { type: mongoose.Schema.Types.Mixed, default: {} },
    tabletSettings: { type: mongoose.Schema.Types.Mixed, default: {} },
    mobileSettings: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
}, { _id: false });

const layoutSchema = new mongoose.Schema({
  sections: { type: [sectionSchema], default: [] },
}, { _id: false });

const pageSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
  // Vendor pages keep a globally unique internal slug for backwards
  // compatibility, while publicSlug is the path shown inside that vendor's
  // storefront (/, /about, /shipping, ...).
  publicSlug: { type: String, default: '', lowercase: true, trim: true },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null, index: true },
  scope: { type: String, enum: ['platform', 'vendor'], default: 'platform', index: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  isHomepage: { type: Boolean, default: false, index: true },
  isStorefrontHome: { type: Boolean, default: false, index: true },
  status: { type: String, enum: ['draft', 'published'], default: 'draft' },
  // Compare-and-swap token for concurrent Page Builder tabs.
  builderRevision: { type: Number, default: 0, min: 0 },

  draftLayout: { type: layoutSchema, default: () => ({ sections: [] }) },
  publishedLayout: { type: layoutSchema, default: null },
  // Immutable public document snapshot. Editable fields below may change
  // during a draft; anonymous routes must read this snapshot instead.
  publishedDocument: { type: mongoose.Schema.Types.Mixed, default: null },
  scheduledPublishAt: { type: Date, default: null, index: true },

  seo: {
    metaTitle: { type: String, default: '' },
    metaDescription: { type: String, default: '' },
    ogImage: { type: String, default: '' },
    canonical: { type: String, default: '' },
    robots: { type: String, default: 'index, follow' },
  },

  pageSettings: {
    showHeader: { type: Boolean, default: true },
    showFooter: { type: Boolean, default: true },
    backgroundColor: { type: String, default: '' },
    designSystem: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },

  mobileLayoutMode: { type: String, enum: ['auto', 'separate'], default: 'auto' },
  mobileLayout: { type: layoutSchema, default: null },
  // Immutable public mobile snapshot. The editable mobileLayout must never
  // be served to anonymous visitors while a draft is being edited.
  publishedMobileLayout: { type: layoutSchema, default: null },

  archivedAt: { type: Date, default: null },
  isTemplate: { type: Boolean, default: false, index: true },
  // 'page' (default), 'header', or 'footer'. Header/footer are special
  // single-instance "chrome" pages rendered globally by CustomerLayout.
  kind: { type: String, enum: ['page', 'header', 'footer'], default: 'page', index: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

pageSchema.index({ archivedAt: 1, updatedAt: -1 });
pageSchema.index({ vendor: 1, publicSlug: 1 }, { unique: true, partialFilterExpression: { vendor: { $type: 'objectId' }, publicSlug: { $type: 'string', $gt: '' } } });

module.exports = mongoose.model('Page', pageSchema);
