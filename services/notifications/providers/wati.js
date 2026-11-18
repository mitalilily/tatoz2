const crypto = require('crypto');
const httpRequest = require('../../../utils/httpRequest');
const { PLATFORM_NAME } = require('../../../constants/branding');

const endpoint = (config, suffix) => {
  const base = String(config.api_endpoint || '').replace(/\/$/, '');
  if (!base) throw new Error('WATI API endpoint is required');
  if (base.includes('/api/ext/v3')) return `${base}${suffix}`;
  return `${base}/api/ext/v3${suffix}`;
};
const headersFor = config => ({ Authorization: `Bearer ${config.api_token}` });
const assertConfig = config => { if (!config.api_endpoint || !config.api_token) throw new Error('WATI endpoint and API token are required'); };

const normalizeParams = parameters => Array.isArray(parameters)
  ? parameters.map(item => typeof item === 'object' ? item : ({ name: String(item.name || ''), value: String(item.value || item) }))
  : Object.entries(parameters || {}).map(([name, value]) => ({ name, value: String(value) }));

module.exports = {
  id: 'wati',
  contractMethods: ['sendTemplateMessage', 'syncTemplates', 'verifyWebhook', 'testConnection'],

  async sendTemplateMessage({ phone, templateName, parameters = [], broadcastName = PLATFORM_NAME }, config) {
    assertConfig(config);
    if (!phone || !templateName) throw new Error('WATI phone and template name are required');
    const { data } = await httpRequest({
      url: endpoint(config, '/messageTemplates/send'), method: 'POST', headers: headersFor(config),
      body: { channel: config.channel_number || null, template_name: templateName, broadcast_name: broadcastName, receivers: [{ whatsapp_number: String(phone).replace(/\D/g, ''), custom_params: normalizeParams(parameters) }] },
    });
    return { externalId: data?.id || data?.messageId || '', status: data?.result === false ? 'failed' : 'sent', raw: data };
  },

  async syncTemplates(config) {
    assertConfig(config);
    const { data } = await httpRequest({ url: endpoint(config, '/messageTemplates'), headers: headersFor(config) });
    return data?.templates || data?.data || data;
  },

  verifyWebhook(rawBody, signature, config) {
    if (!config.webhook_secret) return true;
    const expected = crypto.createHmac('sha256', config.webhook_secret).update(typeof rawBody === 'string' ? rawBody : Buffer.from(rawBody || '').toString('utf8')).digest('hex');
    if (!signature || expected.length !== String(signature).length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)))) throw new Error('WATI webhook signature mismatch');
    return true;
  },

  async testConnection(config) {
    assertConfig(config);
    await this.syncTemplates(config);
    return { success: true, message: 'WATI connection is valid' };
  },
};
