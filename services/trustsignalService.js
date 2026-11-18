const tenantIntegrationService = require('./tenantIntegrationService');

const envConfig = () => ({
  source: 'environment',
  enabled: Boolean(process.env.TRUSTSIGNAL_API_KEY),
  base_url: process.env.TRUSTSIGNAL_BASE_URL || 'https://api.trustsignal.io',
  api_key: process.env.TRUSTSIGNAL_API_KEY || '',
  sender_id: process.env.TRUSTSIGNAL_SENDER_ID || 'TATOZS',
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
  payment_success_template_id: process.env.TRUSTSIGNAL_PAYMENT_SUCCESS_TEMPLATE_ID || '',
  payment_failed_template_id: process.env.TRUSTSIGNAL_PAYMENT_FAILED_TEMPLATE_ID || '',
  order_cancelled_template_id: process.env.TRUSTSIGNAL_ORDER_CANCELLED_TEMPLATE_ID || '',
  refund_requested_template_id: process.env.TRUSTSIGNAL_REFUND_REQUESTED_TEMPLATE_ID || '',
  refund_approved_template_id: process.env.TRUSTSIGNAL_REFUND_APPROVED_TEMPLATE_ID || '',
  refund_processed_template_id: process.env.TRUSTSIGNAL_REFUND_PROCESSED_TEMPLATE_ID || '',
  refund_rejected_template_id: process.env.TRUSTSIGNAL_REFUND_REJECTED_TEMPLATE_ID || '',
  webhook_url: process.env.TRUSTSIGNAL_WEBHOOK_URL || '',
});

const getConfig = async tenantId => {
  if (tenantId) {
    const configured = await tenantIntegrationService.configFor(tenantId, 'trustsignal', { allowPlatformFallback: true });
    if (configured.source && configured.source !== 'none') return configured;
  }
  return envConfig();
};

const isConfigured = config => Boolean(config?.enabled && config.api_key && config.sender_id);

module.exports = { envConfig, getConfig, isConfigured };
