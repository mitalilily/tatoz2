const crypto = require('crypto');
const httpRequest = require('../../../utils/httpRequest');

// Keep production on Razorpay's live API while allowing the disposable
// Selenium suite to use a local sandbox stub without touching real payments.
const BASE_URL = String(process.env.RAZORPAY_API_BASE_URL || 'https://api.razorpay.com/v1').replace(/\/$/, '');

const assertConfig = config => {
  if (!config?.key_id || !config?.key_secret) throw new Error('Razorpay credentials are not configured');
};

const authHeaders = config => ({
  Authorization: `Basic ${Buffer.from(`${config.key_id}:${config.key_secret}`).toString('base64')}`,
});

const collectionQuery = ({ count = 20, limit, skip = 0, from, to, ...rest } = {}) => {
  const query = new URLSearchParams();
  const safeCount = Math.min(100, Math.max(1, Number(limit || count) || 20));
  const safeSkip = Math.max(0, Number(skip) || 0);
  query.set('count', String(safeCount));
  if (safeSkip) query.set('skip', String(safeSkip));
  if (from !== undefined && from !== null && from !== '') query.set('from', String(from));
  if (to !== undefined && to !== null && to !== '') query.set('to', String(to));
  Object.entries(rest).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  });
  return query.toString();
};

const listCollection = async (resource, params, config) => {
  assertConfig(config);
  const query = collectionQuery(params);
  const { data } = await httpRequest({
    url: `${BASE_URL}/${resource}?${query}`,
    headers: authHeaders(config),
  });
  return {
    ...data,
    items: Array.isArray(data?.items) ? data.items : [],
  };
};

const getResource = async (resource, id, config) => {
  assertConfig(config);
  if (!id) throw new Error(`Razorpay ${resource} identifier is required`);
  const { data } = await httpRequest({
    url: `${BASE_URL}/${resource}/${encodeURIComponent(id)}`,
    headers: authHeaders(config),
  });
  return data;
};

const collectCollection = async (resource, config, params = {}, maxItems = 1000) => {
  const pageSize = Math.min(100, Math.max(1, Number(params.count || params.limit) || 100));
  let skip = Math.max(0, Number(params.skip) || 0);
  const items = [];
  let truncated = false;
  while (items.length < maxItems) {
    const page = await listCollection(resource, { ...params, count: pageSize, skip }, config);
    const pageItems = Array.isArray(page.items) ? page.items : [];
    items.push(...pageItems);
    if (pageItems.length < pageSize) break;
    skip += pageItems.length;
    if (items.length >= maxItems) truncated = true;
  }
  return { items: items.slice(0, maxItems), truncated };
};

const liveDashboardSummary = async config => {
  const [payments, refunds] = await Promise.all([
    collectCollection('payments', config),
    collectCollection('refunds', config),
  ]);
  const captured = payments.items.filter(payment => ['captured', 'refunded'].includes(String(payment.status || '').toLowerCase()) || Number(payment.captured) === 1);
  const failed = payments.items.filter(payment => String(payment.status || '').toLowerCase() === 'failed');
  const capturedAmount = captured.reduce((sum, payment) => sum + Number(payment.amount || 0) / 100, 0);
  const failedAmount = failed.reduce((sum, payment) => sum + Number(payment.amount || 0) / 100, 0);
  const refundedAmount = refunds.items.reduce((sum, refund) => sum + Number(refund.amount || 0) / 100, 0);
  const daily = new Map();
  const since = Date.now() - (7 * 86400000);
  captured.forEach(payment => {
    const createdAt = Number(payment.created_at || 0) * 1000;
    if (!createdAt || createdAt < since) return;
    const date = new Date(createdAt).toISOString().slice(0, 10);
    const current = daily.get(date) || { date, amount: 0, count: 0 };
    current.amount += Number(payment.amount || 0) / 100;
    current.count += 1;
    daily.set(date, current);
  });
  return {
    attempts: { captured: captured.length, failed: failed.length, pending: Math.max(0, payments.items.length - captured.length - failed.length) },
    paidAmount: Math.round(capturedAmount * 100) / 100,
    paidOrders: captured.length,
    totalRevenue: Math.round(capturedAmount * 100) / 100,
    totalPayments: payments.items.length,
    captured: captured.length,
    failed: failed.length,
    refunded: refunds.items.length,
    dailyData: [...daily.values()].sort((left, right) => left.date.localeCompare(right.date)).map(item => ({ ...item, amount: Math.round(item.amount * 100) / 100 })),
    ledger: {
      events: {
        provider_captured: { count: captured.length, amount: Math.round(capturedAmount * 100) / 100 },
        provider_failed: { count: failed.length, amount: Math.round(failedAmount * 100) / 100 },
        refunded: { count: refunds.items.length, amount: Math.round(refundedAmount * 100) / 100 },
      },
      statuses: { captured: captured.length, failed: failed.length },
      capturedAmount: Math.round(capturedAmount * 100) / 100,
      refundedAmount: Math.round(refundedAmount * 100) / 100,
      failedAmount: Math.round(failedAmount * 100) / 100,
      totalEvents: payments.items.length + refunds.items.length,
    },
    source: 'razorpay_live_api',
    live: true,
    snapshot: { payments: payments.items.length, refunds: refunds.items.length, truncated: payments.truncated || refunds.truncated },
  };
};

