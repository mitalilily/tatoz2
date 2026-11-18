const crypto = require('crypto');
const mongoose = require('mongoose');
const IntegrationConnection = require('../models/IntegrationConnection');
const IntegrationHealthEvent = require('../models/IntegrationHealthEvent');
const IntegrationDelivery = require('../models/IntegrationDelivery');
const IntegrationAuditLog = require('../models/IntegrationAuditLog');
const Tenant = require('../models/Tenant');
const legacyIntegrationService = require('./integrationService');
const moduleService = require('./moduleService');
const { catalog, getProviderDefinition, getAdapter } = require('./integrations/providerRegistry');
require('./integrations/registerBuiltins');
require('./integrations/contractAdapters');

const hasValue = value => value !== undefined && value !== null && String(value).trim() !== '';
const keyForToken = () => crypto.createHash('sha256').update(`tatoz-tenant-test:${process.env.INTEGRATION_ENCRYPTION_KEY || process.env.JWT_SECRET || ''}`).digest();
const fingerprint = value => crypto.createHash('sha256').update(JSON.stringify(Object.keys(value || {}).sort().reduce((out, key) => { out[key] = value[key]; return out; }, {}))).digest('hex');

const defaultsFor = definition => Object.fromEntries((definition.fields || []).filter(field => field.defaultValue !== undefined).map(field => [field.key, field.defaultValue]));

const mergeCredentials = (definition, stored = {}, incoming = {}, clearFields = []) => {
  const credentials = { ...defaultsFor(definition), ...(stored || {}) };
  for (const field of definition.fields || []) {
    if (clearFields.includes(field.key)) delete credentials[field.key];
    if (!Object.prototype.hasOwnProperty.call(incoming || {}, field.key)) continue;
    if (field.secret && !hasValue(incoming[field.key]) && hasValue(stored?.[field.key])) continue;
    if (field.type === 'boolean') credentials[field.key] = Boolean(incoming[field.key]);
    else if (field.type === 'number') {
      const number = Number(incoming[field.key]);
      if (!Number.isFinite(number)) throw new Error(`${field.label} must be a valid number`);
      credentials[field.key] = number;
    } else if (hasValue(incoming[field.key])) credentials[field.key] = String(incoming[field.key]).trim();
  }
  return credentials;
};

const tokenFor = (provider, tenantId, credentials, message, context = {}) => {
  const body = Buffer.from(JSON.stringify({ provider, tenantId: String(tenantId), fingerprint: fingerprint({ credentials, context }), message, expiresAt: Date.now() + (5 * 60 * 1000) })).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', keyForToken()).update(body).digest('base64url')}`;
};

