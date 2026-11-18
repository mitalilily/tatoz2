require('dotenv').config();
const { production, parseOrigins, validateEnvironment } = require('./config/env');
validateEnvironment();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const cookieParser = require('cookie-parser');
const { csrfProtection } = require('./middleware/csrf');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');

const connectDB = require('./config/db');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');
const redirectMiddleware = require('./middleware/redirects');
const { requestContext } = require('./middleware/requestContext');
const observability = require('./services/observability');
const { hydrateIntegrationKey } = require('./services/secrets/secretProvider');
const { PLATFORM_NAME } = require('./constants/branding');

// Route imports
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const bundleRoutes = require('./routes/bundles');
const categoryRoutes = require('./routes/categories');
const brandRoutes = require('./routes/brands');
const orderRoutes = require('./routes/orders');
const reviewRoutes = require('./routes/reviews');
const couponRoutes = require('./routes/coupons');
const referralRoutes = require('./routes/referral');
const affiliateRoutes = require('./routes/affiliate');
const paymentRoutes = require('./routes/payments');
const shippingRoutes = require('./routes/shipping');
const siteRoutes = require('./routes/site');
const pageRoutes = require('./routes/pages');
const newsletterRoutes = require('./routes/newsletter');
const adminRoutes = require('./routes/admin');
const blogRoutes = require('./routes/blog');
const chatRoutes = require('./routes/chat');
const vendorRoutes = require('./routes/vendor');
const vendorOnboardingRoutes = require('./routes/vendorOnboarding');
const vendorDashboardRoutes = require('./routes/vendorDashboard');
const { protect: sellerProtect } = require('./middleware/auth');
const { acceptInvite: acceptTeamInvite } = require('./controllers/vendorTeamController');
const marketplaceOAuthRoutes = require('./routes/marketplaceOAuth');
const tenantIntegrationRoutes = require('./routes/tenantIntegrations');
const tenantModuleRoutes = require('./routes/tenantModules');
const tenantAuthPolicyRoutes = require('./routes/tenantAuthPolicy');
const notificationRoutes = require('./routes/notifications');
const storageRoutes = require('./routes/storage');
const cartRoutes = require('./routes/cart');
const walletRoutes = require('./routes/wallet');
const loyaltyRoutes = require('./routes/loyalty');
const giftCardRoutes = require('./routes/giftCards');
const taxRoutes = require('./routes/tax');
const invoiceRoutes = require('./routes/invoices');
const b2bRoutes = require('./routes/b2b');
const preorderSubscriptionRoutes = require('./routes/preorderSubscription');
const supportRoutes = require('./routes/support');
const publicApiRoutes = require('./routes/publicApi');
const { handleWatiWebhook, handleTrustsignalWebhook } = require('./controllers/notificationController');
const { handleRazorpayWebhook } = require('./controllers/razorpayWebhookController');
const { handlePaymentWebhook } = require('./controllers/paymentWebhookController');
const { handleShiprocketWebhook } = require('./controllers/shiprocketWebhookController');
const { loadTenantOptional } = require('./services/tenantService');

const app = express();
observability.init();
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS) || (production ? 1 : 0));
app.use(requestContext);
app.use(observability.telemetryMiddleware);
if (process.env.HTTP_ACCESS_LOG !== 'false') {
  app.use(morgan(':remote-addr :method :url :status :response-time ms request=:req[x-request-id]'));
}

// Auto-seed admin user after DB connects
const autoSeedAdmin = async () => {
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) return;
  try {
    const User = require('./models/User');
    const adminEmail = process.env.ADMIN_EMAIL;
    const existing = await User.findOne({ email: adminEmail });
    if (!existing) {
      await User.create({
        name: 'Super Admin',
        email: adminEmail,
        password: process.env.ADMIN_PASSWORD,
        role: 'superadmin',
        isActive: true,
      });
      console.log(`✅ Admin user auto-created: ${adminEmail}`);
    }
  } catch (e) {
    // DB may not be ready yet – superadmin will be created on next restart
  }
};

// Connect database only from the executable entrypoint. Keeping startup out of
// module import makes API and middleware tests deterministic.
const { start: startPageScheduler, stop: stopPageScheduler } = require('./services/pageScheduler');
const { startMarketplaceScheduler, stopMarketplaceScheduler } = require('./services/marketplaceScheduler');
const { start: startInventoryReservationScheduler, stop: stopInventoryReservationScheduler } = require('./services/inventoryReservationScheduler');
const { start: startCampaignScheduler, stop: stopCampaignScheduler } = require('./services/campaignScheduler');
const { start: startCurrencyRateScheduler, stop: stopCurrencyRateScheduler } = require('./services/currencyRateScheduler');
const { seedHomepage } = require('./scripts/seedHomepage');

