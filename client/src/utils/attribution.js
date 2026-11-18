const STORAGE_KEY = 'tatoz_utm_attribution';
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

const readStored = () => {
  if (typeof sessionStorage === 'undefined') return {};
  try {
    const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch (_) {
    return {};
  }
};

const writeStored = value => {
  if (typeof sessionStorage === 'undefined') return value;
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch (_) { /* storage is optional */ }
  return value;
};

const valuesFromSearch = search => {
  const params = new URLSearchParams(search || '');
  return UTM_KEYS.reduce((result, key) => {
    const value = params.get(key);
    if (value) result[key] = value.slice(0, 500);
    return result;
  }, {});
};

export const captureAttribution = (search = '', pathname = '') => {
  const previous = readStored();
  const incoming = valuesFromSearch(search);
  const now = new Date().toISOString();
  const page = String(pathname || '/').slice(0, 500);
  const browserReferrer = typeof document !== 'undefined' ? String(document.referrer || '').slice(0, 1000) : '';
  const next = { ...previous };

  if (Object.keys(incoming).length) {
    if (!previous.firstTouch) next.firstTouch = { ...incoming, page, referrer: browserReferrer, at: now };
    next.lastTouch = { ...incoming, page, referrer: browserReferrer, at: now };
    Object.assign(next, incoming);
  } else if (!previous.firstPage) {
    next.firstPage = page;
    next.firstSeenAt = now;
  }
  if (!next.firstPage) next.firstPage = next.firstTouch?.page || page;
  if (!next.firstSeenAt) next.firstSeenAt = next.firstTouch?.at || now;
  next.lastPage = page;
  next.lastSeenAt = now;
  if (browserReferrer && !next.referrer) next.referrer = browserReferrer;
  return writeStored(next);
};

export const getAttribution = () => readStored();

export const getOrderAttribution = () => {
  const value = getAttribution();
  return {
    ...UTM_KEYS.reduce((result, key) => {
      if (value[key]) result[key] = value[key];
      return result;
    }, {}),
    source: value.utm_source || value.source || '',
    medium: value.utm_medium || value.medium || '',
    campaign: value.utm_campaign || value.campaign || '',
    term: value.utm_term || value.term || '',
    content: value.utm_content || value.content || '',
    landingPage: value.firstPage || value.firstTouch?.page || '',
    firstPage: value.firstPage || value.firstTouch?.page || '',
    lastPage: value.lastPage || value.lastTouch?.page || '',
    firstSeenAt: value.firstSeenAt || value.firstTouch?.at || '',
    lastSeenAt: value.lastSeenAt || value.lastTouch?.at || '',
    referrer: value.referrer || value.firstTouch?.referrer || '',
  };
};
