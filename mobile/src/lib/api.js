import * as SecureStore from 'expo-secure-store';

const FALLBACK_API_URL = 'https://tatoz.com/api';
export const API_BASE = String(process.env.EXPO_PUBLIC_API_URL || FALLBACK_API_URL).replace(/\/+$/, '');
export const API_ORIGIN = API_BASE.replace(/\/api\/?$/, '');
const TOKEN_KEY = 'tatoz_mobile_session';

let tokenCache;

export async function readToken() {
  if (tokenCache !== undefined) return tokenCache;
  tokenCache = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
  return tokenCache;
}

export async function saveToken(token) {
  tokenCache = token || null;
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
}

export function absoluteUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || /^(blob:|data:)/i.test(raw)) return null;
  if (/^https?:\/\//i.test(raw)) return raw.replace(/^http:\/\//i, 'https://');
  if (raw.startsWith('//')) return `https:${raw}`;
  return `${API_ORIGIN}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

function queryString(params = {}) {
  const values = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '');
  if (!values.length) return '';
  const query = values.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(Array.isArray(value) ? value.join(',') : String(value))}`).join('&');
  return `?${query}`;
}

export async function request(path, options = {}) {
  const { method = 'GET', body, params, headers = {}, authenticated = true } = options;
  const token = authenticated ? await readToken() : null;
  const requestHeaders = {
    Accept: 'application/json',
    'x-client-platform': 'mobile',
    'x-session-id': `mobile_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    ...headers,
  };
  if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';
  if (token) requestHeaders.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}${queryString(params)}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || `Request failed (${response.status})`);
    error.status = response.status;
    error.code = payload.code;
    throw error;
  }
  return payload;
}

const idempotencyKey = () => `mobile:${Date.now()}:${Math.random().toString(36).slice(2, 14)}`;

export const authApi = {
  config: () => request('/auth/config', { authenticated: false }),
  me: () => request('/auth/me'),
  sendOtp: (phone, authMethod) => request('/auth/send-otp', { method: 'POST', authenticated: false, body: { phone, authMethod } }),
  verifyOtp: (phone, otp, authMethod) => request('/auth/verify-otp', { method: 'POST', authenticated: false, body: { phone, otp, authMethod } }),
  passwordLogin: (email, password, authMethod = 'password') => request('/auth/login', { method: 'POST', authenticated: false, body: { email, password, authMethod } }),
  register: (data, authMethod = 'password') => request('/auth/register', { method: 'POST', authenticated: false, body: { ...data, authMethod } }),
  googleLogin: credential => request('/auth/google', { method: 'POST', authenticated: false, body: { credential } }),
  googleConfig: () => request('/auth/google-config', { authenticated: false }),
  addAddress: address => request('/auth/addresses', { method: 'POST', body: address }),
  logout: () => request('/auth/logout', { method: 'POST' }),
};

export const siteApi = {
  get: params => request('/site', { params, authenticated: false }),
};

export const pageApi = {
  homepage: () => request('/pages/homepage', { authenticated: false }),
  bySlug: slug => request(`/pages/by-slug/${encodeURIComponent(String(slug || '').replace(/^\/+/, ''))}`, { authenticated: false }),
};

export const productApi = {
  list: params => request('/products', { params, authenticated: false }),
  bySlug: slug => request(`/products/${encodeURIComponent(slug)}`, { authenticated: false }),
  recommendations: (slug, params = {}) => request(`/products/${encodeURIComponent(slug)}/recommendations`, { params, authenticated: false }),
  reviews: (id, params = {}) => request(`/reviews/product/${encodeURIComponent(id)}`, { params, authenticated: false }),
  questions: (slug, params = {}) => request(`/products/${encodeURIComponent(slug)}/questions`, { params, authenticated: false }),
  askQuestion: (slug, question) => request(`/products/${encodeURIComponent(slug)}/questions`, { method: 'POST', body: { question } }),
  toggleWishlist: productId => request(`/auth/wishlist/${encodeURIComponent(productId)}`, { method: 'POST' }),
};

export const couponApi = {
  available: () => request('/coupons/available', { authenticated: false }),
  validate: data => request('/coupons/validate', { method: 'POST', body: data }),
};

export const categoryApi = {
  list: () => request('/categories', { authenticated: false }),
};

export const brandApi = {
  list: () => request('/brands', { authenticated: false }),
};

export const cartApi = {
  get: () => request('/cart'),
  add: (data) => request('/cart/items', { method: 'POST', body: data, headers: { 'Idempotency-Key': idempotencyKey() } }),
  update: (itemId, quantity, revision) => request(`/cart/items/${encodeURIComponent(itemId)}`, { method: 'PATCH', body: { quantity, revision }, headers: { 'Idempotency-Key': idempotencyKey() } }),
  remove: (itemId, revision) => request(`/cart/items/${encodeURIComponent(itemId)}`, { method: 'DELETE', params: { revision }, headers: { 'Idempotency-Key': idempotencyKey() } }),
  clear: revision => request('/cart', { method: 'DELETE', params: { revision }, headers: { 'Idempotency-Key': idempotencyKey() } }),
};

export const newsletterApi = {
  subscribe: email => request('/newsletter/subscribe', { method: 'POST', body: { email, source: 'mobile-app' }, authenticated: false }),
};

export const shippingApi = {
  checkDelivery: pincode => request('/shipping/check-delivery', { method: 'POST', body: { pincode }, authenticated: false }),
  quote: data => request('/shipping/quote', { method: 'POST', body: data }),
};

export const paymentApi = {
  gateways: () => request('/payments/gateways', { authenticated: false }),
  createOrder: data => request('/payments/order', { method: 'POST', body: data }),
  verify: data => request('/payments/verify', { method: 'POST', body: data }),
};

export const taxApi = {
  profile: () => request('/tax/profile'),
};

export const chatApi = {
  config: () => request('/chat/config'),
  history: params => request('/chat/history', { params }),
  start: category => request('/chat/start', { method: 'POST', body: { category } }),
  send: (id, message) => request(`/chat/${encodeURIComponent(id)}/message`, { method: 'POST', body: { message } }),
};

export const blogApi = {
  list: params => request('/blog', { params, authenticated: false }),
  bySlug: slug => request(`/blog/${encodeURIComponent(slug)}`, { authenticated: false }),
};

export const orderApi = {
  create: data => request('/orders', { method: 'POST', body: data, headers: { 'Idempotency-Key': idempotencyKey() } }),
  mine: params => request('/orders/my', { params }),
  byId: id => request(`/orders/${encodeURIComponent(id)}`),
};
