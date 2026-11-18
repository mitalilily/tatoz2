const Settings = require('../models/Settings');
const tenantIntegrationService = require('./tenantIntegrationService');
const authPolicyService = require('./authPolicyService');
const { catalog, getProviderDefinition } = require('./integrations/providerRegistry');
const { getActiveProviders, getActiveProvider, assertProvider, assertProviders } = require('./providerSelectionService');

const AUTH_METHODS = Object.freeze(['password', 'msg91', 'wati', 'google']);
const SHIPPING_PROVIDERS = Object.freeze(['shiprocket', 'delhivery', 'xpressbees', 'bluedart', 'dtdc']);
const PAYMENT_PROVIDERS = Object.freeze(['razorpay', 'cashfree', 'stripe']);

const hasValue = value => value !== undefined && value !== null && String(value).trim() !== '';

const errorWithCode = (message, code, statusCode = 400) => {
  const error = new Error(message);
  error.publicCode = code;
  error.statusCode = statusCode;
  return error;
};

const normalizeMethods = values => [...new Set((Array.isArray(values) ? values : [values])
  .map(value => String(value || '').trim().toLowerCase())
  .filter(Boolean))];

const isConfiguredAndTested = async (tenant, provider) => {
  const definition = getProviderDefinition(provider);
  const config = await tenantIntegrationService.configFor(tenant._id, definition.id, { allowPlatformFallback: false });
  const missing = (definition.fields || [])
    .filter(field => field.required && !hasValue(config[field.key]))
    .map(field => field.label);
  const connected = config.connection?.status === 'connected';
  const enabled = Boolean(config.enabled && config.connectionEnabled && config.moduleEnabled);

  if (!connected || !enabled || missing.length) {
    const reason = missing.length
      ? `Missing ${missing.join(', ')}`
      : !connected
        ? 'Connection test is required'
        : 'Provider connection is disabled';
    throw errorWithCode(`${definition.name} cannot be activated. ${reason}.`, 'PROVIDER_NOT_READY');
  }
  return { definition, config };
};

const publicAuthProvider = (definition, policy) => {
  const mode = policy.modes?.find(item => item.id === definition.id);
  const provider = mode?.provider || definition.provider;
  return {
    id: definition.id,
    name: mode?.label || definition.label,
    description: mode?.description || definition.description,
    provider,
    builtIn: !provider,
    configured: Boolean(mode?.configured),
    tested: Boolean(mode?.tested),
    available: Boolean(mode?.available),
    active: policy.activeMethods.includes(definition.id),
    primary: policy.primaryMode === definition.id,
  };
};

const integrationCards = (integrations, ids) => ids
  .map(id => integrations.find(integration => integration.id === id))
  .filter(Boolean);

const getControlPlane = async tenant => {
  if (!tenant?._id) throw errorWithCode('Platform tenant is not configured', 'PLATFORM_TENANT_REQUIRED', 503);
  const [integrations, policy, activeShippingProvider, activePaymentProviders] = await Promise.all([
    tenantIntegrationService.listPublic(tenant),
    authPolicyService.getPublicConfig(tenant._id),
    getActiveProvider('shipping'),
    getActiveProviders('payment'),
  ]);

  const authDefinitions = AUTH_METHODS.map(id => authPolicyService.MODE_DEFINITIONS[id]).filter(Boolean);
  return {
    version: 1,
    tenant: { id: tenant._id, key: tenant.key, name: tenant.name },
    authentication: {
      activeMethods: policy.activeMethods,
      primaryMode: policy.primaryMode,
      available: policy.available,
      providers: authDefinitions.map(definition => publicAuthProvider(definition, policy)),
      cartOtpProvider: policy.cartOtpProvider,
      cartOtpProviders: policy.cartOtpProviders,
    },
    shipping: {
      activeProvider: activeShippingProvider,
      providers: integrationCards(integrations, SHIPPING_PROVIDERS).map(card => ({ ...card, selected: card.id === activeShippingProvider })),
    },
    payment: {
      activeProviders: activePaymentProviders,
      primaryProvider: activePaymentProviders[0] || null,
      providers: integrationCards(integrations, PAYMENT_PROVIDERS).map(card => ({ ...card, selected: activePaymentProviders.includes(card.id), primary: card.id === activePaymentProviders[0] })),
    },
  };
};

const activateAuthentication = async (tenant, payload, updatedBy) => {
  const requested = normalizeMethods(payload.activeMethods || payload.methods || payload.primaryMode);
  if (!requested.length) throw errorWithCode('Select at least one authentication method', 'AUTH_METHOD_REQUIRED');
  const invalid = requested.filter(id => !AUTH_METHODS.includes(id));
  if (invalid.length) throw errorWithCode(`Unsupported authentication method: ${invalid.join(', ')}`, 'AUTH_MODE_UNSUPPORTED');
  const policy = await authPolicyService.setPolicy(tenant, { ...payload, activeMethods: requested, primaryMode: requested[0] }, updatedBy);
  return { policy };
};

const activateShipping = async (tenant, payload, updatedBy) => {
  const requestedProvider = Object.prototype.hasOwnProperty.call(payload, 'provider') ? payload.provider : payload.activeProvider;
  if (requestedProvider === undefined || requestedProvider === null || String(requestedProvider).trim() === '') {
    await Settings.set('active_shipping_provider', null);
    return { activeProvider: null, updatedBy };
  }
  const provider = assertProvider('shipping', requestedProvider);
  await isConfiguredAndTested(tenant, provider);
  await Settings.set('active_shipping_provider', provider);
  return { activeProvider: provider, updatedBy };
};

const activatePayment = async (tenant, payload, updatedBy) => {
  const requestedProviders = Object.prototype.hasOwnProperty.call(payload, 'providers')
    ? payload.providers
    : Object.prototype.hasOwnProperty.call(payload, 'activeProviders')
      ? payload.activeProviders
      : payload.provider;
  const providers = assertProviders('payment', requestedProviders, { allowEmpty: true });
  await Promise.all(providers.map(provider => isConfiguredAndTested(tenant, provider)));
  await Settings.set('active_payment_providers', providers);
  await Settings.set('active_payment_provider', providers[0] || null);
  return { activeProviders: providers, primaryProvider: providers[0] || null, updatedBy };
};

module.exports = {
  AUTH_METHODS,
  SHIPPING_PROVIDERS,
  PAYMENT_PROVIDERS,
  getControlPlane,
  activateAuthentication,
  activateShipping,
  activatePayment,
};
