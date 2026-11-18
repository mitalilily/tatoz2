const crypto = require('crypto');
const asyncHandler = require('express-async-handler');
const MarketplaceConnection = require('../models/MarketplaceConnection');
const MarketplaceListing = require('../models/MarketplaceListing');
const MarketplaceOrder = require('../models/MarketplaceOrder');
const MarketplaceJob = require('../models/MarketplaceJob');
const Product = require('../models/Product');
const { encrypt, decrypt, credentialHints } = require('../services/marketplace/crypto');
const marketplace = require('../services/marketplace');

const publicConnection = connection => ({
  _id: connection._id,
  provider: connection.provider,
  name: connection.name,
  environment: connection.environment,
  enabled: connection.enabled,
  status: connection.status,
  region: connection.region,
  marketplaceId: connection.marketplaceId,
  sellerId: connection.sellerId,
  settings: connection.settings || {},
  credentialHints: connection.credentialHints || {},
  lastTestAt: connection.lastTestAt,
  lastSyncAt: connection.lastSyncAt,
  lastError: connection.lastError,
  connectedAt: connection.connectedAt,
  createdAt: connection.createdAt,
  updatedAt: connection.updatedAt,
});

const getCredentials = connection => connection.credentialsEncrypted ? decrypt(connection.credentialsEncrypted) : {};
const redirectUri = provider => {
  const explicit = provider === 'amazon' ? process.env.AMAZON_MARKETPLACE_REDIRECT_URI : process.env.FLIPKART_MARKETPLACE_REDIRECT_URI;
  if (explicit) return explicit;
  const base = (process.env.PUBLIC_API_URL || process.env.CLIENT_URL || 'http://localhost:5000').replace(/\/$/, '');
  return `${base}/api/marketplace/oauth/${provider}/callback`;
};

const mergeCredentials = (current, incoming = {}) => {
  const merged = { ...current };
  Object.entries(incoming).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') merged[key] = value;
  });
  return merged;
};

const saveConnectionCredentials = async (connection, credentials) => {
  connection.credentialsEncrypted = encrypt(credentials);
  connection.credentialHints = credentialHints(credentials);
  await connection.save();
};

const getConnections = asyncHandler(async (req, res) => {
  const connections = await MarketplaceConnection.find().sort({ provider: 1, createdAt: -1 });
  res.json({ success: true, connections: connections.map(publicConnection) });
});

const createConnection = asyncHandler(async (req, res) => {
  const { provider, name, environment = 'production', enabled = true, region, marketplaceId, sellerId, settings = {}, credentials = {} } = req.body;
  if (!['amazon', 'flipkart'].includes(provider)) { res.status(400); throw new Error('provider must be amazon or flipkart'); }
  if (!name?.trim()) { res.status(400); throw new Error('Connection name is required'); }
  const connection = await MarketplaceConnection.create({ provider, name: name.trim(), environment, enabled, region: region || (provider === 'amazon' ? 'eu-west-1' : ''), marketplaceId, sellerId, settings, credentialsEncrypted: encrypt(credentials), credentialHints: credentialHints(credentials), createdBy: req.user._id });
  res.status(201).json({ success: true, connection: publicConnection(connection) });
});

const updateConnection = asyncHandler(async (req, res) => {
  const connection = await MarketplaceConnection.findById(req.params.id).select('+credentialsEncrypted');
  if (!connection) { res.status(404); throw new Error('Marketplace connection not found'); }
  const { name, environment, enabled, region, marketplaceId, sellerId, settings, credentials } = req.body;
  if (name !== undefined) connection.name = String(name).trim();
  if (environment !== undefined) connection.environment = environment;
  if (enabled !== undefined) connection.enabled = Boolean(enabled);
  if (region !== undefined) connection.region = region;
  if (marketplaceId !== undefined) connection.marketplaceId = marketplaceId;
  if (sellerId !== undefined) connection.sellerId = sellerId;
  if (settings !== undefined) connection.settings = settings;
  const merged = mergeCredentials(getCredentials(connection), credentials);
  connection.credentialsEncrypted = encrypt(merged);
  connection.credentialHints = credentialHints(merged);
  await connection.save();
  res.json({ success: true, connection: publicConnection(connection) });
});

