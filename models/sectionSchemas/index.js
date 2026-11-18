const { validateHero } = require('./hero');
const { validateCardGrid } = require('./cardGrid');
const { validateProductsShowcase } = require('./productsShowcase');
const { validateCategoriesShowcase } = require('./categoriesShowcase');
const { validateImageText } = require('./imageText');
const { validateSpacer } = require('./spacer');
const { validateImageBanner } = require('./imageBanner');
const { validateMosaic } = require('./mosaic');
const { validateRichText } = require('./richText');
const { validateBrandStrip } = require('./brandStrip');
const { validateUspRow } = require('./uspRow');
const { validateNewsletter } = require('./newsletter');
const { validateButtons } = require('./buttons');
const { validateTrustBadges } = require('./trustBadges');
const { validateTestimonials } = require('./testimonials');
const { validateFaq } = require('./faq');
const { validateStats } = require('./stats');
const { validateTabs } = require('./tabs');
const { validateAnnouncementBar } = require('./announcementBar');
const { validateVideo } = require('./video');
const { validateCountdown } = require('./countdown');
const { validateBlogPosts } = require('./blogPosts');
const { validateCouponCta } = require('./couponCta');
const { validateImageGallery } = require('./imageGallery');
const { validateSocialEmbed } = require('./socialEmbed');
const { validateCustomHtml } = require('./customHtml');
const { validateMap } = require('./map');

const VALIDATORS = {
  hero: validateHero,
  cardGrid: validateCardGrid,
  productsShowcase: validateProductsShowcase,
  categoriesShowcase: validateCategoriesShowcase,
  imageText: validateImageText,
  spacer: validateSpacer,
  imageBanner: validateImageBanner,
  mosaic: validateMosaic,
  richText: validateRichText,
  brandStrip: validateBrandStrip,
  uspRow: validateUspRow,
  newsletter: validateNewsletter,
  buttons: validateButtons,
  trustBadges: validateTrustBadges,
  testimonials: validateTestimonials,
  faq: validateFaq,
  stats: validateStats,
  tabs: validateTabs,
  announcementBar: validateAnnouncementBar,
  video: validateVideo,
  countdown: validateCountdown,
  blogPosts: validateBlogPosts,
  couponCta: validateCouponCta,
  imageGallery: validateImageGallery,
  socialEmbed: validateSocialEmbed,
  customHtml: validateCustomHtml,
  map: validateMap,
};

// These presentation-only sections have lightweight data shapes. Keep their
// data intact so the page builder and AI editor can compose them safely.
const GENERIC_TYPES = [
  'instaReels', 'paymentIcons', 'stockCounter', 'sizeGuide',
  'returnPolicy', 'contactCta', 'shippingBar', 'flashSaleBanner', 'backToTop',
];
GENERIC_TYPES.forEach(type => {
  VALIDATORS[type] = data => (data && typeof data === 'object' ? data : {});
});

const KNOWN_TYPES = Object.keys(VALIDATORS);

const PADDING_VALUES = { none: 0, sm: 8, md: 16, lg: 24, xl: 32 };
const SECTION_VARIANTS = ['default', 'soft-card', 'bordered', 'full-bleed', 'editorial'];
const SPACING_KEYS = ['all', 'top', 'right', 'bottom', 'left'];
const DIMENSION_UNITS = ['px', '%', 'vw', 'vh', 'rem', 'em', 'auto'];
const MEDIA_FIT_VALUES = ['cover', 'contain', 'fill', 'none', 'scale-down'];
const MEDIA_POSITION_VALUES = [
  'center center', 'top left', 'top center', 'top right',
  'center left', 'center right', 'bottom left', 'bottom center', 'bottom right',
];
const BACKGROUND_POSITION_VALUES = ['center center', 'top left', 'top right', 'bottom left', 'bottom right'];
const MAX_LAYOUT_SECTIONS = 100;
const MAX_RESPONSIVE_OVERRIDE_CHARS = 20000;

function sanitizeUrlFields(value, key = '') {
  if (Array.isArray(value)) return value.map(item => sanitizeUrlFields(item, key));
  if (!value || typeof value !== 'object') {
    if (typeof value !== 'string' || !/(url|uri|href|link|image|video|embed|canonical|poster)$/i.test(key)) return value;
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^(?:https?:\/\/|\/|#|mailto:|tel:|data:image\/)/i.test(trimmed)) return trimmed.slice(0, 4000);
    return '';
  }
  return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, sanitizeUrlFields(childValue, childKey)]));
}

