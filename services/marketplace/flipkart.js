const request = require('./http');

const tokenCache = new Map();
const BASE_URL = 'https://api.flipkart.net';

const credentialsFor = connection => connection._credentials || {};
const baseUrl = connection => (credentialsFor(connection).apiBaseUrl || BASE_URL).replace(/\/$/, '');
const locationId = connection => credentialsFor(connection).locationId || connection.settings?.locationId;
const defaultTax = connection => credentialsFor(connection).taxCode || connection.settings?.taxCode || 'GST_18';
const defaultHsn = connection => credentialsFor(connection).hsn || connection.settings?.hsn || '';

const getToken = async connection => {
  const credentials = credentialsFor(connection);
  const cacheKey = String(connection._id);
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.accessToken;
  if (credentials.accessToken && !credentials.refreshToken) {
    tokenCache.set(cacheKey, { accessToken: credentials.accessToken, expiresAt: Date.now() + 50 * 86400000 });
    return credentials.accessToken;
  }
  if (!credentials.appId || !credentials.appSecret) throw new Error('Flipkart app ID and app secret are required');
  const params = credentials.refreshToken
    ? { grant_type: 'refresh_token', refresh_token: credentials.refreshToken }
    : { grant_type: 'client_credentials', scope: 'Seller_Api' };
  const query = new URLSearchParams(params).toString();
  const basic = Buffer.from(`${credentials.appId}:${credentials.appSecret}`).toString('base64');
  const response = await request({
    url: `${baseUrl(connection)}/oauth-service/oauth/token?${query}`,
    headers: { Authorization: `Basic ${basic}`, Accept: 'application/json' },
  });
  const token = response.data.access_token;
  if (!token) throw new Error(response.data.error_description || 'Flipkart did not return an access token');
  tokenCache.set(cacheKey, { accessToken: token, expiresAt: Date.now() + Math.max(60, Number(response.data.expires_in || 3600) - 120) * 1000 });
  return token;
};

const apiRequest = async (connection, { method = 'GET', path, body = null, raw = false }) => request({
  url: path.startsWith('http') ? path : `${baseUrl(connection)}${path}`,
  method,
  headers: { Authorization: `Bearer ${await getToken(connection)}`, 'Content-Type': 'application/json; charset=utf-8' },
  body,
  raw,
});

const listingPayload = (connection, product, listing) => {
  const credentials = credentialsFor(connection);
  const sku = listing.channelSku || product.sku;
  const productId = listing.remoteProductId || credentials.defaultProductId;
  if (!sku) throw new Error('Product SKU is required before publishing to Flipkart');
  if (!productId) throw new Error('Flipkart product ID / FSN is required for this listing');
  const payload = {
    product_id: productId,
    price: { mrp: Math.round(Number(product.comparePrice || product.price)), sellingPrice: Math.round(Number(product.price)) },
    tax: { hsn: listing.metadata?.hsn || defaultHsn(connection), tax_code: listing.metadata?.taxCode || defaultTax(connection) },
    listing_status: listing.status === 'inactive' ? 'INACTIVE' : 'ACTIVE',
    fulfillment_profile: credentials.fulfillmentProfile || 'NON_FBF',
    fulfillment: {
      dispatch_sla: Number(credentials.dispatchSla || 2),
      shipping_provider: credentials.shippingProvider || 'SELLER',
      procurement_type: credentials.procurementType || 'REGULAR',
    },
    locations: [{ id: locationId(connection), status: 'ENABLED', inventory: Math.max(0, Number(product.stock || 0)) }],
    packages: [{ dimensions: { length: Number(product.dimensions?.length || 10), breadth: Number(product.dimensions?.width || 10), height: Number(product.dimensions?.height || 10), weight: Number(product.weight || 0.5) } }],
    ...((listing.overridePayload && typeof listing.overridePayload === 'object') ? listing.overridePayload : {}),
  };
  if (!payload.tax.hsn) throw new Error('Flipkart HSN is required before publishing a listing');
  if (!payload.locations[0].id) throw new Error('Flipkart location ID is required before publishing a listing');
  return { [sku]: payload };
};

const orderFromShipment = shipment => ({
  remoteOrderId: shipment.orderId || shipment.order_id || shipment.orderItemId || shipment.orderItemID || shipment.shipmentId,
  remoteShipmentId: shipment.shipmentId || shipment.shipment_id,
  status: shipment.status || shipment.shipmentStatus || shipment.state,
  fulfillmentStatus: shipment.serviceProfile || shipment.serviceProfiles,
  orderDate: shipment.orderDate || shipment.order_date,
  currency: 'INR',
  total: Number(shipment.price?.sellingPrice || shipment.amount || shipment.orderAmount || 0),
  buyerDisplay: shipment.buyerDetails?.name || shipment.customerName || '',
  raw: shipment,
});

