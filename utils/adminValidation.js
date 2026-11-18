const CONTROL_CHARACTER_RE = /[\u0000-\u001F\u007F]/;
const MARKUP_RE = /<[^>]*>/;
const PRODUCT_SPECIAL_CHARACTER_RE = /[@#$%]/;
const EMOJI_RE = /\p{Extended_Pictographic}/u;

const DEFAULT_LIMITS = Object.freeze({
  brandName: 80,
  categoryName: 80,
  categoryDescription: 1000,
  productTitle: 200,
  productShortDescription: 500,
  productSku: 80,
  couponCode: 50,
  couponDescription: 1000,
  regionValue: 80,
  pincode: 10,
  reviewReply: 2000,
  notificationTitle: 160,
  notificationMessage: 4000,
  recipientName: 120,
  senderName: 120,
  phone: 30,
});

const validationError = (message, publicCode = 'ADMIN_VALIDATION_ERROR') => {
  const error = new Error(message);
  error.statusCode = 400;
  error.publicCode = publicCode;
  return error;
};

const normalizeTrimmed = (value, field, {
  max = null,
  required = false,
  rejectMarkup = false,
} = {}) => {
  if (value === undefined || value === null) {
    if (required) throw validationError(`${field} is required`);
    return value;
  }
  const normalized = String(value).trim();
  if (required && !normalized) throw validationError(`${field} is required`);
  if (max && normalized.length > max) throw validationError(`${field} must be ${max} characters or fewer`);
  if (CONTROL_CHARACTER_RE.test(normalized)) throw validationError(`${field} contains unsupported control characters`);
  if (rejectMarkup && MARKUP_RE.test(normalized)) throw validationError(`${field} must contain plain text only`);
  return normalized;
};

const finiteNumber = (value, field, {
  required = false,
  min = null,
  max = null,
  integer = false,
  safeInteger = false,
} = {}) => {
  if (value === undefined || value === null || value === '') {
    if (required) throw validationError(`${field} is required`);
    return value;
  }
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(parsed)) throw validationError(`${field} must be a finite number`);
  if (integer && !Number.isInteger(parsed)) throw validationError(`${field} must be a whole number`);
  if (safeInteger && !Number.isSafeInteger(parsed)) throw validationError(`${field} exceeds the safe numeric range`);
  if (min !== null && parsed < min) throw validationError(`${field} must be at least ${min}`);
  if (max !== null && parsed > max) throw validationError(`${field} must be at most ${max}`);
  return parsed;
};

const normalizeCode = (value, field = 'Code', max = DEFAULT_LIMITS.couponCode) => {
  const normalized = normalizeTrimmed(value, field, { max, required: true, rejectMarkup: true });
  if (!/^[A-Za-z0-9][A-Za-z0-9 _-]*$/.test(normalized)) {
    throw validationError(`${field} may contain only letters, numbers, spaces, underscores, and hyphens`);
  }
  return normalized.toUpperCase();
};

const normalizeDelimitedValues = (values, field, {
  maxItems = 100,
  maxLength = DEFAULT_LIMITS.regionValue,
  pattern = null,
} = {}) => {
  if (values === undefined || values === null || values === '') return [];
  const list = Array.isArray(values) ? values : String(values).split(/[\n,]+/);
  if (list.length > maxItems) throw validationError(`${field} may contain at most ${maxItems} values`);
  return list.map((value, index) => {
    const normalized = normalizeTrimmed(value, `${field} ${index + 1}`, { max: maxLength, rejectMarkup: true });
    if (!normalized) throw validationError(`${field} ${index + 1} cannot be blank`);
    if (pattern && !pattern.test(normalized)) throw validationError(`${field} ${index + 1} has an invalid format`);
    return normalized;
  });
};

const normalizeEmail = (value, field = 'Email') => {
  const normalized = normalizeTrimmed(value, field, { max: 160, rejectMarkup: true });
  if (normalized === undefined || normalized === '') return normalized;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw validationError(`${field} must be a valid email address`);
  return normalized.toLowerCase();
};

const normalizePhone = (value, field = 'Phone') => {
  const normalized = normalizeTrimmed(value, field, { max: DEFAULT_LIMITS.phone, rejectMarkup: true });
  if (normalized === undefined || normalized === '') return normalized;
  if (!/^\+?[0-9 ()-]{7,30}$/.test(normalized) || normalized.replace(/\D/g, '').length < 7) {
    throw validationError(`${field} must contain a valid phone number`);
  }
  return normalized;
};

