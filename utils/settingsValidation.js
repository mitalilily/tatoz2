const CONTROL_CHARACTER_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const MARKUP_RE = /<[^>]*>/;

const makeValidationError = (message, publicCode, errors = []) => {
  const error = new Error(message);
  error.statusCode = 422;
  error.publicCode = publicCode;
  if (errors.length) error.details = errors;
  return error;
};

const fieldError = (field, message) => ({ field, message });

const text = (value, field, {
  max = 500,
  required = false,
  rejectMarkup = false,
  allowNewlines = false,
} = {}) => {
  if (value === undefined || value === null) {
    if (required) throw makeValidationError(`${field} is required`, 'VALIDATION_ERROR', [fieldError(field, `${field} is required`)]);
    return '';
  }
  const normalized = String(value).trim();
  if (required && !normalized) throw makeValidationError(`${field} is required`, 'VALIDATION_ERROR', [fieldError(field, `${field} is required`)]);
  if (normalized.length > max) throw makeValidationError(`${field} must be ${max} characters or fewer`, 'VALIDATION_ERROR', [fieldError(field, `${field} must be ${max} characters or fewer`)]);
  if (!allowNewlines && CONTROL_CHARACTER_RE.test(normalized)) throw makeValidationError(`${field} contains unsupported control characters`, 'VALIDATION_ERROR', [fieldError(field, `${field} contains unsupported control characters`)]);
  if (rejectMarkup && MARKUP_RE.test(normalized)) throw makeValidationError(`${field} must contain plain text only`, 'VALIDATION_ERROR', [fieldError(field, `${field} must contain plain text only`)]);
  return normalized;
};

const optionalText = (value, field, options = {}) => text(value, field, { ...options, required: false });

const httpUrl = (value, field, { max = 2048, allowRelative = false, requireHttps = false } = {}) => {
  const normalized = optionalText(value, field, { max, rejectMarkup: true });
  if (!normalized) return '';
  if (allowRelative && normalized.startsWith('/') && !normalized.startsWith('//')) return normalized;
  let parsed;
  try { parsed = new URL(normalized); } catch (_) {
    throw makeValidationError(`${field} must be a valid URL`, 'VALIDATION_ERROR', [fieldError(field, `${field} must be a valid URL`)]);
  }
  const allowedProtocols = requireHttps ? ['https:'] : ['http:', 'https:'];
  if (!allowedProtocols.includes(parsed.protocol) || parsed.username || parsed.password) {
    throw makeValidationError(`${field} must use a safe HTTP URL`, 'VALIDATION_ERROR', [fieldError(field, `${field} must use a safe HTTP URL`)]);
  }
  return parsed.toString().replace(/\/$/, '');
};

const pathPattern = (value, field, { max = 200 } = {}) => {
  const normalized = optionalText(value, field, { max, rejectMarkup: true });
  if (!normalized) return '';
  if (!normalized.startsWith('/') || /^\/\//.test(normalized) || /:\/\//.test(normalized)) {
    throw makeValidationError(`${field} must be a site path beginning with /`, 'VALIDATION_ERROR', [fieldError(field, `${field} must be a site path beginning with /`)]);
  }
  return normalized;
};

const languageCode = (value, field = 'Language code') => {
  const normalized = optionalText(value, field, { max: 35, rejectMarkup: true });
  if (!normalized) return '';
  if (normalized !== 'x-default' && !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(normalized)) {
    throw makeValidationError(`${field} must be a valid BCP-47 language code`, 'VALIDATION_ERROR', [fieldError(field, `${field} must be a valid BCP-47 language code`)]);
  }
  return normalized.toLowerCase() === 'x-default' ? 'x-default' : normalized;
};

const email = (value, field = 'Email') => {
  const normalized = optionalText(value, field, { max: 160, rejectMarkup: true });
  if (!normalized) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized)) {
    throw makeValidationError(`${field} must be a valid email address`, 'VALIDATION_ERROR', [fieldError(field, `${field} must be a valid email address`)]);
  }
  return normalized.toLowerCase();
};

