const crypto = require('crypto');
const OtpChallenge = require('../models/OtpChallenge');
const tenantIntegrationService = require('./tenantIntegrationService');
const authPolicyService = require('./authPolicyService');
const msg91 = require('./msg91Service');
const wati = require('./notifications/providers/wati');
const trustsignal = require('./notifications/providers/trustsignal');
const emailService = require('./emailService');

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const hashCode = (identity, tenantId, purpose, code) => crypto.createHash('sha256')
  .update(`${String(tenantId || 'platform')}:${purpose}:${identity}:${code}`)
  .digest('hex');

const randomCode = () => String(crypto.randomInt(100000, 1000000));

const hasMsg91Credentials = config => Boolean(config?.enabled && config.auth_key && config.template_id);
const hasWatiCredentials = config => Boolean(config?.enabled && config.api_endpoint && config.api_token);
const hasTrustsignalCredentials = config => Boolean(
  config?.enabled
  && config.api_key
  && config.sender_id
  && (config.otify_template_id || config.login_otp_template_id),
);

const unavailableError = () => {
  const error = new Error('Verification is temporarily unavailable');
  error.statusCode = 503;
  error.publicCode = 'OTP_PROVIDER_UNAVAILABLE';
  return error;
};

const selectProvider = async (tenantId, { purpose = 'login', requestedMode } = {}) => {
  const policy = await authPolicyService.getEffectivePolicy(tenantId);
  const id = authPolicyService.modeForPurpose(policy, purpose, requestedMode);
  if (!id) return { id: null, config: null, policy };
  if (id === 'msg91') {
    const selected = await authPolicyService.effectiveOtpConfig(tenantId, 'msg91');
    return { id: selected.provider, policyId: id, config: selected.config, policy };
  }
  const config = await tenantIntegrationService.configFor(tenantId, id === 'email' ? 'smtp' : id, { allowPlatformFallback: true });
  return { id, policyId: id, config, policy };
};

const readiness = async ({ tenantId, allowTestMode = false, selectedProvider, purpose = 'login', requestedMode } = {}) => {
  const selected = selectedProvider || await selectProvider(tenantId, { purpose, requestedMode });
  const providerConfigured = selected.id === 'wati'
    ? hasWatiCredentials(selected.config)
    : selected.id === 'trustsignal'
      ? hasTrustsignalCredentials(selected.config)
    : selected.id === 'msg91'
      ? tenantId
      ? hasMsg91Credentials(selected.config)
        : await msg91.isConfigured()
      : selected.id === 'email'
        ? Boolean(selected.config?.enabled && selected.config?.host && selected.config?.user && selected.config?.pass && selected.config?.from)
        : false;
  if (selected.id === null) {
    return { available: true, providerConfigured: false, provider: null, mode: 'disabled', selectedProvider: 'disabled' };
  }
  const developmentMode = !providerConfigured && process.env.NODE_ENV !== 'production';
  const testMode = !providerConfigured && developmentMode && Boolean(allowTestMode);

  return {
    available: providerConfigured || developmentMode,
    providerConfigured,
    provider: providerConfigured ? selected.id : null,
    mode: providerConfigured ? 'provider' : testMode ? 'test' : developmentMode ? 'development' : 'unavailable',
    selectedProvider: selected.id,
  };
};

const saveChallenge = async ({ tenantId, phone, email, channel = 'phone', purpose, code }) => {
  const identity = channel === 'email' ? email : phone;
  const query = { tenant: tenantId || undefined, purpose, channel, ...(channel === 'email' ? { email } : { phone }) };
  await OtpChallenge.findOneAndUpdate(
    query,
    { $set: { ...(channel === 'email' ? { email } : { phone }), channel, codeHash: hashCode(identity, tenantId, purpose, code), expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS), attempts: 0 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
};

const send = async ({ phone, email, tenantId, purpose = 'login', authMethod }) => {
  const provider = await selectProvider(tenantId, { purpose, requestedMode: authMethod });
  const state = await readiness({ tenantId, selectedProvider: provider, purpose, requestedMode: authMethod });
  if (!provider.id) return { provider: null, status: 'skipped' };
  if (!state.providerConfigured && process.env.NODE_ENV === 'production') throw unavailableError();
  if (provider.id === 'email') {
    if (!email) throw new Error('An email address is required for cart verification');
    const code = randomCode();
    await emailService.sendVerificationOtp({ tenantId, to: email, otp: code });
    await saveChallenge({ tenantId, email, channel: 'email', purpose, code });
    return { provider: 'email', status: 'sent' };
  }
  if (provider.id === 'wati') {
    const code = randomCode();
    await wati.sendTemplateMessage({ phone, templateName: provider.config.otp_template_name || 'otp', parameters: { otp: code } }, provider.config);
    await saveChallenge({ tenantId, phone, channel: 'phone', purpose, code });
    return { provider: 'wati', status: 'sent' };
  }
  if (provider.id === 'trustsignal') {
    const result = await trustsignal.sendOtp({ phone, purpose }, provider.config);
    if (result.mode === 'local' && result.code) await saveChallenge({ tenantId, phone, channel: 'phone', purpose, code: result.code });
    const { code: _code, ...safeResult } = result;
    return safeResult;
  }
  return { provider: 'msg91', ...(await msg91.sendOTP(phone, tenantId)) };
};

const verify = async ({ phone, email, otp, tenantId, purpose = 'login', authMethod }) => {
  const provider = await selectProvider(tenantId, { purpose, requestedMode: authMethod });
  if (!provider.id) return { type: 'skipped', message: 'Verification is disabled' };
  if (provider.id === 'msg91') return msg91.verifyOTP(phone, otp, tenantId);
  if (provider.id === 'trustsignal' && provider.config?.otify_base_url) return trustsignal.verifyOtp({ phone, otp }, provider.config);
  const channel = provider.id === 'email' ? 'email' : 'phone';
  const identity = channel === 'email' ? email : phone;
  const challenge = await OtpChallenge.findOne({ tenant: tenantId || undefined, [channel]: identity, channel, purpose }).sort({ createdAt: -1 });
  if (!challenge || challenge.expiresAt <= new Date()) throw new Error('OTP has expired. Please request a new OTP');
  if (challenge.attempts >= MAX_ATTEMPTS) throw new Error('Too many invalid OTP attempts. Please request a new OTP');
  const expected = Buffer.from(challenge.codeHash);
  const actual = Buffer.from(hashCode(identity, tenantId, purpose, String(otp || '')));
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    challenge.attempts += 1;
    await challenge.save();
    throw new Error('Invalid OTP');
  }
  await OtpChallenge.deleteOne({ _id: challenge._id });
  return { type: 'success', message: 'OTP verified' };
};

const resend = async ({ phone, email, tenantId, purpose = 'login', authMethod }) => send({ phone, email, tenantId, purpose, authMethod });

module.exports = { send, verify, resend, selectProvider, readiness, hashCode, unavailableError };
