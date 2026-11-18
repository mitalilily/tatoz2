const mongoose = require('mongoose');
const StorefrontLocaleConfig = require('../models/StorefrontLocaleConfig');

const DEFAULT_RATE_SOURCE = 'https://api.frankfurter.dev/v2/rates';

const CURRENCY_META = {
  INR: { symbol: '₹', locale: 'en-IN' },
  USD: { symbol: '$', locale: 'en-US' },
  EUR: { symbol: '€', locale: 'de-DE' },
  GBP: { symbol: '£', locale: 'en-GB' },
  CAD: { symbol: 'CA$', locale: 'en-CA' },
  AUD: { symbol: 'A$', locale: 'en-AU' },
  JPY: { symbol: '¥', locale: 'ja-JP' },
  SGD: { symbol: 'S$', locale: 'en-SG' },
  AED: { symbol: 'د.إ', locale: 'ar-AE' },
  SAR: { symbol: '﷼', locale: 'ar-SA' },
  BRL: { symbol: 'R$', locale: 'pt-BR' },
};

const DEFAULT_LOCALES = [
  { code: 'en-IN', label: 'English (India)', enabled: true },
  { code: 'hi-IN', label: 'Hindi (India)', enabled: true },
];

const DEFAULT_CURRENCIES = [
  { code: 'INR', symbol: '₹', locale: 'en-IN', rateFromBase: 1, decimals: 2, enabled: true },
];

const text = (value, fallback = '') => String(value ?? fallback).trim();
const normalizeCurrency = value => text(value, 'INR').toUpperCase();
const normalizeLocale = value => text(value, 'en-IN').replace(/_/g, '-');
const isValidCurrency = value => /^[A-Z]{3}$/.test(String(value || ''));
const isValidLocale = value => /^[A-Za-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(String(value || ''));

const clone = value => JSON.parse(JSON.stringify(value));

const currencyMeta = code => CURRENCY_META[normalizeCurrency(code)] || { symbol: normalizeCurrency(code), locale: 'en-IN' };

function normalizeLocales(input, fallback = DEFAULT_LOCALES) {
  const list = Array.isArray(input) ? input : fallback;
  const seen = new Set();
  const normalized = [];
  for (const item of list) {
    const source = typeof item === 'string' ? { code: item, label: item } : (item || {});
    const code = normalizeLocale(source.code);
    if (!isValidLocale(code) || seen.has(code)) continue;
    seen.add(code);
    normalized.push({
      code,
      label: text(source.label, code).slice(0, 80),
      enabled: source.enabled !== false,
    });
  }
  return normalized.length ? normalized.slice(0, 50) : clone(DEFAULT_LOCALES);
}

function normalizeCurrencies(input, baseCurrency = 'INR', fallback = DEFAULT_CURRENCIES) {
  const list = Array.isArray(input) ? input : fallback;
  const base = normalizeCurrency(baseCurrency);
  const seen = new Set();
  const normalized = [];
  for (const item of list) {
    const source = typeof item === 'string' ? { code: item } : (item || {});
    const code = normalizeCurrency(source.code);
    if (!isValidCurrency(code) || seen.has(code)) continue;
    const meta = currencyMeta(code);
    const rate = code === base ? 1 : Number(source.rateFromBase);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 1000000) continue;
    const decimals = Number(source.decimals);
    seen.add(code);
    normalized.push({
      code,
      symbol: text(source.symbol, meta.symbol).slice(0, 8),
      locale: normalizeLocale(source.locale || meta.locale),
      rateFromBase: rate,
      decimals: Number.isInteger(decimals) && decimals >= 0 && decimals <= 4 ? decimals : 2,
      enabled: source.enabled !== false,
    });
  }
  if (!normalized.some(item => item.code === base)) {
    const meta = currencyMeta(base);
    normalized.unshift({ code: base, symbol: meta.symbol, locale: meta.locale, rateFromBase: 1, decimals: 2, enabled: true });
  }
  return normalized.slice(0, 50);
}

function ensureSelection({ items, requested, fallback }) {
  const enabled = items.filter(item => item.enabled !== false);
  const preferred = text(requested, fallback);
  return enabled.find(item => item.code === preferred) || enabled.find(item => item.code === fallback) || enabled[0] || items[0];
}

function safeConfig(config, source = 'default') {
  const raw = config || {};
  return {
    _id: raw._id,
    tenant: raw.tenant,
    source,
    baseCurrency: normalizeCurrency(raw.baseCurrency),
    defaultCurrency: normalizeCurrency(raw.defaultCurrency),
    defaultLocale: normalizeLocale(raw.defaultLocale),
    supportedLocales: normalizeLocales(raw.supportedLocales),
    supportedCurrencies: normalizeCurrencies(raw.supportedCurrencies, raw.baseCurrency),
    rateSource: raw.rateSource || null,
    ratesUpdatedAt: raw.ratesUpdatedAt || null,
    ratesDate: raw.ratesDate || null,
    updatedAt: raw.updatedAt,
  };
}

