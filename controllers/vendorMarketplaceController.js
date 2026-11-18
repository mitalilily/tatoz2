const crypto = require('crypto');
const asyncHandler = require('express-async-handler');
const MarketplaceConnection = require('../models/MarketplaceConnection');
const MarketplaceListing = require('../models/MarketplaceListing');
const MarketplaceJob = require('../models/MarketplaceJob');
const MarketplaceOrder = require('../models/MarketplaceOrder');
const Product = require('../models/Product');
const marketplace = require('../services/marketplace');
const { encrypt, credentialHints } = require('../services/marketplace/crypto');
const { publicConnection, getCredentials, mergeCredentials, redirectUri } = require('./marketplaceController');
const { isProductApproved } = require('../services/productApprovalService');

const providerNames = new Set(['amazon', 'flipkart']);

const productOnlyError = () => {
  const error = new Error('Seller marketplace access is limited to product and inventory sync');
  error.statusCode = 403;
  error.publicCode = 'VENDOR_PRODUCT_SYNC_ONLY';
  return error;
};

const scopeFor = req => ({ tenant: req.vendor.tenant, vendor: req.vendor._id });

const connectionFor = async (req, { credentials = false } = {}) => {
  const query = MarketplaceConnection.findOne({ ...scopeFor(req), _id: req.params.id });
  if (credentials) query.select('+credentialsEncrypted +oauthState +oauthStateExpiresAt');
  const connection = await query;
  if (!connection) {
    const error = new Error('Marketplace connection not found');
    error.statusCode = 404;
    throw error;
  }
  if (credentials) {
    const saved = getCredentials(connection);
    connection._credentials = {
      ...saved,
      region: saved.region || connection.region,
      marketplaceId: saved.marketplaceId || connection.marketplaceId,
      sellerId: saved.sellerId || connection.sellerId,
      environment: connection.environment,
    };
  }
  return connection;
};

const ensureProvider = provider => {
  const normalized = String(provider || '').trim().toLowerCase();
  if (!providerNames.has(normalized)) {
    const error = new Error('provider must be amazon or flipkart');
    error.statusCode = 400;
    throw error;
  }
  return normalized;
};

const getConnections = asyncHandler(async (req, res) => {
  const connections = await MarketplaceConnection.find(scopeFor(req)).sort({ provider: 1, createdAt: -1 });
  res.json({ success: true, connections: connections.map(publicConnection) });
});

const createConnection = asyncHandler(async (req, res) => {
  const provider = ensureProvider(req.body?.provider);
  const name = String(req.body?.name || `${provider === 'amazon' ? 'Amazon' : 'Flipkart'} seller account`).trim();
  if (!name) { res.status(400); throw new Error('Connection name is required'); }
  const credentials = req.body?.credentials && typeof req.body.credentials === 'object' ? req.body.credentials : {};
  const connection = await MarketplaceConnection.create({
    ...scopeFor(req),
    provider,
    name,
    environment: req.body?.environment || 'production',
    enabled: req.body?.enabled !== false,
    region: req.body?.region || (provider === 'amazon' ? 'eu-west-1' : ''),
    marketplaceId: req.body?.marketplaceId || '',
    sellerId: req.body?.sellerId || '',
    settings: req.body?.settings && typeof req.body.settings === 'object' ? req.body.settings : {},
    credentialsEncrypted: encrypt(credentials),
    credentialHints: credentialHints(credentials),
    createdBy: req.user._id,
  });
  res.status(201).json({ success: true, connection: publicConnection(connection) });
});

const updateConnection = asyncHandler(async (req, res) => {
  const connection = await connectionFor(req, { credentials: true });
  const body = req.body || {};
  if (body.name !== undefined) connection.name = String(body.name).trim();
  if (body.environment !== undefined) connection.environment = body.environment;
  if (body.enabled !== undefined) connection.enabled = Boolean(body.enabled);
  if (body.region !== undefined) connection.region = body.region;
  if (body.marketplaceId !== undefined) connection.marketplaceId = body.marketplaceId;
  if (body.sellerId !== undefined) connection.sellerId = body.sellerId;
  if (body.settings !== undefined) connection.settings = body.settings;
  const credentials = mergeCredentials(getCredentials(connection), body.credentials);
  connection.credentialsEncrypted = encrypt(credentials);
  connection.credentialHints = credentialHints(credentials);
  await connection.save();
  res.json({ success: true, connection: publicConnection(connection) });
});

const deleteConnection = asyncHandler(async (req, res) => {
  const connection = await connectionFor(req);
  await Promise.all([
    MarketplaceListing.deleteMany({ ...scopeFor(req), connection: connection._id }),
    MarketplaceOrder.deleteMany({ ...scopeFor(req), connection: connection._id }),
    MarketplaceJob.deleteMany({ ...scopeFor(req), connection: connection._id }),
    MarketplaceConnection.deleteOne({ ...scopeFor(req), _id: connection._id }),
  ]);
  res.json({ success: true, message: 'Marketplace connection removed' });
});

