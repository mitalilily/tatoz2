const META_PIXEL_SCRIPT = 'https://connect.facebook.net/en_US/fbevents.js';
const PIXEL_ID_RE = /^\d{5,20}$/;

const state = {
  pixelId: '',
  initializedIds: new Set(),
  sentEventIds: new Set(),
  pendingEvents: [],
  scriptPromise: null,
};

const normalizePixelId = value => {
  const pixelId = String(value || '').trim();
  return PIXEL_ID_RE.test(pixelId) ? pixelId : '';
};

const eventIdFor = (prefix = 'tatoz') => {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  return `${prefix}-${random}`.replace(/[^A-Za-z0-9._:-]/g, '-').slice(0, 128);
};

const ensureDebugState = () => {
  if (typeof window === 'undefined') return null;
  if (!window.__tatozMetaPixel) {
    window.__tatozMetaPixel = { pixelId: '', scriptLoaded: false, scriptError: false, events: [] };
  }
  return window.__tatozMetaPixel;
};

const installQueue = () => {
  if (typeof window === 'undefined') return null;
  if (typeof window.fbq === 'function') return window.fbq;

  const fbq = function (...args) {
    if (fbq.callMethod) fbq.callMethod.apply(fbq, args);
    else fbq.queue.push(args);
  };
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.queue = [];
  window.fbq = fbq;
  window._fbq = fbq;
  return fbq;
};

const loadScript = () => {
  if (typeof document === 'undefined') return Promise.resolve(false);
  if (state.scriptPromise) return state.scriptPromise;

  const debug = ensureDebugState();
  const existing = document.querySelector('script[data-tatoz-meta-pixel-script]');
  if (existing?.dataset.loaded === 'true') {
    if (debug) debug.scriptLoaded = true;
    return Promise.resolve(true);
  }

  state.scriptPromise = new Promise(resolve => {
    const script = existing || document.createElement('script');
    let settled = false;
    const finish = loaded => {
      if (settled) return;
      settled = true;
      script.dataset.loaded = loaded ? 'true' : 'false';
      if (debug) {
        debug.scriptLoaded = loaded;
        debug.scriptError = !loaded;
      }
      resolve(loaded);
    };

    script.async = true;
    script.src = META_PIXEL_SCRIPT;
    script.setAttribute('data-tatoz-meta-pixel-script', 'true');
    script.addEventListener('load', () => finish(true), { once: true });
    script.addEventListener('error', () => finish(false), { once: true });
    if (!existing) document.head.appendChild(script);
    // The queue remains useful when an ad blocker or a test network blocks the
    // vendor file. Do not leave the application waiting for a third party.
    window.setTimeout(() => finish(false), 8000);
  });

  return state.scriptPromise;
};

export const configureMetaPixel = pixelId => {
  if (typeof window === 'undefined') return false;
  const normalizedId = normalizePixelId(pixelId);
  const debug = ensureDebugState();
  if (!normalizedId) {
    state.pixelId = '';
    state.pendingEvents = [];
    if (debug) debug.pixelId = '';
    return false;
  }

  state.pixelId = normalizedId;
  if (debug) {
    debug.pixelId = normalizedId;
    debug.scriptError = false;
  }

  const fbq = installQueue();
  if (!fbq) return false;
  if (!state.initializedIds.has(normalizedId)) {
    state.initializedIds.add(normalizedId);
    fbq('init', normalizedId);
  }
  loadScript();
  const pending = state.pendingEvents.splice(0);
  pending.forEach(event => dispatchMetaEvent(event.eventName, event.parameters, event.options));
  return true;
};

const dispatchMetaEvent = (eventName, parameters = {}, options = {}) => {
  if (typeof window === 'undefined' || !state.pixelId || !eventName) return false;
  const fbq = installQueue();
  if (!fbq) return false;

  const eventId = options.eventId || eventIdFor(String(eventName).toLowerCase());
  if (options.dedupe !== false && state.sentEventIds.has(eventId)) return false;
  state.sentEventIds.add(eventId);

  const debug = ensureDebugState();
  if (debug) {
    debug.events = [...(debug.events || []).slice(-99), { eventName, eventId, parameters }];
  }

  const payload = parameters && typeof parameters === 'object' ? parameters : {};
  const command = options.custom ? 'trackCustom' : 'track';
  fbq(command, eventName, payload, { eventID: eventId });
  return true;
};

export const trackMetaPixel = (eventName, parameters = {}, options = {}) => {
  if (typeof window === 'undefined' || !eventName) return false;
  const eventId = options.eventId || eventIdFor(String(eventName).toLowerCase());
  const event = { eventName, parameters, options: { ...options, eventId } };
  if (!state.pixelId) {
    state.pendingEvents.push(event);
    return true;
  }
  return dispatchMetaEvent(eventName, parameters, event.options);
};

export const trackMetaPageView = routeKey => trackMetaPixel('PageView', {}, {
  eventId: `pageview-${String(routeKey || '/').slice(0, 250)}`,
});
