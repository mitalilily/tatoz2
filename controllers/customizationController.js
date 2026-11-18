const asyncHandler = require('express-async-handler');
const Settings = require('../models/Settings');
const { saveFileToDisk, deleteFile } = require('../middleware/upload');
const path = require('path');
const storefrontLocaleService = require('../services/storefrontLocaleService');
const publicCache = require('../services/publicCache');
const { PLATFORM_NAME, displayPlatformName } = require('../constants/branding');
const { normalizeCustomization, normalizeFooterSettings, DEFAULT_FOOTER, normalizeHeaderSettings, DEFAULT_HEADER } = require('../utils/settingsValidation');

const KEYS = {
  logo: 'site_logo',
  logoDark: 'site_logo_dark',
  favicon: 'site_favicon',
  social: 'site_social',
  contact: 'site_contact',
  theme: 'site_theme',
  footer: 'site_footer',
  header: 'site_header',
};

const DEFAULT_THEME = {
  brandColor: '#4f46e5',
  accentColor: '#a855f7',
  textColor: '#111827',
  buttonStyle: 'rounded', // 'rounded' | 'pill' | 'square'
  fontFamily: '',         // empty = inherit, otherwise CSS font-family string
};

const DEFAULTS = {
  [KEYS.logo]: '',
  [KEYS.logoDark]: '',
  [KEYS.favicon]: '',
  [KEYS.social]: {},
  [KEYS.contact]: {},
  [KEYS.theme]: DEFAULT_THEME,
  [KEYS.footer]: DEFAULT_FOOTER,
  [KEYS.header]: DEFAULT_HEADER,
};

function normalizeTheme(input) {
  try {
    return normalizeCustomization({ social: {}, contact: {}, theme: input }).theme;
  } catch (_) {
    return DEFAULT_THEME;
  }
}

function normalizeFooter(input) {
  try {
    return normalizeFooterSettings(input);
  } catch (_) {
    return DEFAULT_FOOTER;
  }
}

function normalizeHeader(input) {
  try {
    return normalizeHeaderSettings(input);
  } catch (_) {
    return DEFAULT_HEADER;
  }
}

// @desc    Get public site customization + platform settings (for footer, checkout — no auth)
// @route   GET /api/site
const getPublicCustomization = asyncHandler(async (req, res) => {
  const key = `public:v2:${String(req.query?.currency || '')}:${String(req.query?.locale || '')}`;
  const payload = await publicCache.getOrSet(req, res, {
    namespace: 'site',
    key,
    loader: async () => {
      const [logo, logoDark, favicon, social, contact, theme, footer, header, siteName, siteTagline, currency, currencySymbol, freeShippingThreshold, standardShippingCost, taxRate, country, timezone, locale, dateFormat, weightUnit, phoneCode, codEnabled] = await Promise.all([
        Settings.get(KEYS.logo, DEFAULTS[KEYS.logo]),
        Settings.get(KEYS.logoDark, DEFAULTS[KEYS.logoDark]),
        Settings.get(KEYS.favicon, DEFAULTS[KEYS.favicon]),
        Settings.get(KEYS.social, DEFAULTS[KEYS.social]),
        Settings.get(KEYS.contact, DEFAULTS[KEYS.contact]),
        Settings.get(KEYS.theme, DEFAULT_THEME),
        Settings.get(KEYS.footer, DEFAULT_FOOTER),
        Settings.get(KEYS.header, DEFAULT_HEADER),
        Settings.get('site_name', PLATFORM_NAME),
        Settings.get('site_tagline', ''),
        Settings.get('currency', 'INR'),
        Settings.get('currency_symbol', '₹'),
        Settings.get('free_shipping_threshold', 999),
        Settings.get('standard_shipping_cost', 49),
        Settings.get('tax_rate', 18),
        Settings.get('country', 'India'),
        Settings.get('timezone', 'Asia/Kolkata'),
        Settings.get('locale', 'en-IN'),
        Settings.get('date_format', 'DD/MM/YYYY'),
        Settings.get('weight_unit', 'kg'),
        Settings.get('phone_code', '+91'),
        Settings.get('cod_enabled', true),
      ]);
      const internationalization = await storefrontLocaleService.getPublicContext({
        tenantId: req.tenant?._id,
        requestedCurrency: req.query?.currency,
        requestedLocale: req.query?.locale,
        legacyCurrency: currency,
        legacyCurrencySymbol: currencySymbol,
        legacyLocale: locale,
      });
      return {
        success: true,
        site: {
          logo: logo || '',
          logoDark: logoDark || '',
          favicon: favicon || '',
          social: social && typeof social === 'object' ? social : {},
          contact: contact && typeof contact === 'object' ? contact : {},
          theme: normalizeTheme(theme),
          footer: normalizeFooter(footer),
          header: normalizeHeader(header),
          settings: {
            // A verified tenant is the source of truth for white-label
            // branding. The legacy Settings value remains the fallback for
            // platform-only requests and older deployments.
            siteName: displayPlatformName(req.tenant?.name || siteName || PLATFORM_NAME),
            siteTagline: siteTagline || '',
            currency: internationalization.currency,
            currencySymbol: internationalization.currencySymbol,
            freeShippingThreshold: (v => { const n = Number(v); return (n === 0 || n) && !Number.isNaN(n) ? n : 999 })(freeShippingThreshold),
            standardShippingCost: (v => { const n = Number(v); return (n === 0 || n) && !Number.isNaN(n) ? n : 49 })(standardShippingCost),
            taxRate: (v => { const n = Number(v); return (n === 0 || n) && !Number.isNaN(n) ? n : 18 })(taxRate),
            country: country || 'India',
            timezone: timezone || 'Asia/Kolkata',
            locale: internationalization.locale,
            baseCurrency: internationalization.baseCurrency,
            settlementCurrency: internationalization.settlementCurrency,
            rateFromBase: internationalization.rateFromBase,
            currencyDecimals: internationalization.decimals,
            dateFormat: dateFormat || 'DD/MM/YYYY',
            weightUnit: weightUnit || 'kg',
            phoneCode: phoneCode || '+91',
            codEnabled: codEnabled !== false && codEnabled !== 'false',
          },
          internationalization,
        },
      };
    },
  });
  res.json(payload);
});

