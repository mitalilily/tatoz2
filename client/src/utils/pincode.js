// India Post public pincode lookup, cached in-memory + sessionStorage.
// Returns { state, city, cities[] } or null when not found / on failure.

const MEMORY = new Map();
const KEY = (p) => `pin:${p}`;

const readSession = (p) => {
  try {
    const raw = sessionStorage.getItem(KEY(p));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

const writeSession = (p, v) => {
  try { sessionStorage.setItem(KEY(p), JSON.stringify(v)); } catch {}
};

const fetchJson = async (url, timeoutMs = 7000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Send cookies to our same-origin tenant endpoint, but do not attach them
    // to the public India Post endpoint (its wildcard CORS response rejects
    // credentialed browser requests).
    const response = await fetch(url, { signal: controller.signal, credentials: 'same-origin' });
    if (!response.ok) throw new Error(`Pincode lookup failed with ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
};

const resultFromOffices = (offices) => ({
  state: offices[0].State,
  city: offices[0].District,
  cities: [...new Set(offices.map(o => o.District).filter(Boolean))],
  areas: [...new Set(offices.map(o => o.Name).filter(Boolean))],
});

export const lookupPincode = async (pincode) => {
  const code = String(pincode || '').replace(/\D/g, '');
  if (code.length !== 6) return null;

  if (MEMORY.has(code)) return MEMORY.get(code);
  const cached = readSession(code);
  if (cached) { MEMORY.set(code, cached); return cached; }

  try {
    // Use the tenant's own pincode registry first. This is fast, same-origin,
    // and keeps configured delivery locations working when the public API is
    // blocked by a browser extension, CORS policy, or rate limit.
    const local = await fetchJson(`/api/shipping/pincode/${code}`, 2500).catch(() => null);
    const configured = local?.configured && local.pincode;
    if (configured && (configured.city || configured.state)) {
      const result = {
        state: configured.state || '',
        city: configured.city || configured.district || '',
        cities: configured.city ? [configured.city] : [],
        areas: configured.area ? [configured.area] : [],
      };
      MEMORY.set(code, result);
      writeSession(code, result);
      return result;
    }

    const data = await fetchJson(`https://api.postalpincode.in/pincode/${code}`);
    const entry = Array.isArray(data) ? data[0] : data;
    if (!entry || entry.Status !== 'Success' || !entry.PostOffice?.length) {
      MEMORY.set(code, null);
      return null;
    }
    const result = resultFromOffices(entry.PostOffice);
    MEMORY.set(code, result);
    writeSession(code, result);
    return result;
  } catch {
    return null;
  }
};
