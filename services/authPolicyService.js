const AuthPolicy = require('../models/AuthPolicy');
const Tenant = require('../models/Tenant');
const tenantIntegrationService = require('./tenantIntegrationService');

const DEFAULT_POLICY = Object.freeze({ primaryMode: 'msg91', activeMethods: ['msg91'], cartOtpProvider: 'disabled' });

const MODE_DEFINITIONS = Object.freeze({
  password: Object.freeze({ id: 'password', label: 'Email + password', description: 'Customers sign in with their email address and password.', provider: null }),
  msg91: Object.freeze({ id: 'msg91', label: 'Phone OTP via MSG91', description: 'Customers receive a verification code by SMS through MSG91.', provider: 'msg91' }),
  wati: Object.freeze({ id: 'wati', label: 'Phone OTP via WATI', description: 'Customers receive a verification code through the configured WATI WhatsApp template.', provider: 'wati' }),
  google: Object.freeze({ id: 'google', label: 'Google Sign-In', description: 'Customers authenticate with the configured Google Identity Services client.', provider: 'googleauth' }),
});

const OTP_PROVIDERS = new Set(['msg91', 'wati']);
const CART_VERIFICATION_PROVIDERS = new Set(['disabled', 'email', 'msg91', 'wati']);
const CART_PROVIDER_DEFINITIONS = Object.freeze({
  disabled: Object.freeze({ id: 'disabled', label: 'Disabled', description: 'Customers can manage their cart without an OTP step.', provider: null }),
  email: Object.freeze({ id: 'email', label: 'Email OTP', description: 'Customers receive a verification code at the email address on their account.', provider: 'smtp' }),
  msg91: Object.freeze({ id: 'msg91', label: 'Phone OTP via MSG91', description: 'Customers receive a verification code by SMS through MSG91.', provider: 'msg91' }),
  wati: Object.freeze({ id: 'wati', label: 'Phone OTP via WATI', description: 'Customers receive a verification code through the configured WATI WhatsApp template.', provider: 'wati' }),
});
const normalizeMode = value => String(value || '').trim().toLowerCase();
const normalizeOtpProvider = value => String(value || '').trim().toLowerCase();
const normalizeMethods = values => [...new Set((Array.isArray(values) ? values : [values])
  .map(normalizeMode)
  .filter(Boolean))];

const policyShape = (policy, source = 'default', tenantId = null) => ({
  primaryMode: MODE_DEFINITIONS[policy?.primaryMode] ? policy.primaryMode : DEFAULT_POLICY.primaryMode,
  activeMethods: (() => {
    const values = normalizeMethods(policy?.activeMethods);
    const primary = MODE_DEFINITIONS[policy?.primaryMode] ? policy.primaryMode : DEFAULT_POLICY.primaryMode;
    return (values.filter(mode => MODE_DEFINITIONS[mode]).length ? values.filter(mode => MODE_DEFINITIONS[mode]) : [primary]);
  })(),
  cartOtpProvider: CART_VERIFICATION_PROVIDERS.has(policy?.cartOtpProvider) ? policy.cartOtpProvider : DEFAULT_POLICY.cartOtpProvider,
  source,
  tenantId: tenantId || policy?.tenant || null,
  updatedAt: policy?.updatedAt || null,
});

const getDirectPolicy = async tenantId => {
  if (!tenantId) return null;
  return AuthPolicy.findOne({ tenant: tenantId }).lean();
};

const getEffectivePolicy = async tenantId => {
  const direct = await getDirectPolicy(tenantId);
  if (direct) return policyShape(direct, 'tenant', tenantId);

  const platform = await Tenant.findOne({ type: 'platform', status: { $ne: 'archived' } }).select('_id').lean();
  if (platform && (!tenantId || String(platform._id) !== String(tenantId))) {
    const fallback = await getDirectPolicy(platform._id);
    if (fallback) return policyShape(fallback, 'platform', platform._id);
  }

  return policyShape(DEFAULT_POLICY, 'default', tenantId);
};

const hasValue = value => value !== undefined && value !== null && String(value).trim() !== '';

const credentialsReady = (mode, config) => {
  if (mode === 'password') return true;
  if (!config?.enabled) return false;
  if (mode === 'google') return hasValue(config.client_id);
  if (mode === 'msg91') return hasValue(config.auth_key) && hasValue(config.template_id);
  if (mode === 'wati') return hasValue(config.api_endpoint) && hasValue(config.api_token);
  if (mode === 'smtp') return hasValue(config.host) && hasValue(config.user) && hasValue(config.pass) && hasValue(config.from);
  return false;
};