module.exports = {
  id: 'razorpay',
  displayName: 'Razorpay',
  description: 'Accept UPI, Cards, Wallets, Net Banking via Razorpay',
  logo: 'https://razorpay.com/favicon.ico',
  fields: [
    { key: 'key_id', label: 'Key ID', type: 'text', placeholder: 'rzp_test_xxxxxxxxxxxx', required: true },
    { key: 'key_secret', label: 'Key Secret', type: 'password', placeholder: 'Your Razorpay secret key', required: true },
  ],

  getPublicConfig(config) {
    return { key_id: config.key_id };
  },

  async createOrder({ amount, orderId, currency = 'INR', config }) {
    assertConfig(config);
    const { data } = await httpRequest({
      url: `${BASE_URL}/orders`,
      method: 'POST',
      headers: authHeaders(config),
      body: {
        amount: Math.round(amount * 100), // paise
        currency,
        receipt: `ord_${orderId}`,
        notes: { orderId: String(orderId) },
      },
    });
    // Return shape expected by frontend: id + key_id for Razorpay checkout popup
    return {
      id: data.id,
      razorpayOrderId: data.id,
      amount: data.amount,
      currency: data.currency,
      key_id: config.key_id,
    };
  },

  verifyPayment({ razorpay_order_id, razorpay_payment_id, razorpay_signature }, config) {
    if (!config.key_secret) throw new Error('Razorpay secret not configured');
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      throw new Error('Incomplete Razorpay verification payload');
    }
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expected = crypto.createHmac('sha256', config.key_secret).update(body).digest('hex');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const providedBuffer = Buffer.from(String(razorpay_signature), 'utf8');
    if (expectedBuffer.length !== providedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
      throw new Error('Payment verification failed: signature mismatch');
    }
    return { paymentId: razorpay_payment_id, verified: true };
  },

  verifyWebhook(rawBody, signature, config) {
    if (!config.webhook_secret) throw new Error('Razorpay webhook secret is not configured');
    const expected = crypto.createHmac('sha256', config.webhook_secret)
      .update(typeof rawBody === 'string' ? rawBody : Buffer.from(rawBody || '').toString('utf8'))
      .digest('hex');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const providedBuffer = Buffer.from(String(signature || ''), 'utf8');
    if (!providedBuffer.length || expectedBuffer.length !== providedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
      throw new Error('Razorpay webhook signature mismatch');
    }
    return true;
  },

  async fetchPayment(paymentId, config) {
    assertConfig(config);
    if (!paymentId) throw new Error('Razorpay payment id is required');
    const { data } = await httpRequest({
      url: `${BASE_URL}/payments/${encodeURIComponent(paymentId)}`,
      method: 'GET',
      headers: authHeaders(config),
    });
    return data;
  },

  async listPayments(params = {}, config) {
    return listCollection('payments', params, config);
  },

  async listOrders(params = {}, config) {
    return listCollection('orders', params, config);
  },

  async listRefunds(params = {}, config) {
    return listCollection('refunds', params, config);
  },

  async listSettlements(params = {}, config) {
    return listCollection('settlements', params, config);
  },

  async fetchOrder(orderId, config) {
    return getResource('orders', orderId, config);
  },

  async fetchRefund(refundId, config) {
    return getResource('refunds', refundId, config);
  },

  async fetchSettlement(settlementId, config) {
    return getResource('settlements', settlementId, config);
  },

  async listTransactions(params = {}, config) {
    const { eventType, status, page, ...providerParams } = params;
    const result = await listCollection('payments', providerParams, config);
    const items = result.items || [];
    return {
      transactions: items.map(payment => {
        const providerStatus = String(payment.status || '').toLowerCase();
        const succeeded = providerStatus === 'captured' || providerStatus === 'refunded' || Number(payment.captured) === 1;
        return {
          _id: payment.id,
          provider: 'razorpay',
          order: { orderNumber: payment.order_id || '—' },
          eventType: succeeded ? 'provider_captured' : providerStatus === 'failed' ? 'provider_failed' : 'provider_authorized',
          source: 'razorpay_live_api',
          amount: Number(payment.amount || 0) / 100,
          status: providerStatus === 'failed' ? 'failed' : succeeded ? 'succeeded' : 'pending',
          externalPaymentId: payment.id,
          externalOrderId: payment.order_id || '',
          occurredAt: payment.created_at ? new Date(Number(payment.created_at) * 1000).toISOString() : null,
          providerStatus: payment.status || '',
          method: payment.method || '',
        };
      }),
      pagination: {
        page: Math.floor((Number(params.skip) || 0) / Math.max(1, Number(params.limit || params.count) || 30)) + 1,
        limit: Math.min(100, Math.max(1, Number(params.limit || params.count) || 30)),
        total: Number(result.count ?? items.length),
        pages: items.length ? Math.ceil(Number(result.count ?? items.length) / Math.max(1, Number(params.limit || params.count) || 30)) : 0,
      },
      live: true,
      source: 'razorpay_live_api',
    };
  },

  async getDashboardSummary(config) {
    assertConfig(config);
    return liveDashboardSummary(config);
  },

  async capture({ paymentId, amount, currency = 'INR' }, config) {
    assertConfig(config);
    if (!paymentId) throw new Error('Razorpay payment id is required');
    const { data } = await httpRequest({
      url: `${BASE_URL}/payments/${encodeURIComponent(paymentId)}/capture`,
      method: 'POST',
      headers: authHeaders(config),
      body: { amount: Math.round(Number(amount || 0) * 100), currency },
    });
    return {
      paymentId: data?.id || paymentId,
      status: data?.status || 'captured',
      amount: Math.round(Number(data?.amount || Number(amount || 0) * 100)) / 100,
      currency: data?.currency || currency,
    };
  },

  async refund({ paymentId, paymentIntentId, amount, refundId, notes }, config) {
    const resolvedPaymentId = paymentId || paymentIntentId;
    assertConfig(config);
    if (!resolvedPaymentId) throw new Error('Razorpay payment id is required');
    const body = { amount: Math.round(Number(amount || 0) * 100) };
    if (refundId) body.receipt = String(refundId).slice(0, 40);
    if (notes && typeof notes === 'object') body.notes = notes;
    const { data } = await httpRequest({
      url: `${BASE_URL}/payments/${encodeURIComponent(resolvedPaymentId)}/refund`,
      method: 'POST',
      headers: authHeaders(config),
      body,
    });
    return {
      refundId: data?.id || refundId || `refund_${resolvedPaymentId}`,
      paymentId: data?.payment_id || resolvedPaymentId,
      status: data?.status || 'processed',
      amount: Math.round(Number(data?.amount || Number(amount || 0) * 100)) / 100,
      currency: data?.currency || 'INR',
    };
  },

  async testConnection(config) {
    assertConfig(config);
    await httpRequest({
      url: `${BASE_URL}/orders?count=1`,
      headers: authHeaders(config),
    });
    return { success: true, message: 'Razorpay connected successfully' };
  },
};
