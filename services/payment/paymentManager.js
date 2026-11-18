const razorpay = require('./gateways/razorpay');
const cashfree = require('./gateways/cashfree');
const stripe = require('./gateways/stripe');
const Settings = require('../../models/Settings');
const { getProviderConfig: getLegacyProviderConfig } = require('../integrationService');
const tenantIntegrationService = require('../tenantIntegrationService');
const { getActiveProviders, getActiveProvider: getSelectedProvider, assertProvider } = require('../providerSelectionService');
require('../integrations/registerBuiltins');

const gateways = { razorpay, cashfree, stripe };

const hasRequiredCredentials = (id, config = {}) => id === 'razorpay'
  ? Boolean(config.key_id && config.key_secret)
  : id === 'cashfree'
    ? Boolean(config.app_id && config.app_secret)
    : Boolean(config.secret_key && config.publishable_key);

const getConfig = async ({ provider = 'razorpay', tenantId } = {}) => tenantId
  ? tenantIntegrationService.configFor(tenantId, provider)
  : getLegacyProviderConfig(provider).catch(() => ({ enabled: false }));

const publicGateway = (id, config) => {
  const adapter = gateways[id];
  return { id, displayName: adapter.displayName || id[0].toUpperCase() + id.slice(1), description: adapter.description || `Pay securely with ${id}`, environment: config.environment || 'sandbox', ...(id === 'razorpay' ? adapter.getPublicConfig(config) : id === 'stripe' ? { publishable_key: config.publishable_key || '' } : {}) };
};

const getOperationalProviders = async ({ tenantId } = {}) => {
  const selectedProviders = await getActiveProviders('payment');
  const configs = await Promise.all(selectedProviders.map(async provider => ({ provider, config: await getConfig({ provider, tenantId }) })));
  return configs.filter(({ provider, config }) => config?.enabled && hasRequiredCredentials(provider, config));
};

const getActiveGateways = async ({ tenantId } = {}) => {
  const active = [];
  const operationalProviders = await getOperationalProviders({ tenantId });
  operationalProviders.forEach(({ provider, config }) => active.push(publicGateway(provider, config)));
  // COD is an internal checkout capability, not an external integration.
  const codEnabled = await Settings.get('cod_enabled', true);
  const codFallback = operationalProviders.length === 0;
  if (codFallback || (codEnabled !== false && codEnabled !== 'false')) {
    active.push({ id: 'cod', displayName: 'Cash on Delivery', description: codFallback ? 'No payment gateway is active. Pay when your order arrives.' : 'Pay when your order arrives.', ...(codFallback ? { fallback: true, mode: 'cod_fallback' } : {}) });
  }
  const manualEnabled = await Settings.get('manual_payment_enabled', false);
  const configuredMethods = await Settings.get('manual_payment_methods', ['manual']);
  const manualMethods = Array.isArray(configuredMethods) ? configuredMethods : ['manual'];
  const instructions = String(await Settings.get('manual_payment_instructions', '') || '').slice(0, 2000);
  if (manualEnabled === true || manualEnabled === 'true') {
    const labels = { manual: 'Manual Payment', bank_transfer: 'Bank Transfer', upi: 'UPI / QR' };
    manualMethods.filter(method => Object.prototype.hasOwnProperty.call(labels, method)).forEach(method => {
      active.push({ id: method, displayName: labels[method], description: instructions || 'Place the order and complete payment using the instructions shown by the store.', instructions });
    });
  }
  return active;
};

const createOrder = async (gatewayId, params = {}) => {
  const id = String(gatewayId || '').toLowerCase();
  if (id === 'cod') return { id: null, externalOrderId: null, status: 'authorized', currency: params.currency || 'INR', amount: params.amount };
  const adapter = gateways[id];
  if (!adapter) throw new Error(`Unsupported payment gateway: ${gatewayId}`);
  assertProvider('payment', id);
  const operationalProviders = await getOperationalProviders({ tenantId: params.tenantId });
  if (!operationalProviders.some(({ provider }) => provider === id)) {
    const error = new Error(`${adapter.displayName || id} is not an active and configured payment gateway. Select COD or configure it in Admin → Modules.`);
    error.statusCode = 409;
    error.publicCode = 'PAYMENT_PROVIDER_INACTIVE';
    throw error;
  }
  const config = await getConfig({ provider: id, tenantId: params.tenantId });
  if (!config.enabled || !hasRequiredCredentials(id, config)) throw new Error(`${adapter.displayName || id} is not configured. Add credentials in Admin → Modules.`);
  // Razorpay reads config from the request object while Cashfree/Stripe
  // receive it as their second adapter argument. Pass it both ways so every
  // gateway contract gets the resolved tenant credentials.
  return adapter.createOrder({
    ...params,
    config,
    idempotencyKey: params.idempotencyKey || `order:${params.orderId}:${id}`,
  }, config);
};

const verifyPayment = async (gatewayId, payload, expected = {}) => {
  const id = String(gatewayId || '').toLowerCase();
  const adapter = gateways[id];
  if (!adapter) throw new Error(`Unsupported payment gateway: ${gatewayId}`);
  assertProvider('payment', id);
  const config = await getConfig({ provider: id, tenantId: expected.tenantId });
  if (!config.enabled || !hasRequiredCredentials(id, config)) throw new Error(`${adapter.displayName || id} is not configured. Add credentials in Admin → Modules.`);

  if (id === 'razorpay') {
    if (!config.key_secret) throw new Error('Razorpay is not configured. Add credentials in Admin → Modules.');
    const result = adapter.verifyPayment(payload, config);
    const payment = await adapter.fetchPayment(payload.razorpay_payment_id, config);
    if (expected.providerOrderId && payment.order_id !== expected.providerOrderId) throw new Error('Payment provider order mismatch');
    if (expected.amount !== undefined && Number(payment.amount) !== Math.round(Number(expected.amount) * 100)) throw new Error('Payment amount mismatch');
    if (expected.currency && payment.currency !== expected.currency) throw new Error('Payment currency mismatch');
    if (!['authorized', 'captured'].includes(payment.status)) throw new Error(`Payment is not successful: ${payment.status || 'unknown status'}`);
    return { ...result, providerPayment: payment };
  }

  if (id === 'stripe') return adapter.verifyPayment({ paymentIntentId: payload.payment_intent || payload.stripe_payment_intent_id || expected.providerOrderId, amount: expected.amount, currency: expected.currency }, config);

  const providerOrderId = payload.cashfree_order_id || payload.order_id || expected.providerOrderId;
  if (!providerOrderId) throw new Error('Cashfree order ID is required');
  const order = await adapter.statusLookup(providerOrderId, config);
  if (expected.amount !== undefined && Number(order.amount) !== Number(expected.amount)) throw new Error('Payment amount mismatch');
  if (expected.currency && order.currency !== expected.currency) throw new Error('Payment currency mismatch');
  if (!['PAID', 'SUCCESS', 'COMPLETED'].includes(String(order.status || '').toUpperCase())) throw new Error(`Payment is not successful: ${order.status || 'unknown status'}`);
  return { verified: true, paymentId: payload.cf_payment_id || payload.payment_id || providerOrderId, providerPayment: order };
};

module.exports = { getActiveGateways, getOperationalProviders, createOrder, verifyPayment, getConfig, getActiveProvider: () => getSelectedProvider('payment'), hasRequiredCredentials };