function normalizeResponsiveOverrides(value, validator, baseData = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalizePatch = (key, inherited = baseData) => {
    const patch = source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) ? source[key] : {};
    if (!validator || !Object.keys(patch).length) return sanitizeUrlFields(patch);
    const normalized = validator({ ...(inherited && typeof inherited === 'object' ? inherited : {}), ...patch });
    return sanitizeUrlFields(Object.fromEntries(Object.keys(patch)
      .filter(field => Object.prototype.hasOwnProperty.call(normalized, field))
      .map(field => [field, normalized[field]])));
  };
  const tablet = normalizePatch('tablet');
  const mobile = normalizePatch('mobile', { ...baseData, ...tablet });
  const tabletSettings = source.tabletSettings && typeof source.tabletSettings === 'object' && !Array.isArray(source.tabletSettings)
    ? normalizeResponsiveSettings(source.tabletSettings)
    : {};
  const mobileSettings = source.mobileSettings && typeof source.mobileSettings === 'object' && !Array.isArray(source.mobileSettings)
    ? normalizeResponsiveSettings(source.mobileSettings)
    : {};
  try {
    const serialized = JSON.stringify({ tablet, mobile, tabletSettings, mobileSettings });
    if (serialized.length > MAX_RESPONSIVE_OVERRIDE_CHARS) throw new Error('Responsive settings are too large. Reduce the content before saving.');
  } catch (error) {
    throw new Error(error.message || 'Invalid responsive settings');
  }
  return { tablet, mobile, tabletSettings, mobileSettings };
}

function normalizeAssetAttributions(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map(item => ({
    url: typeof item?.url === 'string' ? item.url.slice(0, 4000) : '',
    source: typeof item?.source === 'string' ? item.source.slice(0, 80) : '',
    attributionUrl: typeof item?.attributionUrl === 'string' ? sanitizeUrlFields(item.attributionUrl, 'attributionUrl') : '',
    creator: typeof item?.creator === 'string' ? item.creator.slice(0, 160) : '',
    license: typeof item?.license === 'string' ? item.license.slice(0, 120) : '',
    query: typeof item?.query === 'string' ? item.query.slice(0, 160) : '',
  }));
}

function normalizeSpacing(value, fallback) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const result = {};
  SPACING_KEYS.forEach((key) => {
    if (source[key] == null || source[key] === '') return;
    const number = Number(source[key]);
    if (Number.isFinite(number)) result[key] = Math.max(0, number);
  });
  return Object.keys(result).length ? result : fallback;
}

function normalizeDimension(value, fallback = null, { allowAuto = true, min = 0, max = 4000 } = {}) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { value: Math.min(max, Math.max(min, value)), unit: 'px' };
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    const unit = DIMENSION_UNITS.includes(value.unit) ? value.unit : null;
    if (!unit || (!allowAuto && unit === 'auto')) return fallback;
    if (unit === 'auto') return { value: null, unit };
    if (value.value == null || value.value === '') return fallback;
    const number = Number(value.value);
    return Number.isFinite(number)
      ? { value: Math.min(max, Math.max(min, number)), unit }
      : fallback;
  }
  if (typeof value === 'string') {
    const raw = value.trim();
    if (allowAuto && raw === 'auto') return { value: null, unit: 'auto' };
    const match = raw.match(/^(-?\d+(?:\.\d+)?)(px|%|vw|vh|rem|em)$/i);
    if (match) {
      return { value: Math.min(max, Math.max(min, Number(match[1]))), unit: match[2].toLowerCase() };
    }
  }
  return fallback;
}

function normalizeAspectRatio(value) {
  if (!value || value === 'auto') return 'auto';
  const raw = String(value).trim();
  if (!/^\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?$/.test(raw)) return 'auto';
  const [width, height] = raw.split('/').map(Number);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width > 100 || height > 100) return 'auto';
  return `${width}/${height}`;
}

const DEFAULT_MEDIA_SETTINGS = {
  width: null,
  height: null,
  maxWidth: null,
  maxHeight: null,
  aspectRatio: 'auto',
  objectFit: null,
  objectPosition: null,
  align: 'center',
  borderRadius: null,
  opacity: null,
};

