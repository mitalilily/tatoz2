const asyncHandler = require('express-async-handler');
const { v4: uuidv4 } = require('uuid');
const Page = require('../models/Page');
const Vendor = require('../models/Vendor');
const Settings = require('../models/Settings');
const Category = require('../models/Category');
const Brand = require('../models/Brand');
const Product = require('../models/Product');
const { getAIClient, getAIModel } = require('../services/aiService');
const { startAIUsage } = require('../services/aiUsageService');
const { AI_CREDIT_COSTS, roundCredits } = require('../config/aiCreditCosts');
const { KNOWN_TYPES, validateLayout } = require('../models/sectionSchemas');
const { createPageBuilderCheckpoint } = require('../services/pageBuilderCheckpointService');
const {
  getSectionCapability,
  buildPageBuilderContext,
  critiquePageBuilderPlan,
  critiqueAppliedVisualOutcome,
  normalizePlanRecommendations,
} = require('../services/pageBuilderAIContext');

const PAGE_BUILDER_CREDIT_COST = AI_CREDIT_COSTS.pageBuilder;
const MAX_PROMPT_LENGTH = 3000;
const MAX_IMAGE_SEARCHES = 4;
const MAX_QUESTIONS = 3;
const MAX_PLAN_ACTIONS = 12;
const MAX_AI_CONTEXT_CHARS = 24000;
const MAX_APPLIED_CONTEXT_CHARS = 4000;
const MAX_DECISION_KEYS = 24;
const MAX_DECISION_VALUE_LENGTH = 300;
const BLOCKED_DECISION_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

const DEFAULT_SETTINGS = {
  padding: { all: 16 },
  margin: { all: 0 },
  backgroundColor: '',
  backgroundImage: '',
  backgroundSize: 'cover',
  backgroundPosition: 'center center',
  fullWidth: false,
  maxWidth: null,
  textAlign: 'left',
  borderWidth: 0,
  borderStyle: 'solid',
  borderColor: '#000000',
  borderRadius: 0,
  boxShadow: 'none',
  visibility: 'all',
  schedule: { from: null, until: null },
};

const clone = value => JSON.parse(JSON.stringify(value));

function compactJson(value, maxChars = MAX_AI_CONTEXT_CHARS) {
  const serialized = JSON.stringify(value);
  if (serialized.length <= maxChars) return serialized;
  return `${serialized.slice(0, Math.max(0, maxChars - 40))} ...[context truncated]`;
}

function normalizeAppliedContext(value) {
  const source = value?.lastApplied && typeof value.lastApplied === 'object' ? value.lastApplied : value;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const prompt = typeof source.prompt === 'string' ? source.prompt.trim().slice(0, 300) : '';
  const changes = Array.isArray(source.changes)
    ? source.changes.filter(item => typeof item === 'string' && item.trim()).slice(0, 8).map(item => item.trim().slice(0, 240))
    : [];
  const imageSearches = Array.isArray(source.imageSearches)
    ? source.imageSearches.filter(item => item && typeof item.query === 'string').slice(0, 4).map(item => ({
      sectionId: String(item.sectionId || '').slice(0, 128),
      target: String(item.target || '').slice(0, 40),
      query: item.query.trim().slice(0, 160),
    }))
    : [];
  const warnings = Array.isArray(source.warnings)
    ? source.warnings.filter(item => typeof item === 'string' && item.trim()).slice(0, 4).map(item => item.trim().slice(0, 240))
    : [];
  const visualChecks = Array.isArray(source.visualChecks)
    ? source.visualChecks.slice(0, 4).map(item => ({
      sectionId: String(item?.sectionId || '').slice(0, 128),
      target: String(item?.target || '').slice(0, 40),
      query: String(item?.query || '').slice(0, 160),
      verified: item?.verified === true,
    }))
    : [];
  const normalized = { prompt, changes, imageSearches, warnings, visualChecks };
  if (!prompt && !changes.length && !imageSearches.length && !warnings.length && !visualChecks.length) return null;
  return JSON.stringify(normalized).length <= MAX_APPLIED_CONTEXT_CHARS ? normalized : {
    prompt,
    changes: changes.slice(0, 4),
    imageSearches: imageSearches.slice(0, 2),
    warnings: warnings.slice(0, 2),
    visualChecks: visualChecks.slice(0, 2),
  };
}

function normalizePlanFeedback(value) {
  const normalized = normalizeAppliedContext(value);
  if (!normalized) return null;
  return normalized;
}

function normalizePlanningContext(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { lastApplied: null, lastAdjusted: null };
  }
  return {
    lastApplied: normalizeAppliedContext(value.lastApplied),
    lastAdjusted: normalizePlanFeedback(value.lastAdjusted),
  };
}

async function getPageBuilderCredits(req) {
  if (req.vendor && req.vendor.aiCredits != null) return Number(req.vendor.aiCredits || 0);
  return Number(await Settings.get('ai_credits', 0));
}

async function setPageBuilderCredits(req, value) {
  const rounded = roundCredits(value);
  if (req.vendor && req.vendor.aiCredits != null) {
    await Vendor.updateOne({ _id: req.vendor._id }, { $set: { aiCredits: rounded } });
    req.vendor.aiCredits = rounded;
    return rounded;
  }
  await Settings.set('ai_credits', rounded, 'ai');
  return rounded;
}

function safeCatalog(catalog) {
  if (!Array.isArray(catalog)) return [];
  return catalog
    .filter(item => item && KNOWN_TYPES.includes(item.type))
    .slice(0, 60)
    .map(item => ({
      type: item.type,
      label: String(item.label || item.type).slice(0, 80),
      category: String(item.category || 'Other').slice(0, 40),
      defaults: item.defaults && typeof item.defaults === 'object' ? item.defaults : {},
      capabilities: getSectionCapability(item.type),
    }));
}

function catalogText(value) {
  return String(value || '').trim().toLowerCase();
}