const deleteConnection = asyncHandler(async (req, res) => {
  const connection = await MarketplaceConnection.findById(req.params.id);
  if (!connection) { res.status(404); throw new Error('Marketplace connection not found'); }
  await Promise.all([
    MarketplaceListing.deleteMany({ connection: connection._id }),
    MarketplaceOrder.deleteMany({ connection: connection._id }),
    MarketplaceJob.deleteMany({ connection: connection._id }),
    MarketplaceConnection.deleteOne({ _id: connection._id }),
  ]);
  res.json({ success: true, message: 'Marketplace connection removed' });
});

const authorizeConnection = asyncHandler(async (req, res) => {
  const connection = await marketplace.loadConnection(req.params.id);
  const credentials = connection._credentials;
  if (!(credentials.clientId || credentials.appId)) { res.status(400); throw new Error(`${connection.provider} client ID / app ID is required before authorization`); }
  const state = crypto.randomBytes(24).toString('hex');
  connection.oauthState = state;
  connection.oauthStateExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await connection.save();
  const url = marketplace.providerFor(connection.provider).getAuthorizeUrl(connection, state, redirectUri(connection.provider));
  res.json({ success: true, authorizationUrl: url, redirectUri: redirectUri(connection.provider) });
});

const oauthCallback = asyncHandler(async (req, res) => {
  const provider = req.params.provider;
  const code = req.query.code || req.query.spapi_oauth_code;
  const state = req.query.state;
  const connectionId = req.query.connection_id || req.query.connectionId;
  let connection = connectionId ? await MarketplaceConnection.findById(connectionId).select('+credentialsEncrypted +oauthState +oauthStateExpiresAt') : null;
  if (!connection && state) connection = await MarketplaceConnection.findOne({ oauthState: state }).select('+credentialsEncrypted +oauthState +oauthStateExpiresAt');
  if (!connection || connection.provider !== provider || !code || connection.oauthState !== state || !connection.oauthStateExpiresAt || connection.oauthStateExpiresAt < new Date()) {
    res.status(400);
    return res.send('<h2>Marketplace authorization failed</h2><p>Invalid or expired authorization state. You can close this window.</p>');
  }
  try {
    connection._credentials = getCredentials(connection);
    const token = await marketplace.providerFor(provider).exchangeCode(connection, code, redirectUri(provider), state);
    const credentials = { ...connection._credentials, refreshToken: token.refresh_token || connection._credentials.refreshToken, accessToken: token.access_token || connection._credentials.accessToken, sellerId: req.query.selling_partner_id || connection._credentials.sellerId };
    connection.credentialsEncrypted = encrypt(credentials);
    connection.credentialHints = credentialHints(credentials);
    connection.status = 'connected'; connection.connectedAt = new Date(); connection.lastError = ''; connection.oauthState = undefined; connection.oauthStateExpiresAt = undefined;
    await connection.save();
    res.send('<script>window.opener&&window.opener.postMessage({type:"marketplace-authorized"},"*");window.close();</script><h2>Marketplace connected</h2><p>You can close this window and return to the admin panel.</p>');
  } catch (error) {
    connection.status = 'error'; connection.lastError = error.message; await connection.save();
    res.status(502).send(`<h2>Marketplace authorization failed</h2><p>${String(error.message).replace(/[<>]/g, '')}</p>`);
  }
});

const testConnection = asyncHandler(async (req, res) => {
  const connection = await marketplace.loadConnection(req.params.id);
  try {
    const result = await marketplace.testConnection(connection);
    await MarketplaceConnection.findByIdAndUpdate(connection._id, { $set: { status: 'connected', lastTestAt: new Date(), lastError: '', connectedAt: connection.connectedAt || new Date() } });
    res.json({ success: true, message: result.message, data: result.data });
  } catch (error) {
    await MarketplaceConnection.findByIdAndUpdate(connection._id, { $set: { status: 'error', lastTestAt: new Date(), lastError: error.message } });
    res.status(error.status && error.status >= 400 && error.status < 500 ? error.status : 502);
    throw error;
  }
});

const getProductTypeDefinition = asyncHandler(async (req, res) => {
  const connection = await marketplace.loadConnection(req.params.id);
  if (connection.provider !== 'amazon') { res.status(400); throw new Error('Product Type Definitions are an Amazon SP-API feature'); }
  const productType = req.params.productType || connection._credentials.defaultProductType || 'PRODUCT';
  const data = await marketplace.providerFor('amazon').getProductTypeDefinition(connection, productType);
  res.json({ success: true, productType, data });
});

