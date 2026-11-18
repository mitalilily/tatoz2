const asyncHandler = require('express-async-handler');
const Settings = require('../models/Settings');
const { getAIClient, getAIModel, createAICompletion, parseAIJson, generateSEOContent } = require('../services/aiService');
const redirectMiddleware = require('../middleware/redirects');
const { startAIUsage } = require('../services/aiUsageService');
const { AI_CREDIT_COSTS, roundCredits } = require('../config/aiCreditCosts');
const { addApprovedProductFilter } = require('../services/productApprovalService');
const { normalizeSeoSettings } = require('../utils/settingsValidation');
const { tenantScope } = require('../services/adminTenantScope');

const AI_SEO_COST = AI_CREDIT_COSTS.siteSEO;
const AI_AUDIT_COST = AI_CREDIT_COSTS.seoAudit;
const SEO_AUDIT_CACHE_TTL_MS = 30 * 1000;
const SEO_AUDIT_PROVIDER_TIMEOUT_MS = 8000;
const seoAuditCache = new Map();
const ROBOTS_OPTIONS = new Set(['index, follow', 'noindex, follow', 'index, nofollow', 'noindex, nofollow']);

const withTimeout = (promise, milliseconds, message) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Object.assign(new Error(message), { code: 'AI_AUDIT_TIMEOUT' })), milliseconds);
  promise.then(
    value => { clearTimeout(timer); resolve(value); },
    error => { clearTimeout(timer); reject(error); },
  );
});

const xmlEscape = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const requestOrigin = req => `${req.protocol}://${req.get('host')}`.replace(/\/$/, '');
const auditConfigValue = (key, value) => {
  if (/custom_(head|body)_scripts|ga4_id|gtm_id|fb_pixel|verification_google/i.test(key)) return value ? '[configured]' : '[not configured]';
  if (key === 'seo_robots_txt') return String(value || '').slice(0, 1200);
  if (Array.isArray(value)) return value.slice(0, 30).map(item => auditConfigValue(key, item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 20).map(([childKey, childValue]) => [childKey, auditConfigValue(`${key}.${childKey}`, childValue)]));
  }
  if (typeof value === 'string') return value.slice(0, 500);
  return value;
};

const buildAuditConfig = settings => Object.fromEntries(
  settings.map(setting => [setting.key, auditConfigValue(setting.key, setting.value)]),
);

const buildLocalAudit = (config, siteStats) => {
  const finding = (title, severity, description, recommendation, currentValue = 'not set', suggestedValue = '') => ({
    title, severity, description, recommendation, currentValue, ...(suggestedValue ? { suggestedValue } : {}),
  });
  const configured = key => {
    const value = config[key];
    if (value === undefined || value === null || value === '' || value === false) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.values(value).some(item => item !== undefined && item !== null && item !== '');
    return true;
  };
  const categories = [
    {
      name: 'Meta Tags',
      score: configured('seo_meta_description') && configured('seo_title_template') ? 90 : 45,
      status: configured('seo_meta_description') && configured('seo_title_template') ? 'good' : 'critical',
      findings: [
        configured('seo_title_template')
          ? finding('Title template configured', 'pass', 'A reusable title template is available for page titles.', 'Keep the template concise and place the brand after the page title.', config.seo_title_template)
          : finding('Title template missing', 'critical', 'Pages do not have a reliable default title template.', 'Set a title template with %s as the page-title placeholder.', 'not set', '%s | Store name'),
        configured('seo_meta_description')
          ? finding('Default meta description configured', 'pass', 'The storefront has a default description for pages without a more specific one.', 'Review it after each major catalogue or positioning change.', config.seo_meta_description)
          : finding('Default meta description missing', 'critical', 'Pages without custom descriptions may render thin search snippets.', 'Add a clear 150–160 character store description.', 'not set', 'A concise store value proposition'),
      ],
    },
    {
      name: 'Crawlability',
      score: configured('seo_sitemap_enabled') && configured('seo_robots_txt') ? 85 : 55,
      status: configured('seo_sitemap_enabled') && configured('seo_robots_txt') ? 'good' : 'warning',
      findings: [
        configured('seo_sitemap_enabled') ? finding('Sitemap enabled', 'pass', 'The sitemap endpoint is enabled.', 'Keep product, category and brand URLs in the sitemap.') : finding('Sitemap disabled', 'warning', 'Search engines cannot discover the configured sitemap through the SEO settings.', 'Enable the sitemap and submit its URL to search consoles.', false, true),
        configured('seo_robots_txt') ? finding('Robots policy configured', 'pass', 'A robots.txt policy is available for crawlers.', 'Verify private account and checkout paths remain disallowed.') : finding('Robots policy missing', 'warning', 'The site is using an implicit crawler policy.', 'Configure robots.txt with a sitemap URL and private path rules.', 'not set', 'User-agent: *\nAllow: /'),
      ],
    },
    {
      name: 'Structured Data & Social',
      score: configured('seo_organization_schema') && configured('seo_og_title') ? 80 : 50,
      status: configured('seo_organization_schema') && configured('seo_og_title') ? 'good' : 'warning',
      findings: [
        configured('seo_organization_schema') ? finding('Organization schema configured', 'pass', 'Organization identity data is available for rich-result context.', 'Keep name, logo and URL aligned with the public storefront.') : finding('Organization schema incomplete', 'warning', 'Search engines may not have a complete business identity to associate with the store.', 'Configure organization name, logo, URL and contact details.', 'not set', 'Organization schema'),
        configured('seo_og_title') ? finding('Social preview title configured', 'pass', 'Open Graph sharing has a default title.', 'Add a matching image and description for consistent previews.') : finding('Open Graph title missing', 'warning', 'Shared links may use inconsistent or unattractive titles.', 'Add a concise Open Graph title and description.', 'not set', 'Store name and value proposition'),
      ],
    },
    {
      name: 'Catalogue Content',
      score: siteStats.totalProducts ? Math.max(20, Math.round(100 - ((siteStats.productsWithoutSeoMeta / siteStats.totalProducts) * 60) - ((siteStats.productsWithoutImageAlt / siteStats.totalProducts) * 40))) : 50,
      status: siteStats.productsWithoutSeoMeta || siteStats.productsWithoutImageAlt ? 'warning' : 'good',
      findings: [
        finding('Products missing SEO metadata', siteStats.productsWithoutSeoMeta ? 'warning' : 'pass', `${siteStats.productsWithoutSeoMeta} of ${siteStats.totalProducts} active products are missing a meta title or description.`, 'Use Content SEO to fill the highest-value product pages first.', siteStats.productsWithoutSeoMeta, 0),
        finding('Products missing image alt text', siteStats.productsWithoutImageAlt ? 'warning' : 'pass', `${siteStats.productsWithoutImageAlt} active products have images without alt text.`, 'Add descriptive, product-specific alt text to primary images.', siteStats.productsWithoutImageAlt, 0),
      ],
    },
  ];
  const scores = categories.map(category => category.score);
  const overallScore = Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
  return {
    overallScore,
    summary: `Local SEO checks completed quickly across ${siteStats.totalProducts} active products, ${siteStats.totalCategories} categories and ${siteStats.totalBlogPosts} published blog posts. Review warnings below and use AI SEO for copy suggestions.`,
    categories,
    quickWins: categories.flatMap(category => category.findings.filter(item => ['critical', 'warning'].includes(item.severity)).map(item => item.recommendation)).slice(0, 5),
    missingEssentials: categories.flatMap(category => category.findings.filter(item => item.severity === 'critical').map(item => item.title)),
    siteStats,
  };
};