function catalogKey(value) {
  return catalogText(value)
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function catalogScope(req, page) {
  const vendorId = req.vendor?._id || (page?.scope === 'vendor' ? page.vendor : null);
  const tenantId = page?.tenant || req.tenant?._id;
  return {
    vendorId: vendorId ? String(vendorId) : null,
    // Vendor catalog records predate tenant backfills in some installations;
    // vendor ownership is therefore the authoritative scope for vendor pages.
    tenantFilter: vendorId || !tenantId ? {} : { tenant: tenantId },
  };
}

async function buildCatalogContext(req, page) {
  const { vendorId, tenantFilter } = catalogScope(req, page);
  const productFilter = {
    isActive: true,
    ...(vendorId ? { vendor: vendorId } : tenantFilter),
  };
  const referenceFilter = { isActive: true, ...(vendorId ? {} : tenantFilter) };

  const [categories, brands, totalProducts, featuredProducts, categoryCounts, brandCounts] = await Promise.all([
    Category.find(referenceFilter).select('_id name slug order').sort({ order: 1, name: 1 }).limit(40).lean(),
    Brand.find(referenceFilter).select('_id name slug order').sort({ order: 1, name: 1 }).limit(40).lean(),
    Product.countDocuments(productFilter),
    Product.countDocuments({ ...productFilter, isFeatured: true }),
    Product.aggregate([
      { $match: productFilter },
      { $group: { _id: '$category', productCount: { $sum: 1 } } },
    ]),
    Product.aggregate([
      { $match: { ...productFilter, brand: { $type: 'string', $ne: '' } } },
      { $group: { _id: { $toLower: '$brand' }, productCount: { $sum: 1 } } },
    ]),
  ]);

  const categoryCountById = new Map(categoryCounts.map(row => [String(row._id), Number(row.productCount || 0)]));
  const brandCountByName = new Map(brandCounts.map(row => [catalogKey(row._id), Number(row.productCount || 0)]));
  const collectionCount = Number(totalProducts || 0);

  return {
    scope: vendorId ? 'vendor' : (tenantFilter.tenant ? 'tenant' : 'platform'),
    totalProducts: collectionCount,
    featuredProducts: Number(featuredProducts || 0),
    categoryCount: categories.length,
    brandCount: brands.length,
    categories: categories.map(item => ({
      id: String(item._id),
      name: String(item.name || '').slice(0, 100),
      slug: String(item.slug || '').slice(0, 120),
      productCount: categoryCountById.get(String(item._id)) || 0,
    })),
    brands: brands.map(item => ({
      id: String(item._id),
      name: String(item.name || '').slice(0, 100),
      slug: String(item.slug || '').slice(0, 120),
      productCount: brandCountByName.get(catalogKey(item.name)) || 0,
    })),
    collections: [
      { key: 'featured', label: 'Featured products', productCount: Number(featuredProducts || 0) },
      { key: 'newest', label: 'Newest products', productCount: collectionCount },
      { key: 'bestsellers', label: 'Bestsellers', productCount: collectionCount },
      { key: 'all', label: 'All products', productCount: collectionCount },
    ],
  };
}

function sectionSnapshot(layout) {
  return (layout?.sections || []).map((section, index) => ({
    index,
    id: section.id,
    type: section.type,
    data: section.data || {},
    settings: section.settings || {},
  }));
}

function buildSystemPrompt({ page, layout, catalog, answers = {}, decisionLedger = {}, catalogContext = {}, pageContext = null, appliedContext = null, adjustedPlan = null }) {
  return [
    'You are the senior AI page-builder copilot for an e-commerce admin panel.',
    'Work like a careful product designer and implementation agent: understand the request, inspect the current layout, make a concrete plan, and only propose safe edits that can be applied exactly.',
    'This is PLAN mode. Do not pretend that changes have already been applied. The admin will review and confirm the plan before it is executed.',
    '',
    'Decision rules:',
    '- Return ONLY valid JSON. No markdown, code fences, or commentary outside JSON.',
    '- Do not reveal hidden chain-of-thought. Give only a concise decisionSummary and observable implementation actions.',
    '- Ask at most 3 concise clarifying questions when an unanswered choice materially changes the result.',
    '- Ask for the padding amount when the user requests padding but does not specify a value or size.',
    '- Ask which collection/source when the user asks to show products without specifying featured, newest, bestsellers, category, brand, or all products.',
    '- Resolve a named category or brand only against the catalog context below. Never invent a category, brand, product count, or collection ID.',
    '- Do not ask questions for details already stated by the user. If a reasonable choice is safe, record it under assumptions and continue to a confirmation plan.',
    '- A request to remove, replace, or substantially reorder existing content must be called out in the plan before confirmation.',
    '- Preserve existing section IDs and all data/settings the user did not ask to change.',
    '- Never return a shortened layout just because you are adding a few sections. Treat the current layout as the base and include or preserve all unrelated sections.',
    '- Only remove a section when the user explicitly asks to remove, delete, clear, replace, or start over. A hide request should set visibility and keep the section.',
    '- For new sections, use an empty id; the server assigns a stable id.',
    '- Use only section types from the catalog below.',
    '- When adding a section, start from its defaults and only change fields required by the request.',
    '- Do not add more than 12 new sections in one request.',
    '- Do not create HTML, CSS, JavaScript, tracking code, or arbitrary URLs.',
    '- For web images, create imageSearches with specific subjects and use those results later; never invent image URLs.',
    '- Only create imageSearches when the user explicitly requests an image, photo, visual, banner, background, slide image, or slideshow image.',
    '- imageSearches.target must be one of heroSlides, imageUrl, cards, background.',
    '- Match imageSearches.target to the section schema: heroSlides only for hero, cards only for cardGrid or mosaic, and imageUrl only for imageBanner or imageText.',
    '- Products must use the productsShowcase section and a valid collection/source, not fake product data.',
    '- Use the page intelligence context to cover the user goal, preserve unrelated content, and call out responsive or catalog risks.',
    '',
    'Return exactly this JSON shape:',
    '{',
    '  "message": "one-sentence user-facing summary",',
    '  "decisionSummary": "brief explanation of how the request maps to the layout",',
    '  "confidence": 0,',
    '  "assumptions": ["safe assumption, if any"],',
    '  "recommendations": [{ "key": "balanced|minimal|conversion", "title": "strategy name", "summary": "what this direction optimizes", "tradeoff": "what it gives up", "fitScore": 0, "recommended": true }],',
    '  "clarifyingQuestions": [{ "id": "short_id", "question": "question", "options": ["choice 1", "choice 2"], "required": true }],',
    '  "plan": [{ "action": "add|move|update|remove|duplicate|search_images", "target": "section or layout target", "details": "exact change" }],',
    '  "layout": { "sections": [{ "id": "existing-id-or-empty", "type": "catalog-type", "data": {}, "settings": {} }] },',
    '  "imageSearches": [{ "sectionId": "section-id-or-empty", "sectionIndex": 0, "target": "heroSlides|imageUrl|cards|background", "query": "specific query", "count": 1 }]',
    '}',
    '',
    'Page:',
    compactJson({
      title: page?.title,
      slug: page?.slug,
      kind: page?.kind,
      seo: page?.seo || {},
      brandTokens: page?.pageSettings?.designSystem || {},
    }, 5000),
    'Current layout:',
    compactJson(sectionSnapshot(layout), 12000),
    'Page intelligence context:',
    compactJson(pageContext || {}, 9000),
    answers && Object.keys(answers).length
      ? ['User answers to your previous questions:', JSON.stringify(answers)].join('\n')
      : '',
    Object.keys(decisionLedger).length
      ? ['Confirmed decisions from this design brief:', JSON.stringify(decisionLedger)].join('\n')
      : '',
    appliedContext
      ? [
        'Recent applied change context (reference only; the current layout is the source of truth and the user’s new request takes priority):',
        compactJson(appliedContext, MAX_APPLIED_CONTEXT_CHARS),
      ].join('\n')
      : '',
    adjustedPlan
      ? [
        'Previous plan the user asked to adjust (feedback only; do not repeat unchanged parts unless the new request explicitly asks for them):',
        compactJson(adjustedPlan, MAX_APPLIED_CONTEXT_CHARS),
      ].join('\n')
      : '',
    'Live catalog context (server-scoped; use IDs only from this context):',
    compactJson(catalogContext, 7000),
    'Available sections:',
    compactJson(catalog, 10000),
  ].filter(Boolean).join('\n');
}

function parseModelJson(content) {
  const text = String(content || '').trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AI did not return a valid page plan');
  return JSON.parse(match[0]);
}

function normalizeAnswers(answers) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return {};
  return Object.entries(answers).slice(0, MAX_QUESTIONS).reduce((result, [key, value]) => {
    if (typeof value === 'string' && value.trim()) result[String(key).slice(0, 60)] = value.trim().slice(0, 300);
    return result;
  }, {});
}

function normalizeDecisionLedger(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value).slice(0, MAX_DECISION_KEYS).reduce((result, [key, rawValue]) => {
    const safeKey = String(key || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
    if (!safeKey || BLOCKED_DECISION_KEYS.has(safeKey)) return result;
    if (typeof rawValue === 'string' && rawValue.trim()) {
      result[safeKey] = rawValue.trim().slice(0, MAX_DECISION_VALUE_LENGTH);
    } else if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      result[safeKey] = String(rawValue);
    } else if (typeof rawValue === 'boolean') {
      result[safeKey] = rawValue ? 'true' : 'false';
    }
    return result;
  }, {});
}

function inferDecisionLedger(prompt, answers = {}, previous = {}, catalogContext = {}) {
  const ledger = {
    ...normalizeDecisionLedger(previous),
    ...normalizeDecisionLedger(answers),
  };
  const lower = String(prompt || '').toLowerCase();

  if (!ledger.product_source) {
    if (/\bfeatured\b/.test(lower)) ledger.product_source = 'Featured products';
    else if (/\b(?:newest|latest)\b/.test(lower)) ledger.product_source = 'Newest products';
    else if (/\bbestsellers?\b|\bbest sellers?\b/.test(lower)) ledger.product_source = 'Bestsellers';
    else if (/\ball products?\b/.test(lower)) ledger.product_source = 'All products';
    else {
      const namedCategory = (catalogContext.categories || []).find(item => {
        const name = catalogText(item.name);
        const slug = catalogText(item.slug);
        return (name.length > 1 && lower.includes(name)) || (slug.length > 1 && lower.includes(slug));
      });
      const namedBrand = (catalogContext.brands || []).find(item => {
        const name = catalogText(item.name);
        const slug = catalogText(item.slug);
        return (name.length > 1 && lower.includes(name)) || (slug.length > 1 && lower.includes(slug));
      });
      if (namedCategory && /\bproducts?\b/.test(lower)) ledger.product_source = `${namedCategory.name} category`;
      else if (namedBrand && /\bproducts?\b/.test(lower)) ledger.product_source = `${namedBrand.name} brand`;
      else if (/\bcategory\b/.test(lower) && /\bproducts?\b/.test(lower)) ledger.product_source = 'Category products';
      else if (/\bbrand\b/.test(lower) && /\bproducts?\b/.test(lower)) ledger.product_source = 'Brand products';
    }
  }

  if (!ledger.padding_amount) {
    const amount = paddingAmountFromPrompt(String(prompt || ''));
    if (amount != null) ledger.padding_amount = `${amount} px`;
  }

  if (!ledger.offer) {
    const match = lower.match(/\b(\d{1,3})\s*%\s*(?:off|discount)\b/);
    if (match) ledger.offer = `${match[1]}% off`;
  }

  return ledger;
}

function decisionKnown(decisionLedger, key) {
  const value = decisionLedger?.[key];
  return typeof value === 'string' && value.trim().length > 0;
}

function hasConcreteProductSource(value) {
  const normalized = catalogKey(value);
  return Boolean(normalized)
    && !['category', 'category products', 'brand', 'brand products', 'products'].includes(normalized);
}

