const MarketplaceConnection = require('../../models/MarketplaceConnection');
const MarketplaceListing = require('../../models/MarketplaceListing');
const MarketplaceOrder = require('../../models/MarketplaceOrder');
const MarketplaceJob = require('../../models/MarketplaceJob');
const Product = require('../../models/Product');
const { getQueue } = require('../queue/queues');
const { encrypt, decrypt, credentialHints } = require('./crypto');
const { addApprovedProductFilter, isProductApproved } = require('../productApprovalService');

const MARKETPLACE_QUEUE_ENQUEUE_TIMEOUT_MS = Number(process.env.MARKETPLACE_QUEUE_ENQUEUE_TIMEOUT_MS) || 750;

const providers = {
  amazon: require('./amazon'),
  flipkart: require('./flipkart'),
};

const providerFor = provider => {
  const adapter = providers[provider];
  if (!adapter) throw new Error(`Unsupported marketplace provider: ${provider}`);
  return adapter;
};

const loadConnection = async id => {
  const connection = await MarketplaceConnection.findById(id).select('+credentialsEncrypted');
  if (!connection) throw new Error('Marketplace connection not found');
  const storedCredentials = connection.credentialsEncrypted ? decrypt(connection.credentialsEncrypted) : {};
  // Keep connection-level seller metadata available to adapters without
  // duplicating it into the encrypted credential blob.
  connection._credentials = {
    ...storedCredentials,
    region: storedCredentials.region || connection.region,
    marketplaceId: storedCredentials.marketplaceId || connection.marketplaceId,
    sellerId: storedCredentials.sellerId || connection.sellerId,
    environment: connection.environment,
  };
  return connection;
};

const attachCredentials = (connection, credentials) => {
  connection._credentials = credentials || {};
  return connection;
};

const saveCredentials = async (connection, credentials) => {
  connection._credentials = credentials;
  connection.credentialsEncrypted = encrypt(credentials);
  connection.credentialHints = credentialHints(credentials);
  await connection.save();
  return connection;
};

const sanitiseResponse = value => {
  if (value === undefined) return null;
  try {
    const json = JSON.stringify(value);
    return JSON.parse(json.length > 30000 ? `${json.slice(0, 30000)}...` : json);
  } catch (_) { return { message: String(value) }; }
};

const addLog = async (job, level, message, meta = {}) => {
  job.logs.push({ level, message, meta: sanitiseResponse(meta), at: new Date() });
  if (job.logs.length > 200) job.logs = job.logs.slice(-200);
  await job.save();
};

