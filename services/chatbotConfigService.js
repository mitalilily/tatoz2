const Settings = require('../models/Settings');

const CONFIG_KEY = 'chatbot_config';
const CACHE_TTL_MS = 60 * 1000;

let cache = { config: null, expiresAt: 0 };
let loadPromise = null;

const TOOLSETS = ['shop_assistant', 'order_query', 'payment_query', 'general'];

const DEFAULT_CATEGORIES = [
  {
    key: 'shop_assistant',
    label: 'Shop Assistant',
    desc: 'Find products, store info & FAQs',
    enabled: true,
    toolset: 'shop_assistant',
    greeting: 'Hello! I can help you find products and answer store questions. What are you looking for today?',
    prompt: '',
  },
  {
    key: 'order_query',
    label: 'Order Related',
    desc: 'Track, status & order queries',
    enabled: true,
    toolset: 'order_query',
    greeting: 'Hello! I can help you track and understand your orders. Please share your order number or ask away.',
    prompt: '',
  },
  {
    key: 'payment_query',
    label: 'Payment Related',
    desc: 'Refunds, failures & payment status',
    enabled: true,
    toolset: 'payment_query',
    greeting: 'Hello! I can help with payment statuses and refund questions. How can I help?',
    prompt: '',
  },
];

const DEFAULTS = {
  enabled: true,
  requireLogin: true,
  botName: 'AI Assistant',
  welcomeMessage: 'How can I help you today? Select a category to start.',
  placeholder: 'Type a message...',
  primaryColor: '#0f172a',
  showProductCards: true,
  categories: DEFAULT_CATEGORIES,
  faqs: [],
  quickReplies: [],
  systemBase: '',
  escalationMessage: 'This conversation has been escalated to our team. They will review and respond.',
  maxHistory: 20,
  productsLimit: 5,
  rateLimitPerMin: 20,
  maxMessageLength: 1000,
  aiTimeoutMs: 25000,
  // Keep normal chat answers short so the provider can finish quickly.
  maxOutputTokens: 600,
};

const slugRe = /^[a-z0-9_]+$/;
const hexColorRe = /^#[0-9a-fA-F]{6}$/;
const clampInt = (value, fallback, min, max) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};
const cleanString = (value, max) => String(value ?? '').trim().slice(0, max);

// Escape user text before it is embedded in a RegExp (product search).
// Without this, characters like `(` or `*` throw or cause ReDoS-style scans.
const escapeRegExp = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeCategory = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const key = cleanString(raw.key, 40).toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '');
  if (!key || !slugRe.test(key)) return null;
  const toolset = TOOLSETS.includes(raw.toolset) ? raw.toolset : 'general';
  return {
    key,
    label: cleanString(raw.label, 40) || 'Assistant',
    desc: cleanString(raw.desc, 120),
    enabled: raw.enabled !== false,
    toolset,
    greeting: cleanString(raw.greeting, 500),
    prompt: cleanString(raw.prompt, 2000),
  };
};

const normalizeFaq = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const question = cleanString(raw.question, 200);
  const answer = cleanString(raw.answer, 2000);
  if (!question || !answer) return null;
  return { question, answer, enabled: raw.enabled !== false };
};

// Pure + exported for unit tests. Merges partial admin input over defaults.
const normalizeChatbotConfig = (input = {}) => {
  const src = input && typeof input === 'object' ? input : {};
  const categories = Array.isArray(src.categories)
    ? src.categories.map(normalizeCategory).filter(Boolean).slice(0, 10)
    : null;
  const faqs = Array.isArray(src.faqs)
    ? src.faqs.map(normalizeFaq).filter(Boolean).slice(0, 50)
    : null;
  const quickReplies = Array.isArray(src.quickReplies)
    ? [...new Set(src.quickReplies.map((q) => cleanString(q, 60)).filter(Boolean))].slice(0, 12)
    : null;
  const primaryColor = cleanString(src.primaryColor, 7);
  return {
    enabled: src.enabled !== undefined ? src.enabled !== false : DEFAULTS.enabled,
    requireLogin: src.requireLogin !== undefined ? src.requireLogin !== false : DEFAULTS.requireLogin,
    botName: cleanString(src.botName, 60) || DEFAULTS.botName,
    welcomeMessage: cleanString(src.welcomeMessage, 500) || DEFAULTS.welcomeMessage,
    placeholder: cleanString(src.placeholder, 100) || DEFAULTS.placeholder,
    primaryColor: hexColorRe.test(primaryColor) ? primaryColor : DEFAULTS.primaryColor,
    showProductCards: src.showProductCards !== undefined ? src.showProductCards !== false : DEFAULTS.showProductCards,
    categories: categories && categories.length ? categories : DEFAULTS.categories.map(normalizeCategory),
    faqs: faqs || [],
    quickReplies: quickReplies || [],
    systemBase: cleanString(src.systemBase, 4000),
    escalationMessage: cleanString(src.escalationMessage, 500) || DEFAULTS.escalationMessage,
    maxHistory: clampInt(src.maxHistory, DEFAULTS.maxHistory, 4, 50),
    productsLimit: clampInt(src.productsLimit, DEFAULTS.productsLimit, 1, 10),
    rateLimitPerMin: clampInt(src.rateLimitPerMin, DEFAULTS.rateLimitPerMin, 5, 120),
    maxMessageLength: clampInt(src.maxMessageLength, DEFAULTS.maxMessageLength, 200, 4000),
    aiTimeoutMs: clampInt(src.aiTimeoutMs, DEFAULTS.aiTimeoutMs, 5000, 60000),
    maxOutputTokens: clampInt(src.maxOutputTokens, DEFAULTS.maxOutputTokens, 150, 1200),
  };
};