function normalizeMediaSettings(value = {}, { partial = false } = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const result = {};
  const set = (key, next) => {
    if (!partial || Object.prototype.hasOwnProperty.call(source, key)) result[key] = next;
  };
  set('width', normalizeDimension(source.width));
  set('height', normalizeDimension(source.height));
  set('maxWidth', normalizeDimension(source.maxWidth));
  set('maxHeight', normalizeDimension(source.maxHeight));
  set('aspectRatio', normalizeAspectRatio(source.aspectRatio));
  set('objectFit', MEDIA_FIT_VALUES.includes(source.objectFit) ? source.objectFit : null);
  set('objectPosition', MEDIA_POSITION_VALUES.includes(source.objectPosition) ? source.objectPosition : null);
  set('align', ['left', 'center', 'right'].includes(source.align) ? source.align : 'center');
  set('borderRadius', normalizeDimension(source.borderRadius, null, { allowAuto: false, min: 0, max: 200 }));
  const opacity = source.opacity == null || source.opacity === '' ? NaN : Number(source.opacity);
  set('opacity', Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : null);
  return partial ? result : { ...DEFAULT_MEDIA_SETTINGS, ...result };
}

function normalizeNumber(value, fallback, min = 0) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, number) : fallback;
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeCssPaint(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length <= 400 && !/[;{}<>]/.test(trimmed) ? trimmed : '';
}

function normalizeAnchorId(value) {
  return typeof value === 'string'
    ? value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 128)
    : '';
}

function normalizeCustomClass(value) {
  return typeof value === 'string'
    ? value.replace(/[^a-zA-Z0-9_\-\s]/g, '').slice(0, 240)
    : '';
}

function validateSection(section) {
  if (!section || typeof section !== 'object') throw new Error('Section must be an object');
  if (!section.id || typeof section.id !== 'string') throw new Error('Section.id is required');
  if (section.id.length > 128) throw new Error('Section.id is too long');
  if (!KNOWN_TYPES.includes(section.type)) throw new Error(`Unknown section type: ${section.type}`);
  const validator = VALIDATORS[section.type];
  return {
    id: section.id,
    type: section.type,
    data: sanitizeUrlFields(validator(section.data || {})),
    settings: normalizeSettings(section.settings),
    responsiveOverrides: normalizeResponsiveOverrides(section.responsiveOverrides, validator, section.data || {}),
  };
}

function normalizeSettings(s = {}) {
  const source = s && typeof s === 'object' ? s : {};
  const legacyPadding = PADDING_VALUES[source.paddingY] ?? 16;
  return {
    variant: SECTION_VARIANTS.includes(source.variant) ? source.variant : 'default',
    padding: normalizeSpacing(source.padding, { all: legacyPadding }),
    margin: normalizeSpacing(source.margin, { all: 0 }),
    paddingY: ['none', 'sm', 'md', 'lg', 'xl'].includes(source.paddingY) ? source.paddingY : 'md',
    backgroundColor: normalizeCssPaint(source.backgroundColor),
    backgroundToken: ['none', 'primary', 'accent', 'surface', 'muted'].includes(source.backgroundToken) ? source.backgroundToken : 'none',
    textToken: ['text', 'muted', 'inverse', 'primary'].includes(source.textToken) ? source.textToken : 'text',
    backgroundImage: sanitizeUrlFields(typeof source.backgroundImage === 'string' ? source.backgroundImage : '', 'backgroundImage'),
    backgroundSize: ['cover', 'contain', 'auto'].includes(source.backgroundSize) ? source.backgroundSize : 'cover',
    backgroundPosition: BACKGROUND_POSITION_VALUES.includes(source.backgroundPosition) ? source.backgroundPosition : 'center center',
    fullWidth: !!source.fullWidth,
    sectionAlign: ['left', 'center', 'right'].includes(source.sectionAlign) ? source.sectionAlign : 'center',
    width: normalizeDimension(source.width),
    height: normalizeDimension(source.height),
    minHeight: normalizeDimension(source.minHeight),
    overflow: ['visible', 'hidden', 'clip', 'auto'].includes(source.overflow) ? source.overflow : 'visible',
    zIndex: source.zIndex == null || source.zIndex === '' ? null : Math.min(1000, Math.max(-100, Math.round(Number(source.zIndex) || 0))),
    maxWidth: source.maxWidth == null || source.maxWidth === '' ? null : Math.min(4000, normalizeNumber(source.maxWidth, null)),
    textAlign: ['left', 'center', 'right'].includes(source.textAlign) ? source.textAlign : 'left',
    borderWidth: normalizeNumber(source.borderWidth, 0),
    borderStyle: ['solid', 'dashed', 'dotted'].includes(source.borderStyle) ? source.borderStyle : 'solid',
    borderColor: normalizeCssPaint(source.borderColor),
    borderColorToken: ['border', 'primary', 'accent'].includes(source.borderColorToken) ? source.borderColorToken : 'border',
    borderRadius: Object.prototype.hasOwnProperty.call(source, 'borderRadius') && source.borderRadius == null
      ? null
      : normalizeNumber(source.borderRadius, 0),
    borderRadiusToken: ['none', 'base'].includes(source.borderRadiusToken) ? source.borderRadiusToken : 'none',
    boxShadow: ['none', 'sm', 'md', 'lg', 'xl'].includes(source.boxShadow) ? source.boxShadow : 'none',
    typography: normalizeTypography(source.typography),
    anchorId: normalizeAnchorId(source.anchorId),
    customClass: normalizeCustomClass(source.customClass),
    aiAssetAttributions: normalizeAssetAttributions(source.aiAssetAttributions),
    media: normalizeMediaSettings(source.media),
    visibility: ['all', 'desktop', 'mobile', 'hidden'].includes(source.visibility) ? source.visibility : 'all',
    schedule: {
      from: normalizeDate(source.schedule?.from),
      until: normalizeDate(source.schedule?.until),
    },
  };
}