const assertObjectIdList = (values, field) => {
  const mongoose = require('mongoose');
  const list = Array.isArray(values) ? values : String(values || '').split(/[\n,]+/).filter(Boolean);
  return list.map((value, index) => {
    const normalized = String(value?._id || value).trim();
    if (!mongoose.isValidObjectId(normalized)) throw validationError(`${field} ${index + 1} is not a valid customer ID`);
    return normalized;
  });
};

const normalizeName = (value, field, max) => {
  const normalized = normalizeTrimmed(value, field, { max, required: true, rejectMarkup: true });
  if (/[\u0000-\u001F\u007F]/.test(normalized)) throw validationError(`${field} contains unsupported control characters`);
  return normalized;
};

const normalizeBrandName = (value, max = DEFAULT_LIMITS.brandName) => {
  const normalized = normalizeTrimmed(value, 'Brand name', { max, required: true, rejectMarkup: true });
  if ([...normalized].length < 2) throw validationError('Brand name must contain at least 2 characters', 'BRAND_NAME_TOO_SHORT');
  // Allow common catalog punctuation while rejecting apostrophe-only or
  // arbitrary-symbol values that cannot form a reliable brand filter.
  if (!/^[\p{L}\p{N}][\p{L}\p{N} .&+()\/-]*$/u.test(normalized) || !/[\p{L}\p{N}]/u.test(normalized)) {
    throw validationError('Brand name may contain only letters, numbers, spaces, and . & + ( ) / - punctuation', 'BRAND_NAME_INVALID');
  }
  return normalized;
};

const normalizeHsnCode = value => {
  const normalized = normalizeTrimmed(value, 'HSN code', { max: 20, rejectMarkup: true });
  if (normalized === undefined || normalized === '') return '';
  if (!/^\d{4,8}$/.test(normalized)) throw validationError('HSN code must contain 4 to 8 digits');
  return normalized;
};

const normalizeProductCRO = (value = {}) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw validationError('Product CRO settings must be an object');
  }
  const numericValue = raw => (raw === '' || raw === null || raw === undefined ? 0 : raw);
  const number = (raw, field, max = 1000000000) => finiteNumber(numericValue(raw), field, { min: 0, max, integer: true, safeInteger: true });
  const decimal = (raw, field) => finiteNumber(numericValue(raw), field, { min: 0, max: 5 });
  const text = (raw, field, max) => normalizeTrimmed(raw ?? '', field, { max, rejectMarkup: true });
  const list = (raw, field, maxItems, maxLength) => {
    if (raw === undefined || raw === null) return [];
    if (!Array.isArray(raw)) throw validationError(`${field} must be an array`);
    if (raw.length > maxItems) throw validationError(`${field} may contain at most ${maxItems} values`);
    return raw.map((item, index) => text(item, `${field} ${index + 1}`, maxLength)).filter(Boolean);
  };
  const sourceRating = value.customRating && typeof value.customRating === 'object' ? value.customRating : {};
  const sourceSocial = value.socialProof && typeof value.socialProof === 'object' ? value.socialProof : {};
  const sourceStock = value.stockDisplay && typeof value.stockDisplay === 'object' ? value.stockDisplay : {};
  const sourceSold = value.soldDisplay && typeof value.soldDisplay === 'object' ? value.soldDisplay : {};
  const sourceVisitors = value.visitorDisplay && typeof value.visitorDisplay === 'object' ? value.visitorDisplay : {};
  const period = String(sourceSocial.period || '24h');
  if (!['24h', '48h', '7d', 'custom'].includes(period)) throw validationError('Social-proof period is invalid');
  const testimonials = Array.isArray(value.testimonialReviews) ? value.testimonialReviews : [];
  if (testimonials.length > 12) throw validationError('Testimonial reviews may contain at most 12 entries');
  const faqs = Array.isArray(value.faqs) ? value.faqs : [];
  if (faqs.length > 20) throw validationError('Product FAQs may contain at most 20 entries');

  return {
    promotionalMessage: text(value.promotionalMessage, 'Promotional message', 180),
    customRating: {
      enabled: Boolean(sourceRating.enabled),
      value: decimal(sourceRating.value, 'Custom rating'),
      reviewCount: number(sourceRating.reviewCount, 'Custom review count'),
      summary: text(sourceRating.summary, 'Custom review summary', 160),
    },
    reasonsTitle: text(value.reasonsTitle, 'Reasons title', 80),
    reasonsToBuy: list(value.reasonsToBuy, 'Reasons to buy', 4, 180),
    socialProof: {
      enabled: Boolean(sourceSocial.enabled),
      period,
      count: number(sourceSocial.count, 'Social-proof count'),
      min: number(sourceSocial.min, 'Social-proof min'),
      max: number(sourceSocial.max, 'Social-proof max'),
      customLabel: text(sourceSocial.customLabel, 'Custom social-proof label', 80),
    },
    stockDisplay: {
      enabled: Boolean(sourceStock.enabled),
      value: number(sourceStock.value, 'Displayed stock left'),
      min: number(sourceStock.min, 'Stock min'),
      max: number(sourceStock.max, 'Stock max'),
    },
    soldDisplay: {
      enabled: Boolean(sourceSold.enabled),
      count: number(sourceSold.count, 'Displayed sold count'),
      min: number(sourceSold.min, 'Sold min'),
      max: number(sourceSold.max, 'Sold max'),
      label: text(sourceSold.label || 'sold recently', 'Sold label', 80) || 'sold recently',
    },
    visitorDisplay: {
      enabled: Boolean(sourceVisitors.enabled),
      count: number(sourceVisitors.count, 'Displayed visitor count'),
      min: number(sourceVisitors.min, 'Visitor min'),
      max: number(sourceVisitors.max, 'Visitor max'),
    },
    etaText: text(value.etaText, 'ETA text', 120),
    benefits: list(value.benefits, 'Product benefits', 8, 180),
    testimonialReviews: testimonials.map((item, index) => ({
      name: text(item?.name, `Testimonial ${index + 1} name`, 80),
      rating: decimal(item?.rating, `Testimonial ${index + 1} rating`),
      text: text(item?.text, `Testimonial ${index + 1} text`, 500),
      location: text(item?.location, `Testimonial ${index + 1} location`, 80),
      verified: item?.verified !== false,
    })).filter(item => item.name && item.text),
    faqs: faqs.map((item, index) => ({
      question: text(item?.question, `FAQ ${index + 1} question`, 180),
      answer: text(item?.answer, `FAQ ${index + 1} answer`, 1000),
    })).filter(item => item.question && item.answer),
  };
};