const trustsignalOtpReady = config => {
  if (!config?.enabled || !config.api_key || !config.sender_id) return false;
  return hasValue(config.otify_template_id || config.login_otp_template_id);
};

const trustsignalTested = config => Boolean(
  config?.connection?.status === 'connected'
  || ['environment', 'legacy-platform'].includes(config?.source),
);

const trustsignalConfig = async tenantId => {
  try {
    const service = require('./trustsignalService');
    const config = await service.getConfig(tenantId);
    return service.isConfigured(config) ? config : null;
  } catch (_) {
    return null;
  }
};

// The legacy Tatoz installation used TrustSignal/Otify for phone auth while
// the current policy contract calls this selectable SMS method "msg91". Keep
// that policy id backward-compatible and resolve its actual transport to
// TrustSignal when MSG91 is not configured.
const effectiveOtpConfig = async (tenantId, provider) => {
  const config = await tenantIntegrationService.configFor(tenantId, provider, { allowPlatformFallback: true });
  if (provider === 'msg91' && !credentialsReady('msg91', config)) {
    const trustsignal = await trustsignalConfig(tenantId);
    if (trustsignalOtpReady(trustsignal)) return { provider: 'trustsignal', config: trustsignal };
  }
  return { provider, config };
};

const availabilityForMode = async (tenantId, mode) => {
  const definition = MODE_DEFINITIONS[normalizeMode(mode)];
  if (!definition) {
    const error = new Error(`Unsupported authentication mode: ${mode}`);
    error.statusCode = 400;
    error.publicCode = 'AUTH_MODE_UNSUPPORTED';
    throw error;
  }
  if (!definition.provider) return { mode: definition.id, provider: null, configured: true, available: true, source: 'built-in' };

  const selected = await effectiveOtpConfig(tenantId, definition.provider);
  const config = selected.config;
  const configured = selected.provider === 'trustsignal' ? trustsignalOtpReady(config) : credentialsReady(definition.id, config);
  // Credentials alone are never activation proof. A provider connection must
  // have passed its server-side adapter test and be stored as connected. The
  // legacy global integration fallback is intentionally not activation-ready
  // until it is migrated into an encrypted tenant/platform connection.
  const tested = selected.provider === 'trustsignal' ? trustsignalTested(config) : Boolean(config?.connection && config.connection.status === 'connected');
  const testAvailable = !configured && process.env.NODE_ENV !== 'production' && process.env.ENABLE_TEST_OTP === 'true' && OTP_PROVIDERS.has(definition.id);
  return {
    mode: definition.id,
    provider: selected.provider,
    configured,
    tested,
    available: Boolean((configured && tested && config.enabled) || testAvailable),
    testMode: testAvailable,
    source: config.source || 'none',
  };
};

const availabilityForCartProvider = async (tenantId, provider) => {
  const definition = CART_PROVIDER_DEFINITIONS[normalizeOtpProvider(provider)];
  if (!definition) {
    const error = new Error(`Unsupported cart verification provider: ${provider}`);
    error.statusCode = 400;
    error.publicCode = 'CART_OTP_PROVIDER_UNSUPPORTED';
    throw error;
  }
  if (!definition.provider) return { mode: definition.id, provider: null, configured: false, tested: false, available: true, source: 'built-in' };

  const selected = await effectiveOtpConfig(tenantId, definition.provider);
  const config = selected.config;
  const configured = selected.provider === 'trustsignal' ? trustsignalOtpReady(config) : credentialsReady(definition.provider, config);
  const tested = selected.provider === 'trustsignal' ? trustsignalTested(config) : Boolean(config?.connection && config.connection.status === 'connected');
  const testAvailable = !configured && process.env.NODE_ENV !== 'production' && process.env.ENABLE_TEST_OTP === 'true' && definition.id !== 'email';
  return {
    mode: definition.id,
    provider: selected.provider,
    configured,
    tested,
    available: Boolean((configured && tested && config.enabled) || testAvailable),
    testMode: testAvailable,
    source: config.source || 'none',
  };
};