const phone = (value, field = 'Phone') => {
  const normalized = optionalText(value, field, { max: 30, rejectMarkup: true });
  if (!normalized) return '';
  const digits = normalized.replace(/\D/g, '');
  if (!/^\+?[0-9 ()-]{7,30}$/.test(normalized) || digits.length < 7 || digits.length > 15) {
    throw makeValidationError(`${field} must be a valid phone number`, 'VALIDATION_ERROR', [fieldError(field, `${field} must be a valid phone number`)]);
  }
  return normalized;
};

const boundedNumber = (value, field, { min = -Infinity, max = Infinity, integer = false } = {}) => {
  if (value === undefined || value === null || value === '') return '';
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (integer && !Number.isInteger(parsed)) || parsed < min || parsed > max) {
    throw makeValidationError(`${field} is invalid`, 'VALIDATION_ERROR', [fieldError(field, `${field} is invalid`)]);
  }
  return parsed;
};

const hexColor = (value, field) => {
  const normalized = optionalText(value, field, { max: 7, rejectMarkup: true });
  if (!normalized) return '';
  if (!/^#[0-9a-f]{6}$/i.test(normalized)) {
    throw makeValidationError(`${field} must be a six-digit hexadecimal color`, 'VALIDATION_ERROR', [fieldError(field, `${field} must be a six-digit hexadecimal color`)]);
  }
  return normalized.toLowerCase();
};

