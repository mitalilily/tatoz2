const crypto = require('crypto');
const httpRequest = require('../../../utils/httpRequest');
const { PLATFORM_NAME, PLATFORM_SHORT_NAME } = require('../../../constants/branding');

const DEFAULT_BASE_URL = 'https://api.trustsignal.io';
const ROUTES = new Set(['otp', 'transactional', 'promotional', 'global']);

const baseUrl = config => String(config?.base_url || DEFAULT_BASE_URL).replace(/\/+$/, '');

const requireConfig = config => {
  if (!config?.api_key) throw new Error('TrustSignal API key is required');
  if (!config?.sender_id) throw new Error('TrustSignal sender ID is required');
};

const urlFor = (config, path, query = {}) => {
  requireConfig(config);
  const url = new URL(`${baseUrl(config)}${path}`);
  url.searchParams.set('api_key', String(config.api_key));
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  return url.toString();
};

const normalizePhone = value => {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (raw.startsWith('+') && digits.length >= 10) return `+${digits}`;
  throw new Error('TrustSignal recipient must be a valid phone number');
};

const normalizeRecipients = ({ to, phone }) => {
  const recipients = Array.isArray(to) ? to : [to || phone];
  const normalized = recipients.filter(Boolean).map(normalizePhone);
  if (!normalized.length) throw new Error('TrustSignal recipient phone is required');
  return normalized;
};

// The current TrustSignal SMS endpoint expects Indian recipients as local
// 10-digit numbers. Keep E.164 formatting for Otify, which has a separate
// contract.
const normalizeSmsRecipient = value => {
  const digits = normalizePhone(value).replace(/\D/g, '');
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  return /^\d{10}$/.test(local) ? Number(local) : local;
};

const normalizeSmsRecipients = ({ to, phone }) => {
  const recipients = Array.isArray(to) ? to : [to || phone];
  const normalized = recipients.filter(Boolean).map(normalizeSmsRecipient);
  if (!normalized.length) throw new Error('TrustSignal recipient phone is required');
  return normalized;
};

const assertProviderSuccess = data => {
  const status = String(data?.status || '').toLowerCase();
  const type = String(data?.type || '').toLowerCase();
  const errorValue = data?.error;
  const hasError = errorValue && (typeof errorValue !== 'object' || Object.keys(errorValue).length > 0);
  if (data && (
    data.success === false
    || data.status === false
    || ['error', 'failed', 'failure', 'rejected'].includes(status)
    || ['error', 'failed', 'failure', 'rejected'].includes(type)
    || hasError
  )) {
    throw new Error(data.message || data.error || 'TrustSignal rejected the request');
  }
  return data;
};

const resultFrom = data => {
  const first = Array.isArray(data?.results) ? data.results[0] : null;
  return {
    externalId: first?.transaction_id || data?.transaction_id || data?.transactionId || data?.message_id || data?.request_id || data?.id || '',
    status: 'sent',
    raw: data,
  };
};

const otpTemplateFor = (config, purpose = 'login') => {
  if (purpose === 'account-create') return config.account_create_otp_template_id || config.login_otp_template_id;
  if (purpose === 'forgot-password') return config.forgot_password_otp_template_id || config.login_otp_template_id;
  return config.login_otp_template_id;
};

const otpMessageFor = ({ purpose = 'login', name = 'Customer', code }) => {
  const safeName = String(name || 'Customer').trim().slice(0, 80) || 'Customer';
  const safeCode = String(code || '');
  const templateBrand = String(PLATFORM_SHORT_NAME || PLATFORM_NAME || 'TATOZ').toUpperCase();
  if (purpose === 'account-create') return `Hi ${safeName}, Your One Time Password for account creation is ${safeCode}. Team ${templateBrand}`;
  if (purpose === 'forgot-password') return `Hi ${safeName}, Your One Time Password for account password reset is ${safeCode}. Team ${templateBrand}`;
  return `Hi ${safeName}, Your One Time Password for login to your account is ${safeCode}. Team ${templateBrand}`;
};