function questionAlreadyAnswered(question, decisionLedger) {
  const key = String(question?.id || '').toLowerCase();
  const text = String(question?.question || '').toLowerCase();
  if (decisionKnown(decisionLedger, key)) return true;
  if ((key === 'product_source' || /which products|product source|collection/.test(text))
    && hasConcreteProductSource(decisionLedger?.product_source)) return true;
  if ((key === 'padding_amount' || /padding|spacing/.test(text))
    && decisionKnown(decisionLedger, 'padding_amount')) return true;
  return false;
}

function normalizeQuestions(questions) {
  if (!Array.isArray(questions)) return [];
  return questions
    .filter(item => item && typeof item.question === 'string' && item.question.trim())
    .slice(0, MAX_QUESTIONS)
    .map((item, index) => ({
      id: String(item.id || `question_${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60),
      question: item.question.trim().slice(0, 240),
      options: Array.isArray(item.options)
        ? item.options.filter(option => typeof option === 'string' && option.trim()).slice(0, 5).map(option => option.trim().slice(0, 100))
        : [],
      required: item.required !== false,
    }));
}

function productSourceOptions(catalogContext = {}) {
  const collectionOptions = (catalogContext.collections || [])
    .slice(0, 4)
    .map(item => String(item.label || '').trim())
    .filter(Boolean);
  const categoryOptions = (catalogContext.categories || [])
    .filter(item => item && item.name)
    .slice(0, 1)
    .map(item => String(item.name).trim());
  const brandOptions = categoryOptions.length
    ? []
    : (catalogContext.brands || []).filter(item => item && item.name).slice(0, 1).map(item => String(item.name).trim());
  return [...new Set([...collectionOptions, ...categoryOptions, ...brandOptions])].slice(0, 5);
}

function promptClarifications(prompt, answers = {}, decisionLedger = {}, catalogContext = {}) {
  const lower = prompt.toLowerCase();
  const decisions = inferDecisionLedger(prompt, answers, decisionLedger, catalogContext);
  const questions = [];
  const asksForPadding = /\bpadding\b|\bspacing\b/.test(lower);
  const hasPaddingValue = /\b(?:padding|spacing)\b[^\n,;]{0,30}\b(?:0|[1-9]\d*)\s*(?:px)?\b/.test(lower)
    || /\b(?:0|[1-9]\d*)\s*(?:px)?\b[^\n,;]{0,36}\b(?:padding|spacing)\b/.test(lower)
    || /\b(?:none|zero|small|medium|large|xl|extra large)\b/.test(lower);
  if (asksForPadding && !hasPaddingValue && !decisionKnown(decisions, 'padding_amount')) {
    questions.push({
      id: 'padding_amount',
      question: 'What padding should I use on the top and bottom of each section?',
      options: ['0 px', '16 px', '24 px', '32 px'],
      required: true,
    });
  }

  const asksForProducts = /\bproducts?\b|\bproduct showcase\b/.test(lower)
    && /\b(show|display|add|include|place|feature|put|below|section)\b/.test(lower);
  const genericSource = /\b(?:a|any|some|the)?\s*(?:category|brand)\s+products?\b/.test(lower)
    || /\bproducts?\s+from\s+(?:a|any|some)\s+(?:category|brand)\b/.test(lower);
  const namesCollection = /\b(featured|newest|latest|bestsellers?|best sellers?|all products?)\b/.test(lower)
    || (/\b(category|brand)\b/.test(lower) && !genericSource);
  const sourceResolved = resolveProductSource(decisions.product_source, catalogContext);
  const sourceNeedsSelection = !hasConcreteProductSource(decisions.product_source)
    || (hasConcreteProductSource(decisions.product_source) && Object.keys(catalogContext).length > 0 && !sourceResolved);
  if (asksForProducts && (!namesCollection || sourceNeedsSelection) && sourceNeedsSelection) {
    questions.push({
      id: 'product_source',
      question: 'Which products should the showcase display?',
      options: productSourceOptions(catalogContext),
      required: true,
    });
  }
  return questions.slice(0, MAX_QUESTIONS);
}

function resolveProductSource(value, catalogContext = {}) {
  const raw = catalogText(value);
  const key = catalogKey(raw);
  if (!key) return null;

  const collection = (catalogContext.collections || []).find(item => {
    const itemKey = catalogKey(item.label || item.key);
    return itemKey === key || item.key === key;
  });
  if (collection) {
    return {
      type: 'collection',
      collection: collection.key,
      collectionRef: null,
      name: collection.label,
      productCount: Number(collection.productCount || 0),
    };
  }

  const isBrand = /\bbrand\b/.test(raw);
  const isCategory = /\bcategory\b/.test(raw);
  const sourceName = catalogKey(raw
    .replace(/\b(?:category|brand|products?|items?|collection)\b/g, ' '));
  if (!sourceName) return null;
  const candidates = isBrand ? (catalogContext.brands || [])
    : isCategory ? (catalogContext.categories || [])
      : [...(catalogContext.categories || []), ...(catalogContext.brands || [])];
  const match = candidates.find(item => [item.name, item.slug].some(candidate => (
    catalogKey(candidate) === sourceName
    || catalogKey(candidate) === catalogKey(raw)
  )));
  if (!match) return null;
  const type = (catalogContext.categories || []).some(item => String(item.id) === String(match.id)) ? 'category' : 'brand';
  return {
    type,
    collection: type,
    collectionRef: String(match.id),
    name: String(match.name),
    slug: String(match.slug || ''),
    productCount: Number(match.productCount || 0),
  };
}

function normalizePlan(plan) {
  if (!Array.isArray(plan)) return [];
  return plan
    .filter(item => item && typeof item.details === 'string' && item.details.trim())
    .slice(0, MAX_PLAN_ACTIONS)
    .map(item => ({
      action: ['add', 'move', 'update', 'remove', 'duplicate', 'search_images'].includes(item.action) ? item.action : 'update',
      target: String(item.target || 'page').slice(0, 120),
      details: item.details.trim().slice(0, 280),
    }));
}

function imageTargetCompatible(section, target) {
  if (!section) return false;
  if (target === 'background') return true;
  if (target === 'heroSlides') return section.type === 'hero';
  if (target === 'cards') return ['cardGrid', 'mosaic'].includes(section.type);
  if (target === 'imageUrl') return ['imageBanner', 'imageText'].includes(section.type);
  return false;
}

function normalizeImageSearches(searches, sections) {
  if (!Array.isArray(searches)) return [];
  const sectionIds = new Set(sections.map(section => section.id));
  return searches
    .filter(item => item && typeof item.query === 'string' && item.query.trim() && (sectionIds.has(item.sectionId) || Number.isInteger(item.sectionIndex)))
    .slice(0, MAX_IMAGE_SEARCHES)
    .map(item => {
      const indexedSection = sections[item.sectionIndex];
      const sectionId = sectionIds.has(item.sectionId) ? item.sectionId : indexedSection?.id;
      const target = ['heroSlides', 'imageUrl', 'cards', 'background'].includes(item.target) ? item.target : null;
      const section = sections.find(candidate => candidate.id === sectionId);
      if (!target || !sectionId || !imageTargetCompatible(section, target)) return null;
      return {
        sectionId,
        target,
        query: String(item.query).trim().slice(0, 160),
        count: Math.min(4, Math.max(1, Number(item.count) || 1)),
      };
    })
    .filter(Boolean);
}

function visualImageIntent(prompt) {
  const lower = String(prompt || '').toLowerCase();
  if (!/\b(?:image|images|photo|photos|picture|pictures|visual|background|slideshow|slide|banner)\b/.test(lower)) return false;
  if (/\b(?:remove|delete|hide|without|no)\b[\s\S]{0,24}\b(?:image|photo|picture|visual|background)\b/.test(lower)) return false;
  return /\b(?:add|put|place|use|show|display|include|set|change|insert|make|daal|lag)\b/.test(lower);
}

function visualSearchQuery(prompt) {
  const stopWords = new Set(['add', 'put', 'place', 'use', 'show', 'display', 'include', 'set', 'change', 'insert', 'make', 'please', 'can', 'you', 'to', 'the', 'a', 'an', 'on', 'in', 'my', 'me', 'for', 'this', 'page', 'image', 'images', 'photo', 'photos', 'picture', 'pictures', 'visual']);
  const words = String(prompt || '')
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .map(word => word.trim())
    .filter(word => word && !stopWords.has(word.toLowerCase()));
  return (words.join(' ') || 'festive ecommerce campaign visual').slice(0, 160);
}

function visualTargetForPrompt(prompt, sections) {
  const lower = String(prompt || '').toLowerCase();
  const target = /\b(?:background|bg)\b/.test(lower) ? 'background'
    : /\b(?:hero|slideshow|slide)\b/.test(lower) ? 'heroSlides'
      : /\b(?:card|cards|grid|tile|tiles|mosaic)\b/.test(lower) ? 'cards'
        : 'imageUrl';
  const preferredTypes = target === 'heroSlides' ? ['hero']
    : target === 'cards' ? ['cardGrid', 'mosaic']
      : target === 'imageUrl' ? ['imageBanner', 'imageText']
        : ['hero', 'imageBanner', 'imageText', 'cardGrid', 'mosaic', 'richText'];
  const section = sections.find(item => preferredTypes.includes(item.type) && imageTargetCompatible(item, target))
    || sections.find(item => imageTargetCompatible(item, target));
  return section ? { sectionId: section.id, target } : null;
}

function ensureVisualImageSearches(searches, prompt, sections) {
  if (!visualImageIntent(prompt)) return searches;
  const visualTarget = visualTargetForPrompt(prompt, sections);
  if (!visualTarget || searches.some(item => item.sectionId === visualTarget.sectionId && item.target === visualTarget.target)) return searches;
  return [...searches, { ...visualTarget, query: visualSearchQuery(prompt), count: 1 }].slice(0, MAX_IMAGE_SEARCHES);
}

function hasExplicitDestructiveIntent(prompt) {
  // Hiding a widget is a settings change, not permission to delete it.
  const lower = String(prompt || '').toLowerCase();
  const negated = /\b(?:do not|don't|never)\s+(?:remove|delete|clear|blank|replace)\b/.test(lower);
  if (negated && !/\b(?:remove|delete|replace)\s+(?:all|everything)\b/.test(lower)) return false;
  // Asset-level requests must never be promoted into section deletion. For
  // example, "remove the hero image" should clear/replace an image, not delete
  // the entire hero section. A section-level noun makes the destructive scope
  // explicit again ("remove the hero section").
  const assetOnlyRequest = /\b(?:image|photo|picture|visual|background|slide|slides|button|headline|text|copy)\b/.test(lower)
    && !/\b(?:section|widget|block|component)\b/.test(lower);
  if (assetOnlyRequest) return false;
  return /\b(?:remove|delete|clear|blank|replace|start over|start from scratch)\b|\b(?:remove|delete)\s+all\b|\breplace\s+everything\b/.test(lower);
}

function sectionTargetMatches(target, section, catalog) {
  const value = String(target || '').toLowerCase();
  if (!value) return false;
  const label = sectionLabel(section.type, catalog).toLowerCase();
  return value === section.id.toLowerCase()
    || value.includes(section.id.toLowerCase())
    || value.includes(section.type.toLowerCase())
    || value.includes(label);
}

function explicitRemovalIds(prompt, plan, currentLayout, catalog) {
  if (!hasExplicitDestructiveIntent(prompt)) return new Set();
  const current = currentLayout.sections || [];
  const lower = String(prompt || '').toLowerCase();
  if (/\b(?:clear|blank|start over|start from scratch|remove all|delete all|replace everything)\b/.test(lower)) {
    return new Set(current.map(section => section.id));
  }

  const ids = new Set();
  normalizePlan(plan).filter(item => item.action === 'remove').forEach(item => {
    current.forEach(section => {
      if (sectionTargetMatches(item.target, section, catalog)) ids.add(section.id);
    });
  });
  current.forEach(section => {
    const label = sectionLabel(section.type, catalog).toLowerCase();
    const mentioned = lower.includes(section.type.toLowerCase()) || lower.includes(label);
    if (mentioned) ids.add(section.id);
  });
  return ids;
}

function normalizeLayout(rawLayout, currentLayout, catalog, options = {}) {
  const allowedTypes = new Set(catalog.map(item => item.type));
  const defaultsByType = new Map(catalog.map(item => [item.type, item.defaults || {}]));
  const oldById = new Map((currentLayout.sections || []).map(section => [section.id, section]));
  const rawSections = Array.isArray(rawLayout?.sections) ? rawLayout.sections : [];
  const removalIds = options.removalIds || new Set();

  const proposedSections = rawSections
    .filter(section => section && allowedTypes.has(section.type))
    .map(section => {
      const old = oldById.get(section.id);
      const id = old?.id || (typeof section.id === 'string' && section.id ? section.id : uuidv4());
      const defaultData = defaultsByType.get(section.type) || {};
      const oldSettings = old?.settings || {};
      const rawSettings = section.settings && typeof section.settings === 'object' ? section.settings : {};
      return {
        id,
        type: section.type,
        data: {
          ...clone(defaultData),
          ...(old?.data || {}),
          ...(section.data && typeof section.data === 'object' ? section.data : {}),
        },
        settings: {
          ...clone(DEFAULT_SETTINGS),
          ...oldSettings,
          ...rawSettings,
          padding: {
            ...clone(DEFAULT_SETTINGS.padding),
            ...(oldSettings.padding || {}),
            ...(rawSettings.padding || {}),
          },
          margin: {
            ...clone(DEFAULT_SETTINGS.margin),
            ...(oldSettings.margin || {}),
            ...(rawSettings.margin || {}),
          },
        },
        responsiveOverrides: old?.responsiveOverrides || { mobile: {} },
      };
    });

  if (!proposedSections.length) return currentLayout;

  // The model is allowed to describe only the sections it wants to change.
  // Never interpret an omitted section as a deletion unless the user clearly
  // asked for destructive work and the target was identified explicitly.
  const seenIds = new Set();
  const sections = proposedSections.filter(section => {
    if (seenIds.has(section.id)) return false;
    seenIds.add(section.id);
    return true;
  });
  (currentLayout.sections || []).forEach(section => {
    if (!seenIds.has(section.id) && !removalIds.has(section.id)) {
      sections.push(section);
      seenIds.add(section.id);
    }
  });
  return validateLayout({ sections });
}

function paddingAmountFromPrompt(prompt) {
  const lower = prompt.toLowerCase();
  const match = lower.match(/\b(?:padding|spacing)\b[^\n,;]{0,36}\b(\d+)\s*(?:px)?\b/)
    || lower.match(/\b(\d+)\s*(?:px)?\b[^\n,;]{0,36}\b(?:padding|spacing)\b/);
  if (match) return Math.max(0, Math.min(240, Number(match[1])));
  if (/\b(?:padding|spacing)\b[^\n,;]{0,36}\b(?:none|zero)\b/.test(lower)) return 0;
  if (/\b(?:padding|spacing)\b[^\n,;]{0,36}\bsmall\b/.test(lower)) return 8;
  if (/\b(?:padding|spacing)\b[^\n,;]{0,36}\b(?:large|xl|extra large)\b/.test(lower)) return 32;
  if (/\b(?:padding|spacing)\b[^\n,;]{0,36}\bmedium\b/.test(lower)) return 16;
  return null;
}

function applyExplicitSpacingIntent(layout, prompt) {
  const amount = paddingAmountFromPrompt(prompt);
  if (amount == null) return layout;
  const lower = prompt.toLowerCase();
  const allSections = /\b(?:all|every|each|sare|sab|components?|sections?)\b/.test(lower);
  const topAndBottom = /\btop\b[\s\S]{0,30}\bbottom\b|\bbottom\b[\s\S]{0,30}\btop\b/.test(lower);
  if (!allSections && !topAndBottom && !/\bpadding\s*(?:to|=|of)?\s*\d+/.test(lower)) return layout;
  // The model remains responsible for targeted changes (for example, only the
  // hero). This deterministic guard is intentionally limited to the explicit
  // "all sections" instruction so it cannot overwrite unrelated widgets.
  if (!allSections) return layout;

  return {
    ...layout,
    sections: layout.sections.map(section => {
      const padding = { ...(section.settings?.padding || {}) };
      if (topAndBottom) {
        padding.top = amount;
        padding.bottom = amount;
      } else {
        padding.all = amount;
        padding.top = amount;
        padding.right = amount;
        padding.bottom = amount;
        padding.left = amount;
      }
      return { ...section, settings: { ...(section.settings || {}), padding } };
    }),
  };
}

function productIntent(prompt) {
  const lower = prompt.toLowerCase();
  return /\bproducts?\b|\bproduct showcase\b/.test(lower)
    && /\b(show|display|add|include|place|feature|put|below|section)\b/.test(lower)
    && !/\b(remove|hide|delete)\b/.test(lower);
}

function ensureProductsSection(layout, prompt, catalog) {
  if (!productIntent(prompt) || layout.sections.some(section => section.type === 'productsShowcase')) return layout;
  const productEntry = catalog.find(item => item.type === 'productsShowcase');
  if (!productEntry) return layout;
  const section = {
    id: uuidv4(),
    type: 'productsShowcase',
    data: {
      ...clone(productEntry.defaults || {}),
      heading: 'Featured products',
      source: 'collection',
      collection: 'featured',
    },
    settings: clone(DEFAULT_SETTINGS),
    responsiveOverrides: { mobile: {} },
  };
  const heroIndex = layout.sections.findIndex(item => item.type === 'hero');
  const insertAt = heroIndex >= 0 ? heroIndex + 1 : layout.sections.length;
  const sections = layout.sections.slice();
  sections.splice(insertAt, 0, section);
  return validateLayout({ sections });
}

function applyAnswerIntent(layout, answers, catalogContext = {}, decisionLedger = {}) {
  const answer = answers?.product_source || decisionLedger?.product_source;
  const resolved = resolveProductSource(answer, catalogContext);
  if (!resolved) return layout;
  const sections = layout.sections.map(section => section.type === 'productsShowcase'
    ? {
      ...section,
      data: {
        ...(section.data || {}),
        source: 'collection',
        collection: resolved.collection,
        collectionRef: resolved.collectionRef,
      },
    }
    : section);
  return validateLayout({ sections });
}

function validateCatalogSelections(layout, catalogContext = {}) {
  const categories = new Set((catalogContext.categories || []).map(item => String(item.id)));
  const brands = new Set((catalogContext.brands || []).map(item => String(item.id)));
  for (const section of layout.sections || []) {
    if (section.type !== 'productsShowcase' || section.data?.source === 'manual') continue;
    const collection = section.data?.collection;
    const reference = section.data?.collectionRef;
    if (collection === 'category' && (!reference || !categories.has(String(reference)))) {
      return { error: 'The selected product category is no longer available. Please ask AI to plan it again.' };
    }
    if (collection === 'brand' && (!reference || !brands.has(String(reference)))) {
      return { error: 'The selected product brand is no longer available. Please ask AI to plan it again.' };
    }
  }
  return { layout };
}

function sectionLabel(type, catalog) {
  return catalog.find(item => item.type === type)?.label || type;
}

function summarizeLayoutChanges(currentLayout, nextLayout, catalog) {
  const current = currentLayout.sections || [];
  const next = nextLayout.sections || [];
  const currentById = new Map(current.map(section => [section.id, section]));
  const nextById = new Map(next.map(section => [section.id, section]));
  const changes = [];

  next.forEach(section => {
    if (!currentById.has(section.id)) {
      changes.push(`Add ${sectionLabel(section.type, catalog)}.`);
      return;
    }
    const old = currentById.get(section.id);
    const oldIndex = current.findIndex(item => item.id === section.id);
    const newIndex = next.findIndex(item => item.id === section.id);
    if (oldIndex !== newIndex) changes.push(`Move ${sectionLabel(section.type, catalog)} to position ${newIndex + 1}.`);
    if (JSON.stringify(old.data || {}) !== JSON.stringify(section.data || {})) changes.push(`Update content in ${sectionLabel(section.type, catalog)}.`);
    if (JSON.stringify(old.settings || {}) !== JSON.stringify(section.settings || {})) changes.push(`Update layout settings for ${sectionLabel(section.type, catalog)}.`);
  });
  current.forEach(section => {
    if (!nextById.has(section.id)) changes.push(`Remove ${sectionLabel(section.type, catalog)}.`);
  });
  return changes.slice(0, MAX_PLAN_ACTIONS);
}

function summarizeLayoutImpact(currentLayout, nextLayout, catalog, visualAssetCount = 0) {
  const current = currentLayout.sections || [];
  const next = nextLayout.sections || [];
  const currentById = new Map(current.map(section => [section.id, section]));
  const nextById = new Map(next.map(section => [section.id, section]));
  const counts = { added: 0, updated: 0, moved: 0, removed: 0, visualAssets: Number(visualAssetCount || 0) };

  next.forEach(section => {
    if (!currentById.has(section.id)) {
      counts.added += 1;
      return;
    }
    const old = currentById.get(section.id);
    const oldIndex = current.findIndex(item => item.id === section.id);
    const newIndex = next.findIndex(item => item.id === section.id);
    if (oldIndex !== newIndex) counts.moved += 1;
    if (JSON.stringify(old.data || {}) !== JSON.stringify(section.data || {})
      || JSON.stringify(old.settings || {}) !== JSON.stringify(section.settings || {})) counts.updated += 1;
  });
  current.forEach(section => {
    if (!nextById.has(section.id)) counts.removed += 1;
  });

  const sectionChanges = counts.added + counts.updated + counts.moved + counts.removed;
  const totalChanges = sectionChanges + counts.visualAssets;
  const level = counts.removed > 0
    ? 'high'
    : counts.added > 0 || counts.moved > 0 || counts.visualAssets > 0
      ? 'medium'
      : totalChanges > 0 ? 'low' : 'none';
  const summary = totalChanges === 0
    ? 'No layout or visual changes detected.'
    : `${totalChanges} planned change${totalChanges === 1 ? '' : 's'}: ${counts.added} added, ${counts.updated} updated, ${counts.moved} moved, ${counts.removed} removed${counts.visualAssets ? `, ${counts.visualAssets} visual asset${counts.visualAssets === 1 ? '' : 's'}` : ''}.`;
  return { level, totalChanges, counts, summary };
}

// Typed, reviewable operations are kept alongside the normalized layout for
// compatibility with older clients. Apply mode can therefore validate and
// execute intent without trusting an arbitrary full-layout replacement.
function buildLayoutPatches(currentLayout, nextLayout) {
  const current = currentLayout.sections || [];
  const next = nextLayout.sections || [];
  const currentById = new Map(current.map(section => [section.id, section]));
  const nextById = new Map(next.map(section => [section.id, section]));
  const patches = [];

  current.forEach(section => {
    if (!nextById.has(section.id)) patches.push({ op: 'remove_section', sectionId: section.id });
  });
  next.forEach((section, index) => {
    if (!currentById.has(section.id)) {
      patches.push({ op: 'add_section', index, section });
    } else if (JSON.stringify(currentById.get(section.id)) !== JSON.stringify(section)) {
      patches.push({ op: 'update_section', sectionId: section.id, section });
    }
  });
  next.forEach((section, index) => {
    const oldIndex = current.findIndex(item => item.id === section.id);
    if (oldIndex >= 0 && oldIndex !== index) patches.push({ op: 'move_section', sectionId: section.id, index });
  });
  return patches.slice(0, MAX_PLAN_ACTIONS * 2);
}

function validateApprovedPatches(currentLayout, patches, prompt, catalog, plan = []) {
  if (!Array.isArray(patches)) return [];
  const currentById = new Map((currentLayout.sections || []).map(section => [section.id, section]));
  const allowedRemovalIds = explicitRemovalIds(prompt, plan, currentLayout, catalog);
  const issues = [];

  patches.forEach((patch, index) => {
    if (!patch || typeof patch !== 'object') {
      issues.push(`Patch ${index + 1} is not an object.`);
      return;
    }
    const sectionId = String(patch.sectionId || '');
    if (patch.op === 'remove_section') {
      if (!currentById.has(sectionId)) issues.push(`Patch ${index + 1} targets an unknown section.`);
      else if (!allowedRemovalIds.has(sectionId)) issues.push(`Patch ${index + 1} removes a section without explicit section-removal intent.`);
      return;
    }
    if (patch.op === 'update_section') {
      const current = currentById.get(sectionId);
      if (!current || !patch.section || typeof patch.section !== 'object') {
        issues.push(`Patch ${index + 1} updates an unknown or incomplete section.`);
      } else if (patch.section.type && patch.section.type !== current.type) {
        issues.push(`Patch ${index + 1} changes a section type instead of using an explicit replace plan.`);
      }
      return;
    }
    if (patch.op === 'move_section') {
      if (!currentById.has(sectionId) || !Number.isInteger(Number(patch.index))) {
        issues.push(`Patch ${index + 1} moves an unknown section or has an invalid position.`);
      }
      return;
    }
    if (patch.op === 'add_section') {
      const section = patch.section;
      if (!section || typeof section !== 'object' || !KNOWN_TYPES.includes(section.type)) {
        issues.push(`Patch ${index + 1} adds an unsupported section type.`);
      } else if (section.id && currentById.has(section.id)) {
        issues.push(`Patch ${index + 1} reuses an existing section id while adding.`);
      }
      return;
    }
    issues.push(`Patch ${index + 1} uses an unsupported operation.`);
  });

  return issues.slice(0, 8);
}

function applyLayoutPatches(currentLayout, patches) {
  let sections = clone(currentLayout.sections || []);
  (Array.isArray(patches) ? patches : []).forEach(patch => {
    if (!patch || typeof patch !== 'object') return;
    if (patch.op === 'remove_section') {
      sections = sections.filter(section => section.id !== patch.sectionId);
    } else if (patch.op === 'add_section' && patch.section && KNOWN_TYPES.includes(patch.section.type)) {
      const section = { ...patch.section, id: patch.section.id || uuidv4() };
      const index = Math.max(0, Math.min(sections.length, Number(patch.index) || sections.length));
      sections.splice(index, 0, section);
    } else if (patch.op === 'update_section' && patch.section) {
      sections = sections.map(section => {
        if (section.id !== patch.sectionId) return section;
        const candidate = patch.section;
        const candidateData = candidate.data && typeof candidate.data === 'object' ? candidate.data : {};
        const candidateSettings = candidate.settings && typeof candidate.settings === 'object' ? candidate.settings : {};
        return {
          ...section,
          ...candidate,
          id: section.id,
          type: section.type,
          data: { ...(section.data || {}), ...candidateData },
          settings: {
            ...(section.settings || {}),
            ...candidateSettings,
            padding: { ...(section.settings?.padding || {}), ...(candidateSettings.padding || {}) },
            margin: { ...(section.settings?.margin || {}), ...(candidateSettings.margin || {}) },
          },
          responsiveOverrides: {
            ...(section.responsiveOverrides || {}),
            ...(candidate.responsiveOverrides || {}),
          },
        };
      });
    } else if (patch.op === 'move_section') {
      const from = sections.findIndex(section => section.id === patch.sectionId);
      if (from >= 0) {
        const [section] = sections.splice(from, 1);
        const index = Math.max(0, Math.min(sections.length, Number(patch.index) || 0));
        sections.splice(index, 0, section);
      }
    }
  });
  return validateLayout({ sections });
}

function normalizePlanResponse(parsed, currentLayout, catalog, prompt, answers = {}, baseRevision = 0, decisionLedger = {}, catalogContext = {}, pageContext = null) {
  const resolvedDecisionLedger = inferDecisionLedger(prompt, answers, decisionLedger, catalogContext);
  const resolvedProductSource = resolveProductSource(resolvedDecisionLedger.product_source, catalogContext);
  const removalIds = explicitRemovalIds(prompt, parsed.plan, currentLayout, catalog);
  let nextLayout = normalizeLayout(parsed.layout, currentLayout, catalog, { removalIds });
  nextLayout = ensureProductsSection(nextLayout, prompt, catalog);
  nextLayout = applyAnswerIntent(nextLayout, answers, catalogContext, resolvedDecisionLedger);
  nextLayout = validateLayout(applyExplicitSpacingIntent(nextLayout, prompt));
  const imageSearches = ensureVisualImageSearches(
    normalizeImageSearches(parsed.imageSearches, nextLayout.sections),
    prompt,
    nextLayout.sections,
  );
  const visualPlan = imageSearches.map(search => ({
    action: 'search_images',
    target: search.sectionId,
    details: `Search for ${search.query} and place the result in ${search.target}.`,
  }));
  const changes = [...summarizeLayoutChanges(currentLayout, nextLayout, catalog), ...visualPlan.map(item => item.details)].slice(0, MAX_PLAN_ACTIONS);
  const resolvedPageContext = pageContext || buildPageBuilderContext({ layout: currentLayout, catalogContext, prompt });
  const quality = critiquePageBuilderPlan({
    prompt,
    currentLayout,
    nextLayout,
    catalogContext,
    target: resolvedPageContext.target || 'desktop',
    pageContext: resolvedPageContext,
    visualAssetCount: imageSearches.length,
  });
  const recommendations = normalizePlanRecommendations(parsed.recommendations, {
    goal: resolvedPageContext.goal?.key,
    quality,
    visualAssetCount: imageSearches.length,
  });
  const questions = normalizeQuestions(parsed.clarifyingQuestions).filter(question => !questionAlreadyAnswered(question, resolvedDecisionLedger));
  const deterministicQuestions = promptClarifications(prompt, answers, resolvedDecisionLedger, catalogContext);
  const allQuestions = [...questions];
  deterministicQuestions.forEach(question => {
    if (!allQuestions.some(item => item.id === question.id)) allQuestions.push(question);
  });
  return {
    message: typeof parsed.message === 'string' && parsed.message.trim()
      ? parsed.message.trim().slice(0, 400)
      : 'I have prepared a page-change plan for your review.',
    decisionSummary: typeof parsed.decisionSummary === 'string' && parsed.decisionSummary.trim()
      ? parsed.decisionSummary.trim().slice(0, 500)
      : 'I mapped your request to the existing page sections and preserved unrelated content.',
    confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 0)),
    assumptions: Array.isArray(parsed.assumptions)
      ? parsed.assumptions.filter(item => typeof item === 'string' && item.trim()).slice(0, 6).map(item => item.trim().slice(0, 240))
      : [],
    questions: allQuestions.slice(0, MAX_QUESTIONS),
    decisionLedger: resolvedDecisionLedger,
    resolvedProductSource,
    plan: normalizePlan([...(Array.isArray(parsed.plan) ? parsed.plan : []), ...visualPlan]),
    proposal: { layout: nextLayout, patches: buildLayoutPatches(currentLayout, nextLayout), imageSearches, baseRevision },
    baseRevision,
    changes,
    impact: summarizeLayoutImpact(currentLayout, nextLayout, catalog, imageSearches.length),
    pageContext: resolvedPageContext,
    quality,
    recommendations,
    imageSearches,
    sectionOrder: nextLayout.sections.map((section, index) => `${index + 1}. ${sectionLabel(section.type, catalog)}`),
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error('Image search failed (' + response.status + ')');
  return response.json();
}

const IMAGE_QUERY_STOP_WORDS = new Set([
  'a', 'an', 'and', 'with', 'for', 'the', 'of', 'in', 'on', 'to', 'from',
  'image', 'images', 'photo', 'photos', 'visual', 'banner', 'wide', 'horizontal',
  'ecommerce', 'close', 'up', 'warm', 'lighting', 'indian', 'elegant', 'festive',
]);

function buildImageQueryVariants(query = '') {
  const original = String(query || '').replace(/\s+/g, ' ').trim().slice(0, 180);
  if (!original) return [];
  const canonical = original.replace(/\brakshabandhan\b/gi, 'Raksha Bandhan');
  const tokens = canonical
    .replace(/[^a-zA-Z0-9%]+/g, ' ')
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length > 2 && !IMAGE_QUERY_STOP_WORDS.has(token.toLowerCase()));
  const lower = canonical.toLowerCase();
  const event = /raksha\s+bandhan|rakhi|diwali|holi|christmas|eid|navratri|valentine|sale/.exec(lower)?.[0] || '';
  const eventPhrase = event === 'rakhi' ? 'rakhi' : event.replace(/\s+/g, ' ').trim();
  const eventWords = new Set(eventPhrase.toLowerCase().split(/\s+/).filter(Boolean));
  const topic = tokens.find(token => !eventWords.has(token.toLowerCase())) || '';
  const variants = [canonical];
  if (eventPhrase && topic) variants.push(`${eventPhrase} ${topic}`);
  if (eventPhrase) variants.push(`${eventPhrase} festival`);
  if (tokens.length) variants.push(tokens.slice(0, 6).join(' '));
  if (tokens.length) variants.push(tokens.slice(0, 4).join(' '));
  if (tokens.length) variants.push(tokens.slice(0, 2).join(' '));
  return [...new Set(variants.map(item => item.trim()).filter(Boolean))].slice(0, 6);
}

function isPageBuilderAITestMode() {
  return process.env.NODE_ENV !== 'production' && process.env.PAGE_BUILDER_AI_TEST_MODE === 'true';
}

function testImageResults(query, count) {
  if (process.env.PAGE_BUILDER_AI_TEST_IMAGE_RESULTS === 'empty') return [];
  return Array.from({ length: count }, (_, index) => {
    const label = `${query} ${index + 1}`.slice(0, 120);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="700"><rect width="100%" height="100%" fill="#f59e0b"/><text x="50%" y="50%" text-anchor="middle" fill="#111827" font-family="Arial" font-size="42">${label.replace(/[<&>]/g, '')}</text></svg>`;
    const encodedQuery = encodeURIComponent(query);
    return {
      url: `data:image/svg+xml,${encodeURIComponent(svg)}`,
      alt: query,
      source: 'AI test fixture',
      attributionUrl: `https://images.example.test/attribution/${encodedQuery}/${index + 1}`,
      creator: 'AI test fixture',
      license: 'test-only',
    };
  });
}

async function searchWebImages(query, count) {
  if (isPageBuilderAITestMode()) return testImageResults(query, count);

  const variants = buildImageQueryVariants(query);
  const accessKey = process.env.UNSPLASH_ACCESS_KEY || await Settings.get('unsplash_access_key', '');
  let lastError = null;
  let hadSuccessfulResponse = false;
  const providers = [];
  if (accessKey) {
    providers.push(async searchQuery => {
      const params = new URLSearchParams({ client_id: accessKey, query: searchQuery, per_page: String(count) });
      const result = await fetchJson('https://api.unsplash.com/search/photos?' + params);
      return (result.results || []).map(photo => ({
        url: photo.urls?.regular || photo.urls?.small,
        alt: photo.alt_description || photo.description || searchQuery,
        source: 'Unsplash',
        attributionUrl: photo.links?.html || '',
      })).filter(image => image.url);
    });
  }
  // Openverse is a public image index and works without an application key.
  // It also gives us attribution metadata, which is safer for admin-created pages.
  providers.push(async searchQuery => {
    const params = new URLSearchParams({ q: searchQuery, page_size: String(count), mature: 'false' });
    const result = await fetchJson('https://api.openverse.org/v1/images/?' + params);
    return (result.results || []).map(image => ({
      url: image.url || image.thumbnail,
      alt: image.title || image.creator || searchQuery,
      source: image.source || 'Openverse',
      attributionUrl: image.foreign_landing_url || image.detail_url || '',
      creator: image.creator || '',
      license: image.license || '',
    })).filter(image => image.url);
  });

  for (const provider of providers) {
    for (const variant of variants) {
      try {
        const results = await provider(variant);
        hadSuccessfulResponse = true;
        if (results.length) return results;
      } catch (error) {
        lastError = error;
      }
    }
  }
  if (lastError && !hadSuccessfulResponse) throw lastError;
  return [];
}

function applyImageResults(layout, searches, resultsBySearch) {
  const sections = layout.sections.map(section => ({
    ...section,
    data: clone(section.data || {}),
    settings: clone(section.settings || {}),
  }));

  searches.forEach((search, index) => {
    const section = sections.find(item => item.id === search.sectionId);
    const results = resultsBySearch[index] || [];
    if (!section || !results.length) return;

    section.settings.aiAssetAttributions = [
      ...(section.settings.aiAssetAttributions || []),
      ...results.map(image => ({ ...image, query: search.query })),
    ].slice(-8);

    if (search.target === 'background') {
      section.settings.backgroundImage = results[0].url;
      return;
    }
    if (search.target === 'heroSlides') {
      const slides = Array.isArray(section.data.slides) ? section.data.slides.slice() : [];
      results.forEach((image, i) => {
        slides[i] = { ...(slides[i] || {}), imageUrl: image.url };
      });
      section.data.slides = slides;
      return;
    }
    if (search.target === 'cards') {
      const cardKey = section.type === 'mosaic' ? 'tiles' : 'cards';
      const cards = Array.isArray(section.data[cardKey]) ? section.data[cardKey].slice() : [];
      results.forEach((image, i) => {
        cards[i] = { ...(cards[i] || {}), imageUrl: image.url };
      });
      section.data[cardKey] = cards;
      return;
    }
    section.data.imageUrl = results[0].url;
  });

  return validateLayout({ sections });
}

function imageTargetUrls(section, search) {
  if (!section) return [];
  if (search.target === 'background') return section.settings?.backgroundImage ? [section.settings.backgroundImage] : [];
  if (search.target === 'heroSlides') return (Array.isArray(section.data?.slides) ? section.data.slides : [])
    .map(slide => slide?.imageUrl)
    .filter(Boolean);
  if (search.target === 'cards') {
    const cardKey = section.type === 'mosaic' ? 'tiles' : 'cards';
    return (Array.isArray(section.data?.[cardKey]) ? section.data[cardKey] : [])
      .map(card => card?.imageUrl)
      .filter(Boolean);
  }
  return section.data?.imageUrl ? [section.data.imageUrl] : [];
}

function verifyImageApplications(layout, searches, imageResults) {
  return searches.map((search, index) => {
    const section = layout.sections.find(item => item.id === search.sectionId);
    const expectedUrls = (imageResults[index]?.images || []).map(image => image.url).filter(Boolean);
    const actualUrls = imageTargetUrls(section, search);
    const verified = expectedUrls.length > 0 && expectedUrls.every((url, urlIndex) => actualUrls[urlIndex] === url);
    return {
      sectionId: search.sectionId,
      target: search.target,
      query: search.query,
      expectedCount: expectedUrls.length,
      appliedCount: expectedUrls.filter((url, urlIndex) => actualUrls[urlIndex] === url).length,
      verified,
    };
  });
}

async function applyImageSearches(layout, searches) {
  const searchStates = await Promise.all(searches.map(async search => {
    try {
      const results = await searchWebImages(search.query, search.count);
      return {
        results,
        imageResult: { query: search.query, count: results.length, images: results },
        warnings: results.length ? [] : [`No images found for “${search.query}”.`],
      };
    } catch (error) {
      return {
        results: [],
        imageResult: { query: search.query, count: 0, images: [] },
        warnings: [`Could not search images for “${search.query}”.`],
      };
    }
  }));
  const imageResults = searchStates.map(state => state.imageResult);
  const appliedLayout = applyImageResults(layout, searches, searchStates.map(state => state.results));
  const visualChecks = verifyImageApplications(appliedLayout, searches, imageResults);
  const verificationWarnings = visualChecks
    .filter(check => check.expectedCount > 0 && !check.verified)
    .map(check => `Could not verify image placement for “${check.query}”.`);
  return {
    layout: appliedLayout,
    warnings: [...searchStates.flatMap(state => state.warnings), ...verificationWarnings],
    imageResults,
    visualChecks,
  };
}

function buildDeterministicTestPlan({ prompt, currentLayout, catalog, answers = {}, decisionLedger = {}, baseRevision = 0, catalogContext = {}, page = {}, target = 'desktop' }) {
  const resolvedDecisionLedger = inferDecisionLedger(prompt, answers, decisionLedger, catalogContext);
  const parsed = {
    message: 'I prepared a deterministic test plan from the confirmed design brief.',
    decisionSummary: Object.keys(resolvedDecisionLedger).length
      ? `I will use the confirmed decisions: ${Object.values(resolvedDecisionLedger).join(', ')}.`
      : 'I mapped the request to the current page without changing unrelated sections.',
    confidence: 100,
    assumptions: [],
    clarifyingQuestions: [],
    plan: [{ action: 'update', target: 'page', details: 'Apply only the confirmed design brief decisions.' }],
    layout: currentLayout,
    imageSearches: [],
  };
  const pageContext = buildPageBuilderContext({
    page,
    layout: currentLayout,
    mobileLayout: page?.mobileLayout || null,
    catalogContext,
    target,
    prompt,
  });
  return normalizePlanResponse(parsed, currentLayout, catalog, prompt, answers, baseRevision, resolvedDecisionLedger, catalogContext, pageContext);
}

function pageFromRequestLayout(layout, page) {
  return layout && Array.isArray(layout.sections) ? layout : (page.draftLayout || { sections: [] });
}

// POST /api/admin/pages/:id/ai-edit
// PLAN mode is the default. APPLY mode executes a previously reviewed proposal.
const aiEditPage = asyncHandler(async (req, res) => {
  const {
    prompt,
    layout,
    catalog = [],
    mode = 'plan',
    answers = {},
    decisionLedger = {},
    context = {},
    proposal,
    target = 'desktop',
  } = req.body || {};

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    res.status(400);
    throw new Error('Please describe the page change you want.');
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    res.status(400);
    throw new Error('Prompt is too long. Keep it under ' + MAX_PROMPT_LENGTH + ' characters.');
  }

  if (req.vendor?.features?.pageBuilder === false) {
    res.status(403);
    throw new Error('Page Builder access is disabled for this vendor account');
  }
  const pageQuery = req.vendor
    ? { _id: req.params.id, vendor: req.vendor._id, scope: 'vendor', kind: 'page' }
    : { _id: req.params.id };
  const page = await Page.findOne(pageQuery).select('title slug publicSlug kind scope tenant vendor draftLayout mobileLayout mobileLayoutMode pageSettings seo builderRevision').lean();
  if (!page) { res.status(404); throw new Error('Page not found'); }

  const safeCatalogItems = safeCatalog(catalog);
  if (!safeCatalogItems.length) {
    res.status(400);
    throw new Error('No page sections are available for AI editing.');
  }

  const currentLayout = pageFromRequestLayout(layout, page);
  const catalogContext = await buildCatalogContext(req, page);
  const pageContext = buildPageBuilderContext({
    page,
    layout: currentLayout,
    mobileLayout: page.mobileLayout || null,
    catalogContext,
    target,
    prompt: prompt.trim(),
  });
  const planningContext = normalizePlanningContext(context);
  const appliedContext = planningContext.lastApplied;
  const adjustedPlan = planningContext.lastAdjusted;

  if (mode === 'apply') {
    if (!proposal || (!Array.isArray(proposal.patches) && (!proposal.layout || !Array.isArray(proposal.layout.sections)))) {
      res.status(400);
      throw new Error('This page plan is no longer available. Please ask AI to plan it again.');
    }
    const expectedRevision = Number(proposal.baseRevision);
    const currentRevision = Number(page.builderRevision || 0);
    if (Number.isInteger(expectedRevision) && expectedRevision !== currentRevision) {
      return res.status(409).json({
        success: false,
        code: 'PAGE_AI_PLAN_STALE',
        message: 'This AI plan was created from an older draft. Refresh the page and ask AI to plan again.',
        latestRevision: currentRevision,
      });
    }
    if (Array.isArray(proposal.patches)) {
      const patchIssues = validateApprovedPatches(currentLayout, proposal.patches, prompt, safeCatalogItems, proposal.plan);
      if (patchIssues.length) {
        return res.status(409).json({
          success: false,
          code: 'PAGE_AI_UNSAFE_PROPOSAL',
          message: 'This AI plan contains a destructive or invalid section change outside the request. Ask AI to plan it again.',
          issues: patchIssues,
        });
      }
    }
    const removalIds = explicitRemovalIds(prompt, proposal.plan, currentLayout, safeCatalogItems);
    const normalizedProposal = Array.isArray(proposal.patches) && proposal.patches.length
      ? applyLayoutPatches(currentLayout, proposal.patches)
      : normalizeLayout(proposal.layout, currentLayout, safeCatalogItems, { removalIds });
    const catalogValidation = validateCatalogSelections(normalizedProposal, catalogContext);
    if (catalogValidation.error) {
      res.status(409);
      throw new Error(catalogValidation.error);
    }
    const imageSearches = ensureVisualImageSearches(
      normalizeImageSearches(proposal.imageSearches, normalizedProposal.sections),
      prompt,
      normalizedProposal.sections,
    );
    const usage = startAIUsage(req, { feature: 'page_builder', action: 'apply_page_edit', credits: PAGE_BUILDER_CREDIT_COST, model: 'proposal', metadata: { pageId: String(req.params.id), patchCount: Array.isArray(proposal.patches) ? proposal.patches.length : 0 } });
    const credits = await getPageBuilderCredits(req);
    if (credits < PAGE_BUILDER_CREDIT_COST) {
      res.status(402);
      await usage.finish({ status: 'rejected', error: `Insufficient AI credits. Need ${PAGE_BUILDER_CREDIT_COST}` });
      throw new Error(`Insufficient AI credits. You have ${credits} credits but need ${PAGE_BUILDER_CREDIT_COST}. Please top up.`);
    }
    await setPageBuilderCredits(req, credits - PAGE_BUILDER_CREDIT_COST);
    usage.charge(PAGE_BUILDER_CREDIT_COST);
    try {
      const imageState = imageSearches.length
        ? await applyImageSearches(normalizedProposal, imageSearches)
        : { layout: normalizedProposal, warnings: [], imageResults: [], visualChecks: [] };
      const changes = summarizeLayoutChanges(currentLayout, imageState.layout, safeCatalogItems);
      const appliedPatches = buildLayoutPatches(currentLayout, imageState.layout);
      const impact = summarizeLayoutImpact(currentLayout, imageState.layout, safeCatalogItems, imageSearches.length);
      const plannedQuality = critiquePageBuilderPlan({
        prompt: prompt.trim(),
        currentLayout,
        nextLayout: imageState.layout,
        catalogContext,
        target,
        pageContext,
        visualAssetCount: imageSearches.length,
      });
      const quality = critiqueAppliedVisualOutcome(
        plannedQuality,
        imageState.visualChecks,
        imageState.warnings,
      );
      const recommendations = normalizePlanRecommendations(null, {
        goal: pageContext?.goal?.key,
        quality,
        visualAssetCount: imageSearches.length,
      });
      const afterDraftLayout = target === 'mobile' ? page.draftLayout : imageState.layout;
      const afterMobileLayout = target === 'mobile' ? imageState.layout : page.mobileLayout;
      const checkpoint = appliedPatches.length
        ? await createPageBuilderCheckpoint(page, {
          target: target === 'mobile' ? 'mobile' : 'desktop',
          prompt,
          changes,
          afterDraftLayout,
          afterMobileLayout,
          userId: req.user?._id || null,
        })
        : null;
      const applyStatus = imageState.warnings.length ? 'applied_with_warnings' : 'applied';
      await usage.finish({ status: 'success', extraMetadata: { status: applyStatus, patchCount: Array.isArray(proposal.patches) ? proposal.patches.length : 0 } });
      return res.json({
        success: true,
        status: applyStatus,
        applied: true,
        message: 'The approved plan has been applied to the preview.',
        layout: imageState.layout,
        patches: appliedPatches,
        images: imageState.imageResults,
        warnings: imageState.warnings,
        visualChecks: imageState.visualChecks,
        imageSearches,
        changes,
        impact,
        pageContext,
        quality,
        recommendations,
        checkpoint: checkpoint ? {
          id: String(checkpoint._id),
          target: checkpoint.target,
          createdAt: checkpoint.createdAt,
          expiresAt: checkpoint.expiresAt,
          beforeRevision: checkpoint.beforeBuilderRevision,
        } : null,
        sectionOrder: imageState.layout.sections.map((section, index) => `${index + 1}. ${sectionLabel(section.type, safeCatalogItems)}`),
        aiCredits: roundCredits(credits - PAGE_BUILDER_CREDIT_COST),
        model: 'proposal',
      });
    } catch (error) {
      const current = await getPageBuilderCredits(req);
      await setPageBuilderCredits(req, current + PAGE_BUILDER_CREDIT_COST);
      usage.refund(PAGE_BUILDER_CREDIT_COST);
      await usage.finish({ status: 'failed', error: error.message });
      throw error;
    }
  }

  const safeAnswers = normalizeAnswers(answers);
  const safeDecisionLedger = inferDecisionLedger(prompt.trim(), safeAnswers, decisionLedger, catalogContext);
  const testMode = process.env.NODE_ENV !== 'production' && process.env.PAGE_BUILDER_AI_TEST_MODE === 'true';
  const model = testMode ? 'deterministic-test' : await getAIModel();
  const usage = startAIUsage(req, { feature: 'page_builder', action: 'plan_page_edit', credits: 0, model, metadata: { pageId: String(req.params.id), answerCount: Object.keys(safeAnswers).length } });
  const remainingCredits = await getPageBuilderCredits(req);
  let response;
  let result;
  try {
    if (testMode) {
        result = buildDeterministicTestPlan({
          prompt: prompt.trim(),
          currentLayout,
          catalog: safeCatalogItems,
          answers: safeAnswers,
          decisionLedger: safeDecisionLedger,
          baseRevision: Number(page.builderRevision || 0),
          catalogContext,
          page,
          target,
        });
      response = { usage: {} };
    } else {
      const client = await getAIClient();
      response = await client.chat.completions.create({
        model,
        temperature: 0.15,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildSystemPrompt({ page, layout: currentLayout, catalog: safeCatalogItems, answers: safeAnswers, decisionLedger: safeDecisionLedger, catalogContext, pageContext, appliedContext, adjustedPlan }) },
          {
            role: 'user',
            content: [
              prompt.trim(),
              Object.keys(safeAnswers).length ? `Answers to clarify the request:\n${JSON.stringify(safeAnswers)}` : '',
              Object.keys(safeDecisionLedger).length ? `Confirmed design brief decisions:\n${JSON.stringify(safeDecisionLedger)}` : '',
            ].filter(Boolean).join('\n\n'),
          },
        ],
        max_tokens: 8000,
      });

      const parsed = parseModelJson(response.choices?.[0]?.message?.content);
      result = normalizePlanResponse(parsed, currentLayout, safeCatalogItems, prompt.trim(), safeAnswers, Number(page.builderRevision || 0), safeDecisionLedger, catalogContext, pageContext);
    }
  } catch (err) {
    await usage.finish({ status: 'failed', error: err.message });
    throw err;
  }

  if (result.questions.length) {
    await usage.finish({ usage: response.usage, extraMetadata: { status: 'needs_clarification', questionCount: result.questions.length } });
    return res.json({
      success: true,
      status: 'needs_clarification',
      requiresClarification: true,
      requiresConfirmation: false,
      message: result.message || 'I need a couple of decisions before I make the change.',
      decisionSummary: result.decisionSummary,
      confidence: result.confidence,
      assumptions: result.assumptions,
      decisionLedger: result.decisionLedger,
      resolvedProductSource: result.resolvedProductSource,
      contextUsed: !!(appliedContext || adjustedPlan),
      feedbackUsed: !!adjustedPlan,
      pageContext: result.pageContext,
      quality: result.quality,
      recommendations: result.recommendations,
      imageSearches: result.imageSearches,
      questions: result.questions,
      plan: result.plan,
      impact: result.impact,
      sectionOrder: result.sectionOrder,
      changes: [],
      model,
      aiCredits: remainingCredits,
    });
  }

  await usage.finish({ usage: response.usage, extraMetadata: { status: 'awaiting_confirmation', actionCount: result.plan.length } });
  return res.json({
    success: true,
    status: 'awaiting_confirmation',
    requiresClarification: false,
    requiresConfirmation: true,
    message: result.message,
    decisionSummary: result.decisionSummary,
    confidence: result.confidence,
    assumptions: result.assumptions,
    decisionLedger: result.decisionLedger,
    resolvedProductSource: result.resolvedProductSource,
    contextUsed: !!(appliedContext || adjustedPlan),
    feedbackUsed: !!adjustedPlan,
    pageContext: result.pageContext,
    quality: result.quality,
    recommendations: result.recommendations,
    imageSearches: result.imageSearches,
    plan: result.plan,
    changes: result.changes,
    impact: result.impact,
    sectionOrder: result.sectionOrder,
    proposal: result.proposal,
    model,
    aiCredits: remainingCredits,
  });
});

module.exports = {
  aiEditPage,
  buildLayoutPatches,
  validateApprovedPatches,
  applyLayoutPatches,
  summarizeLayoutImpact,
  applyImageResults,
  applyImageSearches,
  verifyImageApplications,
  normalizeDecisionLedger,
  inferDecisionLedger,
  promptClarifications,
  resolveProductSource,
  normalizeImageSearches,
  visualImageIntent,
  buildCatalogContext,
  buildDeterministicTestPlan,
  buildPageBuilderContext,
  critiquePageBuilderPlan,
  critiqueAppliedVisualOutcome,
  getSectionCapability,
  normalizePlanRecommendations,
  buildImageQueryVariants,
  normalizeAppliedContext,
  normalizePlanFeedback,
  normalizePlanningContext,
  buildSystemPrompt,
};