const cssFontFamily = (value, field = 'Font family') => {
  const normalized = optionalText(value, field, { max: 160, rejectMarkup: true });
  if (!normalized) return '';
  if (!/^[A-Za-z0-9 ,_'"-]+$/.test(normalized)) {
    throw makeValidationError(`${field} contains unsupported CSS characters`, 'VALIDATION_ERROR', [fieldError(field, `${field} contains unsupported CSS characters`)]);
  }
  return normalized;
};

const normalizeUrlList = (value, field, options = {}) => {
  if (value === undefined || value === null || value === '') return [];
  if (!Array.isArray(value)) throw makeValidationError(`${field} must be a list`, 'VALIDATION_ERROR', [fieldError(field, `${field} must be a list`)]);
  const maxItems = options.maxItems || 50;
  if (value.length > maxItems) throw makeValidationError(`${field} may contain at most ${maxItems} entries`, 'VALIDATION_ERROR', [fieldError(field, `${field} may contain at most ${maxItems} entries`)]);
  const seen = new Set();
  return value.map((entry, index) => {
    const normalized = httpUrl(entry, `${field}[${index}]`, options);
    if (!normalized || seen.has(normalized)) return null;
    seen.add(normalized);
    return normalized;
  }).filter(Boolean);
};

const normalizeSeoSettings = (input = {}) => {
  const output = {};
  const copy = (key, value, field, options) => { output[key] = text(value, field, options); };
  Object.entries(input || {}).forEach(([key, value]) => {
    if (!key.startsWith('seo_')) return;
    switch (key) {
      case 'seo_title_template': copy(key, value, 'Site title template', { max: 160, rejectMarkup: true }); break;
      case 'seo_meta_description': copy(key, value, 'Default meta description', { max: 160, rejectMarkup: true }); break;
      case 'seo_canonical_base': output[key] = httpUrl(value, 'Canonical URL Base', { allowRelative: false, requireHttps: false }); break;
      case 'seo_favicon_url': output[key] = httpUrl(value, 'Favicon URL', { allowRelative: true }); break;
      case 'seo_og_title': copy(key, value, 'OG title', { max: 120, rejectMarkup: true }); break;
      case 'seo_og_description': copy(key, value, 'OG description', { max: 300, rejectMarkup: true }); break;
      case 'seo_og_image': output[key] = httpUrl(value, 'OG image URL', { allowRelative: true }); break;
      case 'seo_og_type': output[key] = ['website', 'article', 'product'].includes(value) ? value : 'website'; break;
      case 'seo_twitter_site': copy(key, value, 'Twitter site', { max: 120, rejectMarkup: true }); break;
      case 'seo_twitter_card': output[key] = ['summary', 'summary_large_image'].includes(value) ? value : 'summary_large_image'; break;
      case 'seo_robots_default': output[key] = ['index, follow', 'noindex, follow', 'index, nofollow', 'noindex, nofollow'].includes(value) ? value : 'index, follow'; break;
      case 'seo_localbusiness_enabled': output[key] = value === true || value === 'true'; break;
      case 'seo_sitemap_enabled': output[key] = value === true || value === 'true'; break;
      case 'seo_trailing_slash': output[key] = value === true || value === 'true'; break;
      case 'seo_sitemap_changefreq': output[key] = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'].includes(value) ? value : 'weekly'; break;
      case 'seo_sitemap_priority': output[key] = Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : 0.8)); break;
      case 'seo_sitemap_types':
        if (!Array.isArray(value)) throw makeValidationError('Sitemap types must be a list', 'SEO_SETTINGS_INVALID', [fieldError(key, 'Sitemap types must be a list')]);
        output[key] = [...new Set(value.filter(type => ['products', 'categories', 'brands', 'blog'].includes(type)))];
        break;
      case 'seo_preconnect_urls':
      case 'seo_social_profiles': output[key] = normalizeUrlList(value, key, { maxItems: 30 }); break;
      case 'seo_noindex_patterns':
        if (!Array.isArray(value) || value.length > 100) throw makeValidationError('Noindex patterns must contain at most 100 paths', 'SEO_SETTINGS_INVALID', [fieldError(key, 'Noindex patterns must contain at most 100 paths')]);
        output[key] = [...new Set(value.map((item, i) => pathPattern(item, `Noindex pattern ${i + 1}`)).filter(Boolean))];
        break;
      case 'seo_sitemap_custom_urls':
        if (!Array.isArray(value) || value.length > 500) throw makeValidationError('Custom sitemap URLs must contain at most 500 entries', 'SEO_SETTINGS_INVALID', [fieldError(key, 'Custom sitemap URLs must contain at most 500 entries')]);
        output[key] = value.map((entry, i) => {
          const item = entry && typeof entry === 'object' ? entry : { url: entry };
          const url = item.url && String(item.url).startsWith('/')
            ? pathPattern(item.url, `Sitemap URL ${i + 1}`)
            : httpUrl(item.url, `Sitemap URL ${i + 1}`);
          if (!url) throw makeValidationError(`Sitemap URL ${i + 1} is required`, 'SEO_SETTINGS_INVALID', [fieldError(`${key}[${i}].url`, 'Sitemap URL is required')]);
          const changefreq = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'].includes(item.changefreq) ? item.changefreq : 'weekly';
          const priority = Number.isFinite(Number(item.priority)) ? Math.max(0, Math.min(1, Number(item.priority))) : 0.5;
          return { ...item, url, changefreq, priority };
        });
        break;
      case 'seo_redirects':
        if (!Array.isArray(value) || value.length > 500) throw makeValidationError('Redirects must contain at most 500 entries', 'SEO_SETTINGS_INVALID', [fieldError(key, 'Redirects must contain at most 500 entries')]);
        output[key] = value.map((entry, i) => {
          const item = entry && typeof entry === 'object' ? entry : {};
          const from = pathPattern(item.from, `Redirect ${i + 1} source`);
          const to = item.to && String(item.to).startsWith('/') ? pathPattern(item.to, `Redirect ${i + 1} target`) : httpUrl(item.to, `Redirect ${i + 1} target`, { allowRelative: false });
          if (!from || !to || from === to) throw makeValidationError(`Redirect ${i + 1} is invalid`, 'SEO_SETTINGS_INVALID', [fieldError(`${key}[${i}]`, 'Redirect source and target must be different')]);
          return { ...item, from, to };
        });
        break;
      case 'seo_organization_schema': {
        const item = value && typeof value === 'object' ? value : {};
        output[key] = {
          ...item,
          name: text(item.name, 'Organization name', { max: 160, rejectMarkup: true }),
          logo: httpUrl(item.logo, 'Organization logo URL', { allowRelative: true }),
          url: httpUrl(item.url, 'Organization website URL'),
          socialProfiles: normalizeUrlList(item.socialProfiles || [], 'Organization social profiles', { maxItems: 30 }),
          contactEmail: email(item.contactEmail, 'Organization contact email'),
          contactPhone: phone(item.contactPhone, 'Organization contact phone'),
        };
        break;
      }
      case 'seo_website_schema': {
        const item = value && typeof value === 'object' ? value : {};
        const searchActionUrl = optionalText(item.searchActionUrl, 'Search Action URL template', { max: 2048, rejectMarkup: true });
        if (searchActionUrl && !searchActionUrl.includes('{search_term_string}')) throw makeValidationError('Search Action URL template must contain {search_term_string}', 'SEO_SETTINGS_INVALID', [fieldError(`${key}.searchActionUrl`, 'Search Action URL template must contain {search_term_string}')]);
        if (searchActionUrl) httpUrl(searchActionUrl.replace('{search_term_string}', 'search'), 'Search Action URL template');
        output[key] = { ...item, searchActionUrl };
        break;
      }
      case 'seo_localbusiness_schema': {
        const item = value && typeof value === 'object' ? value : {};
        output[key] = {
          ...item,
          name: text(item.name, 'LocalBusiness name', { max: 160, rejectMarkup: true }),
          address: text(item.address, 'LocalBusiness address', { max: 500, rejectMarkup: true }),
          phone: phone(item.phone, 'LocalBusiness phone'),
          openingHours: text(item.openingHours, 'LocalBusiness opening hours', { max: 300, rejectMarkup: true }),
          latitude: boundedNumber(item.latitude, 'LocalBusiness latitude', { min: -90, max: 90 }),
          longitude: boundedNumber(item.longitude, 'LocalBusiness longitude', { min: -180, max: 180 }),
        };
        break;
      }
      case 'seo_robots_txt': copy(key, value, 'robots.txt', { max: 10000, allowNewlines: true }); break;
      case 'seo_ga4_id': {
        const id = optionalText(value, 'GA4 measurement ID', { max: 40, rejectMarkup: true });
        if (id && !/^G-[A-Z0-9]{4,30}$/i.test(id)) throw makeValidationError('GA4 measurement ID is invalid', 'SEO_SETTINGS_INVALID', [fieldError(key, 'GA4 measurement ID must look like G-XXXXXXXX')]);
        output[key] = id.toUpperCase(); break;
      }
      case 'seo_gtm_id': {
        const id = optionalText(value, 'GTM container ID', { max: 40, rejectMarkup: true });
        if (id && !/^GTM-[A-Z0-9]{4,30}$/i.test(id)) throw makeValidationError('GTM container ID is invalid', 'SEO_SETTINGS_INVALID', [fieldError(key, 'GTM container ID must look like GTM-XXXXXXX')]);
        output[key] = id.toUpperCase(); break;
      }
      case 'seo_fb_pixel': {
        const id = optionalText(value, 'Facebook Pixel ID', { max: 40, rejectMarkup: true });
        if (id && !/^\d{5,20}$/.test(id)) throw makeValidationError('Facebook Pixel ID is invalid', 'SEO_SETTINGS_INVALID', [fieldError(key, 'Facebook Pixel ID must contain only digits')]);
        output[key] = id; break;
      }
      case 'seo_verification_google': copy(key, value, 'Google verification token', { max: 300, rejectMarkup: true }); break;
      case 'seo_custom_head_scripts':
      case 'seo_custom_body_scripts': copy(key, value, key === 'seo_custom_head_scripts' ? 'Custom head scripts' : 'Custom body scripts', { max: 20000, allowNewlines: true }); break;
      case 'seo_default_language': output[key] = languageCode(value, 'Default language'); break;
      case 'seo_hreflang_entries':
        if (!Array.isArray(value) || value.length > 50) throw makeValidationError('Hreflang entries must contain at most 50 items', 'SEO_SETTINGS_INVALID', [fieldError(key, 'Hreflang entries must contain at most 50 items')]);
        output[key] = value.map((entry, i) => {
          const lang = languageCode(entry?.lang, `Hreflang ${i + 1} language`);
          const url = httpUrl(entry?.url, `Hreflang ${i + 1} URL`);
          if ((lang && !url) || (!lang && url)) throw makeValidationError(`Hreflang ${i + 1} must include both language and URL`, 'SEO_SETTINGS_INVALID', [fieldError(`${key}[${i}]`, 'Language and URL are both required')]);
          return { ...entry, lang, url };
        }).filter(entry => entry.lang && entry.url);
        break;
      default: output[key] = typeof value === 'string' ? text(value, key, { max: 5000, allowNewlines: true }) : value;
    }
  });
  return output;
};

