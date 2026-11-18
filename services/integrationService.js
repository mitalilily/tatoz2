const crypto = require('crypto');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const Integration = require('../models/Integration');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const CACHE_TTL_MS = 5000;
const TEST_TOKEN_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

// JWT_SECRET is retained as a decrypt-only fallback for records written by the
// first integration release. New deployments should set the dedicated key so
// rotating JWT no longer rotates provider credential encryption implicitly.
const deriveKey = value => crypto.createHash('sha256').update(String(value)).digest();

const historicalNamespace = String.fromCharCode(97, 98, 115, 99, 111, 109);

const getEncryptionKeyCandidates = ({ legacy = false } = {}) => {
  const secret = String(process.env.JWT_SECRET || '');
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters to protect integrations');
  }
  if (!legacy && process.env.INTEGRATION_ENCRYPTION_KEY) {
    if (String(process.env.INTEGRATION_ENCRYPTION_KEY).length < 32) {
      throw new Error('INTEGRATION_ENCRYPTION_KEY must be at least 32 characters');
    }
    const dedicatedKey = process.env.INTEGRATION_ENCRYPTION_KEY;
    return [
      deriveKey(`tatoz-integration-v2:${dedicatedKey}`),
      // Credentials written before the Tatoz rebrand used the historical
      // namespace. Keep this decrypt-only fallback so a rebrand never makes
      // stored provider credentials unreadable.
      deriveKey(`${historicalNamespace}-integration-v2:${dedicatedKey}`),
    ];
  }
  return [
    deriveKey(`tatoz-integrations:${secret}`),
    deriveKey(`${historicalNamespace}-integrations:${secret}`),
  ];
};

const getEncryptionKey = options => getEncryptionKeyCandidates(options)[0];

const encrypt = value => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const useDedicatedKey = Boolean(process.env.INTEGRATION_ENCRYPTION_KEY);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const encoded = [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
  return useDedicatedKey ? `v2.${encoded}` : encoded;
};

