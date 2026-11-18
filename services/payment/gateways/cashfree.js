const crypto = require('crypto');
const httpRequest = require('../../../utils/httpRequest');

const baseUrl = config => String(config.environment || 'sandbox').toLowerCase() === 'production'
  ? 'https://api.cashfree.com/pg'
  : 'https://sandbox.cashfree.com/pg';

const headersFor = (config, requestId) => ({
  'x-client-id': config.app_id,
  'x-client-secret': config.app_secret,
  'x-api-version': config.api_version || '2025-01-01',
  'x-request-id': requestId || crypto.randomUUID(),
  ...(requestId ? { 'x-idempotency-key': requestId } : {}),
});

const assertConfig = config => {
  if (!config.app_id || !config.app_secret) throw new Error('Cashfree app ID and app secret are required');
};

const paymentStatus = payment => String(payment.payment_status || payment.status || '').toUpperCase();
const paymentAmount = payment => Number(payment.payment_amount ?? payment.order_amount ?? payment.amount ?? 0);
const paymentRow = (payment, fallbackOrderId) => {
  const status = paymentStatus(payment);
  const failed = ['FAILED', 'CANCELLED', 'USER_DROPPED'].includes(status) || Boolean(payment.error_details);
  const captured = payment.is_captured === true || ['SUCCESS', 'PAID', 'CAPTURED'].includes(status);
  return {
    _id: String(payment.cf_payment_id || payment.payment_id || `${payment.order_id || fallbackOrderId}:payment`),
    provider: 'cashfree',
    order: { orderNumber: payment.order_id || fallbackOrderId || '—' },
    eventType: captured ? 'provider_captured' : failed ? 'provider_failed' : 'provider_authorized',
    source: 'cashfree_live_api',
    amount: paymentAmount(payment),
    status: failed ? 'failed' : captured ? 'succeeded' : 'pending',
    externalPaymentId: String(payment.cf_payment_id || payment.payment_id || ''),
    externalOrderId: payment.order_id || fallbackOrderId || '',
    occurredAt: payment.payment_completion_time || payment.payment_time || payment.created_at || null,
    providerStatus: payment.payment_status || payment.status || '',
    method: payment.payment_group || payment.payment_method || '',
  };
};
const orderRow = (order, fallbackOrderId) => {
  const status = String(order.status || order.order_status || '').toUpperCase();
  const captured = ['PAID', 'SUCCESS', 'CAPTURED'].includes(status);
  const failed = ['FAILED', 'CANCELLED', 'EXPIRED'].includes(status);
  return {
    _id: `cashfree-order-${order.order_id || fallbackOrderId}`,
    provider: 'cashfree',
    order: { orderNumber: order.order_id || fallbackOrderId || '—' },
    eventType: captured ? 'provider_captured' : failed ? 'provider_failed' : 'provider_authorized',
    source: 'cashfree_live_api',
    amount: Number(order.amount || order.order_amount || 0),
    status: failed ? 'failed' : captured ? 'succeeded' : 'pending',
    externalPaymentId: '',
    externalOrderId: order.order_id || fallbackOrderId || '',
    occurredAt: order.created_at || null,
    providerStatus: order.status || order.order_status || '',
    method: '',
  };
};
const uniqueOrderIds = orderIds => [...new Set((Array.isArray(orderIds) ? orderIds : []).map(value => String(value || '').trim()).filter(Boolean))];

module.exports = {
  id: 'cashfree',
  contractMethods: ['createOrder', 'statusLookup', 'refund', 'verifyWebhook', 'testConnection'],

  async createOrder({ amount, orderId, currency = 'INR', customer = {}, idempotencyKey }, config) {
    assertConfig(config);
    const { data } = await httpRequest({
      url: `${baseUrl(config)}/orders`, method: 'POST', headers: headersFor(config, idempotencyKey),
      body: {
        order_id: String(orderId), order_amount: Number(amount), order_currency: currency,
        customer_details: { customer_id: String(customer.id || orderId), customer_name: customer.name || '', customer_email: customer.email || '', customer_phone: customer.phone || '' },
      },
    });
    return { id: data.cf_order_id || data.order_id, externalOrderId: data.order_id, paymentSessionId: data.payment_session_id, currency: data.order_currency || currency, amount: data.order_amount || amount, status: data.order_status || 'ACTIVE' };
  },

  async statusLookup(orderId, config) {
    assertConfig(config);
    const { data } = await httpRequest({ url: `${baseUrl(config)}/orders/${encodeURIComponent(orderId)}`, headers: headersFor(config) });
    return { externalOrderId: data.order_id, status: data.order_status, amount: data.order_amount, currency: data.order_currency, raw: data };
  },

  async listPaymentsForOrder(orderId, config) {
    assertConfig(config);
    if (!orderId) throw new Error('Cashfree order ID is required');
    const { data } = await httpRequest({ url: `${baseUrl(config)}/orders/${encodeURIComponent(orderId)}/payments`, headers: headersFor(config) });
    return Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
  },

  async listTransactionsForOrders(orderIds, config) {
    assertConfig(config);
    const ids = uniqueOrderIds(orderIds);
    const transactions = [];
    const failedOrders = [];
    for (let index = 0; index < ids.length; index += 5) {
      const batch = ids.slice(index, index + 5);
      const results = await Promise.all(batch.map(async orderId => {
        try {
          const payments = await this.listPaymentsForOrder(orderId, config);
          if (payments.length) return payments.map(payment => paymentRow(payment, orderId));
          const order = await this.statusLookup(orderId, config);
          return [orderRow(order.raw || order, orderId)];
        } catch (error) {
          failedOrders.push(orderId);
          return [];
        }
      }));
      results.forEach(rows => transactions.push(...rows));
    }
    return {
      transactions,
      pagination: { page: 1, limit: transactions.length, total: transactions.length, pages: transactions.length ? 1 : 0 },
      live: true,
      source: 'cashfree_live_api',
      dashboardScope: 'tenant_orders',
      snapshot: { ordersRequested: ids.length, ordersRead: ids.length - failedOrders.length, failedOrderLookups: failedOrders.length },
    };
  },

  async refund({ orderId, refundId, amount, reason }, config) {
    assertConfig(config);
    const { data } = await httpRequest({
      url: `${baseUrl(config)}/orders/${encodeURIComponent(orderId)}/refunds`, method: 'POST', headers: headersFor(config, refundId),
      body: { refund_id: String(refundId), refund_amount: Number(amount), refund_note: reason || 'Customer refund' },
    });
    return { refundId: data.refund_id || refundId, status: data.refund_status || data.status, raw: data };
  },

  verifyWebhook(rawBody, signature, timestamp, config) {
    if (!config.webhook_secret) throw new Error('Cashfree webhook secret is not configured');
    const payload = `${timestamp}${typeof rawBody === 'string' ? rawBody : Buffer.from(rawBody || '').toString('utf8')}`;
    const expected = crypto.createHmac('sha256', config.webhook_secret).update(payload).digest('base64');
    if (!signature || expected.length !== String(signature).length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)))) throw new Error('Cashfree webhook signature mismatch');
    return true;
  },

  async testConnection(config) {
    assertConfig(config);
    await httpRequest({ url: `${baseUrl(config)}/orders?limit=1`, headers: headersFor(config) });
    return { success: true, message: 'Cashfree connection is valid' };
  },
};