const startSync = asyncHandler(async (req, res) => {
  const allowed = ['publish-product', 'sync-products', 'sync-inventory', 'sync-orders', 'sync-all', 'refresh-listings'];
  const type = req.body.type || 'sync-all';
  if (!allowed.includes(type)) { res.status(400); throw new Error('Unsupported marketplace sync type'); }
  let productId = req.body.productId;
  if (type === 'publish-product') {
    if (!productId) { res.status(400); throw new Error('productId is required'); }
    const product = await Product.findById(productId);
    if (!product) { res.status(404); throw new Error('Product not found'); }
    await marketplace.getOrCreateListing(await marketplace.loadConnection(req.params.id), product, req.body.mapping || {});
  }
  const job = await marketplace.startJob({ connectionId: req.params.id, type, requestedBy: req.user._id, productId });
  res.status(202).json({ success: true, message: 'Marketplace job queued', job });
});

const getJob = asyncHandler(async (req, res) => {
  const job = await MarketplaceJob.findById(req.params.jobId).populate('product', 'title sku').populate('connection', 'name provider');
  if (!job) { res.status(404); throw new Error('Marketplace job not found'); }
  res.json({ success: true, job });
});

const getJobs = asyncHandler(async (req, res) => {
  const filter = req.query.connectionId ? { connection: req.query.connectionId } : {};
  const jobs = await MarketplaceJob.find(filter).populate('connection', 'name provider').populate('product', 'title sku').sort({ createdAt: -1 }).limit(Math.min(Number(req.query.limit) || 50, 200));
  res.json({ success: true, jobs });
});

const getListings = asyncHandler(async (req, res) => {
  const filter = req.query.connectionId ? { connection: req.query.connectionId } : {};
  const listings = await MarketplaceListing.find(filter).populate('product', 'title sku price stock thumbnail images').populate('connection', 'name provider').sort({ updatedAt: -1 }).limit(Math.min(Number(req.query.limit) || 200, 500));
  res.json({ success: true, listings });
});

const upsertMapping = asyncHandler(async (req, res) => {
  const connection = await marketplace.loadConnection(req.params.id);
  const product = await Product.findById(req.body.productId);
  if (!product) { res.status(404); throw new Error('Product not found'); }
  const listing = await marketplace.getOrCreateListing(connection, product, req.body);
  res.json({ success: true, listing });
});

const getOrders = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.connectionId) filter.connection = req.query.connectionId;
  if (req.query.provider) filter.provider = req.query.provider;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.search) filter.remoteOrderId = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const page = Math.max(1, Number(req.query.page) || 1); const limit = Math.min(100, Number(req.query.limit) || 25);
  const [orders, total] = await Promise.all([MarketplaceOrder.find(filter).populate('connection', 'name provider').sort({ orderDate: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit), MarketplaceOrder.countDocuments(filter)]);
  res.json({ success: true, orders, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const shipmentAction = asyncHandler(async (req, res) => {
  const connection = await marketplace.loadConnection(req.params.id);
  if (connection.provider !== 'flipkart') { res.status(400); throw new Error('Shipment actions are currently supported for Flipkart connections'); }
  const adapter = marketplace.providerFor(connection.provider);
  const action = req.body.action;
  let data;
  if (action === 'pack') data = await adapter.packShipments(connection, req.body.shipments || []);
  else if (action === 'dispatch') data = await adapter.dispatchShipments(connection, req.body.shipmentIds || [], req.body.locationId);
  else if (action === 'cancel') data = await adapter.cancelShipments(connection, req.body.shipments || []);
  else if (action === 'shipments') data = await adapter.getShipments(connection, req.body.filter);
  else { res.status(400); throw new Error('Unsupported shipment action'); }
  res.json({ success: true, data });
});

const getStats = asyncHandler(async (req, res) => {
  res.json({ success: true, stats: await marketplace.marketplaceStats() });
});

module.exports = {
  publicConnection,
  getCredentials,
  mergeCredentials,
  redirectUri,
  getConnections,
  createConnection,
  updateConnection,
  deleteConnection,
  authorizeConnection,
  oauthCallback,
  testConnection,
  getProductTypeDefinition,
  startSync,
  getJob,
  getJobs,
  getListings,
  upsertMapping,
  getOrders,
  shipmentAction,
  getStats,
};