const publicMode = (definition, state) => ({
  id: definition.id,
  label: state?.provider === 'trustsignal' && definition.id === 'msg91' ? 'Phone OTP via TrustSignal' : definition.label,
  description: state?.provider === 'trustsignal' && definition.id === 'msg91' ? 'Customers receive a verification code through the preserved TrustSignal SMS account.' : definition.description,
  provider: state?.provider || definition.provider,
  requiresConnection: Boolean(state?.provider || definition.provider),
  configured: Boolean(state?.configured),
  tested: Boolean(state?.tested),
  available: Boolean(state?.available),
});

const getPublicConfig = async tenantId => {
  const policy = await getEffectivePolicy(tenantId);
  const modes = await Promise.all(Object.values(MODE_DEFINITIONS).map(async definition => publicMode(definition, await availabilityForMode(tenantId, definition.id))));
  const activeState = modes.find(mode => mode.id === policy.primaryMode) || modes[0];
  const activeModes = modes.filter(mode => policy.activeMethods.includes(mode.id));
  const cartState = await availabilityForCartProvider(tenantId, policy.cartOtpProvider);
  const googleState = modes.find(mode => mode.id === 'google');
  const activeDefinition = MODE_DEFINITIONS[policy.primaryMode];
  const activeProvider = activeState?.provider || activeDefinition.provider;
  const activeLabel = activeState?.label || activeDefinition.label;
  const primaryAvailable = Boolean(activeState?.available);
  const activeMethodsAvailable = activeModes.length > 0 && activeModes.every(mode => mode.available);
  const cartOtpAvailable = Boolean(cartState.available);

  return {
    primaryMode: policy.primaryMode,
    activeMode: policy.primaryMode,
    activeMethods: policy.activeMethods,
    activeModes: activeModes.map(mode => mode.id),
    activeProvider,
    activeLabel,
    available: activeMethodsAvailable && cartOtpAvailable,
    primaryAvailable,
    providerConfigured: Boolean(activeState?.configured),
    provider: activeProvider,
    mode: activeProvider ? 'provider' : 'built-in',
    cartOtpProvider: policy.cartOtpProvider,
    cartOtpAvailable,
    cartOtpConfigured: Boolean(cartState.configured),
    cartOtpTested: Boolean(cartState.tested),
    cartVerificationEnabled: policy.cartOtpProvider !== 'disabled',
    cartOtpProviders: await Promise.all(Object.values(CART_PROVIDER_DEFINITIONS).map(async definition => {
      const state = await availabilityForCartProvider(tenantId, definition.id);
      return {
        id: definition.id,
        label: definition.label,
        description: definition.description,
        provider: state.provider || definition.provider,
        requiresConnection: Boolean(state.provider || definition.provider),
        configured: Boolean(state.configured),
        tested: Boolean(state.tested),
        available: Boolean(state.available),
      };
    })),
    google: policy.activeMethods.includes('google') && googleState?.available
      ? { enabled: true, clientId: (await tenantIntegrationService.configFor(tenantId, 'googleauth', { allowPlatformFallback: true })).client_id || '' }
      : { enabled: false, clientId: '' },
    modes,
    source: policy.source,
    updatedAt: policy.updatedAt,
  };
};