module.exports = {
  id: 'flipkart',
  displayName: 'Flipkart Seller API',
  getAuthorizeUrl(connection, state, redirectUri) {
    const credentials = credentialsFor(connection);
    const params = new URLSearchParams({ client_id: credentials.appId || '', redirect_uri: redirectUri || '', response_type: 'code', scope: 'Seller_Api', state });
    return `${credentials.authorizeUrl || 'https://api.flipkart.net/oauth-service/oauth/authorize'}?${params.toString()}`;
  },
  async exchangeCode(connection, code, redirectUri, state) {
    const credentials = credentialsFor(connection);
    const basic = Buffer.from(`${credentials.appId}:${credentials.appSecret}`).toString('base64');
    const query = new URLSearchParams({ redirect_uri: redirectUri, grant_type: 'authorization_code', state, code }).toString();
    const response = await request({ url: `${baseUrl(connection)}/oauth-service/oauth/token?${query}`, headers: { Authorization: `Basic ${basic}` } });
    return response.data;
  },
  async testConnection(connection) {
    const response = await apiRequest(connection, { method: 'POST', path: '/listings/v3/search', body: { filters: { listing_status: 'ACTIVE' }, page_id: null } });
    return { message: 'Flipkart Seller API credentials are valid', data: response.data };
  },
  async getListing(connection, sku) {
    const response = await apiRequest(connection, { path: `/listings/v3/${encodeURIComponent(sku)}` });
    return response.data;
  },
  async publishProduct(connection, product, listing) {
    const response = await apiRequest(connection, { method: 'POST', path: '/listings/v3', body: listingPayload(connection, product, listing) });
    return { remoteId: listing.remoteProductId, response: response.data };
  },
  async updateInventory(connection, product, listing) {
    const payload = listingPayload(connection, product, listing);
    const sku = Object.keys(payload)[0];
    const value = payload[sku];
    const response = await apiRequest(connection, { method: 'POST', path: '/listings/v3/update/inventory', body: { [sku]: { product_id: value.product_id, locations: value.locations } } });
    return { response: response.data };
  },
  async updatePrice(connection, product, listing) {
    const payload = listingPayload(connection, product, listing);
    const sku = Object.keys(payload)[0];
    const value = payload[sku];
    const response = await apiRequest(connection, { method: 'POST', path: '/listings/v3/update/price', body: { [sku]: { product_id: value.product_id, price: value.price } } });
    return { response: response.data };
  },
  async importOrders(connection) {
    const states = credentialsFor(connection).preDispatchStates || ['APPROVED', 'PACKING_IN_PROGRESS', 'PACKED', 'READY_TO_DISPATCH'];
    const response = await apiRequest(connection, { method: 'POST', path: '/sellers/v3/shipments/filter/', body: { filter: { type: 'preDispatch', states, pageSize: 20, serviceProfiles: credentialsFor(connection).serviceProfiles || 'NON_FBF', mps: false } } });
    const payload = response.data || {};
    const shipments = payload.shipments || payload.shipmentDetails || payload.data || [];
    return (Array.isArray(shipments) ? shipments : []).map(orderFromShipment);
  },
  async getShipments(connection, body) {
    const response = await apiRequest(connection, { method: 'POST', path: '/sellers/v3/shipments/filter/', body: { filter: body || { type: 'preDispatch', states: ['APPROVED'], pageSize: 20 } } });
    return response.data;
  },
  async packShipments(connection, shipments) {
    const response = await apiRequest(connection, { method: 'POST', path: '/sellers/v3/shipments/labels', body: { shipments } });
    return response.data;
  },
  async dispatchShipments(connection, shipmentIds, dispatchLocationId) {
    const response = await apiRequest(connection, { method: 'POST', path: '/sellers/v3/shipments/dispatch', body: { shipmentIds, locationId: dispatchLocationId || locationId(connection) } });
    return response.data;
  },
  async cancelShipments(connection, shipments) {
    const response = await apiRequest(connection, { method: 'POST', path: '/sellers/v3/shipments/cancel', body: { shipments } });
    return response.data;
  },
  async downloadLabels(connection, shipmentIds) {
    const response = await apiRequest(connection, { method: 'GET', path: `/sellers/v3/shipments/${shipmentIds.join(',')}/labelOnly/pdf`, raw: true });
    return { data: response.data, contentType: response.headers['content-type'] || 'application/pdf' };
  },
};