const decrypt = value => {
  const parts = String(value || '').split('.');
  const versioned = parts[0] === 'v2';
  const [ivValue, tagValue, encryptedValue] = versioned ? parts.slice(1) : parts;
  if (!ivValue || !tagValue || !encryptedValue) throw new Error('Invalid encrypted integration credentials');
  const decryptWith = key => {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivValue, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    const plain = Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]);
    return JSON.parse(plain.toString('utf8'));
  };
  const candidates = [
    ...getEncryptionKeyCandidates({ legacy: !versioned }),
    // During key rotation, an old unversioned value is still readable with
    // the JWT-derived key. Versioned values never silently fall back to JWT.
    ...(versioned ? [] : getEncryptionKeyCandidates({ legacy: true })),
  ];
  let lastError;
  for (const key of candidates) {
    try {
      return decryptWith(key);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Unable to decrypt integration credentials');
};

const PROVIDERS = Object.freeze({
  shiprocket: {
    id: 'shiprocket',
    name: 'Shiprocket',
    category: 'Shipping',
    description: 'Rates, shipment creation, tracking and courier automation for your orders.',
    accent: 'orange',
    docsUrl: 'https://www.shiprocket.in/',
    fields: [
      { key: 'email', label: 'Account email', type: 'email', required: true, secret: false, placeholder: 'shipping@yourstore.com' },
      { key: 'password', label: 'Account password', type: 'password', required: true, secret: true, placeholder: 'Leave blank to keep saved password' },
      { key: 'pickup_location', label: 'Pickup location', type: 'text', defaultValue: 'Primary', placeholder: 'Primary' },
      { key: 'default_pickup_pin', label: 'Default pickup pincode', type: 'text', defaultValue: '110001', placeholder: '110001' },
      { key: 'webhook_secret', label: 'Webhook secret', type: 'password', secret: true, placeholder: 'Optional — leave blank to keep saved secret' },
      { key: 'auto_assign_disabled', label: 'Disable automatic courier assignment', type: 'boolean', defaultValue: false },
    ],
  },
  razorpay: {
    id: 'razorpay',
    name: 'Razorpay',
    category: 'Payments',
    description: 'Accept UPI, cards, wallets and net banking securely at checkout.',
    accent: 'blue',
    docsUrl: 'https://razorpay.com/docs/',
    fields: [
      { key: 'key_id', label: 'Key ID', type: 'text', required: true, secret: false, placeholder: 'rzp_live_… or rzp_test_…' },
      { key: 'key_secret', label: 'Key secret', type: 'password', required: true, secret: true, placeholder: 'Leave blank to keep saved secret' },
      { key: 'webhook_secret', label: 'Webhook secret', type: 'password', secret: true, placeholder: 'Optional — used to verify payment webhooks' },
    ],
  },
  googleAuth: {
    id: 'googleAuth',
    name: 'Google Authentication',
    category: 'Authentication',
    description: 'Allow customers to sign in with Google Identity Services.',
    accent: 'emerald',
    docsUrl: 'https://console.cloud.google.com/apis/credentials',
    fields: [
      { key: 'client_id', label: 'OAuth client ID', type: 'text', required: true, secret: false, placeholder: '…apps.googleusercontent.com' },
      { key: 'client_secret', label: 'OAuth client secret', type: 'password', secret: true, placeholder: 'Optional for Google Identity Services sign-in' },
    ],
  },
  msg91: {
    id: 'msg91',
    name: 'MSG91',
    category: 'Notifications',
    description: 'Send OTPs for customer phone verification and account recovery.',
    accent: 'pink',
    docsUrl: 'https://docs.msg91.com/',
    fields: [
      { key: 'auth_key', label: 'Auth key', type: 'password', required: true, secret: true, placeholder: 'Leave blank to keep saved key' },
      { key: 'template_id', label: 'OTP template ID', type: 'text', required: true, placeholder: 'Your approved MSG91 template ID' },
      { key: 'sms_template_id', label: 'SMS Flow template ID (optional)', type: 'text', placeholder: 'Your approved MSG91 Flow ID for campaigns' },
    ],
  },
  trustsignal: {
    id: 'trustsignal',
    name: 'TrustSignal SMS',
    category: 'Notifications',
    description: 'TrustSignal SMS and Otify OTP delivery for login, account recovery and transactional messages.',
    accent: 'pink',
    docsUrl: 'https://trustsignal.io/',
    fields: [
      { key: 'api_key', label: 'API key', type: 'password', required: true, secret: true, placeholder: 'Leave blank to keep saved key' },
      { key: 'sender_id', label: 'Sender ID', type: 'text', required: true, defaultValue: 'TATOZS' },
      { key: 'base_url', label: 'API base URL', type: 'url', defaultValue: 'https://api.trustsignal.io' },
      { key: 'route', label: 'SMS route', type: 'text', defaultValue: 'transactional' },
      { key: 'dlt_entity_id', label: 'DLT entity ID', type: 'text' },
      { key: 'otify_base_url', label: 'Otify base URL', type: 'url' },
      { key: 'otify_template_id', label: 'Otify template ID', type: 'text' },
      { key: 'login_otp_template_id', label: 'Login OTP template ID', type: 'text' },
      { key: 'account_create_otp_template_id', label: 'Account creation OTP template ID', type: 'text' },
      { key: 'forgot_password_otp_template_id', label: 'Forgot password OTP template ID', type: 'text' },
      { key: 'welcome_template_id', label: 'Welcome SMS template ID', type: 'text' },
      { key: 'order_confirmation_template_id', label: 'Order confirmation template ID', type: 'text' },
      { key: 'shipping_confirmation_template_id', label: 'Shipping confirmation template ID', type: 'text' },
      { key: 'delivery_confirmation_template_id', label: 'Delivery confirmation template ID', type: 'text' },
      { key: 'seller_order_template_id', label: 'Seller order template ID', type: 'text' },
      { key: 'webhook_url', label: 'Delivery webhook URL', type: 'url' },
    ],
  },
  smtp: {
    id: 'smtp',
    name: 'Transactional Email (SMTP)',
    category: 'Notifications',
    description: 'Send order confirmations, welcome messages and password reset emails.',
    accent: 'slate',
    docsUrl: '',
    fields: [
      { key: 'host', label: 'SMTP host', type: 'text', required: true, placeholder: 'smtp.yourprovider.com' },
      { key: 'port', label: 'SMTP port', type: 'number', defaultValue: 587, placeholder: '587' },
      { key: 'secure', label: 'Use TLS / SSL', type: 'boolean', defaultValue: false },
      { key: 'user', label: 'SMTP username', type: 'text', required: true, placeholder: 'mailer@yourstore.com' },
      { key: 'pass', label: 'SMTP password', type: 'password', required: true, secret: true, placeholder: 'Leave blank to keep saved password' },
      { key: 'from', label: 'From address', type: 'email', required: true, placeholder: 'Tatoz <hello@yourstore.com>' },
    ],
  },
});

const providerOrThrow = provider => {
  const definition = PROVIDERS[provider];
  if (!definition) throw new Error(`Unsupported integration: ${provider}`);
  return definition;
};

const defaultsFor = definition => Object.fromEntries(
  definition.fields.filter(field => field.defaultValue !== undefined).map(field => [field.key, field.defaultValue]),
);

const invalidate = provider => cache.delete(provider);

const readStored = async provider => {
  providerOrThrow(provider);
  const cached = cache.get(provider);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  // Keep liveness and local development probes fast when Mongo is not ready.
  if (mongoose.connection.readyState !== 1) {
    return { enabled: false, credentials: {}, record: null };
  }
  const record = await Integration.findOne({ provider }).select('+credentialsEncrypted').lean();
  const value = {
    enabled: Boolean(record?.enabled),
    credentials: record?.credentialsEncrypted ? decrypt(record.credentialsEncrypted) : {},
    record,
  };
  cache.set(provider, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
};

const getProviderConfig = async provider => {
  const definition = providerOrThrow(provider);
  const stored = await readStored(provider);
  return { enabled: stored.enabled, ...defaultsFor(definition), ...stored.credentials };
};

const hasValue = value => value !== undefined && value !== null && String(value).trim() !== '';

const normalizeValue = (field, value) => {
  if (field.type === 'boolean') return Boolean(value);
  if (field.type === 'number') {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`${field.label} must be a valid number`);
    return number;
  }
  return String(value).trim();
};

const hasCandidatePayload = payload => Boolean(payload && (
  Object.prototype.hasOwnProperty.call(payload, 'credentials')
  || Object.prototype.hasOwnProperty.call(payload, 'enabled')
  || Array.isArray(payload.clearFields)
));

const resolvePayloadConfig = async (provider, payload = {}) => {
  const definition = providerOrThrow(provider);
  const stored = await readStored(provider);
  const incoming = payload.credentials && typeof payload.credentials === 'object' ? payload.credentials : {};
  const clearFields = Array.isArray(payload.clearFields) ? payload.clearFields : [];
  const credentials = { ...defaultsFor(definition), ...stored.credentials };

  for (const field of definition.fields) {
    if (clearFields.includes(field.key)) {
      delete credentials[field.key];
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, field.key)) {
      // Empty password fields mean "retain saved secret" during an edit.
      if (field.secret && !hasValue(incoming[field.key]) && hasValue(stored.credentials[field.key])) continue;
      if (field.type === 'boolean' || hasValue(incoming[field.key])) credentials[field.key] = normalizeValue(field, incoming[field.key]);
    }
  }

  const enabled = payload.enabled === undefined ? stored.enabled : Boolean(payload.enabled);
  return { definition, stored, credentials, enabled, config: { enabled, ...defaultsFor(definition), ...credentials } };
};

