const Settings = require('../models/Settings');

let redirectMap = new Map();
let enforceTrailingSlash = false;
let lastLoaded = 0;
let refreshPromise = null;
const CACHE_TTL = 30 * 1000; // keep admin SEO URL changes responsive

const safeTarget = (value) => {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const parsed = new URL(value, 'http://tatoz.local');
    if (parsed.origin !== 'http://tatoz.local' && process.env.ALLOW_EXTERNAL_REDIRECTS !== 'true') return null;
    return parsed.origin === 'http://tatoz.local' ? `${parsed.pathname}${parsed.search}${parsed.hash}` : value;
  } catch (_) {
    return null;
  }
};

async function loadRedirects() {
  try {
    const [redirects, trailingSlash] = await Promise.all([
      Settings.get('seo_redirects', []),
      Settings.get('seo_trailing_slash', false),
    ]);
    const newMap = new Map();
    if (Array.isArray(redirects)) {
      redirects.forEach(r => {
        const to = safeTarget(r.to);
        const code = [301, 302, 307, 308].includes(Number(r.code)) ? Number(r.code) : 301;
        if (typeof r.from === 'string' && r.from.startsWith('/') && to) {
          newMap.set(r.from.toLowerCase(), { to, code });
        }
      });
    }
    redirectMap = newMap;
    enforceTrailingSlash = !!trailingSlash;
    lastLoaded = Date.now();
  } catch (err) {
    console.error('Failed to load redirects:', err.message);
  }
}

function refreshRedirects() {
  if (!refreshPromise) {
    refreshPromise = loadRedirects().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

function redirectMiddleware(req, res, next) {
  // Skip API and static asset requests
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
    return next();
  }

  // Refresh cache if stale
  if (Date.now() - lastLoaded > CACHE_TTL) {
    // The executable entrypoint warms this cache after Mongo connects. Keep
    // this lazy refresh for long-running processes, but never perform a query
    // merely because the module was imported by an API-only test.
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) refreshRedirects().catch(() => {});
  }

  const path = req.path.toLowerCase();
  const rule = redirectMap.get(path);
  if (rule) {
    return res.redirect(rule.code, rule.to);
  }
  if (enforceTrailingSlash && req.method === 'GET' && path !== '/' && !path.endsWith('/') && !path.includes('.')) {
    const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    return res.redirect(301, `${req.path}/${query}`);
  }
  next();
}

redirectMiddleware.refresh = refreshRedirects;

module.exports = redirectMiddleware;