function normalizeResponsiveSettings(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const result = {};
  const dimensionKeys = ['width', 'height', 'minHeight'];
  dimensionKeys.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(source, key)) result[key] = normalizeDimension(source[key]);
  });
  if (Object.prototype.hasOwnProperty.call(source, 'fullWidth')) result.fullWidth = !!source.fullWidth;
  if (Object.prototype.hasOwnProperty.call(source, 'sectionAlign')) result.sectionAlign = ['left', 'center', 'right'].includes(source.sectionAlign) ? source.sectionAlign : 'center';
  if (Object.prototype.hasOwnProperty.call(source, 'backgroundColor')) result.backgroundColor = normalizeCssPaint(source.backgroundColor);
  if (Object.prototype.hasOwnProperty.call(source, 'backgroundToken')) result.backgroundToken = ['none', 'primary', 'accent', 'surface', 'muted'].includes(source.backgroundToken) ? source.backgroundToken : 'none';
  if (Object.prototype.hasOwnProperty.call(source, 'textToken')) result.textToken = ['text', 'muted', 'inverse', 'primary'].includes(source.textToken) ? source.textToken : 'text';
  if (Object.prototype.hasOwnProperty.call(source, 'backgroundImage')) result.backgroundImage = sanitizeUrlFields(typeof source.backgroundImage === 'string' ? source.backgroundImage : '', 'backgroundImage');
  if (Object.prototype.hasOwnProperty.call(source, 'backgroundSize')) result.backgroundSize = ['cover', 'contain', 'auto'].includes(source.backgroundSize) ? source.backgroundSize : 'cover';
  if (Object.prototype.hasOwnProperty.call(source, 'backgroundPosition')) result.backgroundPosition = BACKGROUND_POSITION_VALUES.includes(source.backgroundPosition) ? source.backgroundPosition : 'center center';
  if (Object.prototype.hasOwnProperty.call(source, 'textAlign')) result.textAlign = ['left', 'center', 'right'].includes(source.textAlign) ? source.textAlign : 'left';
  if (Object.prototype.hasOwnProperty.call(source, 'borderWidth')) result.borderWidth = Math.min(20, normalizeNumber(source.borderWidth, 0));
  if (Object.prototype.hasOwnProperty.call(source, 'borderStyle')) result.borderStyle = ['solid', 'dashed', 'dotted'].includes(source.borderStyle) ? source.borderStyle : 'solid';
  if (Object.prototype.hasOwnProperty.call(source, 'borderColor')) result.borderColor = normalizeCssPaint(source.borderColor);
  if (Object.prototype.hasOwnProperty.call(source, 'borderColorToken')) result.borderColorToken = ['border', 'primary', 'accent'].includes(source.borderColorToken) ? source.borderColorToken : 'border';
  if (Object.prototype.hasOwnProperty.call(source, 'borderRadius')) result.borderRadius = source.borderRadius == null ? null : Math.min(200, normalizeNumber(source.borderRadius, 0));
  if (Object.prototype.hasOwnProperty.call(source, 'borderRadiusToken')) result.borderRadiusToken = ['none', 'base'].includes(source.borderRadiusToken) ? source.borderRadiusToken : 'none';
  if (Object.prototype.hasOwnProperty.call(source, 'boxShadow')) result.boxShadow = ['none', 'sm', 'md', 'lg', 'xl'].includes(source.boxShadow) ? source.boxShadow : 'none';
  if (Object.prototype.hasOwnProperty.call(source, 'anchorId')) result.anchorId = normalizeAnchorId(source.anchorId);
  if (Object.prototype.hasOwnProperty.call(source, 'customClass')) result.customClass = normalizeCustomClass(source.customClass);
  if (Object.prototype.hasOwnProperty.call(source, 'visibility')) result.visibility = ['all', 'desktop', 'mobile', 'hidden'].includes(source.visibility) ? source.visibility : 'all';
  if (Object.prototype.hasOwnProperty.call(source, 'overflow')) result.overflow = ['visible', 'hidden', 'clip', 'auto'].includes(source.overflow) ? source.overflow : 'visible';
  if (Object.prototype.hasOwnProperty.call(source, 'zIndex')) result.zIndex = source.zIndex == null || source.zIndex === '' ? null : Math.min(1000, Math.max(-100, Math.round(Number(source.zIndex) || 0)));
  if (Object.prototype.hasOwnProperty.call(source, 'maxWidth')) result.maxWidth = source.maxWidth == null || source.maxWidth === '' ? null : Math.min(4000, normalizeNumber(source.maxWidth, null));
  if (Object.prototype.hasOwnProperty.call(source, 'padding')) result.padding = normalizeSpacing(source.padding, { all: 16 });
  if (Object.prototype.hasOwnProperty.call(source, 'margin')) result.margin = normalizeSpacing(source.margin, { all: 0 });
  if (Object.prototype.hasOwnProperty.call(source, 'typography')) result.typography = normalizeTypography(source.typography, { partial: true });
  if (Object.prototype.hasOwnProperty.call(source, 'media')) result.media = normalizeMediaSettings(source.media, { partial: true });
  if (Object.prototype.hasOwnProperty.call(source, 'schedule')) {
    result.schedule = Object.fromEntries(['from', 'until']
      .filter(key => Object.prototype.hasOwnProperty.call(source.schedule || {}, key))
      .map(key => [key, normalizeDate(source.schedule[key])]));
  }
  return sanitizeUrlFields(result);
}

