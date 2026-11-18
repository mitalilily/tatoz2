import axios from 'axios';
import toast from 'react-hot-toast';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  timeout: 30000,
});

const CSRF_API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  timeout: 10000,
});

let csrfTokenCache = null;
let csrfFetchPromise = null;

const invalidateCsrfToken = () => {
  csrfTokenCache = null;
  csrfFetchPromise = null;
  if (typeof document !== 'undefined') {
    // Login rotates the CSRF cookie together with the session cookie. Remove
    // the old browser-readable value so the next mutation fetches the token
    // belonging to the new session instead of reusing stale state.
    document.cookie = 'csrf_token=; Max-Age=0; path=/';
  }
};

const readCsrfToken = () => {
  if (csrfTokenCache) return csrfTokenCache;
  if (typeof document === 'undefined') return null;
  const cookie = document.cookie.split('; ').find(item => item.startsWith('csrf_token='));
  return cookie ? cookie.slice('csrf_token='.length) : null;
};

const fetchCsrfToken = async (refresh = false) => {
  // Several fire-and-forget telemetry calls can start immediately after a
  // logout/login transition. Share one token fetch so concurrent responses
  // cannot overwrite the browser cookie between request creation and send.
  if (!refresh && csrfFetchPromise) return csrfFetchPromise;
  const request = CSRF_API.get(`/auth/csrf${refresh ? '?refresh=1' : ''}`)
    .then(response => {
      csrfTokenCache = response.data?.csrfToken || readCsrfToken();
      return csrfTokenCache;
    });
  if (refresh) return request;
  csrfFetchPromise = request.finally(() => { csrfFetchPromise = null; });
  return csrfFetchPromise;
};

// Authentication uses the HttpOnly session cookie. Keeping access tokens out
// of localStorage prevents XSS from turning into a reusable account takeover.
API.interceptors.request.use(async (config) => {
  const unsafe = !['get', 'head', 'options'].includes(String(config.method || 'get').toLowerCase());
  let csrf = readCsrfToken();
  if (unsafe && !csrf && !String(config.url || '').endsWith('/auth/csrf')) {
    try { csrf = await fetchCsrfToken(); } catch (_) { /* server will return the authoritative error */ }
  }
  if (csrf) {
    try { config.headers['x-csrf-token'] = decodeURIComponent(csrf); } catch (_) { /* malformed cookie is rejected server-side */ }
  }

  // Session ID for referral tracking
  let sessionId = sessionStorage.getItem('sessionId');
  if (!sessionId) {
    sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('sessionId', sessionId);
  }
  config.headers['x-session-id'] = sessionId;

  return config;
});

// Response interceptor
API.interceptors.response.use(
  (res) => {
    const url = String(res.config?.url || '');
    if (/\/auth\/(admin\/login|google|verify-otp|logout)$/.test(url)) invalidateCsrfToken();
    return res;
  },
  async (error) => {
    const message = error.response?.data?.message || 'Something went wrong';
    const request = error.config;
    if (error.response?.status === 403 && message.toLowerCase().includes('csrf') && !request?._csrfRetry) {
      request._csrfRetry = true;
      try {
        invalidateCsrfToken();
        const csrf = await fetchCsrfToken(true);
        request.headers = request.headers || {};
        request.headers['x-csrf-token'] = csrf;
        return API(request);
      } catch (_) { /* preserve the original protected failure */ }
    }
    if (error.response?.status === 401) {
      const path = window.location.pathname;
      const isAuthPage = path === '/login' || path === '/register' || path === '/admin/login';
      const isSessionProbe = String(error.config?.url || '').endsWith('/auth/me');
      // Cart intents own their OTP recovery flow. A hard navigation here would
      // discard the in-memory product/variant/quantity intent before it can be
      // resumed after verification.
      const isCartRequest = /\/cart(?:\/|$|\?)/.test(String(error.config?.url || ''));
      if (!isAuthPage && !isSessionProbe && !isCartRequest) {
        const target = path.startsWith('/admin') ? '/admin/login' : `/login?redirect=${encodeURIComponent(path)}`;
        window.location.href = target;
      }
    }
    return Promise.reject({
      message,
      status: error.response?.status,
      code: error.response?.data?.code,
      latestRevision: error.response?.data?.latestRevision,
    });
  }
);

// Auth
export const authAPI = {
  getConfig: () => API.get('/auth/config'),
  getOtpReadiness: () => API.get('/auth/otp-readiness'),
  sendOtp: (payload, purpose = 'login') => API.post('/auth/send-otp', typeof payload === 'object' ? payload : { phone: payload, purpose }),
  verifyOtp: (payload, otp, purpose = 'login') => API.post('/auth/verify-otp', typeof payload === 'object' ? payload : { phone: payload, otp, purpose }),
  resendOtp: (payload, purpose = 'login') => API.post('/auth/resend-otp', typeof payload === 'object' ? payload : { phone: payload, purpose }),
  register: (data) => API.post('/auth/register', data),
  passwordLogin: (data) => API.post('/auth/login', data),
  googleLogin: (credential) => API.post('/auth/google', { credential }),
  adminLogin: (data) => API.post('/auth/admin/login', data),
  logout: () => API.post('/auth/logout'),
  getMe: () => API.get('/auth/me'),
  getGoogleConfig: () => API.get('/auth/google-config'),
  getCsrfToken: () => fetchCsrfToken(),
  updateProfile: (data) => API.put('/auth/profile', data),
  changePhoneSendOtp: (phone) => API.post('/auth/change-phone/send-otp', { phone }),
  changePhoneVerify: (phone, otp) => API.post('/auth/change-phone/verify', { phone, otp }),
  addAddress: (data) => API.post('/auth/addresses', data),
  toggleWishlist: (productId) => API.post(`/auth/wishlist/${productId}`),
};