const auditSafeValue = value => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    try { return JSON.stringify(value).slice(0, 2400); } catch (_) { return '[unavailable]'; }
  }
  return String(value).slice(0, 2400);
};

const normalizeAuditResult = (input, fallback) => {
  const source = input && typeof input === 'object' ? input : {};
  const categories = Array.isArray(source.categories) && source.categories.length
    ? source.categories.slice(0, 12).map(category => ({
      name: auditSafeValue(category.name || 'SEO area').slice(0, 120),
      score: Math.max(0, Math.min(100, Number(category.score) || 0)),
      status: ['good', 'warning', 'critical'].includes(category.status) ? category.status : 'warning',
      findings: Array.isArray(category.findings) ? category.findings.slice(0, 20).map(finding => ({
        title: auditSafeValue(finding.title || 'Finding').slice(0, 180),
        severity: ['critical', 'warning', 'info', 'pass'].includes(finding.severity) ? finding.severity : 'info',
        description: auditSafeValue(finding.description),
        recommendation: auditSafeValue(finding.recommendation),
        currentValue: auditSafeValue(finding.currentValue),
        suggestedValue: auditSafeValue(finding.suggestedValue),
      })) : [],
    })) : fallback.categories;
  const score = Number(source.overallScore);
  return {
    ...fallback,
    ...source,
    overallScore: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : fallback.overallScore,
    summary: auditSafeValue(source.summary || fallback.summary),
    categories,
    quickWins: (Array.isArray(source.quickWins) ? source.quickWins : fallback.quickWins).slice(0, 8).map(auditSafeValue),
    missingEssentials: (Array.isArray(source.missingEssentials) ? source.missingEssentials : fallback.missingEssentials).slice(0, 12).map(auditSafeValue),
    siteStats: fallback.siteStats,
  };
};

// Helper: check and deduct specific credit amount atomically.
async function deductCredits(res, cost) {
  const updated = await Settings.findOneAndUpdate(
    { key: 'ai_credits', value: { $gte: cost } },
    { $inc: { value: -cost }, $set: { group: 'ai' } },
    { new: true },
  );
  if (!updated) {
    const credits = Number(await Settings.get('ai_credits', 0));
    res.status(402);
    throw new Error(`Insufficient AI credits. You have ${credits} credits but need ${cost}. Please top up.`);
  }
  return roundCredits(updated.value);
}