const validateBlogPayload = (payload = {}, { forCreate = false } = {}) => {
  const next = { ...payload };
  if (forCreate || Object.prototype.hasOwnProperty.call(next, 'title')) {
    next.title = normalizeTrimmed(next.title, 'Blog title', { max: 200, required: true, rejectMarkup: true });
  }
  if (Object.prototype.hasOwnProperty.call(next, 'content')) {
    next.content = normalizeTrimmed(next.content, 'Blog content', { max: 100000, allowNewlines: true });
  }
  if (Object.prototype.hasOwnProperty.call(next, 'excerpt')) {
    next.excerpt = normalizeTrimmed(next.excerpt, 'Blog excerpt', { max: 1000, rejectMarkup: true });
  }
  if (Object.prototype.hasOwnProperty.call(next, 'featuredImage')) {
    next.featuredImage = normalizeTrimmed(next.featuredImage, 'Featured image URL', { max: 2048, rejectMarkup: true });
  }
  if (forCreate || Object.prototype.hasOwnProperty.call(next, 'status')) {
    next.status = normalizeTrimmed(next.status || 'draft', 'Blog status', { required: true });
    if (!['draft', 'published', 'archived'].includes(next.status)) throw validationError('Blog status is invalid');
  }
  if (Object.prototype.hasOwnProperty.call(next, 'publishedAt')) {
    if (next.publishedAt === '' || next.publishedAt === null || next.publishedAt === undefined) next.publishedAt = null;
    else {
      const date = new Date(next.publishedAt);
      if (!Number.isFinite(date.getTime())) throw validationError('Publish date is invalid');
      next.publishedAt = date;
    }
  }
  if (Object.prototype.hasOwnProperty.call(next, 'tags')) {
    const values = Array.isArray(next.tags) ? next.tags : String(next.tags || '').split(',');
    if (values.length > 30) throw validationError('Blog tags may contain at most 30 values');
    next.tags = values.map((value, index) => normalizeTrimmed(value, `Blog tag ${index + 1}`, { max: 50, rejectMarkup: true })).filter(Boolean);
  }
  if (Object.prototype.hasOwnProperty.call(next, 'seo')) {
    const seo = next.seo && typeof next.seo === 'object' ? next.seo : {};
    next.seo = {
      metaTitle: normalizeTrimmed(seo.metaTitle, 'SEO meta title', { max: 60, rejectMarkup: true }),
      metaDescription: normalizeTrimmed(seo.metaDescription, 'SEO meta description', { max: 160, rejectMarkup: true }),
      keywords: (Array.isArray(seo.keywords) ? seo.keywords : String(seo.keywords || '').split(',')).map((value, index) => normalizeTrimmed(value, `SEO keyword ${index + 1}`, { max: 50, rejectMarkup: true })).filter(Boolean).slice(0, 30),
      ogImage: normalizeTrimmed(seo.ogImage, 'SEO OG image URL', { max: 2048, rejectMarkup: true }),
    };
  }
  if (Object.prototype.hasOwnProperty.call(next, 'relatedProducts')) {
    const mongoose = require('mongoose');
    if (!Array.isArray(next.relatedProducts) || next.relatedProducts.length > 50) throw validationError('Related products are invalid');
    next.relatedProducts = next.relatedProducts.map((value, index) => {
      const id = String(value?._id || value?.id || value).trim();
      if (!mongoose.isValidObjectId(id)) throw validationError(`Related product ${index + 1} is invalid`);
      return id;
    });
  }
  if (Object.prototype.hasOwnProperty.call(next, 'isFeatured')) next.isFeatured = Boolean(next.isFeatured);
  if (Object.prototype.hasOwnProperty.call(next, 'allowComments')) next.allowComments = next.allowComments !== false;
  return next;
};

