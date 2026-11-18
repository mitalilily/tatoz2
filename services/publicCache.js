const crypto = require('crypto');
const IORedis = require('ioredis');

const DEFAULT_TTL_SECONDS = 30;
const REDIS_COMMAND_TIMEOUT_MS = 350;
const pendingLoads = new Map();
let redis;
let redisWarningShown = false;

const hash = value => crypto.createHash('sha1').update(String(value)).digest('hex');

const requestScope = (req, tenantId) => {
  const tenant = tenantId || req?.tenant?._id;
  if (tenant) return `tenant:${String(tenant)}`;
  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || 'platform')
    .split(',')[0]
    .trim()
    .toLowerCase();
  return `host:${host || 'platform'}`;
};

const getRedis = () => {
  if (!process.env.REDIS_URL) return null;
  if (redis) return redis;
  redis = new IORedis(process.env.REDIS_URL, {
    lazyConnect: false,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: REDIS_COMMAND_TIMEOUT_MS,
    retryStrategy: () => 1000,
  });
  redis.on('error', error => {
    if (!redisWarningShown) {
      redisWarningShown = true;
      console.warn('[public-cache] Redis unavailable; public reads will use MongoDB fallback:', error.message);
    }
  });
  redis.on('ready', () => { redisWarningShown = false; });
  return redis;
};

const runRedis = async (operation, fallback) => {
  const client = getRedis();
  if (!client) return fallback;
  try {
    return await Promise.race([
      operation(client),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Redis cache command timed out')), REDIS_COMMAND_TIMEOUT_MS)),
    ]);
  } catch (error) {
    if (!redisWarningShown) {
      redisWarningShown = true;
      console.warn('[public-cache] Redis command failed; using MongoDB fallback:', error.message);
    }
    return fallback;
  }
};

const setResponseHeader = (res, name, value) => {
  if (typeof res?.set === 'function') {
    res.set(name, value);
  } else if (typeof res?.setHeader === 'function') {
    res.setHeader(name, value);
  }
};

const setHeaders = (res, status, ttl) => {
  if (!res || res.headersSent) return;
  setResponseHeader(res, 'X-Tatoz-Cache', status);
  setResponseHeader(res, 'Cache-Control', `public, max-age=5, stale-while-revalidate=${Math.max(0, ttl - 5)}`);
  if (typeof res.vary === 'function') {
    res.vary('Host');
    res.vary('X-Tenant-ID');
  }
};

const versionKey = (namespace, scope) => `tatoz:public-cache:version:${namespace}:${hash(scope)}`;
const dataKey = (namespace, scope, version, key) => `tatoz:public-cache:data:${namespace}:${hash(`${scope}:${version}:${key}`)}`;

const readVersion = async (namespace, scope) => runRedis(client => client.get(versionKey(namespace, scope)), '0');

const getOrSet = async (req, res, {
  namespace,
  key,
  loader,
  ttl = DEFAULT_TTL_SECONDS,
}) => {
  const safeTtl = Math.max(1, Math.min(300, Number(ttl) || DEFAULT_TTL_SECONDS));
  const scope = requestScope(req);
  const client = getRedis();
  if (!client) {
    setHeaders(res, 'BYPASS', safeTtl);
    return loader();
  }

  const version = await readVersion(namespace, scope);
  const cacheKey = dataKey(namespace, scope, version || '0', key);
  const raw = await runRedis(redisClient => redisClient.get(cacheKey), null);
  if (raw) {
    try {
      setHeaders(res, 'HIT', safeTtl);
      return JSON.parse(raw);
    } catch (_) {
      await runRedis(redisClient => redisClient.del(cacheKey), null);
    }
  }

  const pendingKey = `${namespace}:${scope}:${version || '0'}:${key}`;
  if (pendingLoads.has(pendingKey)) {
    const value = await pendingLoads.get(pendingKey);
    setHeaders(res, 'COALESCED', safeTtl);
    return value;
  }

  const loadPromise = Promise.resolve().then(loader);
  pendingLoads.set(pendingKey, loadPromise);
  try {
    const value = await loadPromise;
    const serialized = JSON.stringify(value);
    await runRedis(redisClient => redisClient.set(cacheKey, serialized, 'EX', safeTtl), null);
    setHeaders(res, 'MISS', safeTtl);
    return value;
  } finally {
    pendingLoads.delete(pendingKey);
  }
};

const invalidate = async (req, { namespace = 'storefront', tenantId } = {}) => {
  const scope = requestScope(req, tenantId);
  return runRedis(client => client.incr(versionKey(namespace, scope)), null);
};

const close = async () => {
  if (!redis) return;
  await redis.quit().catch(() => {});
  redis = null;
};

module.exports = { getOrSet, invalidate, requestScope, close };