const bootstrap = async () => {
  await hydrateIntegrationKey();
  await connectDB();
  await redirectMiddleware.refresh();
  await autoSeedAdmin();
  await seedHomepage();
  startPageScheduler({ intervalMs: 60000 });
  startMarketplaceScheduler();
  startInventoryReservationScheduler();
  startCampaignScheduler();
  startCurrencyRateScheduler();
};

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  // Google Identity Services may open a cross-origin authentication popup.
  // Keep the isolation boundary while allowing the popup handshake to return
  // to this page when FedCM is unavailable.
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  contentSecurityPolicy: production ? {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://www.googletagmanager.com', 'https://accounts.google.com/gsi/client', 'https://connect.facebook.net', 'https://www.facebook.com', 'https://checkout.razorpay.com', 'https://sdk.cashfree.com', 'https://js.stripe.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://accounts.google.com/gsi/style'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
      connectSrc: ["'self'", 'https:', 'https://accounts.google.com/gsi/'],
      frameSrc: ["'self'", 'https://accounts.google.com/gsi/', 'https://checkout.razorpay.com', 'https://api.razorpay.com', 'https://www.googletagmanager.com', 'https://*.cashfree.com', 'https://js.stripe.com', 'https://hooks.stripe.com'],
      formAction: ["'self'"],
    },
  } : false,
}));
app.use(mongoSanitize());
app.use(compression());

// CORS
const allowedOrigins = [
  ...parseOrigins(),
];

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id', 'x-csrf-token', 'x-tenant-id', 'x-turnstile-token', 'x-client-platform', 'Idempotency-Key', 'x-shiprocket-signature', 'x-shiprocket-hmac', 'x-shiprocket-secret', 'stripe-signature', 'x-razorpay-signature', 'x-razorpay-event-id', 'x-webhook-signature', 'x-webhook-timestamp', 'x-event-id', 'x-payment-event-id'],
  exposedHeaders: ['X-Tatoz-Cache'],
}));

// Razorpay signs the exact request bytes. This must be registered before the
// JSON parser so verification cannot be bypassed by re-serializing the body.
app.post('/api/webhooks/razorpay', apiLimiter, express.raw({ type: 'application/json', limit: '1mb' }), handleRazorpayWebhook);
app.post('/api/payments/:provider/webhook', apiLimiter, express.raw({ type: 'application/json', limit: '1mb' }), handlePaymentWebhook);
app.post('/api/notifications/webhooks/wati', apiLimiter, express.raw({ type: 'application/json', limit: '1mb' }), handleWatiWebhook);
app.post('/api/notifications/webhooks/trustsignal', apiLimiter, express.raw({ type: 'application/json', limit: '1mb' }), handleTrustsignalWebhook);
app.post('/api/notifications/webhooks/:provider', apiLimiter, express.raw({ type: 'application/json', limit: '1mb' }), handleWatiWebhook);
app.post('/api/webhooks/shiprocket', apiLimiter, express.raw({ type: 'application/json', limit: '1mb' }), handleShiprocketWebhook);

// Body parsing
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '5mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.URLENCODED_BODY_LIMIT || '1mb' }));
app.use(cookieParser());
app.use(csrfProtection);

// File uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  // Upload filenames are content-addressed by a random suffix/timestamp and
  // are never reused, so immutable long-lived caching is safe and avoids a
  // repeat download on every storefront visit.
  maxAge: '30d',
  immutable: true,
  fallthrough: false,
}));

// SEO redirects (before routes)
app.use(redirectMiddleware);

// Rate limiting
app.use('/api/', apiLimiter);

