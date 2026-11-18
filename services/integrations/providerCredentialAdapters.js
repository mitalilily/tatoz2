const httpRequest = require('../../utils/httpRequest');
const smtp = require('./smtpAdapter');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const text = value => String(value || '').trim();

const httpUrl = (value, label = 'API endpoint') => {
  const raw = text(value);
  assert(raw, `${label} is required`);
  let parsed;
  try { parsed = new URL(raw); } catch (_) { throw new Error(`${label} must be a valid URL`); }
  assert(['http:', 'https:'].includes(parsed.protocol), `${label} must use HTTP or HTTPS`);
  return parsed.toString().replace(/\/$/, '');
};

const joinUrl = (base, path) => `${httpUrl(base).replace(/\/$/, '')}/${String(path || '').replace(/^\//, '')}`;
const bearer = token => ({ Authorization: `Bearer ${text(token)}` });
const basic = (username, password) => ({ Authorization: `Basic ${Buffer.from(`${text(username)}:${text(password)}`).toString('base64')}` });

const contractError = (provider, method) => new Error(`${provider} ${method} is not enabled until the provider account is approved and its operational API is configured`);

const shippingContract = provider => ({
  contractMethods: ['getRates', 'createShipment', 'trackShipment', 'cancelShipment', 'testConnection'],
  async getRates() { throw contractError(provider, 'rate calculation'); },
  async createShipment() { throw contractError(provider, 'shipment creation'); },
  async trackShipment() { throw contractError(provider, 'tracking'); },
  async cancelShipment() { throw contractError(provider, 'cancellation'); },
});

const complianceContract = provider => ({
  contractMethods: ['createInvoice', 'createEInvoice', 'createEwayBill', 'testConnection'],
  async createInvoice() { throw contractError(provider, 'invoice creation'); },
  async createEInvoice() { throw contractError(provider, 'e-invoice creation'); },
  async createEwayBill() { throw contractError(provider, 'e-waybill creation'); },
});

const marketplaceContract = provider => ({
  contractMethods: ['authorize', 'sync', 'testConnection'],
  async authorize() { throw contractError(provider, 'authorization'); },
  async sync() { throw contractError(provider, 'catalogue sync'); },
});

const operationsContract = provider => ({
  contractMethods: ['sync', 'testConnection'],
  async sync() { throw contractError(provider, 'sync'); },
});

const fraudContract = provider => ({
  contractMethods: ['score', 'testConnection'],
  async score() { throw contractError(provider, 'risk scoring'); },
});

const configuredProbe = ({ provider, config, defaultUrl, headers = {}, method = 'GET', body = null, successMessage }) => {
  const url = httpUrl(config.test_url || defaultUrl, `${provider} verification endpoint`);
  return httpRequest({ url, method, headers, body, timeout: 12000 }).then(() => ({ success: true, message: successMessage || `${provider} connection is valid` }));
};

const xpressbees = {
  activation: 'credential-test',
  ...shippingContract('XpressBees'),
  async testConnection(config) {
    const base = httpUrl(config.base_url || 'https://shipment.xpressbees.com', 'XpressBees API base URL');
    assert(config.email && config.password, 'XpressBees account email and password are required');
    const response = await httpRequest({ url: joinUrl(base, '/api/users/login'), method: 'POST', body: { email: text(config.email), password: text(config.password) }, timeout: 12000 });
    assert(response.data?.token || response.data?.data?.token || response.data?.status === true || response.data?.status === 'success', 'XpressBees returned an unexpected login response');
    return { success: true, message: 'XpressBees credentials are valid' };
  },
};

const accountCourier = (name, defaultUrl) => ({
  activation: 'credential-test',
  ...shippingContract(name),
  async testConnection(config) {
    assert(config.api_key || config.username, `${name} API key or username is required`);
    assert(config.test_url, `${name} provider API verification URL is required because the account endpoint is issued per contract`);
    return configuredProbe({
      provider: name,
      config,
      defaultUrl: config.test_url || defaultUrl,
      headers: {
        ...(config.api_key ? { Authorization: `Bearer ${text(config.api_key)}`, 'x-api-key': text(config.api_key) } : {}),
        ...(config.username ? { 'x-client-id': text(config.username) } : {}),
      },
      successMessage: `${name} API endpoint responded successfully`,
    });
  },
});

const cleartax = {
  activation: 'credential-test',
  ...complianceContract('ClearTax'),
  async testConnection(config) {
    assert(config.api_key && config.gstin, 'ClearTax access token and GSTIN are required');
    const gstin = encodeURIComponent(text(config.gstin).toUpperCase());
    await httpRequest({
      url: joinUrl(config.base_url || 'https://api.clear.in', `/einv/v1/govt/api/Master/gstin/${gstin}`),
      headers: { 'x-cleartax-auth-token': text(config.api_key), 'x-ct-auth-token': text(config.api_key), 'x-cleartax-product': 'EInvoice', gstin: text(config.gstin).toUpperCase() },
      timeout: 12000,
    });
    return { success: true, message: 'ClearTax GST API credentials are valid' };
  },
};