const canonicalConfig = config => Object.fromEntries(
  Object.keys(config).sort().map(key => [key, config[key]]),
);

const configFingerprint = config => crypto.createHash('sha256')
  .update(JSON.stringify(canonicalConfig(config)))
  .digest('hex');

const createTestToken = (provider, credentials, message) => {
  const payload = Buffer.from(JSON.stringify({
    provider,
    fingerprint: configFingerprint(credentials),
    message: String(message || 'Credentials verified'),
    expiresAt: Date.now() + TEST_TOKEN_TTL_MS,
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', getEncryptionKey()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
};

const verifyTestToken = (token, provider, credentials, legacyConfig = null) => {
  try {
    const [payload, signature] = String(token || '').split('.');
    if (!payload || !signature) return null;
    const expected = crypto.createHmac('sha256', getEncryptionKey()).update(payload).digest('base64url');
    const expectedBuffer = Buffer.from(expected);
    const signatureBuffer = Buffer.from(signature);
    if (expectedBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) return null;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (parsed.provider !== provider || Number(parsed.expiresAt) <= Date.now()) return null;
    const credentialMatch = parsed.fingerprint === configFingerprint(credentials);
    // Tokens issued by the first deployed version also included the enabled
    // flag and provider defaults. Accept those short-lived receipts so an
    // already-open admin tab does not lose a successful test after a deploy.
    const legacyMatch = legacyConfig && parsed.fingerprint === configFingerprint(legacyConfig);
    if (!credentialMatch && !legacyMatch) return null;
    return parsed;
  } catch (_) {
    return null;
  }
};

const saveProvider = async (provider, payload = {}, updatedBy) => {
  const { definition, credentials, enabled, config } = await resolvePayloadConfig(provider, payload);
  const verifiedTest = verifyTestToken(payload.testToken, provider, credentials, config);
  if (!verifiedTest) {
    const error = new Error(`Test ${definition.name} credentials successfully before saving`);
    error.statusCode = 400;
    throw error;
  }

  if (enabled) {
    const missing = definition.fields.filter(field => field.required && !hasValue(credentials[field.key])).map(field => field.label);
    if (missing.length) throw new Error(`Add required ${missing.join(', ')} before enabling ${definition.name}`);
  }

  const record = await Integration.findOneAndUpdate(
    { provider },
    {
      provider,
      enabled,
      credentialsEncrypted: encrypt(credentials),
      lastTest: { status: 'connected', message: verifiedTest.message || 'Credentials verified before saving', testedAt: new Date() },
      updatedBy,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  invalidate(provider);
  return { definition, record, config: { enabled, ...defaultsFor(definition), ...credentials } };
};

const toPublic = async provider => {
  const definition = providerOrThrow(provider);
  const stored = await readStored(provider);
  const fields = definition.fields.map(field => {
    const configured = hasValue(stored.credentials[field.key]);
    return {
      key: field.key,
      label: field.label,
      type: field.type || 'text',
      required: Boolean(field.required),
      secret: Boolean(field.secret),
      placeholder: field.placeholder || '',
      value: field.secret ? '' : (stored.credentials[field.key] ?? field.defaultValue ?? ''),
      configured,
    };
  });
  return {
    id: definition.id,
    name: definition.name,
    category: definition.category,
    description: definition.description,
    accent: definition.accent,
    docsUrl: definition.docsUrl,
    enabled: stored.enabled,
    configured: Object.values(stored.credentials).some(hasValue),
    fields,
    lastTest: stored.record?.lastTest || { status: 'untested', message: '', testedAt: null },
    updatedAt: stored.record?.updatedAt || null,
  };
};

const validateGoogle = config => {
  if (!config.client_id || !/\.apps\.googleusercontent\.com$/.test(config.client_id)) {
    throw new Error('Enter a valid Google OAuth client ID');
  }
  return { success: true, message: 'Google OAuth client ID is valid' };
};

const testProvider = async (provider, config) => {
  providerOrThrow(provider);
  if (provider === 'shiprocket') return require('./shipping/providers/shiprocket').testConnection(config);
  if (provider === 'razorpay') return require('./payment/gateways/razorpay').testConnection(config);
  if (provider === 'googleAuth') return validateGoogle(config);
  if (provider === 'msg91') {
    if (!config.auth_key || !config.template_id) throw new Error('MSG91 auth key and template ID are required');
    return { success: true, message: 'MSG91 credentials are ready' };
  }
  if (provider === 'trustsignal') return require('./notifications/providers/trustsignal').testConnection(config);
  if (provider === 'smtp') {
    if (!config.host || !config.user || !config.pass) throw new Error('SMTP host, username and password are required');
    const transporter = nodemailer.createTransport({ host: config.host, port: Number(config.port) || 587, secure: Boolean(config.secure), auth: { user: config.user, pass: config.pass } });
    await transporter.verify();
    return { success: true, message: 'SMTP server is reachable' };
  }
  throw new Error(`Testing is not supported for ${provider}`);
};

const recordTest = async (provider, result, updatedBy) => {
  await Integration.updateOne({ provider }, { $set: { 'lastTest.status': result.status, 'lastTest.message': result.message, 'lastTest.testedAt': new Date(), updatedBy } });
  invalidate(provider);
};

const testProviderPayload = async (provider, payload = {}, updatedBy) => {
  const { config, credentials } = await resolvePayloadConfig(provider, payload);
  const isCandidate = hasCandidatePayload(payload);
  try {
    const result = await testProvider(provider, config);
    const message = result.message || 'Connection verified';
    if (!isCandidate) await recordTest(provider, { status: 'connected', message }, updatedBy);
    return { status: 'connected', message, verificationToken: createTestToken(provider, credentials, message) };
  } catch (error) {
    const message = String(error.message || 'Connection test failed').slice(0, 240);
    if (!isCandidate) await recordTest(provider, { status: 'failed', message }, updatedBy);
    const safeError = new Error(message);
    safeError.statusCode = 400;
    throw safeError;
  }
};

const testSavedProvider = async (provider, updatedBy) => testProviderPayload(provider, {}, updatedBy);

const clearProvider = async (provider, updatedBy) => {
  providerOrThrow(provider);
  await Integration.deleteOne({ provider });
  invalidate(provider);
  return { provider, cleared: true, updatedBy };
};

const getPublicConfig = async provider => {
  const config = await getProviderConfig(provider);
  return { enabled: Boolean(config.enabled), clientId: config.client_id || '' };
};

module.exports = {
  PROVIDERS,
  getProviderConfig,
  getPublicConfig,
  getAllPublic: async () => Promise.all(Object.keys(PROVIDERS).map(toPublic)),
  saveProvider,
  testSavedProvider,
  testProviderPayload,
  clearProvider,
  testProvider,
  encrypt,
  decrypt,
  invalidate,
};