const getOrCreateListing = async (connection, product, input = {}) => {
  if (!product || (product.vendor && !isProductApproved(product))) {
    const error = new Error('Only admin-approved products can be published to a marketplace');
    error.statusCode = 409;
    error.publicCode = 'PRODUCT_APPROVAL_REQUIRED';
    throw error;
  }
  if (connection.vendor && (!product.vendor || String(product.vendor) !== String(connection.vendor))) {
    const error = new Error('This product does not belong to the connected vendor');
    error.statusCode = 403;
    error.publicCode = 'MARKETPLACE_PRODUCT_SCOPE_INVALID';
    throw error;
  }
  const existing = await MarketplaceListing.findOne({ connection: connection._id, product: product._id });
  const channelSku = input.channelSku || existing?.channelSku || product.sku;
  if (!channelSku) throw new Error('Product SKU is required before marketplace publishing');
  const update = {
    channelSku,
    ...(input.remoteId !== undefined ? { remoteId: input.remoteId || undefined } : {}),
    ...(input.remoteProductId !== undefined ? { remoteProductId: input.remoteProductId || undefined } : {}),
    ...(input.productType !== undefined ? { productType: input.productType || undefined } : {}),
    ...(input.overridePayload !== undefined ? { overridePayload: input.overridePayload } : {}),
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
  };
  return MarketplaceListing.findOneAndUpdate(
    { connection: connection._id, product: product._id },
    { $set: { ...update, tenant: connection.tenant, vendor: connection.vendor }, $setOnInsert: { connection: connection._id, product: product._id, status: 'pending' } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
};

const markListing = async (listing, action, result, error = null) => {
  listing.lastAction = action;
  listing.lastSyncedAt = new Date();
  listing.lastResponse = sanitiseResponse(error?.response || result?.response || result);
  listing.status = error ? 'failed' : 'published';
  listing.lastError = error ? error.message : '';
  if (result?.remoteId) listing.remoteId = result.remoteId;
  await listing.save();
  return listing;
};

const runAction = async ({ connection, product, listing, action }) => {
  const adapter = providerFor(connection.provider);
  if (action === 'publish') return adapter.publishProduct(connection, product, listing);
  if (action === 'inventory') return adapter.updateInventory(connection, product, listing);
  if (action === 'price') return adapter.updatePrice(connection, product, listing);
  if (action === 'delete') return adapter.deleteProduct(connection, listing);
  throw new Error(`Unsupported marketplace action: ${action}`);
};

const upsertOrders = async (connection, orders) => {
  let imported = 0;
  for (const item of orders || []) {
    if (!item.remoteOrderId) continue;
    await MarketplaceOrder.findOneAndUpdate(
      { connection: connection._id, remoteOrderId: String(item.remoteOrderId) },
      { $set: { ...item, connection: connection._id, tenant: connection.tenant, vendor: connection.vendor, provider: connection.provider, lastSyncedAt: new Date() }, $setOnInsert: { importedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    imported += 1;
  }
  return imported;
};

const performJob = async inputJob => {
  // Claim queued work atomically. This makes the persisted queue safe across
  // restarts and multiple web/worker processes.
  const job = await MarketplaceJob.findOneAndUpdate(
    { _id: inputJob._id, status: 'queued' },
    { $set: { status: 'running', startedAt: new Date() } },
    { new: true },
  );
  if (!job) return inputJob;
  let connection;
  try {
    connection = await loadConnection(job.connection);
    const adapter = providerFor(connection.provider);
    await addLog(job, 'info', `Started ${job.type}`);
    const stats = { processed: 0, succeeded: 0, failed: 0, imported: 0 };
    if (job.type === 'test') {
      const result = await adapter.testConnection(connection);
      stats.succeeded = 1;
      await MarketplaceConnection.findByIdAndUpdate(connection._id, { $set: { status: 'connected', lastTestAt: new Date(), lastError: '', connectedAt: connection.connectedAt || new Date() } });
      await addLog(job, 'success', result.message || 'Connection test passed', result.data);
    } else if (job.type === 'publish-product') {
      const product = await Product.findOne({
        _id: job.product,
        ...(connection.tenant ? { tenant: connection.tenant } : {}),
        ...(connection.vendor ? { vendor: connection.vendor } : {}),
      }).populate('category', 'name slug');
      if (!product) throw new Error('Product not found for this marketplace connection');
      if (!product.isActive || !isProductApproved(product)) {
        const error = new Error('Only admin-approved active products can be published to a marketplace');
        error.statusCode = 409;
        error.publicCode = 'PRODUCT_APPROVAL_REQUIRED';
        throw error;
      }
      const listing = await MarketplaceListing.findOne({ connection: connection._id, product: product._id });
      if (!listing) throw new Error('Marketplace mapping not found for product');
      stats.processed = 1;
      try {
        const result = await runAction({ connection, product, listing, action: 'publish' });
        await markListing(listing, 'publish', result);
        stats.succeeded = 1;
        await addLog(job, 'success', `Published ${product.title}`, { productId: product._id, response: result?.response });
      } catch (error) {
        stats.failed = 1;
        await markListing(listing, 'publish', null, error);
        await addLog(job, 'error', `Failed to publish ${product.title}`, { error: error.message, response: error.response });
      }
    } else if (job.type === 'sync-products' || job.type === 'sync-inventory') {
      const filter = job.type === 'sync-products'
        ? { isActive: true, ...(connection.tenant ? { tenant: connection.tenant } : {}), ...(connection.vendor ? { vendor: connection.vendor } : {}) }
        : { connection: connection._id, status: { $in: ['published', 'pending', 'failed'] } };
      if (job.type === 'sync-products') addApprovedProductFilter(filter);
      const listings = job.type === 'sync-products'
        ? await Product.find(filter).limit(500).populate('category', 'name slug').then(async products => Promise.all(products.map(product => getOrCreateListing(connection, product).then(listing => ({ product, listing })))))
        : await MarketplaceListing.find(filter).populate({ path: 'product', populate: { path: 'category', select: 'name slug' } }).limit(500).then(items => items.filter(item => item.product && isProductApproved(item.product) && item.product.isActive).map(listing => ({ product: listing.product, listing })));
      for (const item of listings) {
        stats.processed += 1;
        try {
          const result = await runAction({ connection, product: item.product, listing: item.listing, action: job.type === 'sync-products' ? 'publish' : 'inventory' });
          await markListing(item.listing, job.type === 'sync-products' ? 'publish' : 'inventory', result);
          stats.succeeded += 1;
        } catch (error) {
          stats.failed += 1;
          await markListing(item.listing, job.type === 'sync-products' ? 'publish' : 'inventory', null, error);
          await addLog(job, 'error', `Failed ${item.product.title}`, { error: error.message });
        }
      }
    } else if (job.type === 'sync-orders' || job.type === 'sync-all') {
      const orders = await adapter.importOrders(connection, connection.lastSyncAt || Date.now() - 7 * 86400000);
      stats.imported = await upsertOrders(connection, orders);
      stats.processed = stats.imported;
      stats.succeeded = stats.imported;
      await MarketplaceConnection.findByIdAndUpdate(connection._id, { $set: { lastSyncAt: new Date(), lastError: '' } });
      await addLog(job, 'success', `Imported ${stats.imported} marketplace orders`);
      if (job.type === 'sync-all') {
        const inventoryListings = await MarketplaceListing.find({ connection: connection._id }).populate('product').limit(500);
        for (const listing of inventoryListings) {
          if (!listing.product || !listing.product.isActive || !isProductApproved(listing.product)) continue;
          try { const result = await runAction({ connection, product: listing.product, listing, action: 'inventory' }); await markListing(listing, 'inventory', result); } catch (error) { await markListing(listing, 'inventory', null, error); }
        }
        await addLog(job, 'success', `Inventory sync completed for ${inventoryListings.length} mappings`);
      }
    } else if (job.type === 'refresh-listings') {
      const listings = await MarketplaceListing.find({ connection: connection._id }).populate('product').limit(500);
      for (const listing of listings) {
        if (listing.product && (!listing.product.isActive || !isProductApproved(listing.product))) continue;
        stats.processed += 1;
        try {
          const result = await adapter.getListing(connection, listing.channelSku);
          listing.lastResponse = sanitiseResponse(result); listing.lastSyncedAt = new Date(); listing.lastError = ''; listing.status = 'published'; await listing.save(); stats.succeeded += 1;
        } catch (error) { listing.lastError = error.message; listing.status = 'failed'; await listing.save(); stats.failed += 1; }
      }
    }
    job.stats = stats;
    job.status = 'completed';
    job.finishedAt = new Date();
    await job.save();
    if (job.type !== 'test') await MarketplaceConnection.findByIdAndUpdate(connection._id, { $set: { lastError: stats.failed ? `${stats.failed} item(s) failed in ${job.type}` : '' } });
  } catch (error) {
    job.status = 'failed'; job.error = error.message; job.finishedAt = new Date(); job.stats = { ...(job.stats || {}), failed: 1 }; await job.save();
    if (connection) await MarketplaceConnection.findByIdAndUpdate(connection._id, { $set: { status: 'error', lastError: error.message } });
    try { await addLog(job, 'error', error.message, { response: error.response }); } catch (_) {}
  }
  return job;
};

const runInline = job => {
  setImmediate(() => performJob(job).catch(error => console.error('[marketplace] job failed', error)));
  return { mode: 'inline' };
};

const dispatchJob = async job => {
  const queue = getQueue('marketplace-sync');
  if (!queue) return runInline(job);

  try {
    const queueJob = queue.add(
      'marketplace.job',
      { type: 'marketplace.job', marketplaceJobId: String(job._id) },
      { jobId: `marketplace:${job._id}` },
    );
    await Promise.race([
      queueJob,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Marketplace queue enqueue timed out')), MARKETPLACE_QUEUE_ENQUEUE_TIMEOUT_MS)),
    ]);
    return { mode: 'worker' };
  } catch (error) {
    // A duplicate BullMQ job means the persisted work is already scheduled.
    // On a transient Redis failure, keep the operation available through the
    // atomic Mongo-backed fallback; a later worker run cannot double-execute it.
    if (/already exists|duplicat/i.test(String(error.message || ''))) return { mode: 'worker', duplicate: true };
    console.warn(`[marketplace] queue dispatch unavailable; using inline fallback: ${error.message}`);
    return runInline(job);
  }
};

const startJob = async ({ connectionId, type, requestedBy, productId }) => {
  const connection = await loadConnection(connectionId);
  const job = await MarketplaceJob.create({ tenant: connection.tenant, vendor: connection.vendor, connection: connection._id, provider: connection.provider, type, requestedBy, product: productId, status: 'queued' });
  // Do not make the API request wait for provider work or Redis readiness.
  void dispatchJob(job);
  return job;
};

const testConnection = async connection => {
  const adapter = providerFor(connection.provider);
  return adapter.testConnection(connection);
};

const marketplaceStats = async () => {
  const [connections, listings, orders, jobs, failures] = await Promise.all([
    MarketplaceConnection.countDocuments(),
    MarketplaceListing.countDocuments(),
    MarketplaceOrder.countDocuments(),
    MarketplaceJob.countDocuments({ status: { $in: ['queued', 'running'] } }),
    MarketplaceListing.countDocuments({ status: 'failed' }),
  ]);
  return { connections, listings, orders, activeJobs: jobs, failedListings: failures };
};

module.exports = {
  providers,
  providerFor,
  loadConnection,
  attachCredentials,
  saveCredentials,
  getOrCreateListing,
  startJob,
  dispatchJob,
  performJob,
  testConnection,
  upsertOrders,
  marketplaceStats,
};