const setPolicy = async (tenant, payload = {}, updatedBy) => {
  if (!tenant?._id) {
    const error = new Error('Tenant context is required');
    error.statusCode = 400;
    throw error;
  }

  const current = await getEffectivePolicy(tenant._id);
  const hasMethods = Object.prototype.hasOwnProperty.call(payload, 'activeMethods') || Object.prototype.hasOwnProperty.call(payload, 'methods');
  const requestedMethods = normalizeMethods(hasMethods ? (payload.activeMethods || payload.methods) : (payload.primaryMode || payload.mode || current.primaryMode));
  if (hasMethods && !requestedMethods.length) {
    const error = new Error('Select at least one authentication method');
    error.statusCode = 400;
    error.publicCode = 'AUTH_METHOD_REQUIRED';
    throw error;
  }
  const primaryMode = normalizeMode(payload.primaryMode || payload.mode || requestedMethods[0] || current.primaryMode);
  const activeMethods = [primaryMode, ...requestedMethods.filter(mode => mode !== primaryMode)];
  if (!activeMethods.length) {
    const error = new Error('Select at least one authentication method');
    error.statusCode = 400;
    error.publicCode = 'AUTH_METHOD_REQUIRED';
    throw error;
  }
  const hasCartProvider = Object.prototype.hasOwnProperty.call(payload, 'cartOtpProvider');
  const cartOtpProvider = normalizeOtpProvider(hasCartProvider
    ? payload.cartOtpProvider
    : Object.prototype.hasOwnProperty.call(payload, 'cartVerificationEnabled')
      ? (payload.cartVerificationEnabled ? current.cartOtpProvider : 'disabled')
      : current.cartOtpProvider);
  if (!MODE_DEFINITIONS[primaryMode]) {
    const error = new Error(`Unsupported authentication mode: ${primaryMode}`);
    error.statusCode = 400;
    error.publicCode = 'AUTH_MODE_UNSUPPORTED';
    throw error;
  }
  if (!CART_VERIFICATION_PROVIDERS.has(cartOtpProvider)) {
    const error = new Error(`Unsupported cart OTP provider: ${cartOtpProvider}`);
    error.statusCode = 400;
    error.publicCode = 'CART_OTP_PROVIDER_UNSUPPORTED';
    throw error;
  }

  const activeStates = await Promise.all(activeMethods.map(mode => availabilityForMode(tenant._id, mode)));
  const unavailable = activeStates.find(state => !state.available || (MODE_DEFINITIONS[state.mode].provider && !state.configured));
  const disablingCartVerification = cartOtpProvider === 'disabled' && primaryMode === current.primaryMode;
  if (unavailable) {
    if (disablingCartVerification && primaryMode === current.primaryMode) {
      // Turning off the optional cart gate must remain available even when a
      // separate storefront login provider is currently awaiting setup.
    } else {
    const error = new Error(`${MODE_DEFINITIONS[unavailable.mode].label} is not configured and tested yet`);
    error.statusCode = 400;
    error.publicCode = 'AUTH_PROVIDER_NOT_READY';
    throw error;
    }
  }
  if (cartOtpProvider !== 'disabled') {
    const cartState = await availabilityForCartProvider(tenant._id, cartOtpProvider);
    if (!cartState.available || (!cartState.configured && !cartState.testMode)) {
      const error = new Error(`${CART_PROVIDER_DEFINITIONS[cartOtpProvider].label} is not configured and tested for the cart verification step`);
      error.statusCode = 400;
      error.publicCode = 'CART_OTP_PROVIDER_NOT_READY';
      throw error;
    }
  }

  const saved = await AuthPolicy.findOneAndUpdate(
    { tenant: tenant._id },
    { $set: { primaryMode, activeMethods, cartOtpProvider, updatedBy }, $setOnInsert: { tenant: tenant._id } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  return getPublicConfig(saved.tenant);
};

const modeForPurpose = (policy, purpose = 'login', requestedMode) => {
  if (purpose === 'cart_step_up') return policy.cartOtpProvider === 'disabled' ? null : policy.cartOtpProvider;
  const requested = normalizeMode(requestedMode);
  if (OTP_PROVIDERS.has(requested) && (policy.activeMethods || [policy.primaryMode]).includes(requested)) return requested;
  return OTP_PROVIDERS.has(policy.primaryMode) && (policy.activeMethods || [policy.primaryMode]).includes(policy.primaryMode) ? policy.primaryMode : null;
};

const assertPrimaryMode = async (tenantId, expectedMode, requestedMode) => {
  const policy = await getEffectivePolicy(tenantId);
  const activeMethods = policy.activeMethods || [policy.primaryMode];
  const requested = normalizeMode(requestedMode);
  const allowed = expectedMode === 'otp'
    ? (OTP_PROVIDERS.has(requested) ? activeMethods.includes(requested) : OTP_PROVIDERS.has(policy.primaryMode) && activeMethods.includes(policy.primaryMode))
    : activeMethods.includes(expectedMode);
  if (allowed) return policy;
  const error = new Error(`This authentication method is disabled. Active method: ${MODE_DEFINITIONS[policy.primaryMode].label}`);
  error.statusCode = 409;
  error.publicCode = 'AUTH_MODE_DISABLED';
  error.activeMode = policy.primaryMode;
  throw error;
};

module.exports = {
  DEFAULT_POLICY,
  MODE_DEFINITIONS,
  OTP_PROVIDERS,
  CART_VERIFICATION_PROVIDERS,
  CART_PROVIDER_DEFINITIONS,
  getEffectivePolicy,
  getPublicConfig,
  setPolicy,
  availabilityForMode,
  availabilityForCartProvider,
  modeForPurpose,
  assertPrimaryMode,
  normalizeMode,
  normalizeMethods,
  effectiveOtpConfig,
};