const sendSms = async ({ to, phone, senderId, route, message, templateId, options = {} }, config) => {
  requireConfig(config);
  if (!message) throw new Error('TrustSignal SMS message is required');
  const selectedRoute = String(route || config.route || 'transactional').toLowerCase();
  if (!ROUTES.has(selectedRoute)) throw new Error(`Unsupported TrustSignal SMS route: ${selectedRoute}`);
  if (selectedRoute !== 'global' && !templateId) throw new Error('TrustSignal approved template ID is required for this route');

  const body = {
    sender_id: senderId || config.sender_id,
    to: normalizeSmsRecipients({ to, phone }),
    route: selectedRoute,
    message: String(message),
  };
  if (templateId && selectedRoute !== 'global') body.template_id = String(templateId);
  ['isdesturl', 'pr1', 'pr2', 'pr3', 'pr4', 'pr5'].forEach(key => {
    if (options[key] !== undefined && options[key] !== null && options[key] !== '') body[key] = String(options[key]);
  });

  const { data } = await httpRequest({
    // TrustSignal's documented SMS contract uses /v1/sms with the approved
    // DLT template and transactional route.
    url: urlFor(config, '/v1/sms'),
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  return resultFrom(assertProviderSuccess(data));
};

const sendOtp = async ({ phone, purpose = 'login', name = 'Customer' }, config) => {
  requireConfig(config);
  const recipient = normalizePhone(phone);
  const templateId = config.otify_template_id || otpTemplateFor(config, purpose);

  if (config.otify_base_url) {
    if (!templateId) throw new Error('TrustSignal Otify template ID is required');
    const otifyBase = String(config.otify_base_url).replace(/\/+$/, '');
    const url = new URL(`${otifyBase}/v1/createuserotp`);
    url.searchParams.set('api_key', String(config.api_key));
    const { data } = await httpRequest({
      url: url.toString(),
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { to: recipient, sender_id: config.sender_id, template_id: String(templateId) },
    });
    return { ...resultFrom(assertProviderSuccess(data)), provider: 'trustsignal', mode: 'otify' };
  }

  // The public collection leaves OTIFY_BASE_URL account-specific. Until it is
  // configured, keep auth functional with a local, hashed challenge and the
  // approved TrustSignal SMS template rather than guessing a provider host.
  const code = String(crypto.randomInt(100000, 1000000));
  const result = await sendSms({
    phone: recipient,
    purpose,
    message: otpMessageFor({ purpose, name, code }),
    templateId,
    route: 'transactional',
  }, config);
  return { ...result, provider: 'trustsignal', mode: 'local', code };
};

const verifyOtp = async ({ phone, otp }, config) => {
  requireConfig(config);
  if (!config.otify_base_url) throw new Error('TrustSignal Otify base URL is not configured');
  const url = new URL(`${String(config.otify_base_url).replace(/\/+$/, '')}/v1/verifyuserotp`);
  url.searchParams.set('api_key', String(config.api_key));
  const { data } = await httpRequest({
    url: url.toString(),
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { to: normalizePhone(phone), otp: String(otp || '') },
  });
  const verified = assertProviderSuccess(data);
  if (verified?.success === false) throw new Error(verified.message || 'TrustSignal OTP verification failed');
  return { type: 'success', message: verified?.message || 'OTP verified', raw: verified };
};

const getCredits = async config => {
  const { data } = await httpRequest({ url: urlFor(config, '/v1/accounts/credits') });
  return assertProviderSuccess(data);
};

const listTemplates = async (config, { limit = 100, page = 1, status = 'approved' } = {}) => {
  const { data } = await httpRequest({ url: urlFor(config, '/v1/api/templates', { limit, page, status }) });
  return assertProviderSuccess(data);
};

const listSenders = async (config, { limit = 100, page = 1 } = {}) => {
  const { data } = await httpRequest({ url: urlFor(config, '/v1/api/senders', { limit, page }) });
  return assertProviderSuccess(data);
};

const updateWebhook = async (webhookUrl, config) => {
  if (!webhookUrl) throw new Error('TrustSignal webhook URL is required');
  const { data } = await httpRequest({
    url: urlFor(config, '/v1/SMSsavewebhook'),
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { smswebhook_url: String(webhookUrl) },
  });
  return assertProviderSuccess(data);
};

const testConnection = async config => {
  const credits = await getCredits(config);
  return {
    success: true,
    message: 'TrustSignal SMS account is reachable',
    credits: credits?.credits || credits,
  };
};

module.exports = {
  id: 'trustsignal',
  contractMethods: ['sendSms', 'sendOtp', 'verifyOtp', 'testConnection', 'getCredits', 'listTemplates', 'listSenders'],
  sendSms,
  sendOtp,
  verifyOtp,
  testConnection,
  getCredits,
  listTemplates,
  listSenders,
  updateWebhook,
  normalizePhone,
  otpTemplateFor,
  otpMessageFor,
};
