const httpRequest = require('../utils/httpRequest');
const { getProviderConfig } = require('./integrationService');
const tenantIntegrationService = require('./tenantIntegrationService');

const BASE_URL = 'https://control.msg91.com/api/v5';
const DUMMY_OTP = '123456';

const getConfig = async tenantId => {
  const config = tenantId
    ? await tenantIntegrationService.configFor(tenantId, 'msg91', { allowPlatformFallback: true })
    : await getProviderConfig('msg91');
  return { authKey: config.auth_key, templateId: config.template_id, smsTemplateId: config.sms_template_id, enabled: config.enabled };
};

const isConfigured = async tenantId => {
  const { authKey, templateId, enabled } = await getConfig(tenantId);
  return Boolean(enabled && authKey && authKey !== 'your_auth_key_here' && templateId && templateId !== 'your_template_id_here');
};

// The deterministic OTP is intentionally retained for local/test workflows.
// Production must fail closed if the SMS provider has not been configured.
const allowTestingOtp = () => process.env.NODE_ENV !== 'production';

const requireProviderInProduction = async tenantId => {
  if (!await isConfigured(tenantId) && !allowTestingOtp()) {
    throw new Error('Phone OTP is not configured for production delivery');
  }
};

const formatPhone = (phone) => {
  const cleaned = phone.replace(/\D/g, '').replace(/^(91|0)/, '');
  if (cleaned.length !== 10) throw new Error('Invalid phone number — must be 10 digits');
  return `91${cleaned}`;
};

const sendOTP = async (phone, tenantId) => {
  const mobile = formatPhone(phone);

  if (!await isConfigured(tenantId)) {
    await requireProviderInProduction(tenantId);
    console.log(`[DEV OTP] Use ${DUMMY_OTP} for +${mobile}`);
    return { type: 'success', message: 'OTP sent (dev mode)' };
  }

  const { authKey, templateId } = await getConfig(tenantId);
  const { data } = await httpRequest({
    url: `${BASE_URL}/otp?template_id=${templateId}&mobile=${mobile}`,
    method: 'POST',
    headers: { authkey: authKey },
  });
  return data;
};

const verifyOTP = async (phone, otp, tenantId) => {
  const mobile = formatPhone(phone);

  if (!await isConfigured(tenantId)) {
    await requireProviderInProduction(tenantId);
    if (otp !== DUMMY_OTP) throw new Error('Invalid OTP');
    return { type: 'success', message: 'OTP verified (dev mode)' };
  }

  const { authKey } = await getConfig(tenantId);
  const { data } = await httpRequest({
    url: `${BASE_URL}/otp/verify?otp=${otp}&mobile=${mobile}`,
    method: 'POST',
    headers: { authkey: authKey },
  });

  if (data.type === 'error') throw new Error(data.message || 'OTP verification failed');
  return data;
};

const resendOTP = async (phone, tenantId) => {
  const mobile = formatPhone(phone);

  if (!await isConfigured(tenantId)) {
    await requireProviderInProduction(tenantId);
    console.log(`[DEV OTP] Use ${DUMMY_OTP} for +${mobile}`);
    return { type: 'success', message: 'OTP resent (dev mode)' };
  }

  const { authKey } = await getConfig(tenantId);
  const { data } = await httpRequest({
    url: `${BASE_URL}/otp/retry?mobile=${mobile}&retrytype=text`,
    method: 'POST',
    headers: { authkey: authKey },
  });
  return data;
};

const normalizeFlowVariables = (parameters, message = '') => {
  if (parameters && typeof parameters === 'object' && !Array.isArray(parameters)) {
    return Object.fromEntries(Object.entries(parameters).map(([key, value]) => [String(key), String(value ?? '')]));
  }
  if (Array.isArray(parameters)) {
    return Object.fromEntries(parameters.map((value, index) => [`VAR${index + 1}`, String(value?.value ?? value ?? '')]));
  }
  return message ? { VAR1: String(message) } : {};
};

// MSG91's Flow API is used for consented transactional/marketing SMS. The
// OTP endpoint above remains separate because it has a different provider
// contract and verification lifecycle.
const sendSMS = async (phone, { tenantId, templateId, parameters, message } = {}) => {
  const config = await getConfig(tenantId);
  // OTP templates and Flow SMS templates are different MSG91 contracts. Do
  // not silently reuse an OTP template for campaigns or admin SMS sends.
  const flowId = templateId || config.smsTemplateId;
  if (!config.enabled || !config.authKey || !flowId) {
    throw new Error('Phone SMS is not configured for this tenant');
  }
  const mobile = formatPhone(phone);
  const { data } = await httpRequest({
    url: `${BASE_URL}/flow`,
    method: 'POST',
    headers: { authkey: config.authKey },
    body: {
      template_id: flowId,
      short_url: '0',
      recipients: [{ mobiles: mobile, ...normalizeFlowVariables(parameters, message) }],
    },
  });
  if (data?.type === 'error' || data?.success === false) throw new Error(data.message || 'Phone SMS delivery failed');
  return { externalId: data?.request_id || data?.message_id || data?.id || '', status: 'sent', raw: data };
};

module.exports = { sendOTP, verifyOTP, resendOTP, sendSMS, formatPhone, isConfigured };