const normalizeMerchantSettings = input => {
  const values = {
    google_merchant_enabled: Boolean(input.google_merchant_enabled),
    google_merchant_id: optionalText(input.google_merchant_id, 'Merchant Center ID', { max: 30, rejectMarkup: true }),
    google_merchant_country: optionalText(input.google_merchant_country || 'IN', 'Merchant country', { max: 2, rejectMarkup: true }).toUpperCase(),
    google_merchant_language: languageCode(input.google_merchant_language || 'en', 'Merchant language'),
    google_merchant_currency: optionalText(input.google_merchant_currency || 'INR', 'Merchant currency', { max: 3, rejectMarkup: true }).toUpperCase(),
    google_merchant_brand: text(input.google_merchant_brand || 'Tatoz', 'Brand / Store name', { max: 100, required: true, rejectMarkup: true }),
    google_ads_conversion_id: optionalText(input.google_ads_conversion_id, 'Google Ads conversion ID', { max: 40, rejectMarkup: true }),
    google_ads_purchase_label: optionalText(input.google_ads_purchase_label, 'Purchase conversion label', { max: 100, rejectMarkup: true }),
    google_ads_begin_checkout_label: optionalText(input.google_ads_begin_checkout_label, 'Begin checkout conversion label', { max: 100, rejectMarkup: true }),
    google_ads_add_to_cart_label: optionalText(input.google_ads_add_to_cart_label, 'Add-to-cart conversion label', { max: 100, rejectMarkup: true }),
  };
  if (values.google_merchant_id && !/^\d{1,30}$/.test(values.google_merchant_id)) throw makeValidationError('Merchant Center ID must contain only digits', 'GOOGLE_MERCHANT_INVALID', [fieldError('google_merchant_id', 'Merchant Center ID must contain only digits')]);
  if (!/^[A-Z]{2}$/.test(values.google_merchant_country)) throw makeValidationError('Merchant country must be a two-letter country code', 'GOOGLE_MERCHANT_INVALID', [fieldError('google_merchant_country', 'Merchant country must be a two-letter country code')]);
  if (!/^[A-Z]{3}$/.test(values.google_merchant_currency)) throw makeValidationError('Merchant currency must be a three-letter code', 'GOOGLE_MERCHANT_INVALID', [fieldError('google_merchant_currency', 'Merchant currency must be a three-letter code')]);
  if (values.google_ads_conversion_id && !/^AW-[A-Z0-9_-]{3,35}$/i.test(values.google_ads_conversion_id)) throw makeValidationError('Google Ads conversion ID is invalid', 'GOOGLE_MERCHANT_INVALID', [fieldError('google_ads_conversion_id', 'Google Ads conversion ID must look like AW-123456789')]);
  const feedKey = optionalText(input.google_merchant_feed_key, 'Feed access key', { max: 128, rejectMarkup: true });
  if (feedKey && !/^[A-Za-z0-9_-]{16,128}$/.test(feedKey)) throw makeValidationError('Feed access key has an invalid format', 'GOOGLE_MERCHANT_INVALID', [fieldError('google_merchant_feed_key', 'Feed access key must be a secure alphanumeric key')]);
  if (values.google_merchant_enabled && !values.google_merchant_id) throw makeValidationError('Merchant Center ID is required when the feed is enabled', 'GOOGLE_MERCHANT_INVALID', [fieldError('google_merchant_id', 'Merchant Center ID is required when the feed is enabled')]);
  if (values.google_merchant_enabled && !feedKey) throw makeValidationError('Feed access key is required when the feed is enabled', 'GOOGLE_MERCHANT_INVALID', [fieldError('google_merchant_feed_key', 'Feed access key is required when the feed is enabled')]);
  if (values.google_ads_purchase_label && !/^[A-Za-z0-9_-]{3,100}$/.test(values.google_ads_purchase_label)) throw makeValidationError('Purchase conversion label is invalid', 'GOOGLE_MERCHANT_INVALID');
  if (values.google_ads_begin_checkout_label && !/^[A-Za-z0-9_-]{3,100}$/.test(values.google_ads_begin_checkout_label)) throw makeValidationError('Begin checkout conversion label is invalid', 'GOOGLE_MERCHANT_INVALID');
  if (values.google_ads_add_to_cart_label && !/^[A-Za-z0-9_-]{3,100}$/.test(values.google_ads_add_to_cart_label)) throw makeValidationError('Add-to-cart conversion label is invalid', 'GOOGLE_MERCHANT_INVALID');
  values.google_merchant_feed_key = feedKey;
  return values;
};