const refundCredits = async cost => {
  await Settings.findOneAndUpdate(
    { key: 'ai_credits' },
    { $inc: { value: cost }, $set: { group: 'ai' } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
};

// @desc    Get all SEO settings
// @route   GET /api/admin/seo
// @access  Admin
const getSeoSettings = asyncHandler(async (req, res) => {
  const settings = await Settings.find({ group: 'seo' });
  const map = {};
  settings.forEach((s) => {
    map[s.key] = s.value;
  });
  res.json(map);
});

// @desc    Update SEO settings (batch)
// @route   PUT /api/admin/seo
// @access  Admin
const updateSeoSettings = asyncHandler(async (req, res) => {
  const { settings } = req.body;
  if (!settings || typeof settings !== 'object') {
    res.status(400);
    throw new Error('Settings object is required');
  }
  const normalized = normalizeSeoSettings(settings);
  const entries = Object.entries(normalized);
  await Promise.all(entries.map(([key, value]) => Settings.set(key, value, 'seo')));
  seoAuditCache.clear();
  if (redirectMiddleware.refresh) redirectMiddleware.refresh().catch(() => {});
  res.json({ success: true, message: 'SEO settings updated', count: entries.length, settings: normalized });
});

// @desc    Get public SEO config (for frontend head tags)
// @route   GET /api/seo/public
// @access  Public
const getPublicSeoConfig = asyncHandler(async (req, res) => {
  const keys = [
    'seo_title_template', 'seo_meta_description', 'seo_canonical_base',
    'seo_robots_default', 'seo_og_title', 'seo_og_description', 'seo_og_image',
    'seo_og_type', 'seo_twitter_card', 'seo_twitter_site', 'seo_social_profiles', 'seo_favicon_url',
    'seo_organization_schema', 'seo_website_schema', 'seo_localbusiness_enabled',
    'seo_localbusiness_schema', 'seo_ga4_id', 'seo_gtm_id', 'seo_fb_pixel',
    'seo_verification_google', 'seo_custom_head_scripts', 'seo_custom_body_scripts',
    'seo_default_language', 'seo_hreflang_entries', 'seo_preconnect_urls',
    'seo_noindex_patterns', 'seo_trailing_slash',
    'google_ads_conversion_id', 'google_ads_purchase_label',
    'google_ads_begin_checkout_label', 'google_ads_add_to_cart_label',
  ];
  const settings = await Settings.find({ key: { $in: keys } });
  const config = {};
  settings.forEach((s) => {
    config[s.key] = s.value;
  });
  res.json(config);
});

// @desc    Serve dynamic XML sitemap
// @route   GET /sitemap.xml
// @access  Public
const serveSitemap = asyncHandler(async (req, res) => {
  const enabled = await Settings.get('seo_sitemap_enabled', true);
  if (!enabled) {
    res.status(404).send('Sitemap not enabled');
    return;
  }

  const configuredBase = String(await Settings.get('seo_canonical_base', '') || '').replace(/\/$/, '');
  const canonicalBase = configuredBase || requestOrigin(req);
  const configuredTypes = await Settings.get('seo_sitemap_types', ['products', 'categories', 'brands', 'blog']);
  const types = Array.isArray(configuredTypes) ? configuredTypes : ['products', 'categories', 'brands', 'blog'];
  const changefreq = await Settings.get('seo_sitemap_changefreq', 'weekly');
  const priority = await Settings.get('seo_sitemap_priority', 0.8);
  const customUrls = await Settings.get('seo_sitemap_custom_urls', []);

  const urls = [];

  // Homepage
  if (canonicalBase) {
    urls.push({ loc: canonicalBase, changefreq: 'daily', priority: 1.0, lastmod: new Date().toISOString().split('T')[0] });
  }

  // Products
  if (types.includes('products')) {
    const Product = require('../models/Product');
    const productQuery = { isActive: true, ...(req.tenant ? { tenant: req.tenant._id } : {}) };
    addApprovedProductFilter(productQuery);
    const products = await Product.find(productQuery).select('slug updatedAt').lean();
    products.forEach((p) => {
      urls.push({
        loc: `${canonicalBase}/product/${p.slug}`,
        lastmod: p.updatedAt ? p.updatedAt.toISOString().split('T')[0] : undefined,
        changefreq,
        priority,
      });
    });
  }

  // Categories
  if (types.includes('categories')) {
    const Category = require('../models/Category');
    const categories = await Category.find({ isActive: true, ...(req.tenant ? { tenant: req.tenant._id } : {}) }).select('slug updatedAt').lean();
    categories.forEach((c) => {
      urls.push({
        loc: `${canonicalBase}/category/${c.slug}`,
        lastmod: c.updatedAt ? c.updatedAt.toISOString().split('T')[0] : undefined,
        changefreq,
        priority: 0.7,
      });
    });
  }

  // Brands
  if (types.includes('brands')) {
    const Brand = require('../models/Brand');
    const brands = await Brand.find({ isActive: true, ...(req.tenant ? { tenant: req.tenant._id } : {}) }).select('slug updatedAt').lean();
    brands.forEach((b) => {
      urls.push({
        loc: `${canonicalBase}/brand/${b.slug}`,
        lastmod: b.updatedAt ? b.updatedAt.toISOString().split('T')[0] : undefined,
        changefreq,
        priority: 0.6,
      });
    });
  }

  // Blog posts
  if (types.includes('blog')) {
    const Blog = require('../models/Blog');
    const posts = await Blog.find({ status: 'published', ...(req.tenant ? { tenant: req.tenant._id } : {}) }).select('slug updatedAt').lean();
    posts.forEach((p) => {
      urls.push({
        loc: `${canonicalBase}/blog/${p.slug}`,
        lastmod: p.updatedAt ? p.updatedAt.toISOString().split('T')[0] : undefined,
        changefreq,
        priority: 0.6,
      });
    });
  }

  // Custom URLs
  if (Array.isArray(customUrls)) {
    customUrls.forEach((u) => {
      if (u.url) {
        urls.push({
          loc: /^https?:\/\//i.test(u.url) ? u.url : `${canonicalBase}${u.url}`,
          changefreq: u.changefreq || changefreq,
          priority: u.priority ?? priority,
        });
      }
    });
  }

  const uniqueUrls = [];
  const seenUrls = new Set();
  urls.forEach(url => {
    if (!url.loc || seenUrls.has(url.loc)) return;
    seenUrls.add(url.loc);
    uniqueUrls.push(url);
  });

  // Build XML
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  uniqueUrls.forEach((u) => {
    xml += '  <url>\n';
    xml += `    <loc>${xmlEscape(u.loc)}</loc>\n`;
    if (u.lastmod) xml += `    <lastmod>${xmlEscape(u.lastmod)}</lastmod>\n`;
    if (u.changefreq) xml += `    <changefreq>${xmlEscape(u.changefreq)}</changefreq>\n`;
    if (u.priority !== undefined) xml += `    <priority>${xmlEscape(u.priority)}</priority>\n`;
    xml += '  </url>\n';
  });
  xml += '</urlset>';

  res.set('Content-Type', 'application/xml; charset=UTF-8');
  res.send(xml);
});

// @desc    Serve robots.txt
// @route   GET /robots.txt
// @access  Public
const serveRobots = asyncHandler(async (req, res) => {
  const configuredBase = String(await Settings.get('seo_canonical_base', '') || '').replace(/\/$/, '');
  const canonicalBase = configuredBase || requestOrigin(req);
  const defaultContent = `User-agent: *\nAllow: /\nSitemap: ${canonicalBase}/sitemap.xml\n`;
  const configuredContent = await Settings.get('seo_robots_txt', '');
  const content = String(configuredContent || '').trim() || defaultContent;
  res.set('Content-Type', 'text/plain; charset=UTF-8');
  res.send(content.endsWith('\n') ? content : `${content}\n`);
});

// @desc    AI-generate all SEO settings (50 credits)
// @route   POST /api/admin/seo/ai-generate
// @access  Admin
const aiGenerateSeo = asyncHandler(async (req, res) => {
  const model = await getAIModel();
  const usage = startAIUsage(req, { feature: 'seo', action: 'generate_site_seo', credits: AI_SEO_COST, model });
  let remainingCredits;
  let creditsCharged = false;
  try {
    remainingCredits = await deductCredits(res, AI_SEO_COST);
    creditsCharged = true;
    usage.charge(AI_SEO_COST);

    // Keep the prompt compact and tenant-scoped. Large descriptions/scripts
    // make provider calls slower and can accidentally expose unrelated stores.
    const Product = require('../models/Product');
    const Category = require('../models/Category');
    const Brand = require('../models/Brand');
    const Blog = require('../models/Blog');
    const scope = tenantScope(req);
    const [products, categories, brands, blogs, currentSettings] = await Promise.all([
      Product.find({ ...scope, isActive: true }).select('title tags').limit(12).lean(),
      Category.find({ ...scope, isActive: true }).select('name').limit(80).lean(),
      Brand.find({ ...scope, isActive: true }).select('name').limit(80).lean(),
      Blog.find({ ...scope, status: 'published' }).select('title tags').limit(8).lean(),
      Settings.find({ group: 'seo' }).select('key value').lean(),
    ]);

    const existingConfig = Object.fromEntries(currentSettings.map(setting => [setting.key, setting.value]));
    const canonicalBase = String(existingConfig.seo_canonical_base || '').replace(/\/$/, '');
    const siteBaseForPrompt = canonicalBase || requestOrigin(req);
    const titleTemplate = String(existingConfig.seo_title_template || '');
    const siteName = titleTemplate.replace('%s | ', '').replace(' | %s', '') || 'Our Store';
    const siteContext = {
      siteName: siteName.slice(0, 120),
      canonicalBase: siteBaseForPrompt,
      productCount: products.length,
      sampleProducts: products.map(product => String(product.title || '').slice(0, 120)),
      categories: categories.map(category => String(category.name || '').slice(0, 80)),
      brands: brands.map(brand => String(brand.name || '').slice(0, 80)),
      blogTopics: blogs.map(blog => String(blog.title || '').slice(0, 120)),
    };

    const client = await getAIClient();
    let response = await createAICompletion(client, {
      model,
      messages: [
        {
          role: 'system',
          content: 'You are an expert e-commerce SEO specialist. Return only valid JSON. Do not include markdown, scripts, credentials, or commentary.',
        },
        {
          role: 'user',
          content: `Generate optimized site-wide SEO settings for this store:

Site Data:
${JSON.stringify(siteContext, null, 2)}

Generate a JSON object with these exact keys and optimized values:
{
  "seo_title_template": "optimized title template using %s as page title placeholder",
  "seo_meta_description": "compelling site-wide meta description (150-160 chars)",
  "seo_robots_default": "index, follow",
  "seo_og_title": "compelling OG title for homepage",
  "seo_og_description": "engaging OG description (100-150 chars)",
  "seo_og_type": "website",
  "seo_twitter_card": "summary_large_image",
  "seo_organization_schema": {
    "name": "business name",
    "logo": "",
    "url": "${siteBaseForPrompt}",
    "socialProfiles": [],
    "contactEmail": "",
    "contactPhone": ""
  },
  "seo_website_schema": {
    "searchActionUrl": "${siteBaseForPrompt}/search?q={search_term_string}"
  },
  "seo_robots_txt": "optimized robots.txt content with sitemap URL",
  "seo_noindex_patterns": ["array of URL patterns that should be noindexed like /account/*, /cart, /checkout"],
  "seo_sitemap_enabled": true,
  "seo_sitemap_types": ["products", "categories", "brands", "blog"],
  "seo_sitemap_changefreq": "weekly",
  "seo_sitemap_priority": 0.8,
  "seo_default_language": "en",
  "seo_404_title": "optimized 404 page title",
  "seo_404_description": "helpful 404 page description"
}

Return ONLY the JSON object.`,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1600,
      temperature: 0.25,
    }, 'Site SEO generation');

    // Some provider/model combinations occasionally stop after a reasoning
    // preamble or return a truncated object. Retry once with a smaller,
    // explicitly compact contract before surfacing an error to the admin.
    let parsedResponse;
    try {
      parsedResponse = parseAIJson(response, 'AI SEO returned an invalid response');
    } catch (parseError) {
      console.warn('[ai] Site SEO response was not valid JSON; retrying compact response');
      response = await createAICompletion(client, {
        model,
        messages: [
          { role: 'system', content: 'Return exactly one valid compact JSON object. No markdown, prose, scripts, or comments.' },
          { role: 'user', content: `Return SEO settings for ${siteBaseForPrompt} with these keys only: seo_title_template, seo_meta_description, seo_robots_default, seo_og_title, seo_og_description, seo_og_type, seo_twitter_card, seo_organization_schema, seo_website_schema, seo_robots_txt, seo_noindex_patterns, seo_sitemap_enabled, seo_sitemap_types, seo_sitemap_changefreq, seo_sitemap_priority, seo_default_language, seo_404_title, seo_404_description. Use valid JSON strings, arrays, booleans and numbers.` },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2200,
        temperature: 0.1,
      }, 'Site SEO generation retry');
      parsedResponse = parseAIJson(response, parseError.message);
    }

    // Normalize before returning the draft so the admin can save it without
    // hitting validation errors from provider-generated URLs or markup.
    const generated = normalizeSeoSettings(parsedResponse);
    const fieldsUpdated = Object.keys(generated).length;
    if (!fieldsUpdated) throw new Error('AI SEO returned no usable settings');
    await usage.finish({ usage: response.usage, extraMetadata: { fieldsGenerated: fieldsUpdated } });
    return res.json({ success: true, generated, fieldsUpdated, aiCredits: remainingCredits });
  } catch (err) {
    if (creditsCharged) {
      await refundCredits(AI_SEO_COST);
      usage.refund(AI_SEO_COST);
    }
    await usage.finish({ status: res.statusCode === 402 ? 'rejected' : 'failed', error: err.message });
    throw err;
  }
});

// @desc    AI SEO Audit — analyze current settings and suggest improvements (20 credits)
// @route   POST /api/admin/seo/ai-audit
// @access  Admin
const aiSeoAudit = asyncHandler(async (req, res) => {
  const cacheKey = req.adminGlobalScope
    ? `global:${(req.adminTenantIds || []).map(String).sort().join(',')}`
    : `tenant:${String(req.tenant?._id || 'default')}`;
  const cached = seoAuditCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < SEO_AUDIT_CACHE_TTL_MS) {
    const credits = Number(await Settings.get('ai_credits', 0));
    return res.json({
      success: true,
      audit: { ...cached.audit, auditMeta: { ...cached.audit.auditMeta, cached: true, ageMs: Date.now() - cached.createdAt } },
      aiCredits: credits,
      cached: true,
    });
  }

  const model = await getAIModel();
  const usage = startAIUsage(req, { feature: 'seo', action: 'audit_site_seo', credits: AI_AUDIT_COST, model });
  let remainingCredits;
  let creditsCharged = false;
  let localAudit = null;
  const startedAt = Date.now();
  try {
    remainingCredits = await deductCredits(res, AI_AUDIT_COST);
    creditsCharged = true;
    usage.charge(AI_AUDIT_COST);

    const Product = require('../models/Product');
    const Category = require('../models/Category');
    const Blog = require('../models/Blog');
    const scope = tenantScope(req);
    const allSettings = await Settings.find({ group: 'seo' }).select('key value').lean();
    const currentConfig = buildAuditConfig(allSettings);
    const [productCount, categoryCount, blogCount, productsWithoutSeo, productsWithoutAlt] = await Promise.all([
      Product.countDocuments({ ...scope, isActive: true }),
      Category.countDocuments({ ...scope, isActive: true }),
      Blog.countDocuments({ ...scope, status: 'published' }),
      Product.countDocuments({ ...scope, isActive: true, $or: [{ 'seo.metaTitle': { $in: [null, ''] } }, { 'seo.metaDescription': { $in: [null, ''] } }] }),
      Product.countDocuments({ ...scope, isActive: true, 'images.alt': { $in: [null, ''] } }),
    ]);
    const siteStats = { totalProducts: productCount, totalCategories: categoryCount, totalBlogPosts: blogCount, productsWithoutSeoMeta: productsWithoutSeo, productsWithoutImageAlt: productsWithoutAlt };
    localAudit = buildLocalAudit(currentConfig, siteStats);

    const client = await getAIClient();
    const response = await withTimeout(createAICompletion(client, {
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a senior SEO consultant. Return only valid JSON, with concise but specific findings. Never include scripts, credentials, or markdown.',
        },
        {
          role: 'user',
          content: `Audit this e-commerce store and prioritize the highest-impact fixes.

Current SEO Configuration:
${JSON.stringify(currentConfig, null, 2)}

Site Statistics:
${JSON.stringify(siteStats, null, 2)}

Analyze the current settings against SEO best practices and return a JSON object:
{
  "overallScore": number 0-100,
  "summary": "2-3 sentence executive summary of SEO health",
  "categories": [
    {
      "name": "Category name (e.g. Meta Tags, Structured Data, Crawlability, Content, Performance)",
      "score": number 0-100,
      "status": "good" | "warning" | "critical",
      "findings": [
        {
          "title": "Finding title",
          "severity": "critical" | "warning" | "info" | "pass",
          "description": "What the issue is",
          "recommendation": "Specific fix or improvement",
          "currentValue": "current setting value or 'not set'",
          "suggestedValue": "what it should be (if applicable)"
        }
      ]
    }
  ],
  "quickWins": ["top 5 easy improvements that would have the biggest impact"],
  "missingEssentials": ["list of essential SEO elements that are not configured"]
}

Check meta descriptions, OG tags, robots.txt, sitemap, schema, noindex patterns, canonical URL, language tags, analytics status, and catalogue content gaps. Keep the response under 2200 output tokens.

Return ONLY the JSON.`,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 2200,
      temperature: 0.2,
    }, 'SEO audit'), SEO_AUDIT_PROVIDER_TIMEOUT_MS, 'SEO audit provider timed out');
    const audit = normalizeAuditResult(parseAIJson(response, 'AI audit returned an invalid response'), localAudit);
    audit.auditMeta = { source: 'ai', cached: false, durationMs: Date.now() - startedAt, generatedAt: new Date().toISOString() };
    seoAuditCache.set(cacheKey, { audit, createdAt: Date.now() });
    await usage.finish({ usage: response.usage, extraMetadata: { overallScore: audit.overallScore, categories: audit.categories.length, durationMs: Date.now() - startedAt } });
    return res.json({ success: true, audit, aiCredits: remainingCredits, cached: false });
  } catch (err) {
    if (creditsCharged) {
      await refundCredits(AI_AUDIT_COST);
      usage.refund(AI_AUDIT_COST);
    }
    await usage.finish({ status: res.statusCode === 402 ? 'rejected' : 'failed', error: err.message });
    // A provider outage should not block the admin from getting useful,
    // deterministic SEO findings. Return the fast local audit and label it.
    if (localAudit && res.statusCode !== 402) {
      localAudit.auditMeta = { source: 'local-fallback', cached: false, durationMs: Date.now() - startedAt, generatedAt: new Date().toISOString(), providerError: 'AI suggestions temporarily unavailable' };
      seoAuditCache.set(cacheKey, { audit: localAudit, createdAt: Date.now() });
      return res.json({ success: true, audit: localAudit, aiCredits: Number(await Settings.get('ai_credits', 0)), cached: false, aiFallback: true });
    }
    throw err;
  }
});

// ─── Content SEO Management ─────────────────────────────────────────

const MODEL_MAP = {
  products: () => require('../models/Product'),
  categories: () => require('../models/Category'),
  brands: () => require('../models/Brand'),
  blog: () => require('../models/Blog'),
};

const TITLE_FIELD = { products: 'title', categories: 'name', brands: 'name', blog: 'title' };

function computeSeoScore(seo, type) {
  let score = 0;
  const mt = seo?.metaTitle || '';
  const md = seo?.metaDescription || '';
  const kw = seo?.keywords || [];
  if (mt.length >= 30 && mt.length <= 60) score += 30;
  else if (mt.length > 0) score += 15;
  if (md.length >= 120 && md.length <= 160) score += 30;
  else if (md.length > 0) score += 15;
  if (kw.length >= 3) score += 20;
  else if (kw.length > 0) score += 10;
  if (type === 'products' && seo?.altText) score += 10;
  if (seo?.schema) score += 10;
  return score;
}

// @desc    Get content SEO stats (products/categories/brands/blog)
// @route   GET /api/admin/seo/content-stats
const getContentSeoStats = asyncHandler(async (req, res) => {
  const { type = 'products', page = 1, limit = 50, filter = 'all' } = req.query;
  const getModel = MODEL_MAP[type];
  if (!getModel) { res.status(400); throw new Error('Invalid type'); }

  const Model = getModel();
  const titleField = TITLE_FIELD[type];
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const skip = (safePage - 1) * safeLimit;

  let query = { ...tenantScope(req) };
  if (['products', 'categories', 'brands'].includes(type)) query.isActive = true;
  if (type === 'blog') query.status = 'published';

  if (filter === 'missing') {
    query['$or'] = [
      { 'seo.metaTitle': { $exists: false } },
      { 'seo.metaTitle': '' },
      { 'seo.metaTitle': null },
      { 'seo.metaDescription': { $exists: false } },
      { 'seo.metaDescription': '' },
      { 'seo.metaDescription': null },
    ];
  } else if (filter === 'complete') {
    query['seo.metaTitle'] = { $exists: true, $ne: '', $ne: null };
    query['seo.metaDescription'] = { $exists: true, $ne: '', $ne: null };
  }

  const [items, total] = await Promise.all([
    Model.find(query)
      .select(`${titleField} slug seo`)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    Model.countDocuments(query),
  ]);

  const enriched = items.map(item => ({
    _id: item._id,
    name: item[titleField],
    slug: item.slug,
    seo: item.seo || {},
    seoScore: computeSeoScore(item.seo, type),
  }));

  res.json({
    items: enriched,
    total,
    type,
    pagination: { page: safePage, limit: safeLimit, pages: Math.ceil(total / safeLimit) },
  });
});

// @desc    Update SEO for a single content item
// @route   PUT /api/admin/seo/item/:type/:id
const updateItemSeo = asyncHandler(async (req, res) => {
  const { type, id } = req.params;
  const { seo } = req.body;
  const getModel = MODEL_MAP[type];
  if (!getModel) { res.status(400); throw new Error('Invalid type'); }
  if (!seo || typeof seo !== 'object') { res.status(400); throw new Error('SEO object is required'); }

  const Model = getModel();
  const update = {};
  const fields = type === 'products'
    ? ['metaTitle', 'metaDescription', 'keywords', 'altText', 'focusKeyword', 'canonical', 'robots', 'ogTitle', 'ogDescription', 'ogImage']
    : ['metaTitle', 'metaDescription', 'keywords', ...(type === 'blog' ? ['ogImage'] : [])];
  fields.forEach((field) => {
    if (seo[field] === undefined) return;
    if (field === 'keywords') update[`seo.${field}`] = Array.isArray(seo[field])
      ? seo[field].map((keyword) => String(keyword).trim()).filter(Boolean)
      : String(seo[field]).split(',').map((keyword) => keyword.trim()).filter(Boolean);
    else if (field === 'robots') update[`seo.${field}`] = ROBOTS_OPTIONS.has(seo[field]) ? seo[field] : 'index, follow';
    else update[`seo.${field}`] = typeof seo[field] === 'string' ? seo[field].trim() : seo[field];
  });
  if (Object.keys(update).length === 0) { res.status(400); throw new Error('No SEO fields supplied'); }

  let item;
  try {
    item = await Model.findOneAndUpdate({ _id: id, ...tenantScope(req) }, { $set: update }, { new: true, runValidators: true }).lean();
  } catch (error) {
    if (error.name === 'CastError') { res.status(400); throw new Error('Invalid item id'); }
    throw error;
  }
  if (!item) { res.status(404); throw new Error('Item not found'); }

  res.json({ success: true, seo: item.seo });
});

// @desc    Generate SEO for one content item
// @route   POST /api/admin/seo/item/:type/:id/generate
const generateItemSeo = asyncHandler(async (req, res) => {
  const { type, id } = req.params;
  const getModel = MODEL_MAP[type];
  if (!getModel) { res.status(400); throw new Error('Invalid type'); }

  const Model = getModel();
  const query = { _id: id, ...tenantScope(req) };
  if (['products', 'categories', 'brands'].includes(type)) query.isActive = true;
  if (type === 'blog') query.status = 'published';

  let item;
  try {
    item = await Model.findOne(query)
      .select(`${TITLE_FIELD[type]} description shortDescription excerpt content tags`)
      .lean();
  } catch (error) {
    if (error.name === 'CastError') { res.status(400); throw new Error('Invalid item id'); }
    throw error;
  }
  if (!item) { res.status(404); throw new Error('Item not found'); }

  const model = await getAIModel();
  const usage = startAIUsage(req, { feature: 'seo', action: 'generate_item_seo', credits: BULK_SEO_COST, model, metadata: { contentType: type, itemId: String(id) } });
  let creditsCharged = false;
  try {
    const remainingCredits = await deductCredits(res, BULK_SEO_COST);
    creditsCharged = true;
    usage.charge(BULK_SEO_COST);

    const title = String(item[TITLE_FIELD[type]] || '').trim().slice(0, 200);
    const sourceText = item.description || item.shortDescription || item.excerpt || item.content || '';
    const description = String(sourceText).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
    const generated = await generateSEOContent(title, description, type);
    const cleanText = (value, max) => String(value || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
    const cleanKeywords = value => (Array.isArray(value) ? value : String(value || '').split(',')).map(keyword => cleanText(keyword, 80)).filter(Boolean).slice(0, 12);
    const seoUpdate = {
      'seo.metaTitle': cleanText(generated.metaTitle, 60),
      'seo.metaDescription': cleanText(generated.metaDescription, 160),
      'seo.keywords': cleanKeywords(generated.keywords),
    };
    if (type === 'products' && generated.altText) seoUpdate['seo.altText'] = cleanText(generated.altText, 240);
    if (!seoUpdate['seo.metaTitle'] && !seoUpdate['seo.metaDescription'] && !seoUpdate['seo.keywords'].length) throw new Error('AI returned no usable item SEO fields');

    const updated = await Model.findOneAndUpdate({ _id: id, ...tenantScope(req) }, { $set: seoUpdate }, { new: true, runValidators: true }).lean();
    await usage.finish({ extraMetadata: { contentType: type, itemId: String(id), fieldsUpdated: Object.keys(seoUpdate).length } });
    return res.json({ success: true, type, itemId: id, seo: updated?.seo || seoUpdate, fieldsUpdated: Object.keys(seoUpdate).length, aiCredits: remainingCredits });
  } catch (error) {
    if (creditsCharged) {
      await refundCredits(BULK_SEO_COST);
      usage.refund(BULK_SEO_COST);
    }
    await usage.finish({ status: res.statusCode === 402 ? 'rejected' : 'failed', error: error.message });
    throw error;
  }
});

// @desc    Bulk generate SEO for items missing it
// @route   POST /api/admin/seo/bulk-generate
const BULK_SEO_COST = AI_CREDIT_COSTS.bulkSEO;
const BULK_LIMIT = 50;
const bulkGenerateSeo = asyncHandler(async (req, res) => {
  const { type } = req.body;
  const getModel = MODEL_MAP[type];
  if (!getModel) { res.status(400); throw new Error('Invalid type'); }

  const Model = getModel();
  const titleField = TITLE_FIELD[type];

  const missingSeoQuery = {
    ...tenantScope(req),
    $or: [
      { 'seo.metaTitle': { $exists: false } },
      { 'seo.metaTitle': '' },
      { 'seo.metaTitle': null },
      { 'seo.metaDescription': { $exists: false } },
      { 'seo.metaDescription': '' },
      { 'seo.metaDescription': null },
    ],
  };
  if (['products', 'categories', 'brands'].includes(type)) missingSeoQuery.isActive = true;
  if (type === 'blog') missingSeoQuery.status = 'published';

  const items = await Model.find(missingSeoQuery)
    .select(`${titleField} description slug category`)
    .limit(BULK_LIMIT)
    .lean();

  if (items.length === 0) {
    return res.json({ updated: 0, message: 'All items already have SEO data' });
  }

  const totalCost = items.length * BULK_SEO_COST;
  const model = await getAIModel();
  const batchUsage = startAIUsage(req, { feature: 'seo', action: 'bulk_generate_seo', model, metadata: { contentType: type, itemCount: items.length } });
  const credits = Number(await Settings.get('ai_credits', 0));
  if (credits < totalCost) {
    res.status(402);
    await batchUsage.finish({ status: 'rejected', error: `Insufficient AI credits. Need ${totalCost}` });
    throw new Error(`Need ${totalCost} credits (${items.length} items × ${BULK_SEO_COST}), but only have ${credits}`);
  }

  await Settings.set('ai_credits', roundCredits(credits - totalCost), 'ai');
  const { generateSEOContent } = require('../services/aiService');

  let updated = 0;
  for (const item of items) {
    const itemUsage = startAIUsage(req, { feature: 'seo', action: 'bulk_generate_seo_item', credits: BULK_SEO_COST, model, metadata: { contentType: type, itemId: String(item._id), titleLength: String(item[titleField] || '').length } });
    itemUsage.charge(BULK_SEO_COST);
    try {
      const title = item[titleField] || '';
      const desc = (item.description || '').replace(/<[^>]+>/g, '').substring(0, 500);
      const seo = await generateSEOContent(title, desc, type);

      const seoUpdate = {};
      if (seo.metaTitle) seoUpdate['seo.metaTitle'] = seo.metaTitle;
      if (seo.metaDescription) seoUpdate['seo.metaDescription'] = seo.metaDescription;
      if (seo.keywords?.length) seoUpdate['seo.keywords'] = seo.keywords;
      if (seo.altText) seoUpdate['seo.altText'] = seo.altText;

      if (Object.keys(seoUpdate).length > 0) {
        await Model.findByIdAndUpdate(item._id, { $set: seoUpdate });
        updated++;
      }
      if (Object.keys(seoUpdate).length === 0) itemUsage.refund(BULK_SEO_COST);
      await itemUsage.finish({ extraMetadata: { updated: Object.keys(seoUpdate).length > 0 } });
    } catch (err) {
      console.error(`Bulk SEO failed for ${item._id}:`, err.message);
      itemUsage.refund(BULK_SEO_COST);
      await itemUsage.finish({ status: 'failed', error: err.message });
    }
  }

  // Refund unused credits
  const refund = (items.length - updated) * BULK_SEO_COST;
  if (refund > 0) {
    const current = Number(await Settings.get('ai_credits', 0));
    await Settings.set('ai_credits', roundCredits(current + refund), 'ai');
  }

  const remainingCredits = Number(await Settings.get('ai_credits', 0));
  await batchUsage.finish({ extraMetadata: { updated, total: items.length, refunded: refund } });
  res.json({ updated, total: items.length, aiCredits: remainingCredits });
});

module.exports = {
  getSeoSettings,
  updateSeoSettings,
  getPublicSeoConfig,
  serveSitemap,
  serveRobots,
  aiGenerateSeo,
  aiSeoAudit,
  getContentSeoStats,
  updateItemSeo,
  generateItemSeo,
  bulkGenerateSeo,
};