function normalizeTypography(value = {}, { partial = false } = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const fontFamily = ['system', 'serif', 'mono'].includes(source.fontFamily) ? source.fontFamily : 'inherit';
  const fontSize = normalizeNumber(source.fontSize, null);
  const lineHeight = normalizeNumber(source.lineHeight, null);
  const letterSpacing = normalizeNumber(source.letterSpacing, null, -5);
  const fontWeight = normalizeNumber(source.fontWeight, null);
  const result = {
    fontFamily,
    fontSize: fontSize == null ? null : Math.min(96, Math.max(8, fontSize)),
    lineHeight: lineHeight == null ? null : Math.min(3, Math.max(0.8, lineHeight)),
    letterSpacing: letterSpacing == null ? null : Math.min(20, Math.max(-5, letterSpacing)),
    fontWeight: fontWeight == null ? null : [300, 400, 500, 600, 700, 800].includes(fontWeight) ? fontWeight : null,
  };
  return partial
    ? Object.fromEntries(Object.entries(result).filter(([key]) => Object.prototype.hasOwnProperty.call(source, key)))
    : result;
}

function validateLayout(layout) {
  try {
  if (!layout || typeof layout !== 'object') return { sections: [] };
  const sections = Array.isArray(layout.sections) ? layout.sections : [];
  if (sections.length > MAX_LAYOUT_SECTIONS) throw new Error(`A page cannot contain more than ${MAX_LAYOUT_SECTIONS} sections`);
  if (new Set(sections.map(section => section?.id)).size !== sections.length) throw new Error('Each section must have a unique id');
  return { sections: sections.map(validateSection) };
  } catch (error) {
    error.statusCode = 400;
    throw error;
  }
}

module.exports = { validateLayout, validateSection, KNOWN_TYPES };
