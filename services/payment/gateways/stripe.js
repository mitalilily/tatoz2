const crypto = require('crypto');
const httpRequest = require('../../../utils/httpRequest');

const BASE_URL = 'https://api.stripe.com/v1';
const formEncode = value => Object.entries(value).map(([key, item]) => `${encodeURIComponent(key)}=${encodeURIComponent(item)}`).join('&');
const headersFor = (config, idempotencyKey) => ({
  Authorization: `Basic ${Buffer.from(`${config.secret_key}:`).toString('base64')}`,
  ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
});
const assertConfig = config => { if (!config.secret_key) throw new Error('Stripe secret key is required'); };
const unixTime = value => {
  if (value === undefined || value === null || value === '') return undefined;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric);
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : undefined;
};
const listQuery = params => {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  });
  return query.toString();
};
const listResource = async (resource, params, config) => {
  assertConfig(config);
  const query = listQuery(params);
  const { data } = await httpRequest({ url: `${BASE_URL}/${resource}${query ? `?${query}` : ''}`, headers: headersFor(config) });
  return data || {};
};
const normalizeTransaction = paymentIntent => {
  const providerStatus = String(paymentIntent.status || '').toLowerCase();
  const failed = providerStatus === 'canceled' || Boolean(paymentIntent.last_payment_error);
  const succeeded = providerStatus === 'succeeded';
  return {
    _id: paymentIntent.id,
    provider: 'stripe',
    order: { orderNumber: paymentIntent.metadata?.orderId || paymentIntent.id },
    eventType: succeeded ? 'provider_captured' : failed ? (providerStatus === 'canceled' ? 'provider_cancelled' : 'provider_failed') : 'provider_authorized',
    source: 'stripe_live_api',
    amount: Number(paymentIntent.amount_received ?? (succeeded ? paymentIntent.amount : paymentIntent.amount || 0)) / 100,
    status: failed ? 'failed' : succeeded ? 'succeeded' : 'pending',
    externalPaymentId: paymentIntent.id,
    externalOrderId: paymentIntent.metadata?.orderId || paymentIntent.id,
    occurredAt: paymentIntent.created ? new Date(Number(paymentIntent.created) * 1000).toISOString() : null,
    providerStatus: paymentIntent.status || '',
    method: paymentIntent.payment_method_types?.[0] || '',
  };
};
const collectResource = async (resource, config, params = {}, maxItems = 1000) => {
  const items = [];
  let startingAfter = params.starting_after;
  let truncated = false;
  while (items.length < maxItems) {
    const page = await listResource(resource, { ...params, limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) }, config);
    const pageItems = Array.isArray(page.data) ? page.data : [];
    items.push(...pageItems);
    if (!page.has_more || !pageItems.length) break;
    startingAfter = pageItems[pageItems.length - 1].id;
    if (items.length >= maxItems) truncated = true;
  }
  return { items: items.slice(0, maxItems), truncated };
};
const liveSummary = async config => {
  const [paymentIntents, refunds] = await Promise.all([
    collectResource('payment_intents', config),
    collectResource('refunds', config),
  ]);
  const transactions = paymentIntents.items.map(normalizeTransaction);
  const captured = transactions.filter(item => item.status === 'succeeded');
  const failed = transactions.filter(item => item.status === 'failed');
  const daily = new Map();
  const since = Date.now() - (7 * 86400000);
  captured.forEach(item => {
    const createdAt = new Date(item.occurredAt || 0).getTime();
    if (!createdAt || createdAt < since) return;
    const date = new Date(createdAt).toISOString().slice(0, 10);
    const current = daily.get(date) || { date, amount: 0, count: 0 };
    current.amount += Number(item.amount || 0);
    current.count += 1;
    daily.set(date, current);
  });
  const refundedAmount = refunds.items.reduce((sum, refund) => sum + Number(refund.amount || 0) / 100, 0);
  const capturedAmount = captured.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const failedAmount = failed.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return {
    attempts: transactions.reduce((out, item) => ({ ...out, [item.status]: (out[item.status] || 0) + 1 }), {}),
    paidAmount: Math.round(capturedAmount * 100) / 100,
    paidOrders: captured.length,
    totalRevenue: Math.round(capturedAmount * 100) / 100,
    totalPayments: transactions.length,
    captured: captured.length,
    failed: failed.length,
    refunded: refunds.items.length,
    dailyData: [...daily.values()].sort((left, right) => left.date.localeCompare(right.date)),
    ledger: {
      events: {
        provider_captured: { count: captured.length, amount: Math.round(capturedAmount * 100) / 100 },
        provider_failed: { count: failed.length, amount: Math.round(failedAmount * 100) / 100 },
        refunded: { count: refunds.items.length, amount: Math.round(refundedAmount * 100) / 100 },
      },
      statuses: transactions.reduce((out, item) => ({ ...out, [item.status]: (out[item.status] || 0) + 1 }), {}),
      capturedAmount: Math.round(capturedAmount * 100) / 100,
      refundedAmount: Math.round(refundedAmount * 100) / 100,
      failedAmount: Math.round(failedAmount * 100) / 100,
      totalEvents: transactions.length + refunds.items.length,
    },
    source: 'stripe_live_api',
    live: true,
    snapshot: { paymentIntents: transactions.length, refunds: refunds.items.length, truncated: paymentIntents.truncated || refunds.truncated },
  };
};

