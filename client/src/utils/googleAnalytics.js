const GOOGLE_TAG_SCRIPT = 'https://www.googletagmanager.com/gtag/js';
const GA4_ID_RE = /^G-[A-Z0-9]{4,30}$/i;
const GOOGLE_ADS_ID_RE = /^AW-[A-Z0-9_-]{3,35}$/i;
const GTM_ID_RE = /^GTM-[A-Z0-9]{4,30}$/i;

const state = {
  ga4Id: '',
  googleAdsId: '',
  gtmId: '',
  configuredGa4Ids: new Set(),
  configuredAdsIds: new Set(),
  loadedScripts: new Map(),
  pageViews: new Set(),
};

const normalize = (value, pattern) => {
  const normalized = String(value || '').trim().toUpperCase();
  return pattern.test(normalized) ? normalized : '';
};

const getDebugState = () => {
  if (typeof window === 'undefined') return null;
  if (!window.__tatozAnalytics) {
    window.__tatozAnalytics = {
      ga4Id: '',
      googleAdsId: '',
      gtmId: '',
      scripts: {},
      pageViews: [],
    };
  }
  return window.__tatozAnalytics;
};

const ensureDataLayer = () => {
  if (typeof window === 'undefined') return [];
  window.dataLayer = window.dataLayer || [];
  return window.dataLayer;
};

const ensureGtag = () => {
  if (typeof window === 'undefined') return null;
  const dataLayer = ensureDataLayer();
  if (typeof window.gtag === 'function') return window.gtag;

  window.gtag = (...args) => dataLayer.push(args);
  window.gtag('js', new Date());
  return window.gtag;
};

const loadScript = (src, marker, kind, id) => {
  if (typeof document === 'undefined') return Promise.resolve(false);
  const key = `${kind}:${id}`;
  if (state.loadedScripts.has(key)) return state.loadedScripts.get(key);

  const debug = getDebugState();
  const existing = [...document.querySelectorAll(`script[${marker}]`)]
    .find(script => script.dataset.tatozAnalyticsId === id);
  if (existing?.dataset.tatozLoaded === 'true') {
    if (debug) debug.scripts[kind] = { id, loaded: true, error: false };
    const ready = Promise.resolve(true);
    state.loadedScripts.set(key, ready);
    return ready;
  }

  const promise = new Promise(resolve => {
    const script = existing || document.createElement('script');
    let settled = false;
    let timeoutId;
    const finish = loaded => {
      if (settled) return;
      settled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      script.dataset.tatozLoaded = loaded ? 'true' : 'false';
      if (debug) debug.scripts[kind] = { id, loaded, error: !loaded };
      resolve(loaded);
    };

    script.async = true;
    script.src = src;
    script.setAttribute(marker, 'true');
    script.dataset.tatozAnalyticsId = id;
    script.addEventListener('load', () => finish(true), { once: true });
    script.addEventListener('error', () => finish(false), { once: true });
    if (!existing) document.head.appendChild(script);
    timeoutId = window.setTimeout(() => finish(false), 10000);
  });

  state.loadedScripts.set(key, promise);
  return promise;
};

export const configureGoogleAnalytics = ({ ga4Id, googleAdsId } = {}) => {
  if (typeof window === 'undefined') return false;
  const normalizedGa4 = normalize(ga4Id, GA4_ID_RE);
  const normalizedAds = normalize(googleAdsId, GOOGLE_ADS_ID_RE);
  if (!normalizedGa4 && !normalizedAds) return false;

  const debug = getDebugState();
  const gtag = ensureGtag();
  if (!gtag) return false;

  state.ga4Id = normalizedGa4;
  state.googleAdsId = normalizedAds;
  if (debug) {
    debug.ga4Id = normalizedGa4;
    debug.googleAdsId = normalizedAds;
  }

  if (normalizedGa4 && !state.configuredGa4Ids.has(normalizedGa4)) {
    state.configuredGa4Ids.add(normalizedGa4);
    // Route-level page_view events are sent explicitly below. Disabling the
    // automatic first hit prevents a duplicate initial page view in an SPA.
    gtag('config', normalizedGa4, { send_page_view: false });
  }
  if (normalizedAds && !state.configuredAdsIds.has(normalizedAds)) {
    state.configuredAdsIds.add(normalizedAds);
    gtag('config', normalizedAds, { allow_enhanced_conversions: true });
  }

  const scriptId = normalizedGa4 || normalizedAds;
  loadScript(`${GOOGLE_TAG_SCRIPT}?id=${encodeURIComponent(scriptId)}`, 'data-tatoz-google-analytics-script', 'googleAnalytics', scriptId);
  return true;
};

export const configureGoogleTagManager = gtmId => {
  if (typeof window === 'undefined') return false;
  const normalizedId = normalize(gtmId, GTM_ID_RE);
  if (!normalizedId) return false;

  const debug = getDebugState();
  state.gtmId = normalizedId;
  ensureDataLayer();
  if (debug) debug.gtmId = normalizedId;

  const scriptId = normalizedId;
  const marker = 'data-tatoz-google-tag-manager-script';
  const key = `gtm:${scriptId}`;
  if (!state.loadedScripts.has(key)) {
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    loadScript(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(scriptId)}`, marker, 'googleTagManager', scriptId);
  }
  return true;
};

export const trackGooglePageView = (routeKey, config = {}) => {
  if (typeof window === 'undefined') return false;
  if (config.ga4Id || config.googleAdsId) configureGoogleAnalytics(config);
  if (config.gtmId) configureGoogleTagManager(config.gtmId);

  if (!state.ga4Id && !state.gtmId) return false;
  const key = String(routeKey || '/');
  if (state.pageViews.has(key)) return false;
  state.pageViews.add(key);

  const pagePath = `${window.location.pathname}${window.location.search}`;
  const pageLocation = window.location.href;
  const pageTitle = document.title;
  const payload = { page_title: pageTitle, page_location: pageLocation, page_path: pagePath };

  if (state.ga4Id && typeof window.gtag === 'function') {
    window.gtag('event', 'page_view', { ...payload, send_to: state.ga4Id });
  }
  if (state.gtmId) {
    ensureDataLayer().push({ event: 'tatoz_page_view', ...payload });
  }

  const debug = getDebugState();
  if (debug) {
    debug.pageViews = [...(debug.pageViews || []).slice(-99), { routeKey: key, ...payload }];
  }
  return true;
};
