const crypto = require('crypto');
const { URL } = require('url');
const request = require('./http');
const { PLATFORM_NAME } = require('../../constants/branding');

const tokenCache = new Map();
const SERVICE = 'execute-api';

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const hmac = (key, value, encoding) => crypto.createHmac('sha256', key).update(value).digest(encoding);
const encode = value => encodeURIComponent(String(value)).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

const endpointFor = (credentials) => {
  if (credentials.endpoint) return credentials.endpoint.replace(/\/$/, '');
  const region = credentials.region || 'eu-west-1';
  const suffix = credentials.environment === 'sandbox' ? 'sandbox.' : '';
  const domain = region === 'us-west-2' ? 'fe' : region.startsWith('us-') ? 'na' : 'eu';
  return `https://${suffix}sellingpartnerapi-${domain}.amazon.com`;
};

const canonicalQuery = target => [...target.searchParams.entries()]
  .map(([key, value]) => [encode(key), encode(value)])
  .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))
  .map(([key, value]) => `${key}=${value}`).join('&');

const signedHeaders = (target, headers) => {
  const merged = { host: target.host };
  Object.entries(headers).forEach(([key, value]) => { merged[key.toLowerCase()] = String(value).trim().replace(/\s+/g, ' '); });
  const keys = Object.keys(merged).sort();
  return {
    canonical: keys.map(key => `${key}:${merged[key]}\n`).join(''),
    names: keys.join(';'),
    values: merged,
  };
};