module.exports = {
  id: 'stripe',
  contractMethods: ['createOrder', 'verifyPayment', 'statusLookup', 'refund', 'verifyWebhook', 'testConnection'],

  async createOrder({ amount, orderId, currency = 'INR', idempotencyKey }, config) {
    assertConfig(config);
    const { data } = await httpRequest({
      url: `${BASE_URL}/payment_intents`, method: 'POST', headers: { ...headersFor(config, idempotencyKey), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formEncode({ amount: Math.round(Number(amount) * 100), currency: String(currency).toLowerCase(), 'metadata[orderId]': String(orderId), 'automatic_payment_methods[enabled]': 'true' }),
    });
    return { id: data.id, externalOrderId: data.id, clientSecret: data.client_secret, amount: data.amount / 100, currency: String(data.currency || currency).toUpperCase(), status: data.status };
  },

  async statusLookup(paymentIntentId, config) {
    assertConfig(config);
    const { data } = await httpRequest({ url: `${BASE_URL}/payment_intents/${encodeURIComponent(paymentIntentId)}`, headers: headersFor(config) });
    return { externalPaymentId: data.id, status: data.status, amount: Number(data.amount || 0) / 100, currency: String(data.currency || '').toUpperCase(), raw: data };
  },

  async verifyPayment({ paymentIntentId, amount, currency }, config) {
    const result = await this.statusLookup(paymentIntentId, config);
    if (result.status !== 'succeeded') throw new Error(`Stripe payment is not captured: ${result.status}`);
    if (Math.round(result.amount * 100) !== Math.round(Number(amount) * 100)) throw new Error('Stripe amount mismatch');
    if (currency && result.currency !== String(currency).toUpperCase()) throw new Error('Stripe currency mismatch');
    return { verified: true, paymentId: paymentIntentId, status: result.status };
  },

  async refund({ paymentIntentId, amount, reason, idempotencyKey }, config) {
    assertConfig(config);
    const { data } = await httpRequest({ url: `${BASE_URL}/refunds`, method: 'POST', headers: { ...headersFor(config, idempotencyKey), 'Content-Type': 'application/x-www-form-urlencoded' }, body: formEncode({ payment_intent: paymentIntentId, amount: Math.round(Number(amount) * 100), reason: reason || 'requested_by_customer' }) });
    return { refundId: data.id, status: data.status, raw: data };
  },

  async listTransactions(params = {}, config) {
    const safeLimit = Math.min(100, Math.max(1, Number(params.limit || params.count) || 30));
    const page = Math.max(1, Number(params.page) || 1);
    const result = await listResource('payment_intents', {
      limit: safeLimit,
      ...(params.starting_after ? { starting_after: params.starting_after } : {}),
      ...(unixTime(params.from) ? { 'created[gte]': unixTime(params.from) } : {}),
      ...(unixTime(params.to) ? { 'created[lte]': unixTime(params.to) } : {}),
    }, config);
    let transactions = (Array.isArray(result.data) ? result.data : []).map(normalizeTransaction);
    if (params.eventType) transactions = transactions.filter(item => item.eventType === params.eventType);
    if (params.status) transactions = transactions.filter(item => item.status === params.status);
    return {
      transactions,
      pagination: { page, limit: safeLimit, total: transactions.length, pages: result.has_more ? undefined : (transactions.length ? page : 0) },
      hasMore: Boolean(result.has_more),
      live: true,
      source: 'stripe_live_api',
    };
  },

  async getDashboardSummary(config) {
    return liveSummary(config);
  },

  verifyWebhook(rawBody, signature, config) {
    if (!config.webhook_secret) throw new Error('Stripe webhook secret is not configured');
    const [timestampPart, ...signatureParts] = String(signature || '').split(',');
    const timestamp = timestampPart?.replace(/^t=/, '');
    const v1 = signatureParts.find(part => part.startsWith('v1='))?.slice(3);
    if (!timestamp || !v1 || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) throw new Error('Stripe webhook timestamp is invalid');
    const payload = `${timestamp}.${typeof rawBody === 'string' ? rawBody : Buffer.from(rawBody || '').toString('utf8')}`;
    const expected = crypto.createHmac('sha256', config.webhook_secret).update(payload).digest('hex');
    if (expected.length !== v1.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1))) throw new Error('Stripe webhook signature mismatch');
    return true;
  },

  async testConnection(config) {
    assertConfig(config);
    await httpRequest({ url: `${BASE_URL}/account`, headers: headersFor(config) });
    return { success: true, message: 'Stripe connection is valid' };
  },
};