const authorizeConnection = asyncHandler(async (req, res) => {
  const connection = await connectionFor(req, { credentials: true });
  const credentials = connection._credentials || {};
  if (!(credentials.clientId || credentials.appId)) {
    res.status(400);
    throw new Error(`${connection.provider} client ID / app ID is required before authorization`);
  }
  const state = crypto.randomBytes(24).toString('hex');
  connection.oauthState = state;
  connection.oauthStateExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await connection.save();
  const url = marketplace.providerFor(connection.provider).getAuthorizeUrl(connection, state, redirectUri(connection.provider));
  res.json({ success: true, authorizationUrl: url, redirectUri: redirectUri(connection.provider) });
});

const testConnection = asyncHandler(async (req, res) => {
  const connection = await connectionFor(req, { credentials: true });
  try {
    const result = await marketplace.testConnection(connection);
    await MarketplaceConnection.updateOne({ ...scopeFor(req), _id: connection._id }, { $set: { status: 'connected', lastTestAt: new Date(), lastError: '', connectedAt: connection.connectedAt || new Date() } });
    res.json({ success: true, message: result.message, data: result.data });
  } catch (error) {
    await MarketplaceConnection.updateOne({ ...scopeFor(req), _id: connection._id }, { $set: { status: 'error', lastTestAt: new Date(), lastError: error.message } });
    res.status(error.status && error.status >= 400 && error.status < 500 ? error.status : 502);
    throw error;
  }
});

const getProductTypeDefinition = asyncHandler(async (req, res) => {
  const connection = await connectionFor(req, { credentials: true });
  if (connection.provider !== 'amazon') { res.status(400); throw new Error('Product Type Definitions are an Amazon SP-API feature'); }
  const productType = req.params.productType || connection._credentials.defaultProductType || 'PRODUCT';
  const data = await marketplace.providerFor('amazon').getProductTypeDefinition(connection, productType);
  res.json({ success: true, productType, data });
});

const vendorProducts = async req => {
  return Product.find({ vendor: req.vendor._id, tenant: req.vendor.tenant })
    .select('title slug sku price stock thumbnail images approvalStatus lifecycleStatus isActive')
    .sort({ createdAt: -1 }).limit(500).lean();
};

const startSync = asyncHandler(async (req, res) => {
  const allowed = ['publish-product', 'sync-products', 'sync-inventory', 'refresh-listings'];
  const type = req.body?.type || 'sync-all';
  if (!allowed.includes(type)) {
    res.status(403);
    throw productOnlyError();
  }
  const connection = await connectionFor(req, { credentials: true });
  let productId = req.body?.productId;
  if (type === 'publish-product') {
    if (!productId) { res.status(400); throw new Error('productId is required'); }
    const product = await Product.findOne({ _id: productId, vendor: req.vendor._id, tenant: req.vendor.tenant }).populate('category', 'name slug');
    if (!product) { res.status(404); throw new Error('Product not found'); }
    if (!isProductApproved(product)) {
      res.status(409);
      const error = new Error('Only admin-approved products can be synced to Amazon or Flipkart');
      error.statusCode = 409;
      error.publicCode = 'PRODUCT_APPROVAL_REQUIRED';
      throw error;
    }
    if (!product.isActive) { res.status(409); throw new Error('Only active products can be synced to Amazon or Flipkart'); }
    await marketplace.getOrCreateListing(connection, product, req.body.mapping || {});
  }
  const job = await marketplace.startJob({ connectionId: connection._id, type, requestedBy: req.user._id, productId });
  res.status(202).json({ success: true, message: 'Marketplace sync job queued', job });
});

const getJobs = asyncHandler(async (req, res) => {
  const filter = { vendor: req.vendor._id };
  if (req.query.connectionId) filter.connection = req.query.connectionId;
  const jobs = await MarketplaceJob.find(filter).populate('connection', 'name provider').populate('product', 'title sku').sort({ createdAt: -1 }).limit(Math.min(Number(req.query.limit) || 50, 200));
  res.json({ success: true, jobs });
});

const getListings = asyncHandler(async (req, res) => {
  const filter = { vendor: req.vendor._id };
  if (req.query.connectionId) filter.connection = req.query.connectionId;
  const listings = await MarketplaceListing.find(filter).populate('product', 'title sku price stock thumbnail images approvalStatus').populate('connection', 'name provider').sort({ updatedAt: -1 }).limit(Math.min(Number(req.query.limit) || 200, 500));
  res.json({ success: true, listings });
});

const getOrders = asyncHandler(async (req, res) => {
  res.status(403);
  throw productOnlyError();
});

const getStats = asyncHandler(async (req, res) => {
  const [connections, listings, jobs, failedListings] = await Promise.all([
    MarketplaceConnection.countDocuments(scopeFor(req)),
    MarketplaceListing.countDocuments({ vendor: req.vendor._id }),
    MarketplaceJob.countDocuments({ vendor: req.vendor._id, status: { $in: ['queued', 'running'] } }),
    MarketplaceListing.countDocuments({ vendor: req.vendor._id, status: 'failed' }),
  ]);
  res.json({ success: true, stats: { connections, listings, activeJobs: jobs, failedListings, productSyncOnly: true } });
});

const getProducts = asyncHandler(async (req, res) => {
  res.json({ success: true, products: await vendorProducts(req) });
});

module.exports = { getConnections, createConnection, updateConnection, deleteConnection, authorizeConnection, testConnection, getProductTypeDefinition, startSync, getJobs, getListings, getOrders, getStats, getProducts };