const normalizeCustomization = ({ social, contact, theme }) => {
  const socialKeys = ['facebook', 'twitter', 'instagram', 'linkedin', 'youtube'];
  const normalizedSocial = {};
  socialKeys.forEach(key => { normalizedSocial[key] = httpUrl(social?.[key], `${key} URL`, { allowRelative: false }); });
  const normalizedContact = {
    phone: phone(contact?.phone, 'Contact phone'),
    email: email(contact?.email, 'Contact email'),
    address: optionalText(contact?.address, 'Contact address', { max: 500, rejectMarkup: true }),
    hours: optionalText(contact?.hours, 'Business hours', { max: 160, rejectMarkup: true }),
  };
  const normalizedTheme = {
    brandColor: hexColor(theme?.brandColor || '#4f46e5', 'Brand color'),
    accentColor: hexColor(theme?.accentColor || '#a855f7', 'Accent color'),
    textColor: hexColor(theme?.textColor || '#111827', 'Text color'),
    buttonStyle: ['rounded', 'pill', 'square'].includes(theme?.buttonStyle) ? theme.buttonStyle : 'rounded',
    fontFamily: cssFontFamily(theme?.fontFamily, 'Custom font family'),
  };
  return { social: normalizedSocial, contact: normalizedContact, theme: normalizedTheme };
};