function defaultConfig({ legacyCurrency, legacyCurrencySymbol, legacyLocale } = {}) {
  const legacyCode = normalizeCurrency(legacyCurrency || 'INR');
  const legacyLocaleCode = normalizeLocale(legacyLocale || currencyMeta(legacyCode).locale || 'en-IN');
  const currencies = clone(DEFAULT_CURRENCIES);
  if (legacyCode !== 'INR') {
    currencies.push({
      code: legacyCode,
      symbol: text(legacyCurrencySymbol, currencyMeta(legacyCode).symbol),
      locale: legacyLocaleCode,
      // Legacy settings were labels only. Preserve that behaviour until a
      // tenant explicitly configures a conversion rate.
      rateFromBase: 1,
      decimals: 2,
      enabled: true,
    });
  }
  return {
    baseCurrency: 'INR',
    defaultCurrency: legacyCode,
    defaultLocale: legacyLocaleCode,
    supportedLocales: normalizeLocales([
      ...DEFAULT_LOCALES,
      { code: legacyLocaleCode, label: legacyLocaleCode, enabled: true },
    ]),
    supportedCurrencies: normalizeCurrencies(currencies, 'INR'),
  };
}

async function getConfig({ tenantId, legacyCurrency, legacyCurrencySymbol, legacyLocale } = {}) {
  if (tenantId && mongoose.isValidObjectId(tenantId)) {
    const saved = await StorefrontLocaleConfig.findOne({ tenant: tenantId }).lean();
    if (saved) return safeConfig(saved, 'tenant');
  }
  return safeConfig(defaultConfig({ legacyCurrency, legacyCurrencySymbol, legacyLocale }), 'default');
}