// @desc    Get full customization (admin)
// @route   GET /api/admin/customization
const getCustomization = asyncHandler(async (req, res) => {
  const [logo, logoDark, favicon, social, contact, theme, footer, header] = await Promise.all([
    Settings.get(KEYS.logo, DEFAULTS[KEYS.logo]),
    Settings.get(KEYS.logoDark, DEFAULTS[KEYS.logoDark]),
    Settings.get(KEYS.favicon, DEFAULTS[KEYS.favicon]),
    Settings.get(KEYS.social, DEFAULTS[KEYS.social]),
    Settings.get(KEYS.contact, DEFAULTS[KEYS.contact]),
    Settings.get(KEYS.theme, DEFAULT_THEME),
    Settings.get(KEYS.footer, DEFAULT_FOOTER),
    Settings.get(KEYS.header, DEFAULT_HEADER),
  ]);
  res.json({
    success: true,
    customization: {
      logo: logo || '',
      logoDark: logoDark || '',
      favicon: favicon || '',
      social: social && typeof social === 'object' ? social : {},
      contact: contact && typeof contact === 'object' ? contact : {},
      theme: normalizeTheme(theme),
      footer: normalizeFooter(footer),
      header: normalizeHeader(header),
    },
  });
});

// @desc    Update customization (admin)
// @route   PUT /api/admin/customization
const updateCustomization = asyncHandler(async (req, res) => {
  const { logo, logoDark, favicon, social, contact, theme, footer, header } = req.body;
  if (logo !== undefined) await Settings.set(KEYS.logo, String(logo), 'site');
  if (logoDark !== undefined) await Settings.set(KEYS.logoDark, String(logoDark), 'site');
  if (favicon !== undefined) await Settings.set(KEYS.favicon, String(favicon), 'site');
  if (social !== undefined || contact !== undefined || theme !== undefined) {
    const normalized = normalizeCustomization({
      // Validate only fields supplied by this request. This lets an admin
      // repair one setting even when an older deployment stored a malformed
      // value in a different settings group.
      social: social === undefined ? {} : social,
      contact: contact === undefined ? {} : contact,
      theme: theme === undefined ? {} : theme,
    });
    if (social !== undefined) await Settings.set(KEYS.social, normalized.social, 'site');
    if (contact !== undefined) await Settings.set(KEYS.contact, normalized.contact, 'site');
    if (theme !== undefined) await Settings.set(KEYS.theme, normalized.theme, 'site');
  }
  if (footer !== undefined) {
    await Settings.set(KEYS.footer, normalizeFooterSettings(footer), 'site');
  }
  if (header !== undefined) {
    await Settings.set(KEYS.header, normalizeHeaderSettings(header), 'site');
  }
  await publicCache.invalidate(req, { namespace: 'site' });
  res.json({ success: true, message: 'Customization updated' });
});

// @desc    Upload site asset (logo, favicon, page image) – admin
// @route   POST /api/admin/customization/upload
const uploadSiteAsset = asyncHandler(async (req, res) => {
  if (!req.file || !req.file.buffer) {
    res.status(400);
    throw new Error('File is required');
  }
  const ext = path.extname(req.file.originalname) || '.jpg';
  const result = await saveFileToDisk(req.file.buffer, { ext, originalname: req.file.originalname, mimetype: req.file.mimetype });
  res.json({ success: true, url: result.url, publicId: result.filename });
});

// @desc    Delete site asset – admin
// @route   DELETE /api/admin/customization/asset
// Body: { url } — the /uploads/... URL to delete
const deleteSiteAsset = asyncHandler(async (req, res) => {
  const { url } = req.body;
  if (!url) {
    res.status(400);
    throw new Error('URL is required');
  }
  await deleteFile(url);
  res.json({ success: true, message: 'Asset deleted' });
});

module.exports = { getPublicCustomization, getCustomization, updateCustomization, uploadSiteAsset, deleteSiteAsset };