// Liveness never depends on Mongo. Readiness does, so load balancers do not
// send traffic to a process that cannot serve data.
app.get('/api/live', (req, res) => {
  res.json({ status: 'OK', app: PLATFORM_NAME, version: '1.0.0', timestamp: new Date().toISOString() });
});
app.get('/api/health', (req, res) => {
  const ready = connectDB.isReady();
  res.status(ready ? 200 : 503).json({
    status: ready ? 'OK' : 'NOT_READY',
    app: PLATFORM_NAME,
    version: '1.0.0',
    dependencies: { mongodb: ready ? 'up' : 'down' },
    timestamp: new Date().toISOString(),
  });
});
app.get('/api/metrics', observability.metricsHandler);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/bundles', bundleRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/brands', brandRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/referral', referralRoutes);
app.use('/api/affiliate', affiliateRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/site', siteRoutes);
app.use('/api/pages', pageRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/blog', blogRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/vendors', vendorRoutes);
// Seller onboarding (pre-approval) must mount before the authenticated seller
// portal: /api/vendor/* otherwise falls into vendorAuth, which 403s pending
// sellers. The onboarding router authenticates with protect+loadTenant and
// resolves the caller's own application without requiring active status.
app.use('/api/vendor/onboarding', vendorOnboardingRoutes);
// Team-invite acceptance is intentionally outside vendorAuth: the invited user
// has no active membership yet, so only login is required.
app.post('/api/vendor/team/accept', sellerProtect, acceptTeamInvite);
app.use('/api/vendor', vendorDashboardRoutes);
app.use('/api/tenant/integrations', tenantIntegrationRoutes);
app.use('/api/tenant/modules', tenantModuleRoutes);
app.use('/api/tenant/auth-policy', tenantAuthPolicyRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/storage', storageRoutes);
// Authoritative customer-cart routes are mounted before the legacy abandoned-
// cart tracking endpoints. Unmatched /sync and /recovered requests continue to
// the compatibility handlers below.
app.use('/api/cart', cartRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/loyalty', loyaltyRoutes);
app.use('/api/gift-cards', giftCardRoutes);
app.use('/api/tax', taxRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/b2b', b2bRoutes);
app.use('/api', preorderSubscriptionRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/v1', publicApiRoutes);
// OAuth callbacks must remain public because Amazon/Flipkart redirect the seller here.
app.use('/api/marketplace/oauth', marketplaceOAuthRoutes);
const { getLegalPage } = require('./controllers/legalController');
app.get('/api/legal/:slug', getLegalPage);
const { getMyNotifications, markAsRead, markAllAsRead, getUnreadCount } = require('./controllers/notificationController');
const { trackEvent } = require('./controllers/clickTrackingController');
const { syncCart, markRecovered } = require('./controllers/abandonedCartController');
const { optionalAuth, protect: authProtect } = require('./middleware/auth');
app.get('/api/notifications', authProtect, getMyNotifications);
app.get('/api/notifications/unread-count', authProtect, getUnreadCount);
app.put('/api/notifications/read-all', authProtect, markAllAsRead);
app.put('/api/notifications/:id/read', authProtect, markAsRead);
app.post('/api/track', optionalAuth, loadTenantOptional, trackEvent);
app.post('/api/cart/sync', optionalAuth, syncCart);
app.post('/api/cart/recovered', optionalAuth, markRecovered);
// SEO public endpoints
const { getPublicSeoConfig, serveSitemap, serveRobots } = require('./controllers/seoController');
app.get('/api/seo/public', getPublicSeoConfig);
app.get('/sitemap.xml', loadTenantOptional, serveSitemap);
app.get('/robots.txt', serveRobots);
const { getMerchantFeed } = require('./controllers/googleMerchantController');
app.get('/google-merchant-feed.xml', getMerchantFeed);

app.use('/api/admin', adminRoutes);

// Serve React build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client', 'dist'), {
    maxAge: '1y',
    immutable: true,
    index: false,
  }));
  app.get('*', (req, res) => {
    // Never turn unknown API or dot-file requests into a successful SPA HTML
    // response. API clients and scanners must receive a real 404 instead.
    if (req.path.startsWith('/api/') || req.path.startsWith('/.') || req.path.includes('/.')) return res.status(404).end();
    res.sendFile(path.join(__dirname, 'client', 'dist', 'index.html'));
  });
}

// Error handling
app.use(notFound);
app.use(errorHandler);

let server = null;
const startServer = () => {
  const PORT = process.env.PORT || 5000;
  server = app.listen(PORT, () => {
    // Keep browser/proxy connections reusable without changing request
    // semantics. headersTimeout is kept above keepAliveTimeout as required by
    // Node's HTTP server and both values remain deployment-configurable.
    const configuredKeepAlive = Number(process.env.HTTP_KEEP_ALIVE_TIMEOUT_MS);
    const keepAliveTimeout = Number.isFinite(configuredKeepAlive) && configuredKeepAlive > 0 ? configuredKeepAlive : 65000;
    const configuredHeaders = Number(process.env.HTTP_HEADERS_TIMEOUT_MS);
    const headersTimeout = Number.isFinite(configuredHeaders) && configuredHeaders > keepAliveTimeout
      ? configuredHeaders
      : keepAliveTimeout + 5000;
    server.keepAliveTimeout = keepAliveTimeout;
    server.headersTimeout = headersTimeout;
    console.log(`🚀 ${PLATFORM_NAME} server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
  return server;
};

const shutdown = async (signal) => {
  console.log(`[shutdown] ${signal}`);
  stopPageScheduler();
  stopMarketplaceScheduler();
  stopInventoryReservationScheduler();
  stopCampaignScheduler();
  stopCurrencyRateScheduler();
  if (server) await new Promise(resolve => server.close(resolve));
  const mongoose = require('mongoose');
  await mongoose.disconnect().catch(() => {});
  process.exit(0);
};

if (require.main === module && process.env.NODE_ENV !== 'test') {
  (async () => {
    try {
      await hydrateIntegrationKey();
      startServer();
      await bootstrap();
    } catch (err) {
      console.error('Startup error:', err);
    }
  })();
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
    shutdown('unhandledRejection').catch(() => process.exit(1));
  });
}

module.exports = app;