async function updateConfig({ tenantId, userId, payload = {} }) {
  if (!tenantId || !mongoose.isValidObjectId(tenantId)) {
    const error = new Error('Tenant context is required');
    error.statusCode = 400;
    error.publicCode = 'TENANT_REQUIRED';
    throw error;
  }
  const current = await getConfig({ tenantId });
  const baseCurrency = normalizeCurrency(payload.baseCurrency ?? current.baseCurrency);
  const defaultCurrency = normalizeCurrency(payload.defaultCurrency ?? current.defaultCurrency);
  const defaultLocale = normalizeLocale(payload.defaultLocale ?? current.defaultLocale);
  if (!isValidCurrency(baseCurrency) || !isValidCurrency(defaultCurrency)) {
    const error = new Error('Currency codes must be three uppercase letters');
    error.statusCode = 400;
    error.publicCode = 'LOCALE_CURRENCY_INVALID';
    throw error;
  }
  if (!isValidLocale(defaultLocale)) {
    const error = new Error('Default locale is invalid');
    error.statusCode = 400;
    error.publicCode = 'LOCALE_INVALID';
    throw error;
  }

  const supportedLocales = normalizeLocales(payload.supportedLocales ?? current.supportedLocales);
  const supportedCurrencies = normalizeCurrencies(payload.supportedCurrencies ?? current.supportedCurrencies, baseCurrency);
  const defaultLocaleEntry = supportedLocales.find(item => item.code === defaultLocale);
  const defaultCurrencyEntry = supportedCurrencies.find(item => item.code === defaultCurrency);
  if (!defaultLocaleEntry || defaultLocaleEntry.enabled === false) {
    const error = new Error('Default locale must be enabled in supported locales');
    error.statusCode = 400;
    error.publicCode = 'DEFAULT_LOCALE_NOT_SUPPORTED';
    throw error;
  }
  if (!defaultCurrencyEntry || defaultCurrencyEntry.enabled === false) {
    const error = new Error('Default currency must be enabled in supported currencies');
    error.statusCode = 400;
    error.publicCode = 'DEFAULT_CURRENCY_NOT_SUPPORTED';
    throw error;
  }

  const saved = await StorefrontLocaleConfig.findOneAndUpdate(
    { tenant: tenantId },
    { $set: { baseCurrency, defaultCurrency, defaultLocale, supportedLocales, supportedCurrencies, updatedBy: userId } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();
  return safeConfig(saved, 'tenant');
}

const parseRatePayload = body => {
  if (Array.isArray(body)) return body.reduce((out, row) => {
    const quote = normalizeCurrency(row?.quote || row?.currency || row?.symbol);
    const rate = Number(row?.rate);
    if (quote && Number.isFinite(rate) && rate > 0) out[quote] = rate;
    return out;
  }, {});
  return Object.entries(body?.rates || {}).reduce((out, [code, value]) => {
    const quote = normalizeCurrency(code);
    const rate = Number(value);
    if (quote && Number.isFinite(rate) && rate > 0) out[quote] = rate;
    return out;
  }, {});
};

async function fetchExchangeRates({ baseCurrency, quoteCurrencies, fetchImpl = globalThis.fetch, sourceUrl = process.env.EXCHANGE_RATE_API_URL || DEFAULT_RATE_SOURCE } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Automatic currency conversion requires a fetch-capable Node runtime');
  const base = normalizeCurrency(baseCurrency);
  const quotes = [...new Set((quoteCurrencies || []).map(normalizeCurrency).filter(code => code && code !== base))];
  if (!quotes.length) return { rates: {}, source: sourceUrl, date: null };
  const url = new URL(sourceUrl);
  url.searchParams.set('base', base);
  url.searchParams.set('quotes', quotes.join(','));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.EXCHANGE_RATE_TIMEOUT_MS) || 8000);
  try {
    const response = await fetchImpl(url.toString(), { headers: { accept: 'application/json' }, signal: controller.signal });
    if (!response?.ok) throw new Error(`Exchange rate provider returned HTTP ${response?.status || 0}`);
    const body = await response.json();
    const rates = parseRatePayload(body);
    const missing = quotes.filter(code => !Number.isFinite(rates[code]));
    if (missing.length === quotes.length) throw new Error(`Exchange rate provider returned no rates for ${missing.join(', ')}`);
    const date = body?.date || body?.ratesDate || (Array.isArray(body) ? body.find(row => row?.date)?.date : null) || null;
    return { rates, source: url.toString(), date };
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshRates({ tenantId, userId, fetchImpl, now = new Date() } = {}) {
  if (!tenantId || !mongoose.isValidObjectId(tenantId)) {
    const error = new Error('Tenant context is required');
    error.statusCode = 400;
    error.publicCode = 'TENANT_REQUIRED';
    throw error;
  }
  const current = await StorefrontLocaleConfig.findOne({ tenant: tenantId }).lean();
  const config = current ? safeConfig(current, 'tenant') : safeConfig(defaultConfig(), 'default');
  const quoteCurrencies = config.supportedCurrencies.filter(item => item.enabled !== false).map(item => item.code);
  const fetched = await fetchExchangeRates({ baseCurrency: config.baseCurrency, quoteCurrencies, fetchImpl });
  const supportedCurrencies = config.supportedCurrencies.map(item => ({
    ...item,
    rateFromBase: item.code === config.baseCurrency ? 1 : (fetched.rates[item.code] || item.rateFromBase),
  }));
  const saved = await StorefrontLocaleConfig.findOneAndUpdate(
    { tenant: tenantId },
    { $set: { baseCurrency: config.baseCurrency, defaultCurrency: config.defaultCurrency, defaultLocale: config.defaultLocale, supportedLocales: config.supportedLocales, supportedCurrencies, rateSource: fetched.source, ratesUpdatedAt: now, ratesDate: fetched.date || null, updatedBy: userId } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();
  return safeConfig(saved, 'tenant');
}

async function getPublicContext({ tenantId, requestedCurrency, requestedLocale, legacyCurrency, legacyCurrencySymbol, legacyLocale } = {}) {
  const config = await getConfig({ tenantId, legacyCurrency, legacyCurrencySymbol, legacyLocale });
  const currency = ensureSelection({ items: config.supportedCurrencies, requested: normalizeCurrency(requestedCurrency), fallback: config.defaultCurrency });
  const locale = ensureSelection({ items: config.supportedLocales, requested: normalizeLocale(requestedLocale), fallback: config.defaultLocale });
  return {
    source: config.source,
    baseCurrency: config.baseCurrency,
    currency: currency?.code || config.baseCurrency,
    currencySymbol: currency?.symbol || currencyMeta(config.baseCurrency).symbol,
    locale: locale?.code || config.defaultLocale,
    rateFromBase: Number(currency?.rateFromBase || 1),
    decimals: Number.isInteger(currency?.decimals) ? currency.decimals : 2,
    supportedCurrencies: config.supportedCurrencies.filter(item => item.enabled !== false),
    supportedLocales: config.supportedLocales.filter(item => item.enabled !== false),
    defaultCurrency: config.defaultCurrency,
    defaultLocale: config.defaultLocale,
    // The server continues to calculate and settle orders in base currency.
    // Display conversion is intentionally explicit until provider settlement
    // capabilities are configured for every tenant and payment gateway.
    settlementCurrency: config.baseCurrency,
  };
}

function convertFromBase(amount, rateFromBase = 1, decimals = 2) {
  const numeric = Number(amount || 0);
  if (!Number.isFinite(numeric)) return 0;
  const rate = Number(rateFromBase || 1);
  const places = Number.isInteger(Number(decimals)) ? Math.min(4, Math.max(0, Number(decimals))) : 2;
  const factor = 10 ** places;
  return Math.round(numeric * rate * factor) / factor;
}

module.exports = {
  DEFAULT_RATE_SOURCE,
  CURRENCY_META,
  DEFAULT_LOCALES,
  DEFAULT_CURRENCIES,
  normalizeCurrency,
  normalizeLocale,
  getConfig,
  updateConfig,
  fetchExchangeRates,
  refreshRates,
  getPublicContext,
  convertFromBase,
  safeConfig,
};