const irisGst = {
  activation: 'credential-test',
  ...complianceContract('IRIS GST'),
  async testConnection(config) {
    assert(config.client_id && config.client_secret && config.gstin, 'IRIS GST client ID, client secret and GSTIN are required');
    const url = httpUrl(config.auth_url || joinUrl(config.base_url || 'https://einvoice6.gsp.irisgst.com', '/eivital/v1.03/auth'), 'IRIS GST authentication URL');
    const response = await httpRequest({
      url,
      method: 'POST',
      headers: { client_id: text(config.client_id), client_secret: text(config.client_secret), gstin: text(config.gstin).toUpperCase() },
      body: { client_id: text(config.client_id), client_secret: text(config.client_secret), gstin: text(config.gstin).toUpperCase() },
      timeout: 12000,
    });
    assert(response.data?.access_token || response.data?.token || response.data?.status === true || response.data?.status === 'SUCCESS', 'IRIS GST returned an unexpected authentication response');
    return { success: true, message: 'IRIS GST credentials are valid' };
  },
};

const configurableMarketplace = (name, defaultPath = '/health') => ({
  activation: 'credential-test',
  ...marketplaceContract(name),
  async testConnection(config) {
    assert(config.api_key && config.base_url, `${name} API key and API base URL are required`);
    return configuredProbe({
      provider: name,
      config,
      defaultUrl: joinUrl(config.base_url, config.test_path || defaultPath),
      headers: { Authorization: `Bearer ${text(config.api_key)}`, 'x-api-key': text(config.api_key), ...(config.account_id ? { 'x-account-id': text(config.account_id) } : {}) },
      successMessage: `${name} API credentials are valid`,
    });
  },
});

const unicommerce = {
  activation: 'credential-test',
  ...operationsContract('Unicommerce'),
  async testConnection(config) {
    assert(config.base_url && config.username && config.password, 'Unicommerce base URL, username and password are required');
    const response = await httpRequest({
      url: `${httpUrl(config.base_url, 'Unicommerce API base URL')}/authToken?username=${encodeURIComponent(text(config.username))}&password=${encodeURIComponent(text(config.password))}`,
      timeout: 12000,
    });
    assert(response.data?.accessToken || response.data?.access_token || response.data?.status === 'SUCCESS', 'Unicommerce returned an unexpected authentication response');
    return { success: true, message: 'Unicommerce credentials are valid' };
  },
};

const zohoInventory = {
  activation: 'credential-test',
  ...operationsContract('Zoho Inventory'),
  async testConnection(config) {
    assert(config.access_token, 'Zoho Inventory access token is required');
    const base = httpUrl(config.api_domain || 'https://www.zohoapis.com', 'Zoho API domain');
    const path = `/inventory/v1/organizations${config.organization_id ? `?organization_id=${encodeURIComponent(text(config.organization_id))}` : ''}`;
    await httpRequest({ url: `${base}${path}`, headers: { Authorization: `Zoho-oauthtoken ${text(config.access_token)}` }, timeout: 12000 });
    return { success: true, message: 'Zoho Inventory access token is valid' };
  },
};

const erpnext = {
  activation: 'credential-test',
  ...operationsContract('ERPNext'),
  async testConnection(config) {
    assert(config.endpoint && config.api_key && config.api_secret, 'ERPNext endpoint, API key and API secret are required');
    await httpRequest({ url: joinUrl(config.endpoint, '/api/method/frappe.auth.get_logged_user'), headers: { Authorization: `token ${text(config.api_key)}:${text(config.api_secret)}` }, timeout: 12000 });
    return { success: true, message: 'ERPNext API credentials are valid' };
  },
};

const freshdesk = {
  activation: 'credential-test',
  contractMethods: ['createTicket', 'updateTicket', 'testConnection'],
  async testConnection(config) {
    assert(config.domain && config.api_key, 'Freshdesk domain and API key are required');
    await httpRequest({ url: joinUrl(config.domain, '/api/v2/agents/me'), headers: basic(config.api_key, 'X') , timeout: 12000 });
    return { success: true, message: 'Freshdesk API key is valid' };
  },
  async createTicket(ticket, config) {
    assert(config.domain && config.api_key, 'Freshdesk domain and API key are required');
    const { data } = await httpRequest({ url: joinUrl(config.domain, '/api/v2/tickets'), method: 'POST', headers: basic(config.api_key, 'X'), body: ticket, timeout: 12000 });
    return data;
  },
  async updateTicket(id, ticket, config) {
    assert(config.domain && config.api_key && id, 'Freshdesk domain, API key and ticket ID are required');
    const { data } = await httpRequest({ url: joinUrl(config.domain, `/api/v2/tickets/${encodeURIComponent(id)}`), method: 'PUT', headers: basic(config.api_key, 'X'), body: ticket, timeout: 12000 });
    return data;
  },
};