const verifyToken = (token, provider, tenantId, credentials, context = {}) => {
  try {
    const [body, signature] = String(token || '').split('.');
    if (!body || !signature) return null;
    const expected = crypto.createHmac('sha256', keyForToken()).update(body).digest('base64url');
    if (expected.length !== signature.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (parsed.provider !== provider || String(parsed.tenantId) !== String(tenantId) || parsed.expiresAt <= Date.now()) return null;
    return parsed.fingerprint === fingerprint({ credentials, context }) ? parsed : null;
  } catch (_) {
    return null;
  }
};

const connectionFor = async (tenantId, provider, accountKey = 'default') => {
  if (!tenantId) throw new Error('Tenant is required');
  return IntegrationConnection.findOne({ tenant: tenantId, provider, accountKey }).select('+credentialsEncrypted').lean();
};

const configFor = async (tenantId, provider, { allowPlatformFallback = true, accountKey = 'default' } = {}) => {
  const definition = getProviderDefinition(provider);
  if (!tenantId) return { source: 'none', enabled: false, ...defaultsFor(definition) };
  const connection = await connectionFor(tenantId, definition.id, accountKey);
  if (connection) {
    const moduleState = await moduleService.getState(tenantId, definition.id);
    const moduleEnabled = moduleState === undefined ? Boolean(connection.enabled) : Boolean(moduleState);
    return {
      source: 'tenant', connection,
      enabled: Boolean(connection.enabled && moduleEnabled),
      moduleEnabled,
      connectionEnabled: Boolean(connection.enabled),
      environment: connection.environment,
      settings: connection.settings || {},
      ...defaultsFor(definition),
      ...legacyIntegrationService.decrypt(connection.credentialsEncrypted),
    };
  }

  if (allowPlatformFallback) {
    const platform = await Tenant.findOne({ type: 'platform', status: { $ne: 'archived' } }).select('_id').lean();
    if (platform && String(platform._id) !== String(tenantId)) {
      const fallback = await connectionFor(platform._id, definition.id, accountKey);
      if (fallback) {
        const moduleState = await moduleService.getState(tenantId, definition.id);
        const moduleEnabled = moduleState === undefined ? Boolean(fallback.enabled) : Boolean(moduleState);
        return {
          source: 'platform', connection: fallback, fallbackTenant: platform._id,
          enabled: Boolean(fallback.enabled && moduleEnabled), moduleEnabled,
          connectionEnabled: Boolean(fallback.enabled), environment: fallback.environment,
          settings: fallback.settings || {}, ...defaultsFor(definition),
          ...legacyIntegrationService.decrypt(fallback.credentialsEncrypted),
        };
      }
    }
    // Legacy global Integration records are treated as platform fallback
    // during migration. They are never returned to the browser.
    try {
      const legacyProvider = definition.id === 'googleauth' ? 'googleAuth' : definition.id;
      const legacy = await legacyIntegrationService.getProviderConfig(legacyProvider);
      const moduleState = await moduleService.getState(tenantId, definition.id);
      const moduleEnabled = moduleState === undefined ? Boolean(legacy.enabled) : Boolean(moduleState);
      if (legacy.enabled) return {
        source: 'legacy-platform',
        enabled: Boolean(moduleEnabled),
        moduleEnabled,
        connectionEnabled: true,
        connection: { status: 'connected', enabled: true, lastTest: { status: 'connected', message: 'Legacy provider credentials preserved', testedAt: null } },
        ...legacy,
      };
    } catch (_) { /* unsupported legacy provider or unavailable database */ }
  }
  return { source: 'none', enabled: false, ...defaultsFor(definition) };
};

const platformConfig = async (provider, options = {}) => {
  const platform = await Tenant.findOne({ type: 'platform', status: { $ne: 'archived' } }).select('_id').lean();
  return platform ? configFor(platform._id, provider, { ...options, allowPlatformFallback: false }) : { source: 'none', enabled: false, ...defaultsFor(getProviderDefinition(provider)) };
};

const testWithAdapter = async (provider, config) => {
  const adapter = getAdapter(provider);
  if (adapter && typeof adapter.testConnection === 'function') return adapter.testConnection(config);
  // Re-use battle-tested legacy adapters during the migration window.
  if (['razorpay', 'shiprocket', 'trustsignal', 'smtp'].includes(provider)) return legacyIntegrationService.testProvider(provider, config);
  throw new Error(`${getProviderDefinition(provider).name} adapter is not activated yet`);
};

const recordHealth = async ({ tenant, provider, connection, event, message, latencyMs, statusCode }) => {
  if (!tenant || !mongoose.Types.ObjectId.isValid(tenant)) return;
  await IntegrationHealthEvent.create({ tenant, provider, connection, event, message: String(message || '').slice(0, 500), latencyMs, statusCode });
};

const testProvider = async (tenant, provider, payload = {}, updatedBy) => {
  const definition = getProviderDefinition(provider);
  const existing = await connectionFor(tenant._id, definition.id, payload.accountKey || 'default');
  const stored = existing ? legacyIntegrationService.decrypt(existing.credentialsEncrypted) : {};
  const credentials = mergeCredentials(definition, stored, payload.credentials, payload.clearFields || []);
  const config = { ...defaultsFor(definition), ...credentials, enabled: payload.enabled === undefined ? Boolean(existing?.enabled) : Boolean(payload.enabled), environment: payload.environment || existing?.environment || 'sandbox', settings: payload.settings || existing?.settings || {} };
  const started = Date.now();
  try {
    const result = await testWithAdapter(definition.id, config);
    const message = result.message || `${definition.name} connection verified`;
    await recordHealth({ tenant: tenant._id, provider: definition.id, connection: existing?._id, event: 'success', message, latencyMs: Date.now() - started });
    return { status: 'connected', message, latencyMs: Date.now() - started, verificationToken: tokenFor(definition.id, tenant._id, credentials, message, { environment: config.environment }), config, existing, updatedBy };
  } catch (error) {
    const message = String(error.message || 'Connection test failed').slice(0, 500);
    await recordHealth({ tenant: tenant._id, provider: definition.id, connection: existing?._id, event: error.status === 429 ? 'rate_limited' : 'failure', message, latencyMs: Date.now() - started, statusCode: error.status });
    const safe = new Error(message);
    safe.statusCode = 400;
    throw safe;
  }
};

const toPublic = (definition, connection, credentials = {}, moduleState) => {
  const connectionEnabled = Boolean(connection?.enabled);
  const moduleEnabled = moduleState === undefined ? connectionEnabled : Boolean(moduleState);
  const configured = Boolean(connection && Object.keys(credentials).some(key => hasValue(credentials[key])));
  const adapterAvailable = Boolean((getAdapter(definition.id) && getAdapter(definition.id).activation !== 'contract') || ['razorpay', 'shiprocket', 'trustsignal', 'smtp'].includes(definition.id));
  return {
    id: definition.id,
    name: definition.name,
    category: definition.category,
    lifecycle: definition.lifecycle,
    capabilities: definition.capabilities,
    enabled: moduleEnabled,
    moduleEnabled,
    connectionEnabled,
    operational: Boolean(moduleEnabled && connectionEnabled && configured && adapterAvailable),
    configured,
    source: connection?.source || 'tenant',
    environment: connection?.environment || 'sandbox',
    adapterAvailable,
    fields: (definition.fields || []).map(field => ({ key: field.key, label: field.label, type: field.type || 'text', required: Boolean(field.required), secret: Boolean(field.secret || field.type === 'password'), value: field.secret || field.type === 'password' ? '' : (credentials[field.key] ?? field.defaultValue ?? ''), configured: hasValue(credentials[field.key]) })),
    lastTest: connection?.lastTest || { status: 'untested', message: '', testedAt: null },
    updatedAt: connection?.updatedAt || null,
  };
};

const environmentCredentialsFor = definition => {
  if (definition.id !== 'trustsignal' || !process.env.TRUSTSIGNAL_API_KEY) return null;
  return {
    api_key: process.env.TRUSTSIGNAL_API_KEY,
    sender_id: process.env.TRUSTSIGNAL_SENDER_ID || 'TATOZS',
    base_url: process.env.TRUSTSIGNAL_BASE_URL || 'https://api.trustsignal.io',
    route: process.env.TRUSTSIGNAL_ROUTE || 'transactional',
    dlt_entity_id: process.env.TRUSTSIGNAL_DLT_ENTITY_ID || '',
    otify_base_url: process.env.TRUSTSIGNAL_OTIFY_BASE_URL || '',
    otify_template_id: process.env.TRUSTSIGNAL_OTIFY_TEMPLATE_ID || '',
    login_otp_template_id: process.env.TRUSTSIGNAL_LOGIN_OTP_TEMPLATE_ID || 'sMhMVouEN',
    account_create_otp_template_id: process.env.TRUSTSIGNAL_ACCOUNT_CREATE_OTP_TEMPLATE_ID || process.env.TRUSTSIGNAL_LOGIN_CREATION_OTP_TEMPLATE_ID || 'vWQ1iIioJ',
    forgot_password_otp_template_id: process.env.TRUSTSIGNAL_FORGOT_PASSWORD_OTP_TEMPLATE_ID || 'NDPt1AN7R',
    welcome_template_id: process.env.TRUSTSIGNAL_WELCOME_TEMPLATE_ID || process.env.TRUSTSIGNAL_ACCOUNT_CREATE_TEMPLATE_ID || 'JtXQfEkwj',
    order_confirmation_template_id: process.env.TRUSTSIGNAL_ORDER_CONFIRMATION_TEMPLATE_ID || 'Ruqzp6OOA',
    shipping_confirmation_template_id: process.env.TRUSTSIGNAL_SHIPPING_CONFIRMATION_TEMPLATE_ID || 'Ljy3c8PDK',
    delivery_confirmation_template_id: process.env.TRUSTSIGNAL_DELIVERY_CONFIRMATION_TEMPLATE_ID || 'HXiEncJX3',
    seller_order_template_id: process.env.TRUSTSIGNAL_SELLER_ORDER_TEMPLATE_ID || 'V5QxrnNmi',
    webhook_url: process.env.TRUSTSIGNAL_WEBHOOK_URL || '',
  };
};

const listPublic = async tenant => {
  const connections = await IntegrationConnection.find({ tenant: tenant._id }).select('+credentialsEncrypted').lean();
  const byProvider = new Map(connections.map(connection => [connection.provider, connection]));
  const moduleStates = await moduleService.getStates(tenant._id);
  return Promise.all(Object.values(catalog).map(async definition => {
    let connection = byProvider.get(definition.id);
    let credentials = connection ? legacyIntegrationService.decrypt(connection.credentialsEncrypted) : {};
    // Tatoz was originally provisioned with encrypted global Integration
    // records and environment-backed TrustSignal credentials. Expose those
    // records through the same redacted module contract while leaving the
    // source record, encryption and ownership untouched.
    if (!connection && definition.id === 'trustsignal') {
      const environmentCredentials = environmentCredentialsFor(definition);
      if (environmentCredentials) {
        credentials = environmentCredentials;
        connection = { source: 'environment', enabled: true, environment: 'production', lastTest: { status: 'connected', message: 'Environment TrustSignal credentials preserved', testedAt: null } };
      }
    }
    const moduleState = moduleStates.has(definition.id) ? moduleStates.get(definition.id) : undefined;
    return toPublic(definition, connection, credentials, moduleState);
  }));
};

const saveProvider = async (tenant, provider, payload = {}, updatedBy) => {
  const definition = getProviderDefinition(provider);
  const accountKey = payload.accountKey || 'default';
  const existing = await connectionFor(tenant._id, definition.id, accountKey);
  const stored = existing
    ? legacyIntegrationService.decrypt(existing.credentialsEncrypted)
    : (definition.id === 'trustsignal' ? (environmentCredentialsFor(definition) || {}) : {});
  const credentials = mergeCredentials(definition, stored, payload.credentials, payload.clearFields || []);
  if (!verifyToken(payload.testToken, definition.id, tenant._id, credentials, { environment: payload.environment || existing?.environment || 'sandbox' })) {
    const error = new Error(`Test ${definition.name} credentials successfully before saving`);
    error.statusCode = 400;
    throw error;
  }
  if (payload.enabled !== false) {
    const missing = (definition.fields || []).filter(field => field.required && !hasValue(credentials[field.key])).map(field => field.label);
    if (missing.length) throw new Error(`Add required ${missing.join(', ')} before enabling ${definition.name}`);
  }
  const saved = await IntegrationConnection.findOneAndUpdate(
    { tenant: tenant._id, provider: definition.id, accountKey },
    { $set: { category: definition.category, enabled: payload.enabled !== false, environment: payload.environment || existing?.environment || 'sandbox', credentialsEncrypted: legacyIntegrationService.encrypt(credentials), credentialVersion: process.env.INTEGRATION_ENCRYPTION_KEY ? 2 : 1, credentialHints: Object.fromEntries((definition.fields || []).filter(field => field.secret || field.type === 'password').map(field => [field.key, hasValue(credentials[field.key]) ? 'configured' : ''])) , settings: payload.settings || existing?.settings || {}, status: 'connected', lastTest: { status: 'connected', message: 'Credentials verified before saving', testedAt: new Date() }, updatedBy }, $setOnInsert: { tenant: tenant._id, provider: definition.id, accountKey, createdBy: updatedBy } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await IntegrationAuditLog.create({ tenant: tenant._id, provider: definition.id, action: existing ? 'updated' : 'created', actor: updatedBy, changedFields: Object.keys(payload.credentials || {}).filter(key => !definition.fields.find(field => field.key === key)?.secret), credentialVersion: 2 }).catch(() => {});
  await moduleService.setEnabled(tenant, definition.id, payload.enabled !== false, updatedBy);
  return toPublic(definition, saved, credentials);
};

const clearProvider = async (tenant, provider, accountKey = 'default', updatedBy) => {
  getProviderDefinition(provider);
  await IntegrationConnection.deleteOne({ tenant: tenant._id, provider: String(provider).toLowerCase(), accountKey });
  await moduleService.clearState(tenant, provider);
  await IntegrationAuditLog.create({ tenant: tenant._id, provider: String(provider).toLowerCase(), action: 'cleared', actor: updatedBy }).catch(() => {});
  return { provider: String(provider).toLowerCase(), cleared: true };
};

const rotateProviderKey = async (tenant, provider, updatedBy, accountKey = 'default') => {
  const definition = getProviderDefinition(provider);
  const connection = await connectionFor(tenant._id, definition.id, accountKey);
  if (!connection) throw new Error(`${definition.name} is not configured for this tenant`);
  const credentials = legacyIntegrationService.decrypt(connection.credentialsEncrypted);
  await IntegrationConnection.updateOne({ _id: connection._id }, { $set: { credentialsEncrypted: legacyIntegrationService.encrypt(credentials), credentialVersion: process.env.INTEGRATION_ENCRYPTION_KEY ? 2 : 1, updatedBy } });
  await IntegrationAuditLog.create({ tenant: tenant._id, provider: definition.id, action: 'rotated', actor: updatedBy, credentialVersion: process.env.INTEGRATION_ENCRYPTION_KEY ? 2 : 1 }).catch(() => {});
  return { provider: definition.id, rotated: true, credentialVersion: process.env.INTEGRATION_ENCRYPTION_KEY ? 2 : 1 };
};

const health = async (tenant, provider) => {
  getProviderDefinition(provider);
  return IntegrationHealthEvent.find({ tenant: tenant._id, provider: String(provider).toLowerCase() }).sort({ occurredAt: -1 }).limit(50).lean();
};

const deliveries = async (tenant, provider) => {
  if (provider) getProviderDefinition(provider);
  const query = { tenant: tenant._id, ...(provider ? { provider: String(provider).toLowerCase() } : {}) };
  return IntegrationDelivery.find(query).sort({ createdAt: -1 }).limit(100).lean();
};

module.exports = { catalog, configFor, platformConfig, listPublic, testProvider, saveProvider, clearProvider, rotateProviderKey, health, deliveries, mergeCredentials, tokenFor };