const normalizeProductTitle = value => {
  const normalized = normalizeTrimmed(value, 'Product title', {
    max: DEFAULT_LIMITS.productTitle,
    required: true,
    rejectMarkup: true,
  });
  if (PRODUCT_SPECIAL_CHARACTER_RE.test(normalized)) {
    throw validationError('Product title contains unsupported special characters');
  }
  if (EMOJI_RE.test(normalized)) throw validationError('Product title cannot contain emoji characters');
  return normalized;
};

const validateProductPayload = (payload = {}, { forCreate = false, currentPrice } = {}) => {
  const next = { ...payload };
  if (forCreate || Object.prototype.hasOwnProperty.call(next, 'title')) next.title = normalizeProductTitle(next.title);
  if (forCreate || Object.prototype.hasOwnProperty.call(next, 'description')) {
    next.description = normalizeTrimmed(next.description, 'Description', { max: 30000, required: true });
  }
  if (Object.prototype.hasOwnProperty.call(next, 'shortDescription')) {
    next.shortDescription = normalizeTrimmed(next.shortDescription, 'Short description', { max: DEFAULT_LIMITS.productShortDescription, rejectMarkup: true });
  }
  if (Object.prototype.hasOwnProperty.call(next, 'brand')) {
    next.brand = normalizeTrimmed(next.brand, 'Brand', { max: DEFAULT_LIMITS.brandName, rejectMarkup: true });
  }
  if (Object.prototype.hasOwnProperty.call(next, 'cro')) next.cro = normalizeProductCRO(next.cro);
  if (Object.prototype.hasOwnProperty.call(next, 'sku')) {
    const sku = normalizeTrimmed(next.sku, 'SKU', { max: DEFAULT_LIMITS.productSku, rejectMarkup: true });
    next.sku = sku || undefined;
  }
  if (Object.prototype.hasOwnProperty.call(next, 'hsnCode')) next.hsnCode = normalizeHsnCode(next.hsnCode);

  const numericRules = {
    price: { required: forCreate, min: 0, max: 1000000000 },
    comparePrice: { min: 0, max: 1000000000 },
    discount: { min: 0, max: 100 },
    costPrice: { min: 0, max: 1000000000 },
    wholesalePrice: { min: 0, max: 1000000000 },
    stock: { min: 0, max: 1000000000, integer: true, safeInteger: true },
    lowStockThreshold: { min: 0, max: 1000000000, integer: true, safeInteger: true },
    gstRate: { min: 0, max: 100 },
  };
  Object.entries(numericRules).forEach(([field, rules]) => {
    if (rules.required || Object.prototype.hasOwnProperty.call(next, field)) next[field] = finiteNumber(next[field], field, rules);
  });
  if (currentPrice !== undefined && next.price !== undefined && next.price < 0) {
    throw validationError('Selling price must be non-negative');
  }
  return next;
};