const DEFAULT_FOOTER = {
  backgroundColor: '#020617',
  textColor: '#94a3b8',
  headingColor: '#ffffff',
  accentColor: '#4f46e5',
  tagline: 'AI-powered shopping with honest prices, fast delivery and easy returns.',
  headings: { shop: 'Shop', support: 'Support', contact: 'Contact Us' },
  show: { brand: true, shop: true, support: true, contact: true, socials: true, partners: true, payments: true },
  partners: {
    paymentsLabel: 'Payments by',
    paymentsName: 'Razorpay',
    deliveryLabel: 'Delivery by',
    deliveryName: 'Shiprocket',
  },
  paymentBadges: [
    { kind: 'mastercard', label: '' },
    { kind: 'visa', label: '' },
    { kind: 'text', label: 'UPI' },
    { kind: 'text', label: 'COD' },
  ],
  shopLinks: [
    { label: 'Home', url: '/' },
    { label: 'All Products', url: '/search' },
    { label: 'Bundles & Combos', url: '/bundles' },
    { label: 'Blog', url: '/blog' },
  ],
  supportLinks: [
    { label: 'My Account', url: '/profile' },
    { label: 'Track Order', url: '/orders' },
    { label: 'Shipping Policy', url: '/legal/shipping-policy' },
    { label: 'Returns & Refunds', url: '/legal/returns-refunds' },
    { label: 'FAQ', url: '/legal/faq' },
    { label: 'Privacy Policy', url: '/legal/privacy-policy' },
    { label: 'Terms of Service', url: '/legal/terms-of-service' },
  ],
  copyright: '',
};