const sign = ({ method, target, headers, body, accessKey, secretKey, sessionToken, region }) => {
  const amzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const date = amzDate.slice(0, 8);
  const payloadHash = sha256(body || '');
  const requestHeaders = {
    ...headers,
    host: target.host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
  };
  if (sessionToken) requestHeaders['x-amz-security-token'] = sessionToken;
  const canonical = signedHeaders(target, requestHeaders);
  const canonicalRequest = [
    method.toUpperCase(),
    target.pathname || '/',
    canonicalQuery(target),
    canonical.canonical,
    canonical.names,
    payloadHash,
  ].join('\n');
  const scope = `${date}/${region}/${SERVICE}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256(canonicalRequest)}`;
  const dateKey = hmac(`AWS4${secretKey}`, date);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, SERVICE);
  const signingKey = hmac(serviceKey, 'aws4_request');
  const signature = hmac(signingKey, stringToSign, 'hex');
  requestHeaders.Authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${canonical.names}, Signature=${signature}`;
  return requestHeaders;
};

const credentialsFor = connection => connection._credentials || {};

const getLwaToken = async (connection) => {
  const credentials = credentialsFor(connection);
  if (!credentials.clientId || !credentials.clientSecret || !credentials.refreshToken) {
    throw new Error('Amazon LWA client ID, client secret and refresh token are required');
  }
  const cacheKey = String(connection._id);
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.accessToken;
  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: credentials.refreshToken,
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
  }).toString();
  const response = await request({
    url: credentials.lwaTokenUrl || 'https://api.amazon.com/auth/o2/token',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  tokenCache.set(cacheKey, { accessToken: response.data.access_token, expiresAt: Date.now() + Math.max(60, Number(response.data.expires_in || 3600) - 120) * 1000 });
  return response.data.access_token;
};

const apiRequest = async (connection, { method = 'GET', path, query = {}, body = null, retry = true }) => {
  const credentials = credentialsFor(connection);
  if (!credentials.awsAccessKeyId || !credentials.awsSecretAccessKey) {
    throw new Error('Amazon AWS access key ID and secret access key are required for SP-API signing');
  }
  const target = new URL(`${endpointFor({ ...credentials, environment: connection.environment })}${path}`);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') target.searchParams.set(key, String(value));
  });
  const bodyValue = body === null || body === undefined ? '' : JSON.stringify(body);
  const headers = sign({
    method,
    target,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'x-amz-access-token': await getLwaToken(connection) },
    body: bodyValue,
    accessKey: credentials.awsAccessKeyId,
    secretKey: credentials.awsSecretAccessKey,
    sessionToken: credentials.awsSessionToken,
    region: credentials.region || 'eu-west-1',
  });
  try {
    return await request({ url: target.toString(), method, headers, body: bodyValue || null });
  } catch (error) {
    if (retry && error.status === 401) {
      tokenCache.delete(String(connection._id));
      return apiRequest(connection, { method, path, query, body, retry: false });
    }
    throw error;
  }
};

const marketplaceId = connection => credentialsFor(connection).marketplaceId || connection.marketplaceId || 'A21TJRUUN4KGV';
const sellerId = connection => credentialsFor(connection).sellerId || connection.sellerId;
const languageTag = connection => credentialsFor(connection).languageTag || 'en_IN';
const currency = connection => credentialsFor(connection).currency || 'INR';

const offerAttributes = (connection, product) => ({
  fulfillment_availability: [{ fulfillment_channel_code: 'DEFAULT', quantity: Math.max(0, Number(product.stock || 0)) }],
  purchasable_offer: [{ currency: currency(connection), our_price: [{ schedule: [{ value_with_tax: Number(product.price || 0) }] }] }],
});

const listingBody = (connection, product, listing) => {
  const credentials = credentialsFor(connection);
  const attributes = {
    item_name: [{ value: product.title, language_tag: languageTag(connection), marketplace_id: marketplaceId(connection) }],
    brand: [{ value: product.brand || credentials.defaultBrand || PLATFORM_NAME, language_tag: languageTag(connection), marketplace_id: marketplaceId(connection) }],
    manufacturer: [{ value: product.brand || credentials.defaultBrand || PLATFORM_NAME, language_tag: languageTag(connection), marketplace_id: marketplaceId(connection) }],
    product_description: [{ value: product.description || product.title, language_tag: languageTag(connection), marketplace_id: marketplaceId(connection) }],
    bullet_point: (product.tags || []).slice(0, 5).map(value => ({ value, language_tag: languageTag(connection), marketplace_id: marketplaceId(connection) })),
    ...offerAttributes(connection, product),
  };
  const override = listing?.overridePayload && typeof listing.overridePayload === 'object' ? listing.overridePayload : {};
  return {
    productType: listing?.productType || credentials.defaultProductType || 'PRODUCT',
    requirements: 'LISTING',
    attributes: { ...attributes, ...(override.attributes || {}) },
    ...override,
  };
};

const productIdentifierQuery = connection => ({ marketplaceIds: marketplaceId(connection), includedData: 'summaries,attributes,offers,fulfillmentAvailability,issues' });

module.exports = {
  id: 'amazon',
  displayName: 'Amazon SP-API',
  getAuthorizeUrl(connection, state, redirectUri) {
    const credentials = credentialsFor(connection);
    const base = credentials.authUrl || 'https://sellercentral.amazon.in/apps/authorize/consent';
    const params = new URLSearchParams({ application_id: credentials.clientId || '', state, version: credentials.version || 'beta' });
    if (redirectUri) params.set('redirect_uri', redirectUri);
    return `${base}?${params.toString()}`;
  },
  async exchangeCode(connection, code, redirectUri) {
    const credentials = credentialsFor(connection);
    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      redirect_uri: redirectUri,
    }).toString();
    const response = await request({ url: credentials.lwaTokenUrl || 'https://api.amazon.com/auth/o2/token', method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
    return response.data;
  },
  async testConnection(connection) {
    const response = await apiRequest(connection, { path: '/sellers/v1/marketplaceParticipations' });
    return { message: 'Amazon SP-API credentials are valid', data: response.data };
  },
  async getProductTypeDefinition(connection, productType) {
    const response = await apiRequest(connection, { path: `/definitions/2020-09-01/productTypes/${encodeURIComponent(productType)}`, query: { marketplaceIds: marketplaceId(connection), requirements: 'LISTING', locale: languageTag(connection) } });
    return response.data;
  },
  async getListing(connection, sku) {
    const response = await apiRequest(connection, { path: `/listings/2021-08-01/items/${encodeURIComponent(sellerId(connection))}/${encodeURIComponent(sku)}`, query: productIdentifierQuery(connection) });
    return response.data;
  },
  async publishProduct(connection, product, listing) {
    if (!sellerId(connection)) throw new Error('Amazon seller ID is required');
    const sku = listing.channelSku || product.sku;
    if (!sku) throw new Error('Product SKU is required before publishing to Amazon');
    if (listing.remoteId) {
      const patches = [
        { op: 'replace', path: '/attributes/fulfillment_availability', value: offerAttributes(connection, product).fulfillment_availability },
        { op: 'replace', path: '/attributes/purchasable_offer', value: offerAttributes(connection, product).purchasable_offer },
      ];
      const response = await apiRequest(connection, { method: 'PATCH', path: `/listings/2021-08-01/items/${encodeURIComponent(sellerId(connection))}/${encodeURIComponent(sku)}`, query: { marketplaceIds: marketplaceId(connection), productType: listing.productType || credentialsFor(connection).defaultProductType || 'PRODUCT', requirements: 'LISTING_OFFER_ONLY' }, body: { productType: listing.productType || credentialsFor(connection).defaultProductType || 'PRODUCT', patches } });
      return { remoteId: listing.remoteId, response: response.data };
    }
    const response = await apiRequest(connection, { method: 'PUT', path: `/listings/2021-08-01/items/${encodeURIComponent(sellerId(connection))}/${encodeURIComponent(sku)}`, query: { marketplaceIds: marketplaceId(connection) }, body: listingBody(connection, product, listing) });
    return { remoteId: response.data?.sku || sku, response: response.data };
  },
  async updateInventory(connection, product, listing) {
    if (!listing.channelSku) throw new Error('Amazon channel SKU is required');
    const productType = listing.productType || credentialsFor(connection).defaultProductType || 'PRODUCT';
    const response = await apiRequest(connection, { method: 'PATCH', path: `/listings/2021-08-01/items/${encodeURIComponent(sellerId(connection))}/${encodeURIComponent(listing.channelSku)}`, query: { marketplaceIds: marketplaceId(connection), productType, requirements: 'LISTING_OFFER_ONLY' }, body: { productType, patches: [{ op: 'replace', path: '/attributes/fulfillment_availability', value: offerAttributes(connection, product).fulfillment_availability }] } });
    return { response: response.data };
  },
  async updatePrice(connection, product, listing) {
    if (!listing.channelSku) throw new Error('Amazon channel SKU is required');
    const productType = listing.productType || credentialsFor(connection).defaultProductType || 'PRODUCT';
    const response = await apiRequest(connection, { method: 'PATCH', path: `/listings/2021-08-01/items/${encodeURIComponent(sellerId(connection))}/${encodeURIComponent(listing.channelSku)}`, query: { marketplaceIds: marketplaceId(connection), productType, requirements: 'LISTING_OFFER_ONLY' }, body: { productType, patches: [{ op: 'replace', path: '/attributes/purchasable_offer', value: offerAttributes(connection, product).purchasable_offer }] } });
    return { response: response.data };
  },
  async deleteProduct(connection, listing) {
    const response = await apiRequest(connection, { method: 'DELETE', path: `/listings/2021-08-01/items/${encodeURIComponent(sellerId(connection))}/${encodeURIComponent(listing.channelSku)}`, query: { marketplaceIds: marketplaceId(connection) } });
    return response.data;
  },
  async importOrders(connection, since) {
    const query = { MarketplaceIds: marketplaceId(connection), CreatedAfter: new Date(since || Date.now() - 7 * 86400000).toISOString(), OrderStatuses: 'Unshipped,PartiallyShipped,Shipped,InvoiceUnconfirmed' };
    const all = [];
    let nextToken = null;
    do {
      const response = await apiRequest(connection, { path: '/orders/v0/orders', query: nextToken ? { MarketplaceIds: marketplaceId(connection), NextToken: nextToken } : query });
      const payload = response.data || {};
      all.push(...(payload.Orders || []));
      nextToken = payload.NextToken || null;
    } while (nextToken && all.length < 500);
    return all.map(order => ({
      remoteOrderId: order.AmazonOrderId,
      status: order.OrderStatus,
      fulfillmentStatus: order.FulfillmentChannel,
      orderDate: order.PurchaseDate,
      currency: order.OrderTotal?.CurrencyCode,
      total: Number(order.OrderTotal?.Amount || 0),
      buyerDisplay: order.BuyerInfo?.BuyerEmail || '',
      restrictedDataRequired: true,
      raw: { AmazonOrderId: order.AmazonOrderId, PurchaseDate: order.PurchaseDate, OrderStatus: order.OrderStatus, FulfillmentChannel: order.FulfillmentChannel, MarketplaceId: order.MarketplaceId, OrderTotal: order.OrderTotal },
    }));
  },
  async confirmShipment(connection, orderId, shipment) {
    const body = { marketplaceId: marketplaceId(connection), codCollectionMethod: shipment.codCollectionMethod || 'DirectPayment', packageDetail: { carrierCode: shipment.carrierCode, trackingNumber: shipment.trackingNumber, shipDate: shipment.shipDate || new Date().toISOString(), orderItems: shipment.orderItems || [] } };
    const response = await apiRequest(connection, { method: 'POST', path: `/orders/v0/orders/${encodeURIComponent(orderId)}/shipmentConfirmation`, body });
    return response.data;
  },
};