const validateCouponPayload = (payload = {}, { forCreate = false } = {}) => {
  const next = { ...payload };
  if (forCreate || Object.prototype.hasOwnProperty.call(next, 'code')) next.code = normalizeCode(next.code, 'Coupon code');
  if (Object.prototype.hasOwnProperty.call(next, 'description')) next.description = normalizeTrimmed(next.description, 'Coupon description', { max: DEFAULT_LIMITS.couponDescription, rejectMarkup: true });
  if (forCreate || Object.prototype.hasOwnProperty.call(next, 'type')) {
    const type = normalizeTrimmed(next.type, 'Coupon type', { required: true });
    if (!['percentage', 'fixed', 'free_shipping', 'buy_x_get_y', 'tiered', 'bundle'].includes(type)) throw validationError('Coupon type is invalid');
    next.type = type;
  }
  if (Object.prototype.hasOwnProperty.call(next, 'value') || ['percentage', 'fixed'].includes(next.type)) {
    next.value = finiteNumber(next.value, 'Coupon value', { required: true, min: 0, max: 1000000000 });
    if (next.type === 'percentage' && next.value > 100) throw validationError('Percentage coupon value must be at most 100');
  }
  [['minOrderAmount', 1000000000], ['maxDiscount', 1000000000]].forEach(([field, max]) => {
    if (Object.prototype.hasOwnProperty.call(next, field)) next[field] = finiteNumber(next[field], field, { min: 0, max });
  });
  [['usageLimit', 1000000000], ['userLimit', 1000000000]].forEach(([field, max]) => {
    if (Object.prototype.hasOwnProperty.call(next, field)) next[field] = finiteNumber(next[field], field, { min: 1, max, integer: true, safeInteger: true });
  });
  if (forCreate || Object.prototype.hasOwnProperty.call(next, 'expiresAt')) {
    const expiresAt = new Date(next.expiresAt);
    if (!Number.isFinite(expiresAt.getTime())) throw validationError('Coupon expiry date is invalid');
    next.expiresAt = expiresAt;
  }
  if (next.startDate !== undefined && next.startDate !== null && next.startDate !== '') {
    const startDate = new Date(next.startDate);
    if (!Number.isFinite(startDate.getTime())) throw validationError('Coupon start date is invalid');
    next.startDate = startDate;
  }
  if (next.geo && typeof next.geo === 'object') {
    next.geo = {
      states: normalizeDelimitedValues(next.geo.states, 'States'),
      cities: normalizeDelimitedValues(next.geo.cities, 'Cities'),
      pincodes: normalizeDelimitedValues(next.geo.pincodes, 'Pincodes', { maxLength: DEFAULT_LIMITS.pincode, pattern: /^[A-Za-z0-9 -]+$/ }),
    };
  }
  return next;
};

const validateGiftCardPayload = (payload = {}) => {
  const next = { ...payload };
  next.amount = finiteNumber(next.amount, 'Gift card amount', { required: true, min: 0.01, max: 100000000 });
  if (next.expiresAt !== undefined && next.expiresAt !== null && next.expiresAt !== '') {
    const expiry = new Date(next.expiresAt);
    if (!Number.isFinite(expiry.getTime()) || expiry <= new Date()) throw validationError('Gift card expiry must be in the future');
    next.expiresAt = expiry;
  }
  next.recipientName = normalizeTrimmed(next.recipientName, 'Recipient name', { max: DEFAULT_LIMITS.recipientName, rejectMarkup: true });
  next.senderName = normalizeTrimmed(next.senderName, 'Sender name', { max: DEFAULT_LIMITS.senderName, rejectMarkup: true });
  next.message = normalizeTrimmed(next.message, 'Gift card message', { max: 500, rejectMarkup: true });
  next.recipientEmail = normalizeEmail(next.recipientEmail, 'Recipient email');
  next.recipientPhone = normalizePhone(next.recipientPhone, 'Recipient phone');
  return next;
};

module.exports = {
  DEFAULT_LIMITS,
  validationError,
  normalizeTrimmed,
  finiteNumber,
  normalizeCode,
  normalizeDelimitedValues,
  normalizeEmail,
  normalizePhone,
  assertObjectIdList,
  normalizeName,
  normalizeBrandName,
  normalizeHsnCode,
  normalizeProductCRO,
  validateBlogPayload,
  validateProductPayload,
  validateCouponPayload,
  validateGiftCardPayload,
};