const FOOTER_SHOW_KEYS = ['brand', 'shop', 'support', 'contact', 'socials', 'partners', 'payments'];

const normalizeFooterLink = (entry, field, index) => {
  const item = entry && typeof entry === 'object' ? entry : {};
  const label = text(item.label, `${field} ${index + 1} name`, { max: 80, rejectMarkup: true });
  const raw = String(item.url || '').trim();
  if (!label || !raw) return null;
  const url = raw.startsWith('/') ? pathPattern(raw, `${field} ${index + 1} link`) : httpUrl(raw, `${field} ${index + 1} link`);
  if (!url) return null;
  return { label, url };
};

const normalizeFooterLinks = (value, field, fallback) => {
  if (value === undefined || value === null) return fallback.map(link => ({ ...link }));
  if (!Array.isArray(value)) throw makeValidationError(`${field} must be a list`, 'VALIDATION_ERROR', [fieldError(field, `${field} must be a list`)]);
  if (value.length > 12) throw makeValidationError(`${field} may contain at most 12 links`, 'VALIDATION_ERROR', [fieldError(field, `${field} may contain at most 12 links`)]);
  return value.map((entry, index) => normalizeFooterLink(entry, field, index)).filter(Boolean);
};

const PAYMENT_BADGE_KINDS = ['mastercard', 'visa', 'text'];

const normalizePaymentBadge = (entry, index) => {
  const item = entry && typeof entry === 'object' ? entry : {};
  const kind = PAYMENT_BADGE_KINDS.includes(item.kind) ? item.kind : 'text';
  const label = text(item.label, `Payment badge ${index + 1} label`, { max: 20, rejectMarkup: true });
  if (kind === 'text' && !label) return null;
  return { kind, label: kind === 'text' ? label : '' };
};

const normalizePaymentBadges = (value) => {
  if (value === undefined || value === null) return DEFAULT_FOOTER.paymentBadges.map(badge => ({ ...badge }));
  if (!Array.isArray(value)) throw makeValidationError('Payment badges must be a list', 'VALIDATION_ERROR', [fieldError('paymentBadges', 'Payment badges must be a list')]);
  if (value.length > 8) throw makeValidationError('Payment badges may contain at most 8 entries', 'VALIDATION_ERROR', [fieldError('paymentBadges', 'Payment badges may contain at most 8 entries')]);
  return value.map((entry, index) => normalizePaymentBadge(entry, index)).filter(Boolean);
};

const DEFAULT_HEADER = {
  backgroundColor: '#ffffff',
  textColor: '#111827',
  accentColor: '#4f46e5',
  sticky: true,
  show: { deliverTo: true, search: true, notifications: true, account: true, wishlist: true, cart: true, mobileMenu: true },
  searchPlaceholder: 'Search for products, categories or brands...',
  deliverToLabel: 'Deliver to',
  menuLinks: [
    { label: 'Profile', url: '/profile' },
    { label: 'My Orders', url: '/orders' },
    { label: 'Wishlist', url: '/wishlist' },
    { label: 'Wallet', url: '/wallet' },
    { label: 'Loyalty & Rewards', url: '/loyalty' },
    { label: 'Gift Cards', url: '/gift-cards' },
    { label: 'Pre-orders & Plans', url: '/lifecycle' },
    { label: 'Settings', url: '/settings' },
  ],
};

const HEADER_SHOW_KEYS = ['deliverTo', 'search', 'notifications', 'account', 'wishlist', 'cart', 'mobileMenu'];