// Products
export const productAPI = {
  getAll: (params, config = {}) => API.get('/products', { ...config, params }),
  getVendors: () => API.get('/products/vendors'),
  getSuggestions: (params, config = {}) => API.get('/products/suggestions', { ...config, params }),
  getBySlug: (slug) => API.get(`/products/${slug}`),
  getRecommendations: (slug, params) => API.get(`/products/${slug}/recommendations`, { params }),
  getFeatured: () => API.get('/products/featured'),
  getFlashDeals: () => API.get('/products/flash-deals'),
  // Admin
  adminGetAll: (params) => API.get('/admin/products', { params }),
  adminGetVendors: () => API.get('/admin/products/vendors'),
  adminGetById: (id) => API.get(`/admin/products/${id}`),
  create: (data) => API.post('/admin/products', data),
  update: (id, data) => API.put(`/admin/products/${id}`, data),
  review: (id, data) => API.put(`/admin/products/${id}/approval`, data),
  duplicate: (id) => API.post(`/admin/products/${id}/duplicate`),
  delete: (id) => API.delete(`/admin/products/${id}`),
  updateImages: (id, images) => API.post(`/admin/products/${id}/images`, { images }),
  upload: (formData) => API.post('/admin/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  // Vendor
  vendorGetAll: (params) => API.get('/vendor/products', { params }),
  vendorGetById: (id) => API.get(`/vendor/products/${id}`),
  vendorCreate: (data) => API.post('/vendor/products', data),
  vendorUpdate: (id, data) => API.put(`/vendor/products/${id}`, data),
  vendorDelete: (id) => API.delete(`/vendor/products/${id}`),
  vendorUpdateImages: (id, images) => API.post(`/vendor/products/${id}/images`, { images }),
  vendorUpload: (formData) => API.post('/vendor/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

export const bundleAPI = {
  list: (params) => API.get('/bundles', { params }),
  getBySlug: (slug) => API.get(`/bundles/${slug}`),
  publicQuote: (id, data) => API.post(`/bundles/${id}/quote`, data),
  addToCart: (data, idempotencyKey) => API.post('/cart/bundles', data, idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : undefined),
  adminList: (params) => API.get('/admin/bundles', { params }),
  adminGet: (id) => API.get(`/admin/bundles/${id}`),
  create: (data) => API.post('/admin/bundles', data),
  update: (id, data) => API.put(`/admin/bundles/${id}`, data),
  remove: (id) => API.delete(`/admin/bundles/${id}`),
  quote: (id, data) => API.post(`/admin/bundles/${id}/quote`, data),
  duplicate: (id) => API.post(`/admin/bundles/${id}/duplicate`),
  publish: (id) => API.post(`/admin/bundles/${id}/publish`),
  archive: (id) => API.post(`/admin/bundles/${id}/archive`),
  analytics: (id) => API.get(`/admin/bundles/${id}/analytics`),
};

// Inventory control plane
export const inventoryAPI = {
  getOverview: (params) => API.get('/admin/inventory/overview', { params }),
  getReservations: (params) => API.get('/admin/inventory/reservations', { params }),
  getMovements: (params) => API.get('/admin/inventory/movements', { params }),
};

export const warehouseAPI = {
  list: (params) => API.get('/admin/warehouses', { params }),
  create: (data) => API.post('/admin/warehouses', data),
  update: (id, data) => API.put(`/admin/warehouses/${id}`, data),
  inventory: (id, params) => API.get(`/admin/warehouses/${id}/inventory`, { params }),
  setInventory: (id, data) => API.post(`/admin/warehouses/${id}/inventory`, data),
  transfers: (params) => API.get('/admin/warehouse-transfers', { params }),
  createTransfer: (data) => API.post('/admin/warehouse-transfers', data),
  dispatchTransfer: (id) => API.post(`/admin/warehouse-transfers/${id}/dispatch`),
  receiveTransfer: (id) => API.post(`/admin/warehouse-transfers/${id}/receive`),
};

export const b2bAPI = {
  listAccounts: (params) => API.get('/admin/b2b/accounts', { params }),
  createAccount: (data) => API.post('/admin/b2b/accounts', data),
  updateAccount: (id, data) => API.put(`/admin/b2b/accounts/${id}`, data),
  listPriceRules: (params) => API.get('/admin/b2b/price-rules', { params }),
  createPriceRule: (data) => API.post('/admin/b2b/price-rules', data),
  getMyAccount: () => API.get('/b2b/me'),
  quotePrice: (params) => API.get('/b2b/price-quote', { params }),
};

export const recommendationAPI = {
  list: (params) => API.get('/admin/recommendations', { params }),
  create: (data) => API.post('/admin/recommendations', data),
  update: (id, data) => API.put(`/admin/recommendations/${id}`, data),
  delete: (id) => API.delete(`/admin/recommendations/${id}`),
};

export const codPolicyAPI = {
  get: () => API.get('/admin/cod-policy'),
  update: (data) => API.put('/admin/cod-policy', data),
  check: (data) => API.post('/shipping/cod-eligibility', data),
};

export const lifecycleAPI = {
  listPreorders: (params) => API.get('/admin/preorders', { params }),
  updatePreorderStatus: (id, data) => API.put(`/admin/preorders/${id}/status`, data),
  listPlans: (params) => API.get('/admin/subscription-plans', { params }),
  createPlan: (data) => API.post('/admin/subscription-plans', data),
  customerPreorders: (params) => API.get('/preorders', { params }),
  createPreorder: (data) => API.post('/preorders', data),
  cancelPreorder: (id) => API.post(`/preorders/${id}/cancel`),
  customerPlans: (params) => API.get('/subscription-plans', { params }),
  customerSubscriptions: (params) => API.get('/subscriptions', { params }),
  subscribe: (data) => API.post('/subscriptions', data),
  updateSubscriptionStatus: (id, data) => API.put(`/subscriptions/${id}/status`, data),
};

export const securityAPI = {
  listEvents: (params) => API.get('/admin/security-events', { params }),
  get2FA: () => API.get('/admin/security/2fa'),
  setup2FA: () => API.post('/admin/security/2fa/setup'),
  enable2FA: code => API.post('/admin/security/2fa/enable', { code }),
  disable2FA: code => API.post('/admin/security/2fa/disable', { code }),
};

// Categories
export const categoryAPI = {
  getAll: () => API.get('/categories'),
  getBySlug: (slug) => API.get(`/categories/${slug}`),
  // Admin
  adminGetAll: () => API.get('/admin/categories'),
  create: (data) => API.post('/admin/categories', data),
  update: (id, data) => API.put(`/admin/categories/${id}`, data),
  delete: (id) => API.delete(`/admin/categories/${id}`),
};

// Brands
export const brandAPI = {
  getAll: () => API.get('/brands'),
  getBySlug: (slug) => API.get(`/brands/${slug}`),
  // Admin
  adminGetAll: () => API.get('/admin/brands'),
  create: (data) => API.post('/admin/brands', data),
  update: (id, data) => API.put(`/admin/brands/${id}`, data),
  delete: (id) => API.delete(`/admin/brands/${id}`),
};

// Orders
export const orderAPI = {
  create: (data, idempotencyKey) => API.post('/orders', data, idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : undefined),
  getMyOrders: (params) => API.get('/orders/my', { params }),
  getById: (id) => {
    const guestToken = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(`tatoz_guest_order_token:${id}`) : null;
    return API.get(`/orders/${id}`, guestToken ? { params: { guestToken } } : undefined);
  },
  reorder: (id, idempotencyKey) => API.post(`/orders/${id}/reorder`, {}, { headers: { 'Idempotency-Key': idempotencyKey } }),
  // Admin
  adminGetAll: (params) => API.get('/admin/orders', { params }),
  getAttribution: (id) => API.get(`/admin/orders/${id}/attribution`),
  getShippingOptions: (id) => API.get(`/admin/orders/${id}/shipping-options`),
  shipWithCourier: (id, data) => API.post(`/admin/orders/${id}/ship`, data),
  getPackingSlip: (id) => API.get(`/admin/orders/${id}/packing-slip`),
  updateDetails: (id, data, idempotencyKey) => API.put(`/admin/orders/${id}/details`, data, idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : undefined),
  updateItems: (id, data, idempotencyKey) => API.put(`/admin/orders/${id}/items`, data, idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : undefined),
  updateStatus: (id, data) => API.put(`/admin/orders/${id}/status`, data),
  updatePayment: (id, data) => API.put(`/admin/orders/${id}/payment`, data),
};

// Provider-neutral shipment lifecycle. Customer responses contain only the
// normalized timeline; admin mutations require an idempotency key.
export const shipmentAPI = {
  getForOrder: (orderId) => API.get(`/shipping/orders/${orderId}/shipment`),
  getById: (id) => API.get(`/shipping/shipments/${id}`),
  getEvents: (id) => API.get(`/shipping/shipments/${id}/events`),
};

// Invoices are generated from the server's immutable order/tax snapshot. The
// PDF renderer may remain client-side, but it never receives browser totals as
// its source of truth.
export const invoiceAPI = {
  getForOrder: (orderId) => API.get(`/orders/${orderId}/invoice`),
  getAdmin: (params) => API.get('/admin/invoices', { params }),
  getAdminById: (id) => API.get(`/admin/invoices/${id}`),
  voidAdmin: (id, reason) => API.put(`/admin/invoices/${id}/void`, { reason }),
};

export const invoiceNoteAPI = {
  getForOrder: (orderId, params) => API.get(`/orders/${orderId}/invoice-notes`, { params }),
  getAdmin: (params) => API.get('/admin/invoice-notes', { params }),
  getAdminById: (id) => API.get(`/admin/invoice-notes/${id}`),
  create: (invoiceId, data, idempotencyKey) => API.post(`/admin/invoices/${invoiceId}/notes`, data, idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : undefined),
  void: (id, reason) => API.put(`/admin/invoice-notes/${id}/void`, { reason }),
  deliver: ({ invoiceId, noteId, channel, idempotencyKey }) => API.post(noteId ? `/admin/invoice-notes/${noteId}/deliver` : `/admin/invoices/${invoiceId}/deliver`, { invoiceId, noteId, channel }, idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : undefined),
  deliveries: (params) => API.get('/admin/invoice-notes/deliveries', { params }),
};

// Reviews
export const reviewAPI = {
  create: (data) => API.post('/reviews', data),
  getByProduct: (productId, params) => API.get(`/reviews/product/${productId}`, { params }),
  helpful: (id) => API.post(`/reviews/${id}/helpful`),
  report: (id, data) => API.post(`/reviews/${id}/report`, data),
  // Admin
  getAll: (params) => API.get('/admin/reviews', { params }),
  update: (id, data) => API.put(`/admin/reviews/${id}`, data),
  getReports: (params) => API.get('/admin/reviews/reports', { params }),
  updateReport: (id, data) => API.put(`/admin/reviews/reports/${id}`, data),
};

// Coupons
export const couponAPI = {
  getAvailable: () => API.get('/coupons/available'),
  validate: (code, orderAmount, cartItems = [], context = {}) => API.post('/coupons/validate', { code, orderAmount, cartItems, ...context }),
  // Admin
  getAll: (params) => API.get('/admin/coupons', { params }),
  create: (data) => API.post('/admin/coupons', data),
  update: (id, data) => API.put(`/admin/coupons/${id}`, data),
  delete: (id) => API.delete(`/admin/coupons/${id}`),
  getRedemptions: (id, params) => API.get(`/admin/coupons/${id}/redemptions`, { params }),
};

// Customer checkout reads only the safe, tenant-scoped tax profile fields.
export const taxAPI = {
  getProfile: () => API.get('/tax/profile'),
};

// Referral
export const referralAPI = {
  trackClick: (code, landingPage) => API.post('/referral/track', { code, landingPage }),
  // Admin
  getCodes: (params) => API.get('/admin/referral/codes', { params }),
  createCode: (data) => API.post('/admin/referral/codes', data),
  updateCode: (id, data) => API.put(`/admin/referral/codes/${id}`, data),
  deleteCode: (id) => API.delete(`/admin/referral/codes/${id}`),
  getAnalytics: (params) => API.get('/admin/referral/analytics', { params }),
  exportCSV: (params) => API.get('/admin/referral/analytics/export', { params, responseType: 'blob' }),
};

// Affiliate applications, tenant-scoped wallet, and payout workflow
export const affiliateAPI = {
  apply: (data) => API.post('/affiliate/apply', data),
  me: () => API.get('/affiliate/me'),
  payouts: () => API.get('/affiliate/payouts'),
  requestPayout: (data, idempotencyKey) => API.post('/affiliate/payouts', data, { headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {} }),
  adminGetProgram: () => API.get('/admin/affiliate/program'),
  adminUpdateProgram: (data) => API.put('/admin/affiliate/program', data),
  adminGetAffiliates: (params) => API.get('/admin/affiliate/affiliates', { params }),
  adminUpdateAffiliateStatus: (id, data) => API.put(`/admin/affiliate/affiliates/${id}/status`, data),
  adminGetPayouts: (params) => API.get('/admin/affiliate/payouts', { params }),
  adminProcessPayout: (id, data) => API.put(`/admin/affiliate/payouts/${id}/process`, data),
  adminCompletePayout: (id, data) => API.put(`/admin/affiliate/payouts/${id}/complete`, data),
  adminRejectPayout: (id, data) => API.put(`/admin/affiliate/payouts/${id}/reject`, data),
  adminAdjustBalance: (data) => API.post('/admin/affiliate/ledger/adjust', data),
};

// AI
// Dispatch credit update event when AI responses include aiCredits
function withCreditUpdate(promise) {
  return promise.then(res => {
    const aiCredits = res.data?.aiCredits ?? res.data?.remainingCredits;
    if (aiCredits !== undefined) {
      window.dispatchEvent(new CustomEvent('ai-credits-updated', { detail: { aiCredits } }));
    }
    return res;
  });
}

export const aiAPI = {
  analyzeImage: (formData, onUploadProgress) => withCreditUpdate(API.post('/admin/ai/analyze-image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    // The upload flow now returns compact listing fields only.
    timeout: 120000,
    onUploadProgress,
  })),
  getAnalyzeProgress: (analysisId) => API.get(`/admin/ai/analyze-progress/${encodeURIComponent(analysisId)}`),
  regenerate: (imageUrl, context) => withCreditUpdate(API.post('/admin/ai/regenerate', { imageUrl, additionalContext: context })),
  generateSEO: (data) => withCreditUpdate(API.post('/admin/ai/generate-seo', data)),
  getCredits: () => API.get('/admin/ai/credits'),
  getUsage: (params) => API.get('/admin/ai-usage', { params }),
  exportUsage: (params) => API.get('/admin/ai-usage/export', { params, responseType: 'blob' }),
};

// Site (public – homepage, footer)
export const siteAPI = {
  getSite: (params) => API.get('/site', { params }),
};

// Admin
export const adminAPI = {
  getDashboard: (params) => API.get('/admin/dashboard', { params }),
  getCustomization: () => API.get('/admin/customization'),
  updateCustomization: (data) => API.put('/admin/customization', data),
  uploadSiteAsset: (formData) => API.post('/admin/customization/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteSiteAsset: (url) => API.delete('/admin/customization/asset', { data: { url } }),
  getStorage: (params) => API.get('/admin/storage', { params }),
  deleteStorageBulk: (paths) => API.delete('/admin/storage/bulk', { data: { paths } }),
  deleteStorage: (path) => API.delete('/admin/storage', { data: { path } }),
  getUsers: (params) => API.get('/admin/users', { params }),
  exportCustomers: () => API.get('/admin/customers/export', { responseType: 'blob' }),
  customerImportTemplate: () => API.get('/admin/customers/import-template', { responseType: 'blob' }),
  importCustomers: formData => API.post('/admin/customers/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getSegmentCounts: () => API.get('/admin/users/segments'),
  getCustomer360: (id) => API.get(`/admin/users/${id}/360`),
  getProductIntents: () => API.get('/admin/product-intents'),
  updateUser: (id, data) => API.put(`/admin/users/${id}`, data),
  getCustomerSegments: () => API.get('/admin/customer-segments'),
  getCustomerSegment: id => API.get(`/admin/customer-segments/${id}`),
  createCustomerSegment: data => API.post('/admin/customer-segments', data),
  previewCustomerSegment: data => API.post('/admin/customer-segments/preview', data),
  updateCustomerSegment: (id, data) => API.put(`/admin/customer-segments/${id}`, data),
  applyCustomerSegment: id => API.post(`/admin/customer-segments/${id}/apply`),
  deleteCustomerSegment: id => API.delete(`/admin/customer-segments/${id}`),
  getSettings: () => API.get('/admin/settings'),
  updateSettings: (settings) => API.put('/admin/settings', { settings }),
  getStorefrontLocale: () => API.get('/admin/storefront-locale'),
  updateStorefrontLocale: (config) => API.put('/admin/storefront-locale', config),
  refreshStorefrontRates: () => API.post('/admin/storefront-locale/refresh-rates'),
  getTaxProfile: () => API.get('/admin/tax/profile'),
  updateTaxProfile: (profile) => API.put('/admin/tax/profile', profile),
  updateCategoryCommission: (id, commissionRate) => API.put(`/admin/categories/${id}/commission`, { commissionRate }),
  updateDefaultCommission: (commissionRate) => API.put('/admin/settings/commission-default', { commissionRate }),
  getProductTaxes: (params) => API.get('/admin/products/tax', { params }),
  updateProductTax: (id, data) => API.patch(`/admin/products/${id}/tax`, data),
  bulkUpdateProductTaxes: (data) => API.patch('/admin/products/tax', data),
  getSalesAnalytics: (params) => API.get('/admin/analytics/sales', { params }),
  getOperationAnalytics: (operation, params) => API.get(`/admin/analytics/operations/${encodeURIComponent(operation)}`, { params }),
  getReportTypes: () => API.get('/admin/reports/types'),
  previewReport: (params) => API.get('/admin/reports/preview', { params }),
  downloadReport: (params) => API.get('/admin/reports/excel', { params, responseType: 'blob' }),
  createNotification: (data) => API.post('/admin/notifications', data),
  previewNotificationAudience: (data) => API.post('/admin/notifications/preview', data),
  getNotifications: () => API.get('/admin/notifications'),
  listCampaigns: (params) => API.get('/admin/campaigns', { params }),
  getCampaign: id => API.get(`/admin/campaigns/${id}`),
  createCampaign: data => API.post('/admin/campaigns', data),
  updateCampaign: (id, data) => API.put(`/admin/campaigns/${id}`, data),
  executeCampaign: (id, force = false) => API.post(`/admin/campaigns/${id}/execute`, { force }),
  deleteCampaign: id => API.delete(`/admin/campaigns/${id}`),
  getIntegrations: () => API.get('/admin/integrations'),
  updateIntegration: (provider, data) => API.put(`/admin/integrations/${provider}`, data),
  testIntegration: (provider, data = {}) => API.post(`/admin/integrations/${provider}/test`, data),
  sendSmtpTestEmail: to => API.post('/admin/integrations/smtp/test-email', { to }),
  clearIntegration: provider => API.delete(`/admin/integrations/${provider}`),
  getTenantIntegrations: () => API.get('/tenant/integrations'),
  updateTenantIntegration: (provider, data) => API.put(`/tenant/integrations/${provider}`, data),
  testTenantIntegration: (provider, data = {}) => API.post(`/tenant/integrations/${provider}/test`, data),
  clearTenantIntegration: provider => API.delete(`/tenant/integrations/${provider}`),
  getModules: () => API.get('/admin/modules'),
  updateModule: (module, data) => API.put(`/admin/modules/${module}`, data),
  getModuleControlPlane: () => API.get('/admin/modules/control-plane'),
  updateAuthenticationControlPlane: data => API.put('/admin/modules/control-plane/authentication', data),
  updateShippingControlPlane: data => API.put('/admin/modules/control-plane/shipping', data),
  updatePaymentControlPlane: data => API.put('/admin/modules/control-plane/payment', data),
  getAuthPolicy: () => API.get('/admin/auth-policy'),
  updateAuthPolicy: data => API.put('/admin/auth-policy', data),
  getTenantModules: () => API.get('/tenant/modules'),
  updateTenantModule: (module, data) => API.put(`/tenant/modules/${module}`, data),
  getTenantAuthPolicy: () => API.get('/tenant/auth-policy'),
  updateTenantAuthPolicy: data => API.put('/tenant/auth-policy', data),
  getStaff: () => API.get('/admin/staff'),
  createStaff: data => API.post('/admin/staff', data),
  updateStaff: (id, data) => API.put(`/admin/staff/${id}`, data),
  resetStaffPassword: (id, data) => API.post(`/admin/staff/${id}/password`, data),
  listApiKeys: () => API.get('/admin/api-keys'),
  createApiKey: data => API.post('/admin/api-keys', data),
  revokeApiKey: id => API.delete(`/admin/api-keys/${id}`),
};

// Chat
// Product Q&A
export const questionAPI = {
  getQuestions: (slug, params) => API.get(`/products/${slug}/questions`, { params }),
  ask: (slug, question) => API.post(`/products/${slug}/questions`, { question }),
  answer: (slug, qId, text) => API.post(`/products/${slug}/questions/${qId}/answer`, { text }),
  adminGetAll: (params) => API.get('/admin/questions', { params }),
  adminUpdate: (id, data) => API.put(`/admin/questions/${id}`, data),
  adminDelete: (id) => API.delete(`/admin/questions/${id}`),
};

// Stock Alerts
export const stockAlertAPI = {
  check: (slug) => API.get(`/products/${slug}/stock-alert`),
  subscribe: (slug, email) => API.post(`/products/${slug}/stock-alert`, email ? { email } : {}),
  unsubscribe: (slug) => API.delete(`/products/${slug}/stock-alert`),
};

// Authenticated price-drop intent. The server records the authoritative
// baseline and never trusts a client-supplied current price.
export const priceDropAlertAPI = {
  check: (slug) => API.get(`/products/${slug}/price-drop-alert`),
  subscribe: (slug, targetPrice) => API.post(`/products/${slug}/price-drop-alert`, targetPrice == null ? {} : { targetPrice }),
  unsubscribe: (slug) => API.delete(`/products/${slug}/price-drop-alert`),
};

// Product Import/Export (Admin)
export const productImportAPI = {
  exportCSV: () => API.get('/admin/products/export', { responseType: 'blob' }),
  downloadTemplate: () => API.get('/admin/products/import-template', { responseType: 'blob' }),
  importCSV: (formData) => API.post('/admin/products/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

export const inventoryImportAPI = {
  exportCSV: () => API.get('/admin/inventory/export', { responseType: 'blob' }),
  downloadTemplate: () => API.get('/admin/inventory/import-template', { responseType: 'blob' }),
  importCSV: (formData) => API.post('/admin/inventory/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

export const supportAPI = {
  list: (params) => API.get('/support', { params }),
  create: (data) => API.post('/support', data),
  get: (id) => API.get(`/support/${id}`),
  reply: (id, data) => API.post(`/support/${id}/replies`, data),
  adminList: (params) => API.get('/admin/support', { params }),
  adminGet: (id) => API.get(`/admin/support/${id}`),
  adminUpdate: (id, data) => API.put(`/admin/support/${id}`, data),
  adminReply: (id, data) => API.post(`/admin/support/${id}/replies`, data),
};

// Cancellation & Refund (Customer)
export const cancellationAPI = {
  getPolicy: () => API.get('/orders/cancellation-policy'),
  checkEligibility: (orderId) => API.get(`/orders/${orderId}/cancellation-eligibility`),
  cancel: (orderId, reason) => API.post(`/orders/${orderId}/cancel`, { reason }),
  requestRefund: (orderId, formData) => API.post(`/orders/${orderId}/refund-request`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

// Returns / RMA (Customer + Admin)
export const returnAPI = {
  getForOrder: (orderId) => API.get(`/orders/${orderId}/returns`),
  create: (orderId, formData) => API.post(`/orders/${orderId}/returns`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getAll: (params) => API.get('/admin/returns', { params }),
  getOne: (id) => API.get(`/admin/returns/${id}`),
  updateStatus: (id, data) => API.put(`/admin/returns/${id}/status`, data),
};

// Refund Dashboard (Admin)
export const refundAPI = {
  getAll: (params) => API.get('/admin/refunds', { params }),
  getStats: () => API.get('/admin/refunds/stats'),
  getOne: (id) => API.get(`/admin/refunds/${id}`),
  approve: (id, data) => API.put(`/admin/refunds/${id}/approve`, data),
  reject: (id, data) => API.put(`/admin/refunds/${id}/reject`, data),
};

export const chatAPI = {
  start: (category) => withCreditUpdate(API.post('/chat/start', { category })),
  sendMessage: (id, message) => withCreditUpdate(API.post(`/chat/${id}/message`, { message })),
  getConfig: () => API.get('/chat/config'),
  getHistory: (params) => API.get('/chat/history', { params }),
  getOne: (id) => API.get(`/chat/${id}`),
};

export const chatbotAdminAPI = {
  getConfig: () => API.get('/admin/chatbot/config'),
  updateConfig: (data) => API.put('/admin/chatbot/config', data),
};

// Admin Conversations
export const conversationAPI = {
  getAll: (params) => API.get('/admin/conversations', { params }),
  getOne: (id) => API.get(`/admin/conversations/${id}`),
  update: (id, data) => API.put(`/admin/conversations/${id}`, data),
  getAnalytics: (params) => API.get('/admin/conversations/analytics', { params }),
};

// SEO Dashboard
export const seoAPI = {
  getSettings: () => API.get('/admin/seo'),
  updateSettings: (settings) => API.put('/admin/seo', { settings }),
  getPublicConfig: () => API.get('/seo/public'),
  aiGenerate: () => withCreditUpdate(API.post('/admin/seo/ai-generate', {}, { timeout: 90000 })),
  aiAudit: () => withCreditUpdate(API.post('/admin/seo/ai-audit', {}, { timeout: 45000 })),
  getContentSeoStats: (params) => API.get('/admin/seo/content-stats', { params }),
  updateItemSeo: (type, id, seo) => API.put(`/admin/seo/item/${type}/${id}`, { seo }),
  generateItemSeo: (type, id) => withCreditUpdate(API.post(`/admin/seo/item/${type}/${id}/generate`, {}, { timeout: 90000 })),
  bulkGenerateSeo: (type) => withCreditUpdate(API.post('/admin/seo/bulk-generate', { type }, { timeout: 300000 })),
};

// Google Merchant Center + Google Ads
export const merchantAPI = {
  getSettings: () => API.get('/admin/google-merchant'),
  updateSettings: (settings) => API.put('/admin/google-merchant', { settings }),
  generateFeedKey: () => API.post('/admin/google-merchant/generate-key'),
};

// Payments
export const paymentAPI = {
  getActiveGateways: () => API.get('/payments/gateways'),
  createOrder: (data) => API.post('/payments/order', { ...data, ...guestPaymentToken(data?.orderId) }),
  releaseWallet: (data) => API.post('/payments/release-wallet', { ...data, ...guestPaymentToken(data?.orderId) }),
  verify: (data) => API.post('/payments/verify', { ...data, ...guestPaymentToken(data?.orderId) }),
};

function guestPaymentToken(orderId) {
  if (typeof sessionStorage === 'undefined' || !orderId) return {};
  const token = sessionStorage.getItem(`tatoz_guest_order_token:${orderId}`);
  return token ? { guestAccessToken: token } : {};
}

// Shipping
export const shippingAPI = {
  getProvider: () => API.get('/shipping/provider'),
  getRates: (data) => API.post('/shipping/rates', data),
  quote: (data) => API.post('/shipping/quote', data),
  track: (trackingId) => API.get(`/shipping/track/${trackingId}`),
  checkDelivery: (pincode) => API.post('/shipping/check-delivery', { pincode }),
  getPincode: (pincode) => API.get(`/shipping/pincode/${pincode}`),
};

// Tenant-scoped shipping zones/rates. Courier credentials and external
// provider operations remain in their separate provider-neutral dashboards.
export const adminShippingAPI = {
  getConfig: () => API.get('/admin/shipping-rules'),
  createZone: (data) => API.post('/admin/shipping-zones', data),
  updateZone: (id, data) => API.put(`/admin/shipping-zones/${id}`, data),
  deleteZone: (id) => API.delete(`/admin/shipping-zones/${id}`),
  createRate: (data) => API.post('/admin/shipping-rates', data),
  updateRate: (id, data) => API.put(`/admin/shipping-rates/${id}`, data),
  deleteRate: (id) => API.delete(`/admin/shipping-rates/${id}`),
  listPincodes: (params) => API.get('/admin/serviceable-pincodes', { params }),
  createPincode: (data) => API.post('/admin/serviceable-pincodes', data),
  updatePincode: (id, data) => API.put(`/admin/serviceable-pincodes/${id}`, data),
  deletePincode: (id) => API.delete(`/admin/serviceable-pincodes/${id}`),
};

// Blog
export const blogAPI = {
  getPosts: (params) => API.get('/blog', { params }),
  getFeatured: () => API.get('/blog/featured'),
  getBySlug: (slug) => API.get(`/blog/${slug}`),
  getCategories: () => API.get('/blog/categories'),
  // Admin
  adminGetAll: (params) => API.get('/admin/blog', { params }),
  adminGetById: (id) => API.get(`/admin/blog/${id}`),
  create: (data) => API.post('/admin/blog', data),
  update: (id, data) => API.put(`/admin/blog/${id}`, data),
  delete: (id) => API.delete(`/admin/blog/${id}`),
  aiGenerate: (data) => withCreditUpdate(API.post('/admin/blog/ai-generate', data)),
  adminGetCategories: () => API.get('/admin/blog/categories'),
  createCategory: (data) => API.post('/admin/blog/categories', data),
  updateCategory: (id, data) => API.put(`/admin/blog/categories/${id}`, data),
  deleteCategory: (id) => API.delete(`/admin/blog/categories/${id}`),
};

// Notifications (customer) — uses separate instance to avoid 401 redirect on poll
const notifAPI = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api', withCredentials: true, timeout: 10000 });
notifAPI.interceptors.request.use((config) => {
  const csrf = readCsrfToken();
  if (csrf) {
    try { config.headers['x-csrf-token'] = decodeURIComponent(csrf); } catch (_) { /* malformed cookie is rejected server-side */ }
  }
  return config;
});

export const notificationAPI = {
  getAll: (params) => notifAPI.get('/notifications', { params }),
  getUnreadCount: () => notifAPI.get('/notifications/unread-count'),
  markAsRead: (id) => notifAPI.put(`/notifications/${id}/read`),
  markAllAsRead: () => notifAPI.put('/notifications/read-all'),
  getPreferences: () => API.get('/notifications/preferences'),
  updatePreferences: (data) => API.put('/notifications/preferences', data),
};

// Customer wallet / store credit. All balances are tenant-scoped on the API;
// the browser never calculates or mutates a balance locally.
export const walletAPI = {
  get: (params) => API.get('/wallet', { params }),
  getAdmin: (params) => API.get('/admin/wallets', { params }),
  getAdminCustomer: (id, params) => API.get(`/admin/wallets/${id}`, { params }),
  adjust: (id, data, idempotencyKey) => API.post(`/admin/wallets/${id}/adjust`, data, { headers: { 'Idempotency-Key': idempotencyKey } }),
  bulkAdjust: (data, idempotencyKey) => API.post('/admin/wallets/bulk-adjust', data, { headers: { 'Idempotency-Key': idempotencyKey } }),
};

// Customer loyalty is tenant-scoped and read-only from the storefront. Admin
// mutations remain behind the server's role and idempotency checks.
export const loyaltyAPI = {
  get: (params) => API.get('/loyalty', { params }),
  getAdmin: () => API.get('/admin/loyalty'),
  updateAdmin: (data) => API.put('/admin/loyalty', data),
  getAccounts: (params) => API.get('/admin/loyalty/accounts', { params }),
  adjust: (id, data, idempotencyKey) => API.post(`/admin/loyalty/accounts/${id}/adjust`, data, { headers: { 'Idempotency-Key': idempotencyKey } }),
  bulkAdjust: (data, idempotencyKey) => API.post('/admin/loyalty/accounts/bulk-adjust', data, { headers: { 'Idempotency-Key': idempotencyKey } }),
};

// Gift-card codes are bearer credentials. The storefront receives only a
// server-authoritative quote/last-four display; full codes are never returned
// by list/history endpoints.
export const giftCardAPI = {
  getHistory: (params) => API.get('/gift-cards', { params }),
  validate: (data) => API.post('/gift-cards/validate', data),
  getAdmin: (params) => API.get('/admin/gift-cards', { params }),
  createAdmin: (data, idempotencyKey) => API.post('/admin/gift-cards', data, { headers: { 'Idempotency-Key': idempotencyKey } }),
  createBulkAdmin: (data, idempotencyKey) => API.post('/admin/gift-cards/bulk', data, { headers: { 'Idempotency-Key': idempotencyKey } }),
  updateStatus: (id, status) => API.put('/admin/gift-cards/' + id + '/status', { status }),
  getTransactions: (id, params) => API.get('/admin/gift-cards/' + id + '/transactions', { params }),
};

// Cart Sync (for abandoned cart tracking)
export const cartSyncAPI = {
  sync: (data) => API.post('/cart/sync', data).catch(() => {}),
  recovered: () => API.post('/cart/recovered').catch(() => {}),
  // Admin
  getAbandoned: (params) => API.get('/admin/abandoned-carts', { params }),
};

// Authoritative customer cart. Every mutation carries a caller-generated
// idempotency key; server prices and revisions are the only accepted truth.
export const cartAPI = {
  get: () => API.get('/cart'),
  addItem: (data, idempotencyKey) => API.post('/cart/items', data, { headers: { 'Idempotency-Key': idempotencyKey } }),
  updateItem: (itemId, data, idempotencyKey) => API.patch(`/cart/items/${itemId}`, data, { headers: { 'Idempotency-Key': idempotencyKey } }),
  removeItem: (itemId, revision, idempotencyKey) => API.delete(`/cart/items/${itemId}`, {
    params: { revision },
    headers: { 'Idempotency-Key': idempotencyKey },
  }),
  clear: (revision, idempotencyKey) => API.delete('/cart', {
    params: { revision },
    headers: { 'Idempotency-Key': idempotencyKey },
  }),
  import: (items, idempotencyKey) => API.post('/cart/import', { items, source: 'legacy-local-cart' }, {
    headers: { 'Idempotency-Key': idempotencyKey },
  }),
};

// Click Tracking
export const trackingAPI = {
  track: (data) => API.post('/track', data).catch(() => {}), // fire-and-forget, never block UI
  // Admin
  getAnalytics: (params) => API.get('/admin/click-tracking', { params }),
  getSummary: (params) => withCreditUpdate(API.post('/admin/click-tracking/summary', params)),
};

// Legal Pages
export const legalAPI = {
  getPage: (slug) => API.get(`/legal/${slug}`),
  // Admin
  getAll: () => API.get('/admin/legal-pages'),
  update: (slug, data) => API.put(`/admin/legal-pages/${slug}`, data),
};

// Razorpay Dashboard
export const razorpayAPI = {
  getStats: () => API.get('/admin/razorpay/stats'),
  getPayments: (params) => API.get('/admin/razorpay/payments', { params }),
  getPayment: (id) => API.get(`/admin/razorpay/payments/${id}`),
  getOrders: (params) => API.get('/admin/razorpay/orders', { params }),
  getRefunds: (params) => API.get('/admin/razorpay/refunds', { params }),
  createRefund: (data) => API.post('/admin/razorpay/refunds', data),
  getSettlements: (params) => API.get('/admin/razorpay/settlements', { params }),
  getSettlement: (id) => API.get(`/admin/razorpay/settlements/${id}`),
  capturePayment: (id, data) => API.post(`/admin/razorpay/payments/${id}/capture`, data),
};

// ShipRocket Dashboard
export const shiprocketAPI = {
  getStats: () => API.get('/admin/shiprocket/stats'),
  getOrders: (params) => API.get('/admin/shiprocket/orders', { params }),
  syncOrder: (orderId) => API.post(`/admin/shiprocket/orders/${orderId}/sync`),
  cancelOrder: (orderId, data) => API.post(`/admin/shiprocket/orders/${orderId}/cancel`, data),
  bulkSync: () => API.post('/admin/shiprocket/sync'),
  createShipment: (data) => API.post('/admin/shiprocket/ship', data),
  getShipments: (params) => API.get('/admin/shiprocket/shipments', { params }),
  trackAWB: (awb) => API.get(`/admin/shiprocket/track/${awb}`),
  trackByShipment: (id) => API.get(`/admin/shiprocket/track/shipment/${id}`),
  generateLabel: (data) => API.post('/admin/shiprocket/labels', data),
  generateManifest: (data) => API.post('/admin/shiprocket/manifests', data),
  requestPickup: (data) => API.post('/admin/shiprocket/pickup', data),
  assignCourier: (data) => API.post('/admin/shiprocket/assign-courier', data),
  getRates: (data) => API.post('/admin/shiprocket/rates', data),
  getPickupLocations: () => API.get('/admin/shiprocket/pickup-locations'),
  addPickupLocation: (data) => API.post('/admin/shiprocket/pickup-locations', data),
  createReturn: (data) => API.post('/admin/shiprocket/returns', data),
  getNDR: (params) => API.get('/admin/shiprocket/ndr', { params }),
  getChannels: () => API.get('/admin/shiprocket/channels'),
  getCODOrders: (params) => API.get('/admin/shiprocket/cod', { params }),
  generateInvoice: (data) => API.post('/admin/shiprocket/invoice', data),
};

// Provider-neutral partner dashboards (each provider gets its own URL/page,
// while the secured backend keeps the operational contract shared).
export const partnerDashboardAPI = {
  paymentSummary: (provider) => API.get(`/admin/payment-providers/${provider}/summary`),
  paymentTransactions: (provider, params) => API.get(`/admin/payment-providers/${provider}/transactions`, { params }),
  paymentRefund: (provider, data) => API.post(`/admin/payment-providers/${provider}/refunds`, data),
  shippingSummary: (provider) => API.get(`/admin/shipping-providers/${provider}/summary`),
  shippingShipments: (provider, params) => API.get(`/admin/shipping-providers/${provider}/shipments`, { params }),
  shippingRates: (provider, data) => API.post(`/admin/shipping-providers/${provider}/rates`, data),
  shippingTrack: (provider, data) => API.post(`/admin/shipping-providers/${provider}/track`, data),
  shippingCreate: (provider, data) => API.post(`/admin/shipping-providers/${provider}/shipments`, data),
  shippingUpdateStatus: (id, data, idempotencyKey) => API.put(`/admin/shipments/${id}/status`, data, idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : undefined),
  shippingSync: (id) => API.post(`/admin/shipments/${id}/sync`),
  shippingEvents: (id) => API.get(`/admin/shipments/${id}/events`),
};

// Courier Management (Shiprocket sub-feature)
export const courierAPI = {
  // Selection
  listCouriers: () => API.get('/admin/shiprocket/couriers'),
  toggleCourier: (id, enabled) => API.patch(`/admin/shiprocket/couriers/${id}`, { enabled }),
  refreshCouriers: (data) => API.post('/admin/shiprocket/couriers/refresh', data || {}),
  // Priority
  reorderCouriers: (order) => API.patch('/admin/shiprocket/couriers/priority', { order }),
  // Rules
  listRules: () => API.get('/admin/shiprocket/couriers/rules'),
  createRule: (data) => API.post('/admin/shiprocket/couriers/rules', data),
  updateRule: (id, data) => API.patch(`/admin/shiprocket/couriers/rules/${id}`, data),
  deleteRule: (id) => API.delete(`/admin/shiprocket/couriers/rules/${id}`),
  // Activity
  listActivity: (params) => API.get('/admin/shiprocket/couriers/activity', { params }),
  // Auto-assign
  getAutoAssignSettings: () => API.get('/admin/shiprocket/couriers/auto-assign'),
  updateAutoAssignSettings: (data) => API.patch('/admin/shiprocket/couriers/auto-assign', data),
  runAutoAssignNow: (data) => API.post('/admin/shiprocket/couriers/auto-assign/run', data || {}),
  // Stressed
  getStressedCouriers: () => API.get('/admin/shiprocket/couriers/stressed'),
  updateStressThresholds: (data) => API.patch('/admin/shiprocket/couriers/stressed/thresholds', data),
  toggleManualStress: (id, data) => API.patch(`/admin/shiprocket/couriers/stressed/${id}`, data),
  recomputeMetrics: (days = 7) => API.post('/admin/shiprocket/couriers/metrics/recompute', { days }),
};

export const pageAPI = {
  getHomepage: (token) => API.get('/pages/homepage' + (token ? `?token=${encodeURIComponent(token)}` : '')),
  getBySlug: (slug, token) => API.get(`/pages/by-slug/${encodeURIComponent(slug.replace(/^\//, ''))}` + (token ? `?token=${encodeURIComponent(token)}` : '')),
  getChrome: (kind) => API.get(`/pages/chrome/${kind}`),
};

export const adminPageAPI = {
  // The same builder UI is shared by platform admins and vendors. The vendor
  // editor opens under /vendor/page-builder, so all mutations automatically
  // use the vendor-scoped API and cannot cross tenant boundaries.
  _isVendorBuilder: () => typeof window !== 'undefined' && window.location.pathname.startsWith('/vendor/page-builder'),
  list: (params = {}) => API.get('/admin/pages', { params }),
  get: (id) => API.get(adminPageAPI._isVendorBuilder() ? `/vendor/pages/${id}` : `/admin/pages/${id}`),
  create: (data) => API.post('/admin/pages', data),
  update: (id, data) => API.put(adminPageAPI._isVendorBuilder() ? `/vendor/pages/${id}` : `/admin/pages/${id}`, data),
  archive: (id) => API.delete(adminPageAPI._isVendorBuilder() ? `/vendor/pages/${id}` : `/admin/pages/${id}`),
  unarchive: (id) => API.post(`/admin/pages/${id}/unarchive`),
  hardDelete: (id) => API.delete(`/admin/pages/${id}/permanent`),
  publish: (id, data = {}) => API.post(adminPageAPI._isVendorBuilder() ? `/vendor/pages/${id}/publish` : `/admin/pages/${id}/publish`, data),
  discardDraft: (id, data = {}) => API.post(adminPageAPI._isVendorBuilder() ? `/vendor/pages/${id}/discard-draft` : `/admin/pages/${id}/discard-draft`, data),
  duplicate: (id) => API.post(adminPageAPI._isVendorBuilder() ? `/vendor/pages/${id}/duplicate` : `/admin/pages/${id}/duplicate`),
  schedule: (id, publishAt) => API.post(adminPageAPI._isVendorBuilder() ? `/vendor/pages/${id}/schedule` : `/admin/pages/${id}/schedule`, { publishAt }),
  versions: (id) => API.get(adminPageAPI._isVendorBuilder() ? `/vendor/pages/${id}/versions` : `/admin/pages/${id}/versions`),
  version: (id, versionId) => API.get(adminPageAPI._isVendorBuilder() ? `/vendor/pages/${id}/versions/${versionId}` : `/admin/pages/${id}/versions/${versionId}`),
  rollback: (id, versionId) => API.post(adminPageAPI._isVendorBuilder() ? `/vendor/pages/${id}/rollback/${versionId}` : `/admin/pages/${id}/rollback/${versionId}`),
  rollbackAICheckpoint: (id, checkpointId, data = {}) => API.post(
    adminPageAPI._isVendorBuilder() ? `/vendor/pages/${id}/ai-checkpoints/${checkpointId}/rollback` : `/admin/pages/${id}/ai-checkpoints/${checkpointId}/rollback`,
    data,
  ),
  previewToken: (id) => API.get(adminPageAPI._isVendorBuilder() ? `/vendor/pages/preview-token/${id}` : `/admin/pages/preview-token/${id}`),
  aiEdit: (id, data) => withCreditUpdate(API.post((adminPageAPI._isVendorBuilder() ? '/vendor/pages/' : '/admin/pages/') + id + '/ai-edit', data, { timeout: 120000 })),
  uploadImage: (formData) => API.post(adminPageAPI._isVendorBuilder() ? '/vendor/upload' : '/admin/customization/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  uploadMedia: (formData) => API.post(adminPageAPI._isVendorBuilder() ? '/vendor/upload' : '/admin/customization/upload-media', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

export const pageBlockAPI = {
  list: (params = {}) => API.get(adminPageAPI._isVendorBuilder() ? '/vendor/page-blocks' : '/admin/page-blocks', { params }),
  create: (data) => API.post(adminPageAPI._isVendorBuilder() ? '/vendor/page-blocks' : '/admin/page-blocks', data),
  archive: (id) => API.delete((adminPageAPI._isVendorBuilder() ? '/vendor/page-blocks/' : '/admin/page-blocks/') + id),
};

export const templateAPI = {
  versions: (id) => API.get(`/admin/templates/${id}/versions`),
  createVersion: (id, changeNote = '') => API.post(`/admin/templates/${id}/versions`, { changeNote }),
  restoreVersion: (id, versionId) => API.post(`/admin/templates/${id}/versions/${versionId}/restore`),
};

export const newsletterAPI = {
  subscribe: (email, source = '') => API.post('/newsletter/subscribe', { email, source }),
  unsubscribe: (email) => API.post('/newsletter/unsubscribe', { email }),
};

// ─── Vendor ───────────────────────────────────────────────
export const vendorAPI = {
  register: (data) => API.post('/vendors/register', data),
  getDashboard: () => API.get('/vendor/dashboard'),
  getProducts: (params) => API.get('/vendor/products', { params }),
  createProduct: (data) => API.post('/vendor/products', data),
  updateProduct: (id, data) => API.put(`/vendor/products/${id}`, data),
  deleteProduct: (id) => API.delete(`/vendor/products/${id}`),
  getOrders: (params) => API.get('/vendor/orders', { params }),
  getOrderDetail: (subOrderNumber) => API.get(`/vendor/orders/${subOrderNumber}`),
  updateOrderStatus: (subOrderNumber, data) => API.put(`/vendor/orders/${subOrderNumber}/status`, data),
  getPayouts: (params) => API.get('/vendor/payouts', { params }),
  requestPayout: (data) => API.post('/vendor/payouts/request', data),
  getWallet: (params) => API.get('/vendor/wallet', { params }),
  getStore: () => API.get('/vendor/store'),
  updateStore: (data) => API.put('/vendor/store', data),
  getTaxProfile: () => API.get('/vendor/tax-profile'),
  updateTaxProfile: (data) => API.put('/vendor/tax-profile', data),
  getCommission: () => API.get('/vendor/commission'),
  getInvoices: (params) => API.get('/vendor/invoices', { params }),
  getReports: (params) => API.get('/vendor/reports', { params }),
  getReviews: (params) => API.get('/vendor/reviews', { params }),
  replyToReview: (id, data) => API.put(`/vendor/reviews/${id}`, data),
  getSubscriptionPlans: (params) => API.get('/vendor/subscription-plans', { params }),
  createSubscriptionPlan: (data) => API.post('/vendor/subscription-plans', data),
  updateSubscriptionPlan: (id, data) => API.put(`/vendor/subscription-plans/${id}`, data),
  deactivateSubscriptionPlan: (id) => API.delete(`/vendor/subscription-plans/${id}`),
  uploadImage: (formData) => API.post('/vendor/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getAnalytics: (params) => API.get('/vendor/analytics', { params }),
  getLedger: (params) => API.get('/vendor/ledger', { params }),
  bulkCreateProducts: (items) => API.post('/vendor/products/bulk', { items }),

  // Onboarding (pre-approval seller application)
  getOnboardingStatus: () => API.get('/vendor/onboarding/status'),
  uploadOnboardingDocuments: (formData) => API.post('/vendor/onboarding/documents', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  acceptOnboardingAgreement: (templateVersion) => API.post('/vendor/onboarding/agreement/accept', { templateVersion }),
  resubmitOnboarding: () => API.post('/vendor/onboarding/resubmit'),

  // Team
  getTeam: () => API.get('/vendor/team'),
  inviteTeamMember: (data) => API.post('/vendor/team/invite', data),
  acceptTeamInvite: (vendorId) => API.post('/vendor/team/accept', { vendorId }),
  updateTeamMember: (id, data) => API.put(`/vendor/team/${id}`, data),
  removeTeamMember: (id) => API.delete(`/vendor/team/${id}`),

  // Inventory
  getInventory: (params) => API.get('/vendor/inventory', { params }),
  getLowStockProducts: () => API.get('/vendor/inventory/low-stock'),
  updateStock: (productId, data) => API.patch(`/vendor/inventory/${productId}`, data),
  bulkUpdateStock: (items) => API.post('/vendor/inventory/bulk', { items }),
  getInventoryLogs: (params) => API.get('/vendor/inventory/logs', { params }),

  // Reference
  getCategories: () => API.get('/vendor/categories'),
  getBrands: () => API.get('/vendor/brands'),
  getPages: (params) => API.get('/vendor/pages', { params }),
  getPageTemplates: () => API.get('/vendor/pages/templates'),
  getPage: (id) => API.get(`/vendor/pages/${id}`),
  updatePage: (id, data) => API.put(`/vendor/pages/${id}`, data),
  createPage: (data) => API.post('/vendor/pages', data),
};

export const storefrontAPI = {
  getStore: (slug) => API.get(`/vendors/store/${slug}`),
  getProducts: (slug, params) => API.get(`/vendors/store/${slug}/products`, { params }),
  getPage: (slug, path = '/', token) => API.get(`/vendors/store/${slug}/page`, { params: { path, ...(token ? { token } : {}) } }),
};

export const adminVendorAPI = {
  getVendors: (params) => API.get('/admin/vendors', { params }),
  getVendorDetail: (id) => API.get(`/admin/vendors/${id}`),
  approveVendor: (id) => API.put(`/admin/vendors/${id}/approve`),
  rejectVendor: (id, reason, reasonCode) => API.put(`/admin/vendors/${id}/reject`, { reason, reasonCode }),
  requestChanges: (id, data) => API.put(`/admin/vendors/${id}/request-changes`, data),
  suspendVendor: (id, data) => API.put(`/admin/vendors/${id}/suspend`, data || {}),
  reactivateVendor: (id) => API.put(`/admin/vendors/${id}/reactivate`),
  reverifyVendor: (id, data) => API.post(`/admin/vendors/${id}/reverify`, data || {}),
  getReasonCodes: () => API.get('/admin/vendors/meta/reason-codes'),
  getVendorAudit: (id, params) => API.get(`/admin/vendors/${id}/audit`, { params }),
  bulkVendorAction: (data) => API.post('/admin/vendors/bulk', data),
  updateCommission: (id, commissionRate) => API.put(`/admin/vendors/${id}/commission`, { commissionRate }),
  approveGSTChange: (id, data) => API.put(`/admin/vendors/${id}/gst`, data),
  updateSettings: (id, data) => API.put(`/admin/vendors/${id}/settings`, data),
  updateVerification: (id, data) => API.put(`/admin/vendors/${id}/verification`, data),
  getPayouts: (params) => API.get('/admin/payouts', { params }),
  processPayout: (id) => API.put(`/admin/payouts/${id}/process`),
  completePayout: (id, data) => API.put(`/admin/payouts/${id}/complete`, data),
  failPayout: (id, failureReason) => API.put(`/admin/payouts/${id}/fail`, { failureReason }),
  getCommissionRules: () => API.get('/admin/commission-rules'),
  createCommissionRule: (data) => API.post('/admin/commission-rules', data),
  updateCommissionRule: (id, data) => API.put(`/admin/commission-rules/${id}`, data),
  deleteCommissionRule: (id) => API.delete(`/admin/commission-rules/${id}`),
  runSettlement: (data) => API.post('/admin/settlements/run', data),
  getSettlements: (params) => API.get('/admin/settlements', { params }),
};

// Marketplace integrations (Amazon SP-API + Flipkart Seller API)
export const marketplaceAPI = {
  getStats: () => API.get('/admin/marketplace/stats'),
  getConnections: () => API.get('/admin/marketplace/connections'),
  createConnection: (data) => API.post('/admin/marketplace/connections', data),
  updateConnection: (id, data) => API.put(`/admin/marketplace/connections/${id}`, data),
  deleteConnection: (id) => API.delete(`/admin/marketplace/connections/${id}`),
  authorize: (id) => API.get(`/admin/marketplace/connections/${id}/authorize`),
  testConnection: (id) => API.post(`/admin/marketplace/connections/${id}/test`),
  getAmazonProductTypeDefinition: (id, productType) => API.get(`/admin/marketplace/connections/${id}/amazon/product-types/${encodeURIComponent(productType)}`),
  startSync: (id, data) => API.post(`/admin/marketplace/connections/${id}/sync`, data),
  saveMapping: (id, data) => API.post(`/admin/marketplace/connections/${id}/mappings`, data),
  getJobs: (params) => API.get('/admin/marketplace/jobs', { params }),
  getJob: (id) => API.get(`/admin/marketplace/jobs/${id}`),
  getListings: (params) => API.get('/admin/marketplace/listings', { params }),
  getOrders: (params) => API.get('/admin/marketplace/orders', { params }),
  shipmentAction: (id, data) => API.post(`/admin/marketplace/connections/${id}/shipment-action`, data),
};

export const vendorMarketplaceAPI = {
  getStats: () => API.get('/vendor/marketplace/stats'),
  getProducts: () => API.get('/vendor/marketplace/products'),
  getConnections: () => API.get('/vendor/marketplace/connections'),
  createConnection: (data) => API.post('/vendor/marketplace/connections', data),
  updateConnection: (id, data) => API.put(`/vendor/marketplace/connections/${id}`, data),
  deleteConnection: (id) => API.delete(`/vendor/marketplace/connections/${id}`),
  authorize: (id) => API.get(`/vendor/marketplace/connections/${id}/authorize`),
  testConnection: (id) => API.post(`/vendor/marketplace/connections/${id}/test`),
  getAmazonProductTypeDefinition: (id, productType) => API.get(`/vendor/marketplace/connections/${id}/amazon/product-types/${encodeURIComponent(productType)}`),
  startSync: (id, data) => API.post(`/vendor/marketplace/connections/${id}/sync`, data),
  getJobs: (params) => API.get('/vendor/marketplace/jobs', { params }),
  getListings: (params) => API.get('/vendor/marketplace/listings', { params }),
};

export default API;
