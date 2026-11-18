const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const Redis = require('ioredis');

const isDev = process.env.NODE_ENV !== 'production';
let redisClient;
const makeRedisStore = (prefix) => redisClient ? new RedisStore({
  prefix,
  sendCommand: (...args) => redisClient.call(...args),
}) : undefined;

if (process.env.REDIS_URL) {
  redisClient = new Redis(process.env.REDIS_URL, {
    // Establish the connection during app startup. Keeping the offline queue
    // enabled prevents the first request from racing Redis readiness and
    // receiving a "Stream isn't writeable" error from rate-limit-redis.
    lazyConnect: false,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: true,
  });
  redisClient.on('error', (error) => console.error('[rate-limit] Redis error:', error.message));
} else if (!isDev) {
  console.warn('[rate-limit] REDIS_URL is not configured; using per-process limits. Configure Redis before horizontal scaling.');
}

const createLimiter = (windowMs, max, message, prefix) =>
  rateLimit({
    windowMs,
    max,
    message: { success: false, message },
    standardHeaders: true,
    legacyHeaders: false,
    // Health probes must remain useful while Redis is starting or recovering.
    skip: req => req.path === '/live' || req.path === '/health',
    ...(redisClient ? { store: makeRedisStore(prefix) } : {}),
    passOnStoreError: isDev,
    validate: { xForwardedForHeader: false },
  });

// Explicit env overrides exist for load/stress harnesses (including the
// Selenium E2E suite, whose navigation density exceeds production budgets).
// Defaults are unchanged, so production behaviour is identical unless set.
const authLimiter = createLimiter(15 * 60 * 1000, Number(process.env.RATE_LIMIT_AUTH_MAX) || (isDev ? 200 : 20), 'Too many login attempts, please try again after 15 minutes', 'tatoz:rate:auth:');
const apiLimiter = createLimiter(15 * 60 * 1000, Number(process.env.RATE_LIMIT_API_MAX) || (isDev ? 5000 : 500), 'Too many requests, please try again later', 'tatoz:rate:api:');
const strictLimiter = createLimiter(60 * 60 * 1000, Number(process.env.RATE_LIMIT_STRICT_MAX) || (isDev ? 200 : 10), 'Too many attempts, please try again after an hour', 'tatoz:rate:strict:');

module.exports = { authLimiter, apiLimiter, strictLimiter };