const normalizeHeaderSettings = (input = {}) => {
  const src = input && typeof input === 'object' ? input : {};
  const show = {};
  HEADER_SHOW_KEYS.forEach(key => { show[key] = src.show?.[key] === false ? false : true; });
  return {
    backgroundColor: hexColor(src.backgroundColor, 'Header background color') || DEFAULT_HEADER.backgroundColor,
    textColor: hexColor(src.textColor, 'Header text color') || DEFAULT_HEADER.textColor,
    accentColor: hexColor(src.accentColor, 'Header accent color') || DEFAULT_HEADER.accentColor,
    sticky: src.sticky === false ? false : true,
    show,
    searchPlaceholder: text(src.searchPlaceholder, 'Search placeholder', { max: 120, rejectMarkup: true }) || DEFAULT_HEADER.searchPlaceholder,
    deliverToLabel: text(src.deliverToLabel, 'Deliver-to label', { max: 40, rejectMarkup: true }) || DEFAULT_HEADER.deliverToLabel,
    menuLinks: normalizeFooterLinks(src.menuLinks, 'Menu links', DEFAULT_HEADER.menuLinks),
  };
};

const normalizeFooterSettings = (input = {}) => {
  const src = input && typeof input === 'object' ? input : {};
  const show = {};
  FOOTER_SHOW_KEYS.forEach(key => { show[key] = src.show?.[key] === false ? false : true; });
  const headingsSrc = src.headings && typeof src.headings === 'object' ? src.headings : {};
  const partnersSrc = src.partners && typeof src.partners === 'object' ? src.partners : {};
  return {
    backgroundColor: hexColor(src.backgroundColor, 'Footer background color') || DEFAULT_FOOTER.backgroundColor,
    textColor: hexColor(src.textColor, 'Footer text color') || DEFAULT_FOOTER.textColor,
    headingColor: hexColor(src.headingColor, 'Footer heading color') || DEFAULT_FOOTER.headingColor,
    accentColor: hexColor(src.accentColor, 'Footer accent color') || DEFAULT_FOOTER.accentColor,
    tagline: text(src.tagline, 'Footer tagline', { max: 300, rejectMarkup: true }),
    headings: {
      shop: text(headingsSrc.shop, 'Shop column heading', { max: 60, rejectMarkup: true }) || DEFAULT_FOOTER.headings.shop,
      support: text(headingsSrc.support, 'Support column heading', { max: 60, rejectMarkup: true }) || DEFAULT_FOOTER.headings.support,
      contact: text(headingsSrc.contact, 'Contact column heading', { max: 60, rejectMarkup: true }) || DEFAULT_FOOTER.headings.contact,
    },
    show,
    partners: {
      paymentsLabel: text(partnersSrc.paymentsLabel, 'Payments credit label', { max: 60, rejectMarkup: true }) || DEFAULT_FOOTER.partners.paymentsLabel,
      paymentsName: text(partnersSrc.paymentsName, 'Payment partner name', { max: 60, rejectMarkup: true }) || DEFAULT_FOOTER.partners.paymentsName,
      deliveryLabel: text(partnersSrc.deliveryLabel, 'Delivery credit label', { max: 60, rejectMarkup: true }) || DEFAULT_FOOTER.partners.deliveryLabel,
      deliveryName: text(partnersSrc.deliveryName, 'Delivery partner name', { max: 60, rejectMarkup: true }) || DEFAULT_FOOTER.partners.deliveryName,
    },
    paymentBadges: normalizePaymentBadges(src.paymentBadges),
    shopLinks: normalizeFooterLinks(src.shopLinks, 'Shop links', DEFAULT_FOOTER.shopLinks),
    supportLinks: normalizeFooterLinks(src.supportLinks, 'Support links', DEFAULT_FOOTER.supportLinks),
    copyright: text(src.copyright, 'Footer copyright line', { max: 200, rejectMarkup: true }),
  };
};

module.exports = {
  makeValidationError,
  fieldError,
  text,
  optionalText,
  httpUrl,
  pathPattern,
  languageCode,
  email,
  phone,
  boundedNumber,
  normalizeSeoSettings,
  normalizeMerchantSettings,
  normalizeCustomization,
  DEFAULT_FOOTER,
  normalizeFooterSettings,
  DEFAULT_HEADER,
  normalizeHeaderSettings,
};
