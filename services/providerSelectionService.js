const Settings = require('../models/Settings');

const PROVIDERS = Object.freeze({
  payment: Object.freeze(['razorpay', 'cashfree', 'stripe']),
  shipping: Object.freeze(['shiprocket', 'delhivery', 'xpressbees', 'bluedart', 'dtdc']),
});

const settingKey = kind => kind === 'payment' ? 'active_payment_provider' : 'active_shipping_provider';
const multiSettingKey = kind => kind === 'payment' ? 'active_payment_providers' : null;

const normalize = value => String(value || '').trim().toLowerCase();

const assertProvider = (kind, provider) => {
  const id = normalize(provider);
  if (!PROVIDERS[kind]?.includes(id)) {
    const error = new Error(`Unsupported active ${kind} provider: ${provider}`);
    error.statusCode = 400;
    throw error;
  }
 return id;
};

const assertProviders = (kind, providers, { allowEmpty = false } = {}) => {
 const values = Array.isArray(providers) ? providers : [providers];
 if (allowEmpty && (providers === undefined || providers === null || String(providers || '').trim() === '' || !values.length)) return [];
 const normalized = [...new Set(values.map(provider => assertProvider(kind, provider)))];
 if (!normalized.length && !allowEmpty) {
  const error = new Error(`At least one active ${kind} provider is required`);
  error.statusCode = 400;
  throw error;
 }
 return normalized;
};

const getActiveProviders = async kind => {
 if (!PROVIDERS[kind]) throw new Error(`Unsupported provider type: ${kind}`);
 const configuredMultiple = multiSettingKey(kind) ? await Settings.get(multiSettingKey(kind), undefined) : undefined;
 const configuredLegacy = await Settings.get(settingKey(kind), undefined);
 // An explicitly saved empty list/null means that the operator intentionally
 // disabled the integration. Never silently turn that into a provider default.
 const candidates = multiSettingKey(kind) && configuredMultiple !== undefined
  ? Array.isArray(configuredMultiple)
    ? configuredMultiple
    : configuredMultiple === null || configuredMultiple === '' ? [] : [configuredMultiple]
  : configuredLegacy === undefined || configuredLegacy === null || configuredLegacy === ''
    ? []
    : [configuredLegacy];
 const active = [...new Set(candidates.map(normalize).filter(provider => PROVIDERS[kind].includes(provider)))];
 return active;
};

const getActiveProvider = async kind => (await getActiveProviders(kind))[0] || null;

const assertActiveProvider = async (kind, provider) => {
 const normalized = assertProvider(kind, provider);
 const activeProviders = await getActiveProviders(kind);
 if (activeProviders.includes(normalized)) return normalized;
 const error = new Error(`${normalized} is not active. Configure it in Admin → Modules before using this page.`);
 error.statusCode = 409;
 error.publicCode = 'PROVIDER_INACTIVE';
 error.activeProviders = activeProviders;
 throw error;
};

const isSupported = (kind, provider) => PROVIDERS[kind]?.includes(normalize(provider)) || false;

module.exports = { PROVIDERS, settingKey, multiSettingKey, normalize, assertProvider, assertProviders, getActiveProviders, getActiveProvider, assertActiveProvider, isSupported };