const normalizeToken = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length >= 3);

// Fast local FAQ matcher. Runs before any AI call so common questions
// answer instantly without spending credits.
const matchFaq = (message, faqs = []) => {
  const text = String(message || '').trim().toLowerCase();
  if (text.length < 3) return null;
  const enabled = (faqs || []).filter((f) => f && f.enabled !== false && f.question && f.answer);
  // Direct substring either way (min length guards against 1-word collisions).
  for (const faq of enabled) {
    const q = String(faq.question).trim().toLowerCase();
    if (q.length >= 8 && (text.includes(q) || q.includes(text))) return faq;
  }
  // Word-overlap fallback: at least half the FAQ's meaningful words present.
  const textTokens = new Set(normalizeToken(text));
  if (!textTokens.size) return null;
  let best = null;
  let bestScore = 0;
  for (const faq of enabled) {
    const qTokens = normalizeToken(faq.question);
    if (!qTokens.length) continue;
    const hits = qTokens.filter((t) => textTokens.has(t)).length;
    const score = hits / qTokens.length;
    if (score >= 0.5 && score > bestScore) {
      best = faq;
      bestScore = score;
    }
  }
  return best;
};

const getChatbotConfig = async ({ skipCache = false } = {}) => {
  if (!skipCache && cache.config && Date.now() < cache.expiresAt) return cache.config;
  // Collapse concurrent cold-cache requests from the widget and full chat
  // page into one database read. This matters on the first storefront load.
  if (!skipCache && loadPromise) return loadPromise;
  loadPromise = Promise.all([
    Settings.get(CONFIG_KEY, null).catch(() => null),
    Settings.get('site_name', 'Our Store').catch(() => 'Our Store'),
  ]).then(([stored, siteName]) => {
    const config = {
      ...normalizeChatbotConfig(stored && typeof stored === 'object' ? stored : {}),
      siteName: String(siteName || 'Our Store').trim() || 'Our Store',
    };
    cache = { config, expiresAt: Date.now() + CACHE_TTL_MS };
    return config;
  }).finally(() => { loadPromise = null; });
  return loadPromise;
};

const updateChatbotConfig = async (input) => {
  const config = normalizeChatbotConfig(input);
  await Settings.set(CONFIG_KEY, config, 'chatbot');
  cache = { config: { ...config, siteName: cache.config?.siteName || 'Our Store' }, expiresAt: Date.now() + CACHE_TTL_MS };
  return config;
};

const invalidateChatbotConfigCache = () => {
  cache = { config: null, expiresAt: 0 };
  loadPromise = null;
};

// Public subset for the storefront widget. Never exposes system prompts.
const toPublicConfig = (config) => ({
  enabled: config.enabled !== false,
  requireLogin: config.requireLogin !== false,
  botName: config.botName,
  welcomeMessage: config.welcomeMessage,
  placeholder: config.placeholder,
  primaryColor: config.primaryColor,
  showProductCards: config.showProductCards !== false,
  escalationMessage: config.escalationMessage,
  quickReplies: config.quickReplies || [],
  categories: (config.categories || []).filter((c) => c.enabled !== false).map((c) => ({
    key: c.key,
    label: c.label,
    desc: c.desc,
    greeting: c.greeting || '',
  })),
  faqs: (config.faqs || []).filter((f) => f.enabled !== false).map((f) => ({
    question: f.question,
    answer: f.answer,
  })),
});

module.exports = {
  CONFIG_KEY,
  DEFAULTS,
  TOOLSETS,
  normalizeChatbotConfig,
  normalizeCategory,
  normalizeFaq,
  matchFaq,
  escapeRegExp,
  getChatbotConfig,
  updateChatbotConfig,
  invalidateChatbotConfigCache,
  toPublicConfig,
};