const zendesk = {
  activation: 'credential-test',
  contractMethods: ['createTicket', 'updateTicket', 'testConnection'],
  async testConnection(config) {
    assert(config.subdomain && config.email && config.api_key, 'Zendesk subdomain, email and API token are required');
    await httpRequest({ url: `https://${text(config.subdomain)}.zendesk.com/api/v2/users/me`, headers: basic(`${text(config.email)}/token`, config.api_key), timeout: 12000 });
    return { success: true, message: 'Zendesk API token is valid' };
  },
  async createTicket(ticket, config) {
    assert(config.subdomain && config.email && config.api_key, 'Zendesk subdomain, email and API token are required');
    const { data } = await httpRequest({ url: `https://${text(config.subdomain)}.zendesk.com/api/v2/tickets`, method: 'POST', headers: basic(`${text(config.email)}/token`, config.api_key), body: { ticket }, timeout: 12000 });
    return data;
  },
  async updateTicket(id, ticket, config) {
    assert(config.subdomain && config.email && config.api_key && id, 'Zendesk subdomain, email, API token and ticket ID are required');
    const { data } = await httpRequest({ url: `https://${text(config.subdomain)}.zendesk.com/api/v2/tickets/${encodeURIComponent(id)}`, method: 'PUT', headers: basic(`${text(config.email)}/token`, config.api_key), body: { ticket }, timeout: 12000 });
    return data;
  },
};

const intercom = {
  activation: 'credential-test',
  contractMethods: ['createTicket', 'updateTicket', 'testConnection'],
  async testConnection(config) {
    assert(config.api_key, 'Intercom access token is required');
    await httpRequest({ url: config.base_url ? joinUrl(config.base_url, '/me') : 'https://api.intercom.io/me', headers: { ...bearer(config.api_key), 'Intercom-Version': config.api_version || '2.11' }, timeout: 12000 });
    return { success: true, message: 'Intercom access token is valid' };
  },
  async createTicket(ticket, config) {
    assert(config.api_key, 'Intercom access token is required');
    const { data } = await httpRequest({ url: config.base_url ? joinUrl(config.base_url, '/conversations') : 'https://api.intercom.io/conversations', method: 'POST', headers: { ...bearer(config.api_key), 'Intercom-Version': config.api_version || '2.11' }, body: ticket, timeout: 12000 });
    return data;
  },
  async updateTicket(id, ticket, config) {
    assert(config.api_key && id, 'Intercom access token and conversation ID are required');
    const { data } = await httpRequest({ url: `${config.base_url ? joinUrl(config.base_url, '/conversations') : 'https://api.intercom.io/conversations'}/${encodeURIComponent(id)}`, method: 'PUT', headers: { ...bearer(config.api_key), 'Intercom-Version': config.api_version || '2.11' }, body: ticket, timeout: 12000 });
    return data;
  },
};

const signifyd = {
  activation: 'credential-test',
  ...fraudContract('Signifyd'),
  async testConnection(config) {
    assert(config.api_key, 'Signifyd API key is required');
    await httpRequest({ url: config.base_url ? joinUrl(config.base_url, '/v2/accounts') : 'https://api.signifyd.com/v2/accounts', headers: basic(config.api_key, ''), timeout: 12000 });
    return { success: true, message: 'Signifyd API key is valid' };
  },
};

const maxmind = {
  activation: 'credential-test',
  ...fraudContract('MaxMind'),
  async testConnection(config) {
    assert(config.account_id && config.api_key, 'MaxMind account ID and license key are required');
    await httpRequest({
      url: config.test_url || 'https://minfraud.maxmind.com/minfraud/v2.0/score',
      method: 'POST',
      headers: basic(config.account_id, config.api_key),
      body: { event: { shop_id: 'test', type: 'purchase', transaction_id: `tatoz-test-${Date.now()}` } },
      timeout: 12000,
    });
    return { success: true, message: 'MaxMind minFraud credentials are valid' };
  },
};

const razorpayRisk = {
  activation: 'credential-test',
  ...fraudContract('Razorpay Risk'),
  async testConnection(config) {
    assert(config.key_id && config.key_secret, 'Razorpay Risk key ID and key secret are required');
    await httpRequest({ url: config.test_url || 'https://api.razorpay.com/v1/payments?count=1', headers: basic(config.key_id, config.key_secret), timeout: 12000 });
    return { success: true, message: 'Razorpay Risk credentials are valid' };
  },
};

module.exports = {
  smtp,
  xpressbees,
  bluedart: accountCourier('Blue Dart', 'https://api.bluedart.com/'),
  dtdc: accountCourier('DTDC', 'https://www.dtdc.in/'),
  cleartax,
  iris_gst: irisGst,
  ondc: configurableMarketplace('ONDC'),
  meesho: configurableMarketplace('Meesho'),
  myntra: configurableMarketplace('Myntra'),
  jiomart: configurableMarketplace('JioMart'),
  unicommerce,
  zoho_inventory: zohoInventory,
  erpnext,
  freshdesk,
  zendesk,
  intercom,
  signifyd,
  maxmind,
  razorpay_risk: razorpayRisk,
};
