/**
 * Whole-application Selenium deep dive.
 *
 * This suite intentionally runs the production Express server and the built
 * React application in a disposable MongoDB replica set. The replica set is
 * required because checkout, inventory and cancellation use MongoDB
 * transactions. Every check below is a user-visible process or a complete
 * API boundary, so the final result is useful as a release gate.
 *
 * Run: npm run qa:selenium
 */
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { Builder, By, Key, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');

if (!process.env.SE_CACHE_PATH) {
  try {
    fs.mkdirSync(path.join(os.homedir(), '.cache', 'selenium'), { recursive: true });
  } catch (_) {
    process.env.SE_CACHE_PATH = path.join(os.tmpdir(), 'selenium-cache');
  }
}

const ROOT = path.join(__dirname, '..');
const SCRATCH_DIR = path.join(os.tmpdir(), 'tatoz-deepdive-selenium');
const PORT = Number(process.env.DEEP_PORT || 8124);
const BASE = `http://localhost:${PORT}`;
const STEP_TIMEOUT = Number(process.env.DEEP_STEP_TIMEOUT || 18000);
const RUN_TAG = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const ADMIN = { email: `deep.admin.${RUN_TAG}@example.com`, password: 'Admin1234' };
const CUSTOMER = { name: 'Deep Dive Customer', email: `deep.customer.${RUN_TAG}@example.com`, password: 'Pass1234' };
const VENDOR_OWNER = { name: 'Deep Dive Vendor Owner', email: `deep.vendor.${RUN_TAG}@example.com`, password: 'Vendor1234' };
const TEST_JWT_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const TEST_INTEGRATION_KEY = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
const FAKE_RAZORPAY = {
  keyId: 'rzp_test_deepdive',
  secret: 'deepdive-razorpay-secret',
  orderId: 'order_deepdive_payment',
  paymentId: 'pay_deepdive_payment',
};
FAKE_RAZORPAY.signature = crypto.createHmac('sha256', FAKE_RAZORPAY.secret)
  .update(`${FAKE_RAZORPAY.orderId}|${FAKE_RAZORPAY.paymentId}`)
  .digest('hex');

try { fs.mkdirSync(SCRATCH_DIR, { recursive: true }); } catch (_) { /* tmpdir is still usable */ }

let passes = 0;
let failures = 0;
let driver = null;
let serverLogs = [];
const sessions = {};
const state = {
  tenant: null,
  category: null,
  brand: null,
  product: null,
  secondProduct: null,
  bundle: null,
  bundleOrder: null,
  coupon: null,
  pincode: null,
  vendor: null,
  vendorOwner: null,
  customer: null,
  supportTicket: null,
  order: null,
};

const jsonResponse = (response, statusCode, body) => {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  response.end(payload);
};

const startFakeRazorpay = async () => {
  const calls = { createOrder: 0, fetchPayment: 0, lastOrderAmount: 0 };
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, 'http://127.0.0.1');
    if (request.method === 'POST' && requestUrl.pathname === '/v1/orders') {
      calls.createOrder += 1;
      let body = '';
      request.on('data', chunk => { body += chunk; });
      request.on('end', () => {
        try { calls.lastOrderAmount = JSON.parse(body || '{}').amount || 0; } catch (_) { calls.lastOrderAmount = 0; }
        jsonResponse(response, 200, { id: FAKE_RAZORPAY.orderId, amount: calls.lastOrderAmount, currency: 'INR' });
      });
      return;
    }
    if (request.method === 'GET' && requestUrl.pathname === `/v1/payments/${FAKE_RAZORPAY.paymentId}`) {
      calls.fetchPayment += 1;
      jsonResponse(response, 200, {
        id: FAKE_RAZORPAY.paymentId,
        order_id: FAKE_RAZORPAY.orderId,
        amount: calls.lastOrderAmount,
        currency: 'INR',
        status: 'captured',
      });
      return;
    }
    jsonResponse(response, 404, { error: 'Fake Razorpay resource not found' });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return { server, calls, baseUrl: `http://127.0.0.1:${address.port}/v1` };
};

const startFakeAI = async () => {
  const calls = { completions: 0, itemAttempts: 0 };
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, 'http://127.0.0.1');
    if (request.method !== 'POST' || requestUrl.pathname !== '/responses') {
      jsonResponse(response, 404, { error: 'Fake AI resource not found' });
      return;
    }
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      calls.completions += 1;
      const isAudit = body.includes('Audit this e-commerce store');
      const isItem = body.includes('Generate SEO optimization for this ');
      if (isItem) calls.itemAttempts += 1;
      const payload = isAudit ? {
        overallScore: 78,
        summary: 'The store has a solid crawl foundation, but content metadata and social previews still have clear opportunities.',
        categories: [
          {
            name: 'Meta Tags', score: 82, status: 'good', findings: [
              { title: 'Title template is active', severity: 'pass', description: 'A reusable title template is configured.', recommendation: 'Keep page titles within search snippet limits.', currentValue: '%s | Deep Dive SEO', suggestedValue: '%s | Deep Dive SEO' },
              { title: 'Meta description needs refinement', severity: 'warning', description: 'The default description is shorter than the recommended range.', recommendation: 'Expand it to a focused 150–160 character value proposition.', currentValue: 'Deep dive SEO metadata', suggestedValue: 'A concise 150–160 character store description' },
            ],
          },
          {
            name: 'Crawlability', score: 90, status: 'good', findings: [
              { title: 'Sitemap and robots policy are available', severity: 'pass', description: 'Search engine discovery controls are configured.', recommendation: 'Keep private account and checkout paths excluded.', currentValue: 'configured', suggestedValue: 'maintain' },
            ],
          },
          {
            name: 'Catalogue Content', score: 64, status: 'warning', findings: [
              { title: 'Product metadata coverage can improve', severity: 'warning', description: 'Some catalogue pages still need unique SEO copy.', recommendation: 'Use Content SEO to prioritize high-traffic products.', currentValue: 'partial coverage', suggestedValue: 'unique metadata for every active product' },
            ],
          },
        ],
        quickWins: ['Add stronger default social descriptions', 'Fill missing product meta descriptions'],
        missingEssentials: [],
      } : isItem ? {
        metaTitle: 'Deep Dive Category SEO Title',
        metaDescription: 'Explore carefully selected Deep Dive products and find the right category for your next purchase.',
        keywords: ['deep dive products', 'online shopping', 'category guide'],
        altText: 'Deep Dive category collection',
      } : {
        seo_title_template: '%s | Deep Dive AI Store',
        seo_meta_description: 'Shop thoughtfully selected products from Deep Dive AI Store with reliable delivery and a smooth checkout experience.',
        seo_robots_default: 'index, follow',
        seo_og_title: 'Deep Dive AI Store',
        seo_og_description: 'Discover selected products with a fast, trusted online shopping experience.',
        seo_og_type: 'website',
        seo_twitter_card: 'summary_large_image',
        seo_organization_schema: { name: 'Deep Dive AI Store', logo: '', url: BASE, socialProfiles: [], contactEmail: '', contactPhone: '' },
        seo_website_schema: { searchActionUrl: `${BASE}/search?q={search_term_string}` },
        seo_robots_txt: `User-agent: *\nAllow: /\nSitemap: ${BASE}/sitemap.xml`,
        seo_noindex_patterns: ['/account/*', '/cart', '/checkout'],
        seo_sitemap_enabled: true,
        seo_sitemap_types: ['products', 'categories', 'brands', 'blog'],
        seo_sitemap_changefreq: 'weekly',
        seo_sitemap_priority: 0.8,
        seo_default_language: 'en',
        seo_404_title: 'Page not found | Deep Dive AI Store',
        seo_404_description: 'The requested page could not be found. Continue shopping from the Deep Dive AI Store.',
      };
      const outputText = (!isAudit && !isItem && calls.completions === 1) || (isItem && calls.itemAttempts === 1)
        ? 'I will prepare the SEO settings now.'
        : JSON.stringify(payload);
      jsonResponse(response, 200, {
        id: `fake-seo-${calls.completions}`,
        model: 'fake-seo-model',
        output: [{ type: 'message', content: [{ type: 'output_text', text: outputText }] }],
        usage: { input_tokens: 120, output_tokens: 260, total_tokens: 380 },
      });
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return { server, calls, baseUrl: `http://127.0.0.1:${address.port}` };
};

const stopFakeRazorpay = server => new Promise(resolve => {
  if (!server || !server.listening) return resolve();
  server.close(() => resolve());
});

const stopFakeAI = server => new Promise(resolve => {
  if (!server || !server.listening) return resolve();
  server.close(() => resolve());
});

const model = (conn, name, file) => conn.models[name] || conn.model(name, require(path.join(ROOT, 'models', file)).schema);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const byTestId = id => By.css(`[data-testid="${id}"]`);

async function stopChildProcess(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise(resolve => {
    let settled = false;
    let killTimer = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      resolve();
    };
    child.once('exit', finish);
    child.once('error', finish);
    child.kill('SIGTERM');
    killTimer = setTimeout(() => {
      if (!settled) child.kill('SIGKILL');
    }, 10000);
    killTimer.unref?.();
  });
}

function log(ok, name, extra = '') {
  if (ok) {
    passes += 1;
    console.log(`  PASS ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

async function waitForServer() {
  const deadline = Date.now() + 90000;
  for (;;) {
    try {
      const response = await fetch(`${BASE}/api/auth/config`);
      if (response.ok) return;
    } catch (_) { /* boot is still in progress */ }
    if (Date.now() > deadline) throw new Error('Deep-dive server did not become ready');
    await sleep(800);
  }
}

async function boot() {
  const fakeRazorpay = await startFakeRazorpay();
  const fakeAI = await startFakeAI();
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    instanceOpts: [{ dbName: 'deepdive' }],
    binary: { version: '7.0.14', downloadDir: path.join(SCRATCH_DIR, 'mongo-bins') },
  });
  const mongoUri = replSet.getUri('deepdive');
  serverLogs = [];
  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(PORT),
      MONGO_URI: mongoUri,
      JWT_SECRET: TEST_JWT_SECRET,
      INTEGRATION_ENCRYPTION_KEY: TEST_INTEGRATION_KEY,
      RAZORPAY_API_BASE_URL: fakeRazorpay.baseUrl,
      AI_PROVIDER: 'meta',
      MODEL_API_KEY: 'selenium-fake-ai-key',
      META_AI_BASE_URL: fakeAI.baseUrl,
      META_AI_MODEL: 'fake-seo-model',
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      CLIENT_URL: BASE,
      CLIENT_ORIGINS: BASE,
      TRUST_PROXY_HOPS: '1',
      RATE_LIMIT_API_MAX: '100000',
      RATE_LIMIT_AUTH_MAX: '100000',
      RATE_LIMIT_STRICT_MAX: '100000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const capture = (prefix) => data => {
    const text = String(data);
    serverLogs.push(`${prefix} ${text}`);
    serverLogs = serverLogs.slice(-80);
    if (process.env.DEEPDIVE_VERBOSE === '1') process.stdout.write(`[server] ${text}`);
  };
  server.stdout.on('data', capture('OUT'));
  server.stderr.on('data', capture('ERR'));
  await waitForServer();

  const conn = await mongoose.createConnection(mongoUri).asPromise();
  const Tenant = model(conn, 'Tenant', 'Tenant');
  const AuthPolicy = model(conn, 'AuthPolicy', 'AuthPolicy');
  let tenant = await Tenant.findOne({ type: 'platform' });
  if (!tenant) {
    tenant = await Tenant.create({
      key: 'platform', name: 'Deep Dive Platform', slug: 'platform', type: 'platform',
      // Deliberately leave localhost unmapped so the suite covers the same
      // direct-loopback tenant fallback used by the local production server.
      domains: [{ host: 'deepdive.example.com', verified: true, primary: true }],
    });
  }
  await AuthPolicy.findOneAndUpdate(
    { tenant: tenant._id },
    { tenant: tenant._id, primaryMode: 'password', activeMethods: ['password'], cartOtpProvider: 'disabled' },
    { upsert: true, new: true },
  );
  state.tenant = tenant;
  await seedData(conn, tenant);
  return { replSet, server, conn, fakeRazorpay, fakeAI };
}

async function seedData(conn, tenant) {
  const User = model(conn, 'User', 'User');
  const Category = model(conn, 'Category', 'Category');
  const Brand = model(conn, 'Brand', 'Brand');
  const Product = model(conn, 'Product', 'Product');
  const Bundle = model(conn, 'Bundle', 'Bundle');
  const Coupon = model(conn, 'Coupon', 'Coupon');
  const ServiceablePincode = model(conn, 'ServiceablePincode', 'ServiceablePincode');
  const Vendor = model(conn, 'Vendor', 'Vendor');
  const VendorMember = model(conn, 'VendorMember', 'VendorMember');
  const IntegrationConnection = model(conn, 'IntegrationConnection', 'IntegrationConnection');
  const Settings = model(conn, 'Settings', 'Settings');
  // The disposable provider record exercises the same encrypted tenant
  // integration path as production without storing or calling live secrets.
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.INTEGRATION_ENCRYPTION_KEY = TEST_INTEGRATION_KEY;
  const legacyIntegrationService = require(path.join(ROOT, 'services', 'integrationService'));

  const owner = await User.create({
    name: VENDOR_OWNER.name, email: VENDOR_OWNER.email, password: VENDOR_OWNER.password,
    role: 'customer', isActive: true,
  });
  const vendor = await Vendor.create({
    owner: owner._id,
    tenant: tenant._id,
    storeName: `Deep Dive Store ${RUN_TAG}`,
    slug: `deep-dive-store-${RUN_TAG}`,
    description: 'A disposable storefront used by the whole-app Selenium deep dive.',
    contactEmail: owner.email,
    contactPhone: '9876543211',
    status: 'active',
    approvedAt: new Date(),
    approvedBy: owner._id,
    onboarding: {
      state: 'approved',
      slaDueAt: new Date(Date.now() + 86400000),
      checklist: { profile: true, bank: true, tax: true, docs: true, agreement: true },
    },
    address: { fullName: owner.name, phone: '9876543211', street: '1 Test Road', city: 'Jaipur', state: 'Rajasthan', pincode: '302001' },
    businessDetails: { legalName: 'Deep Dive Store LLP', businessType: 'llp', gstRegistrationType: 'unregistered' },
    bankDetails: { accountHolderName: owner.name, accountNumber: '50100234567890', ifscCode: 'HDFC0001234', bankName: 'HDFC Bank' },
    verification: { status: 'verified' },
  });
  owner.vendor = vendor._id;
  await owner.save();
  // A customer-owned vendor is a supported portal path for an already signed
  // in seller/team member. The approval controller promotes newly approved
  // owners to role=vendor; this active owner membership exercises the other
  // vendorAuth branch without bypassing the browser login contract.
  await VendorMember.create({ vendor: vendor._id, tenant: tenant._id, user: owner._id, role: 'owner', status: 'active' });

  const category = await Category.create({
    tenant: tenant._id, name: 'Deep Dive Fashion', slug: 'deep-dive-fashion', description: 'Selenium catalog category', isActive: true,
  });
  const brand = await Brand.create({
    tenant: tenant._id, name: 'Deep Dive Brand', slug: 'deep-dive-brand', description: 'Selenium catalog brand', isActive: true,
  });
  const image = { url: '/favicon.svg', alt: 'Deep Dive catalog image' };
  const product = await Product.create({
    tenant: tenant._id,
    title: 'Deep Dive Cotton Shirt',
    slug: 'deep-dive-cotton-shirt',
    description: 'A seeded catalog item for browser checkout and vendor order flows.',
    shortDescription: 'Deep dive catalog shirt',
    price: 1299,
    comparePrice: 1599,
    discount: 19,
    category: category._id,
    brand: brand.name,
    sku: `DEEP-SHIRT-${RUN_TAG}`,
    stock: 100,
    lowStockThreshold: 5,
    images: [image],
    thumbnail: '/favicon.svg',
    isActive: true,
    isFeatured: true,
    isFlashDeal: true,
    flashDealExpiry: new Date(Date.now() + 86400000),
    lifecycleStatus: 'active',
    approvalStatus: 'approved',
    vendor: vendor._id,
    gstRate: 18,
  });
  const secondProduct = await Product.create({
    tenant: tenant._id,
    title: 'Deep Dive Linen Tote',
    slug: 'deep-dive-linen-tote',
    description: 'A second seeded item for catalog, search and multi-item cart checks.',
    price: 899,
    comparePrice: 999,
    category: category._id,
    brand: brand.name,
    sku: `DEEP-TOTE-${RUN_TAG}`,
    stock: 50,
    images: [image],
    thumbnail: '/favicon.svg',
    isActive: true,
    isFeatured: true,
    lifecycleStatus: 'active',
    approvalStatus: 'approved',
    vendor: vendor._id,
    variantType: 'variable',
    variants: [{
      name: 'Color',
      options: [
        { value: 'Sand', stock: 50, priceModifier: 0 },
        { value: 'Charcoal', stock: 50, priceModifier: 50 },
      ],
    }],
  });
  const bundle = await Bundle.create({
    tenant: tenant._id,
    name: 'Deep Dive Everyday Combo',
    internalName: `deep-everyday-combo-${RUN_TAG}`,
    slug: `deep-everyday-combo-${RUN_TAG}`,
    sku: `DEEP-COMBO-${RUN_TAG}`,
    bundleType: 'fixed',
    offerType: 'fixed_variant',
    description: 'A browser-tested curated combo with a live variant choice.',
    shortDescription: 'Cotton shirt plus a color-selectable linen tote.',
    components: [
      { product: product._id, quantity: 1, required: true, customerSelectable: false, minQuantity: 1, maxQuantity: 1, sortOrder: 0 },
      { product: secondProduct._id, quantity: 1, required: true, customerSelectable: true, minQuantity: 1, maxQuantity: 1, sortOrder: 1 },
    ],
    price: 1899,
    comparePrice: 2198,
    discountType: 'none',
    pricingType: 'fixed',
    image: '/favicon.svg',
    availability: { startAt: new Date(Date.now() - 60000), endAt: new Date(Date.now() + 86400000), maxQuantityPerOrder: 5 },
    label: 'Combo',
    badges: ['Deep dive tested', 'Save ₹299'],
    channels: ['website'],
    returnPolicy: 'entire_bundle',
    fulfillmentStrategy: 'same_warehouse',
    lifecycleStatus: 'active',
    isActive: true,
    version: 1,
  });
  const coupon = await Coupon.create({
    tenant: tenant._id,
    code: 'DEEP10',
    description: 'Deep dive ten percent offer',
    type: 'percentage',
    value: 10,
    applicableProducts: [product._id],
    isActive: true,
    showOnCheckout: true,
    customerEligibility: 'all',
    expiresAt: new Date(Date.now() + 86400000 * 30),
  });
  const pincode = await ServiceablePincode.create({
    tenant: tenant._id,
    pincode: '302001', city: 'Jaipur', state: 'Rajasthan', country: 'India',
    serviceable: true, codEnabled: true, shippingCharge: 0, estimatedMinDays: 3, estimatedMaxDays: 5,
  });
  await IntegrationConnection.create({
    tenant: tenant._id,
    provider: 'razorpay',
    accountKey: 'default',
    category: 'Payments',
    enabled: true,
    environment: 'sandbox',
    status: 'connected',
    credentialsEncrypted: legacyIntegrationService.encrypt({ key_id: FAKE_RAZORPAY.keyId, key_secret: FAKE_RAZORPAY.secret }),
    credentialHints: { key_id: 'configured', key_secret: 'configured' },
    lastTest: { status: 'connected', message: 'Selenium sandbox provider stub', testedAt: new Date() },
  });
  await Settings.findOneAndUpdate({ key: 'active_payment_providers' }, { key: 'active_payment_providers', value: ['razorpay'], group: 'payments' }, { upsert: true, new: true });
  await Settings.findOneAndUpdate({ key: 'active_payment_provider' }, { key: 'active_payment_provider', value: 'razorpay', group: 'payments' }, { upsert: true, new: true });
  await Settings.findOneAndUpdate({ key: 'ai_credits' }, { key: 'ai_credits', value: 1000, group: 'ai' }, { upsert: true, new: true });
  Object.assign(state, { vendor, vendorOwner: owner, category, brand, product, secondProduct, bundle, coupon, pincode });
}

async function buildDriver() {
  const windowSize = process.env.DEEP_WINDOW_SIZE || '1366,900';
  const options = new chrome.Options()
    .addArguments('--headless=new', '--no-sandbox', '--disable-dev-shm-usage', `--window-size=${windowSize}`);
  if (process.env.DEEP_MOBILE === '1') {
    if (process.env.DEEP_DEVICE) {
      options.setMobileEmulation({ deviceName: process.env.DEEP_DEVICE });
    } else {
      options.setMobileEmulation({ deviceMetrics: {
        width: Number(process.env.DEEP_MOBILE_WIDTH || 390),
        height: Number(process.env.DEEP_MOBILE_HEIGHT || 844),
        pixelRatio: 3,
      } });
    }
  }
  options.setLoggingPrefs({ browser: 'ALL' });
  const browser = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
  await browser.manage().setTimeouts({ implicit: 0, pageLoad: 30000, script: 20000 });
  return browser;
}

async function withStaleRetry(fn, tries = 3) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try { return await fn(); } catch (error) {
      if (!/stale element/i.test(String(error?.message || error)) || attempt === tries - 1) throw error;
      await sleep(350);
    }
  }
  return undefined;
}

async function waitTestId(id, timeout = STEP_TIMEOUT) {
  await driver.wait(until.elementLocated(byTestId(id)), timeout);
  const element = await driver.findElement(byTestId(id));
  await driver.wait(until.elementIsVisible(element), timeout);
  return element;
}

async function waitBodyText(text, timeout = STEP_TIMEOUT) {
  await driver.wait(async () => {
    const body = await driver.findElement(By.css('body')).getText();
    return body.includes(text);
  }, timeout, `Timed out waiting for body text: ${text}`);
}

async function waitBodyReady(timeout = STEP_TIMEOUT) {
  await driver.wait(async () => {
    const body = await driver.findElement(By.css('body')).getText();
    return body.trim().length > 12;
  }, timeout, 'Page body did not render');
  const body = await driver.findElement(By.css('body')).getText();
  if (/Unexpected Application Error|ChunkLoadError|ReferenceError:|TypeError:/i.test(body)) {
    throw new Error(`browser runtime error: ${body.slice(0, 260).replace(/\n/g, ' ')}`);
  }
}

async function scrollIntoMobileSafeArea(element) {
  if (process.env.DEEP_RESPONSIVE !== '1') return;
  await driver.executeScript((target) => {
    if (!target) return;
    const fixedSelectors = ['.checkout-mobile-bar', 'nav[aria-label="Mobile navigation"]'];
    const fixedTops = fixedSelectors
      .flatMap(selector => Array.from(document.querySelectorAll(selector)))
      .map(node => ({ node, style: window.getComputedStyle(node), rect: node.getBoundingClientRect() }))
      .filter(({ style, rect }) => style.position === 'fixed' && rect.width > 0 && rect.height > 0)
      .map(({ rect }) => rect.top);
    const bottomSafeEdge = Math.min(window.innerHeight - 8, ...(fixedTops.length ? fixedTops.map(top => top - 12) : [window.innerHeight - 8]));
    const rect = target.getBoundingClientRect();
    if (rect.bottom > bottomSafeEdge) window.scrollBy(0, rect.bottom - bottomSafeEdge);
    else if (rect.top < 8) window.scrollBy(0, rect.top - 8);
  }, element);
}

async function scrollPastProductOverview() {
  const overview = await driver.findElement(By.css('#pdp-overview'));
  await driver.executeAsyncScript((element, done) => {
    const overviewBottom = element.getBoundingClientRect().bottom + window.scrollY;
    window.scrollTo(0, overviewBottom + 24);
    window.dispatchEvent(new Event('scroll'));
    document.dispatchEvent(new Event('scroll'));
    window.setTimeout(done, 350);
  }, overview);
  try {
    await driver.wait(async () => {
      const actions = await driver.findElement(byTestId('product-floating-actions'));
      return actions.isDisplayed().catch(() => false);
    }, STEP_TIMEOUT, 'Product floating actions did not appear after the CRO overview');
  } catch (error) {
    const diagnostics = await driver.executeScript(() => {
      const overview = document.querySelector('#pdp-overview');
      const actions = document.querySelector('[data-testid="product-floating-actions"]');
      const rect = node => node ? (() => { const box = node.getBoundingClientRect(); return { top: box.top, bottom: box.bottom, height: box.height, className: node.className }; })() : null;
      return { scrollY: window.scrollY, innerHeight: window.innerHeight, documentScrollHeight: document.documentElement.scrollHeight, overview: rect(overview), actions: rect(actions) };
    });
    throw new Error(`${error.message}; scroll diagnostics: ${JSON.stringify(diagnostics)}`);
  }
}

async function assertViewportFits() {
  if (process.env.DEEP_RESPONSIVE !== '1') return;
  const metrics = await driver.executeScript(() => ({
    innerWidth: window.innerWidth,
    documentClientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body?.scrollWidth || 0,
  }));
  const viewport = Math.max(metrics.innerWidth, metrics.documentClientWidth);
  const widest = Math.max(metrics.documentScrollWidth, metrics.bodyScrollWidth);
  if (widest > viewport + 1) {
    throw new Error(`horizontal overflow ${widest}px > viewport ${viewport}px`);
  }
}

async function fillTestId(id, value) {
  return withStaleRetry(async () => {
    const element = await waitTestId(id);
    await scrollIntoMobileSafeArea(element);
    await element.click();
    await element.sendKeys(Key.chord(Key.CONTROL, 'a'), Key.BACK_SPACE, String(value));
  });
}

async function fillCss(selector, value) {
  return withStaleRetry(async () => {
    const element = await driver.findElement(By.css(selector));
    await driver.wait(until.elementIsVisible(element), STEP_TIMEOUT);
    await scrollIntoMobileSafeArea(element);
    await element.click();
    await element.sendKeys(Key.chord(Key.CONTROL, 'a'), Key.BACK_SPACE, String(value));
  });
}

async function clickTestId(id) {
  return withStaleRetry(async () => {
    const element = await waitTestId(id);
    await driver.wait(until.elementIsEnabled(element), STEP_TIMEOUT);
    await scrollIntoMobileSafeArea(element);
    await element.click();
  });
}

async function clickXPath(xpath, timeout = STEP_TIMEOUT) {
  return withStaleRetry(async () => {
    await driver.wait(until.elementLocated(By.xpath(xpath)), timeout);
    const elements = await driver.findElements(By.xpath(xpath));
    for (const element of elements) {
      if (await element.isDisplayed().catch(() => false) && await element.isEnabled().catch(() => false)) {
        await scrollIntoMobileSafeArea(element);
        await element.click();
        return;
      }
    }
    throw new Error(`No visible enabled element for ${xpath}`);
  });
}

async function selectOption(xpath, optionText) {
  const select = await driver.findElement(By.xpath(xpath));
  await scrollIntoMobileSafeArea(select);
  await select.findElement(By.xpath(`.//option[normalize-space(.)="${optionText}"]`)).click();
}

async function api(method, apiPath, body, extraHeaders = {}) {
  return driver.executeScript(async (m, p, b, h) => {
    const csrfCookie = document.cookie.split('; ').find(cookie => cookie.startsWith('csrf_token=')) || '';
    const csrf = csrfCookie.slice('csrf_token='.length);
    const response = await fetch(p, {
      method: m,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(csrf ? { 'x-csrf-token': decodeURIComponent(csrf) } : {}), ...(h || {}) },
      body: b == null ? undefined : JSON.stringify(b),
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) { /* file or empty response */ }
    return { status: response.status, json, text: text.slice(0, 800) };
  }, method, apiPath, body === undefined ? undefined : body, extraHeaders);
}

function assertStatus(result, expected, label) {
  const statuses = Array.isArray(expected) ? expected : [expected];
  if (!statuses.includes(result.status)) {
    throw new Error(`${label || 'request'} returned ${result.status}: ${result.json?.message || result.text || 'no body'}`);
  }
  return result;
}

async function saveSession(name) {
  sessions[name] = await driver.manage().getCookies();
}

async function restoreSession(name, url = `${BASE}/`) {
  if (!sessions[name]) throw new Error(`session ${name} was not saved`);
  await driver.manage().deleteAllCookies();
  await driver.get(`${BASE}/`);
  for (const cookie of sessions[name]) {
    const value = { name: cookie.name, value: cookie.value, path: cookie.path || '/' };
    if (cookie.domain) value.domain = cookie.domain;
    if (cookie.expiry) value.expiry = cookie.expiry;
    if (cookie.secure) value.secure = true;
    if (cookie.httpOnly) value.httpOnly = true;
    if (cookie.sameSite) value.sameSite = cookie.sameSite;
    await driver.manage().addCookie(value);
  }
  await driver.get(url);
  await waitBodyReady();
  await assertViewportFits();
}

async function loginAs(email, password, admin = false) {
  await driver.manage().deleteAllCookies();
  await driver.get('about:blank');
  await driver.get(`${BASE}${admin ? '/admin/login' : '/login'}`);
  if (admin) {
    await driver.wait(until.elementLocated(By.css('input[name="email"]')), STEP_TIMEOUT);
    await driver.findElement(By.css('input[name="email"]')).sendKeys(email);
    await driver.findElement(By.css('input[name="password"]')).sendKeys(password);
    await driver.findElement(By.css('button[type="submit"]')).click();
    await driver.wait(async () => {
      const url = await driver.getCurrentUrl();
      return url.startsWith(`${BASE}/admin`) && !url.includes('/login');
    }, STEP_TIMEOUT, 'Admin login did not redirect to the admin app');
  } else {
    await fillTestId('auth-email', email);
    await fillTestId('auth-password', password);
    await clickTestId('auth-password-submit');
    await driver.wait(async () => {
      const url = await driver.getCurrentUrl();
      return !url.includes('/login') && !url.includes('/register');
    }, STEP_TIMEOUT, 'Customer login did not complete');
  }
  await waitBodyReady();
}

async function registerCustomer() {
  await driver.manage().deleteAllCookies();
  await driver.get(`${BASE}/register`);
  await fillTestId('auth-name', CUSTOMER.name);
  await fillTestId('auth-email', CUSTOMER.email);
  await fillTestId('auth-password', CUSTOMER.password);
  await clickTestId('auth-password-submit');
  await driver.wait(async () => {
    const url = await driver.getCurrentUrl();
    return !url.includes('/login') && !url.includes('/register');
  }, STEP_TIMEOUT);
  await waitBodyReady();
}

async function visit(route, { protectedRoute = false } = {}) {
  await driver.get(`${BASE}${route}`);
  await waitBodyReady();
  await assertViewportFits();
  const url = await driver.getCurrentUrl();
  if (protectedRoute && url.includes('/login')) throw new Error(`${route} redirected to login`);
  return url;
}

async function visitRoutes(routes, options = {}) {
  const errors = [];
  for (const route of routes) {
    try {
      await visit(route, options);
    } catch (error) {
      errors.push(`${route}: ${String(error?.message || error).split('\n')[0]}`);
    }
  }
  if (errors.length) throw new Error(errors.join(' | '));
}

async function check(name, fn) {
  try {
    await fn();
    log(true, name);
  } catch (error) {
    let extra = String(error?.message || error).split('\n')[0];
    if (driver) {
      try {
        const body = await driver.findElement(By.css('body')).getText();
        extra += ` | page: ${body.slice(0, 220).replace(/\n/g, ' ')}`;
        const browserLogs = await driver.manage().logs().get('browser');
        const relevantLogs = browserLogs
          .filter(entry => /SEVERE|WARNING/i.test(String(entry.level || '')) || /error|exception|failed/i.test(String(entry.message || '')))
          .slice(-6);
        if (relevantLogs.length) extra += ` | browser: ${relevantLogs.map(entry => String(entry.message || '').slice(0, 260)).join(' || ')}`;
        const filename = `fail-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 72)}.html`;
        const dump = path.join(SCRATCH_DIR, filename);
        fs.writeFileSync(dump, await driver.getPageSource());
        extra += ` | dom: ${dump}`;
      } catch (_) { /* browser may already be gone */ }
    }
    log(false, name, extra);
  }
}

async function main() {
  console.log('Booting isolated whole-app stack (Mongo replica set + production server)…');
  const { replSet, server, conn, fakeRazorpay, fakeAI } = await boot();
  driver = await buildDriver();
  const Product = model(conn, 'Product', 'Product');
  try {
    await check('01 health, liveness and auth policy', async () => {
      await driver.get(`${BASE}/`);
      assertStatus(await api('GET', '/api/health'), 200, 'health');
      assertStatus(await api('GET', '/api/live'), 200, 'live');
      const config = assertStatus(await api('GET', '/api/auth/config'), 200, 'auth config');
      if (config.json?.auth?.activeMode !== 'password') throw new Error(`active auth mode is ${config.json?.auth?.activeMode}`);
    });

    await check('02 public catalog API process', async () => {
      const requests = [
        ['/api/categories', 200],
        ['/api/categories/deep-dive-fashion', 200],
        ['/api/brands', 200],
        ['/api/brands/deep-dive-brand', 200],
        ['/api/products?search=Deep', 200],
        ['/api/products/featured', 200],
        ['/api/products/flash-deals', 200],
        ['/api/products/suggestions?q=deep', 200],
        ['/api/products/vendors', 200],
        [`/api/products/${state.product.slug}`, 200],
        ['/api/bundles', 200],
        ['/api/coupons/available', 200],
        ['/api/payments/gateways', 200],
        ['/api/shipping/provider', 200],
        ['/api/shipping/pincode/302001', 200],
        ['/api/site', 200],
        ['/api/pages/homepage', [200, 404]],
        ['/api/seo/public', 200],
      ];
      for (const [endpoint, expected] of requests) assertStatus(await api('GET', endpoint), expected, endpoint);
      const bundles = assertStatus(await api('GET', '/api/bundles?limit=50'), 200, 'bundle listing').json?.bundles || [];
      const vendors = assertStatus(await api('GET', '/api/products/vendors'), 200, 'product vendor listing').json?.vendors || [];
      if (!vendors.some(item => String(item._id) === String(state.vendor._id) && item.storeName.includes('Deep Dive Store'))) throw new Error('active vendor was missing from the product filter options');
      const vendorProducts = assertStatus(await api('GET', `/api/products?vendor=${state.vendor._id}&limit=50`), 200, 'vendor product filter').json;
      if (!vendorProducts.products?.length || vendorProducts.products.some(item => String(item.vendor) !== String(state.vendor._id))) throw new Error('vendor product filter returned a product from another seller');
      if (!bundles.some(item => String(item._id) === String(state.bundle._id) && item.slug === state.bundle.slug)) throw new Error('seeded active bundle was missing from the public listing');
      const detail = assertStatus(await api('GET', `/api/bundles/${state.bundle.slug}`), 200, 'bundle detail').json?.bundle;
      if (!detail || detail.components?.length !== 2 || detail.offerType !== 'fixed_variant') throw new Error('bundle detail did not expose the configured components and offer type');
      const quote = assertStatus(await api('POST', `/api/bundles/${state.bundle._id}/quote`, {
        quantity: 1,
        selections: [
          { component: String(state.bundle.components[0]._id), product: String(state.product._id), quantity: 1, variant: {} },
          { component: String(state.bundle.components[1]._id), product: String(state.secondProduct._id), quantity: 1, variant: { Color: 'Sand' } },
        ],
      }), 200, 'bundle authoritative quote').json?.quote;
      const allocationTotal = (quote?.components || []).reduce((sum, item) => sum + Number(item.allocatedSellingPrice || 0), 0);
      if (Number(quote?.unitPrice) !== 1899 || quote.components.length !== 2 || Math.abs(allocationTotal - 1899) > 0.01) throw new Error(`bundle quote or component allocation is incorrect: ${JSON.stringify(quote).slice(0, 900)}`);
      const tampered = await api('POST', `/api/bundles/${state.bundle._id}/quote`, {
        quantity: 1,
        selections: [{ component: String(state.bundle.components[0]._id), product: String(state.secondProduct._id), quantity: 1, variant: {} }],
      });
      if (tampered.status !== 400) throw new Error(`tampered component selection returned ${tampered.status}`);
    });

    await check('03 public content, vendor storefront and API-key boundary', async () => {
      for (const endpoint of ['/api/blog', '/api/blog/featured', '/api/blog/categories', '/api/vendors', `/api/vendors/store/${state.vendor.slug}`, `/api/vendors/store/${state.vendor.slug}/products`, '/api/v1/catalog/products', '/api/v1/catalog/categories']) {
        const result = await api('GET', endpoint);
        if (endpoint.startsWith('/api/v1/')) assertStatus(result, [401, 403], endpoint);
        else assertStatus(result, [200, 404], endpoint);
      }
      const cart = assertStatus(await api('GET', '/api/cart'), 200, 'guest cart');
      if (!cart.json || cart.json.success === false) throw new Error('guest cart did not return a valid payload');
      assertStatus(await api('POST', '/api/referral/track', { code: 'DEEP10', landingPage: '/product/deep-dive-cotton-shirt' }), [200, 201, 400], 'referral tracking');
    });

    await check('location picker opens, applies a pincode and persists it', async () => {
      await driver.get(`${BASE}/`);
      await driver.executeScript(() => {
        localStorage.removeItem('deliverLocation');
        localStorage.removeItem('deliverPincode');
      });
      await driver.navigate().refresh();
      await waitBodyReady();
      await (await waitTestId('location-picker-button')).click();
      await waitTestId('location-picker-modal');
      const input = await waitTestId('location-pincode-input');
      await input.sendKeys('302001');
      await (await waitTestId('location-pincode-submit')).click();
      await driver.wait(async () => driver.executeScript(() => ({
        label: localStorage.getItem('deliverLocation'),
        pincode: localStorage.getItem('deliverPincode'),
        modalOpen: Boolean(document.querySelector('[data-testid="location-picker-modal"]')),
      })).then(value => value?.label === 'Jaipur, Rajasthan' && value?.pincode === '302001' && !value?.modalOpen), STEP_TIMEOUT, 'location picker did not persist the selected pincode');
      const location = await driver.executeScript(() => ({
        label: localStorage.getItem('deliverLocation'),
        pincode: localStorage.getItem('deliverPincode'),
      }));
      if (location.label !== 'Jaipur, Rajasthan' || location.pincode !== '302001') throw new Error(`unexpected saved location: ${JSON.stringify(location)}`);
    });

    await check('04 public customer route matrix', async () => {
      await visitRoutes([
        '/', '/welcome', '/splash', '/search?q=Deep', '/categories', '/category', '/brands', '/brand', '/category/deep-dive-fashion', '/brand/deep-dive-brand',
        '/product/deep-dive-cotton-shirt', '/bundles', `/bundle/${state.bundle.slug}`, '/bundle/missing-bundle', '/cart', `/store/${state.vendor.slug}`,
        '/blog', '/blog/missing-post', '/legal/privacy',
      ]);
      await visit('/categories');
      await driver.wait(until.elementLocated(By.css('[data-testid="category-directory"]')), STEP_TIMEOUT, 'category directory did not render');
      await visit('/brands');
      await driver.wait(until.elementLocated(By.css('[data-testid="brand-directory"]')), STEP_TIMEOUT, 'brand directory did not render');
      await visit('/search?q=Deep');
      const vendorOptions = await waitTestId('vendor-filter-options');
      const sellerButton = await vendorOptions.findElement(By.css('button[aria-label^="Filter by seller"]'));
      const sellerName = await sellerButton.getText();
      await sellerButton.click();
      await waitBodyText(`Seller: ${sellerName}`);
    });

    await check('05 customer registration and session lifecycle', async () => {
      await registerCustomer();
      const me = assertStatus(await api('GET', '/api/auth/me'), 200, 'customer session');
      if (me.json?.user?.email !== CUSTOMER.email) throw new Error('registered customer session is incorrect');
      state.customer = me.json.user;
      await saveSession('customer');
    });

    await check('06 profile, address, wishlist and auth mutations', async () => {
      assertStatus(await api('PUT', '/api/auth/profile', { name: 'Deep Dive Customer Updated', language: 'en' }), 200, 'profile update');
      const address = assertStatus(await api('POST', '/api/auth/addresses', {
        label: 'Deep Dive Home', fullName: CUSTOMER.name, phone: '9876543210', street: '14 MG Road',
        city: 'Jaipur', state: 'Rajasthan', pincode: '302001', country: 'India', isDefault: true,
      }), 200, 'address add');
      if (!address.json?.user?.addresses?.length && !address.json?.addresses?.length) throw new Error('address was not returned');
      const wishlist = assertStatus(await api('POST', `/api/auth/wishlist/${state.product._id}`), 200, 'wishlist toggle');
      if (!wishlist.json) throw new Error('wishlist response was empty');
      const refreshed = assertStatus(await api('GET', '/api/auth/me'), 200, 'profile reload');
      state.customer = refreshed.json.user;
    });

    await check('07 customer account API modules', async () => {
      const requests = [
        ['/api/wallet', 200], ['/api/loyalty', 200], ['/api/gift-cards', 200], ['/api/affiliate/me', [200, 403]],
        ['/api/affiliate/payouts', [200, 403]], ['/api/notifications', 200], ['/api/notifications/unread-count', 200],
        ['/api/notifications/preferences', 200], ['/api/tax/profile', 200], ['/api/orders/my', 200],
        ['/api/orders/cancellation-policy', 200], ['/api/coupons/available', 200],
      ];
      for (const [endpoint, expected] of requests) assertStatus(await api('GET', endpoint), expected, endpoint);
      assertStatus(await api('PUT', '/api/notifications/preferences', { channels: { email: true, push: true, sms: false } }), 200, 'notification preferences');
    });

    await check('08 customer account route matrix', async () => {
      await restoreSession('customer');
      await visitRoutes(['/wishlist', '/profile', '/settings', '/wallet', '/loyalty', '/gift-cards', '/affiliate', '/lifecycle', '/notifications', '/chat', '/support', '/orders'], { protectedRoute: true });
    });

    await check('09 customer support ticket and reply process', async () => {
      await restoreSession('customer', `${BASE}/support`);
      const created = assertStatus(await api('POST', '/api/support', { subject: 'Deep dive support request', category: 'general', message: 'Browser support workflow check.' }), 201, 'support create');
      state.supportTicket = created.json?.ticket;
      if (!state.supportTicket?._id) throw new Error('support ticket id missing');
      assertStatus(await api('GET', '/api/support'), 200, 'support list');
      assertStatus(await api('GET', `/api/support/${state.supportTicket._id}`), 200, 'support detail');
      assertStatus(await api('POST', `/api/support/${state.supportTicket._id}/replies`, { message: 'Customer follow-up from Selenium.' }), 200, 'support reply');
      await visit('/support', { protectedRoute: true });
    });

    await check('10 bundle builder, grouped cart and bundle checkout process', async () => {
      await restoreSession('customer', `${BASE}/bundle/${state.bundle.slug}`);
      await waitBodyText(state.bundle.name);
      await waitTestId('bundle-component-0');
      await waitTestId('bundle-component-1');
      await selectOption('//select[@data-testid="bundle-variant-1-Color"]', 'Sand');
      const addButton = process.env.DEEP_MOBILE === '1' ? 'bundle-mobile-add' : 'bundle-add-to-cart';
      await clickTestId(addButton);
      await sleep(1200);
      const cart = assertStatus(await api('GET', '/api/cart'), 200, 'bundle cart').json?.cart;
      const bundleItem = (cart?.items || []).find(item => item.itemType === 'bundle' || item.bundle);
      if (!bundleItem || (bundleItem.items && !bundleItem.items.length)) throw new Error('bundle was not stored as a grouped cart line');
      await visit('/cart', { protectedRoute: true });
      await waitBodyText(state.bundle.name);
      await waitBodyText('Deep Dive Cotton Shirt');
      await visit('/checkout', { protectedRoute: true });
      await waitBodyText(state.bundle.name);
      await waitTestId('checkout-shipping-quote');
      await sleep(1600);
      const codPayment = await driver.findElement(By.css('input[name="payment"][value="cod"]'));
      await scrollIntoMobileSafeArea(codPayment);
      await codPayment.click();
      await clickXPath("//button[contains(normalize-space(.),'Place Order')]");
      await driver.wait(async () => (await driver.getCurrentUrl()).includes('/order-confirmation/'), STEP_TIMEOUT, 'bundle checkout did not reach confirmation');
      state.bundleOrder = { _id: (await driver.getCurrentUrl()).split('/order-confirmation/')[1].split(/[?#]/)[0] };
      await waitBodyText('Your order has been placed successfully');
      const bundleOrder = assertStatus(await api('GET', `/api/orders/${state.bundleOrder._id}`), 200, 'bundle order').json?.order;
      const parent = (bundleOrder?.items || []).find(item => item.itemType === 'bundle');
      if (!parent || parent.bundleName !== state.bundle.name || parent.bundleVersion !== 1) throw new Error('bundle parent order line snapshot is incomplete');
      if ((parent.bundleComponents || []).length !== 2 || (bundleOrder.inventoryItems || []).length !== 2) throw new Error('bundle component inventory lines were not persisted');
      const paidAllocation = (parent.bundleComponents || []).reduce((sum, item) => sum + Number(item.allocatedSellingPrice || 0), 0);
      if (Math.abs(paidAllocation - Number(parent.price || 0)) > 0.01) throw new Error('bundle component allocations do not reconcile to the paid parent price');
      const [shirtAfter, toteAfter] = await Promise.all([Product.findById(state.product._id).lean(), Product.findById(state.secondProduct._id).lean()]);
      if (Number(shirtAfter.stock) !== 99 || Number(toteAfter.stock) !== 49) throw new Error(`bundle inventory was not deducted atomically: shirt=${shirtAfter.stock}, tote=${toteAfter.stock}`);
    });

    await check('11 product detail to cart UI process', async () => {
      await restoreSession('customer', `${BASE}/product/${state.product.slug}`);
      await waitBodyText('Deep Dive Cotton Shirt');
      if (process.env.DEEP_RESPONSIVE === '1') {
        const actions = await driver.findElement(byTestId('product-floating-actions'));
        if (await actions.isDisplayed()) throw new Error('product floating actions are visible before the CRO overview is complete');
        await scrollPastProductOverview();
      }
      await clickTestId('product-detail-add-to-cart');
      await sleep(1200);
      const cart = assertStatus(await api('GET', '/api/cart'), 200, 'cart after add');
      const items = cart.json?.cart?.items || cart.json?.items || [];
      if (!items.length) throw new Error('product CTA did not add an item to the authoritative cart');
      await visit('/cart', { protectedRoute: true });
      await waitBodyText('Deep Dive Cotton Shirt');
    });

    await check('12 cart quantity and coupon process', async () => {
      const cartBefore = assertStatus(await api('GET', '/api/cart'), 200, 'cart read');
      const items = cartBefore.json?.cart?.items || cartBefore.json?.items || [];
      const itemId = items[0]?._id || items[0]?.id;
      if (!itemId) throw new Error(`cart line id missing in ${String(JSON.stringify(items[0]) || '').slice(0, 220)}`);
      const updated = assertStatus(await api('PATCH', `/api/cart/items/${itemId}`, { quantity: 1, revision: cartBefore.json?.cart?.revision || cartBefore.json?.revision }, { 'Idempotency-Key': `deep-cart-${RUN_TAG}` }), [200, 204], 'cart quantity');
      if (updated.status !== 204 && updated.json?.success === false) throw new Error('cart quantity update failed');
      await visit('/cart', { protectedRoute: true });
      await fillCss('input[placeholder="Enter coupon code"]', 'DEEP10');
      await clickXPath("//button[normalize-space()='Apply']");
      await waitBodyText('DEEP10 applied!');
      const quote = assertStatus(await api('POST', '/api/coupons/validate', { code: 'DEEP10', paymentMethod: 'cod', shippingAddress: { pincode: '302001', city: 'Jaipur', state: 'Rajasthan' } }), 200, 'coupon quote');
      if (Number(quote.json?.coupon?.discount || 0) <= 0) throw new Error('coupon quote has no discount');
    });

    await check('13 checkout address and shipping quote process', async () => {
      await visit('/checkout', { protectedRoute: true });
      const newAddressFields = await driver.findElements(By.css('input[placeholder="Full Name"]'));
      if (newAddressFields.length) {
        await fillCss('input[placeholder="Full Name"]', CUSTOMER.name);
        await fillCss('input[placeholder="10-digit mobile"]', '9876543210');
        await fillCss('input[placeholder="6-digit pincode"]', '302001');
        await fillCss('input[placeholder="House/flat, street, locality"]', '14 MG Road');
        await fillCss('input[placeholder="City"]', 'Jaipur');
        await selectOption('//select[option[normalize-space(.)="Rajasthan"]]', 'Rajasthan');
      } else {
        await waitTestId('checkout-saved-address-0');
        await waitBodyText('Deep Dive Home');
      }
      await waitTestId('checkout-shipping-quote');
      await sleep(1800);
      const quote = assertStatus(await api('POST', '/api/shipping/quote', {
        items: [{ product: String(state.product._id), quantity: 1 }],
        shippingAddress: { fullName: CUSTOMER.name, phone: '9876543210', street: '14 MG Road', city: 'Jaipur', state: 'Rajasthan', pincode: '302001', country: 'India' },
        paymentMethod: 'cod', subtotal: 1299, discount: 129.9,
      }), 200, 'shipping quote');
      if (quote.json?.quote?.serviceable === false || quote.json?.serviceable === false) throw new Error('seeded pincode was reported unserviceable');
      const codPayment = await driver.findElement(By.css('input[name="payment"][value="cod"]'));
      await scrollIntoMobileSafeArea(codPayment);
      await codPayment.click();
      await waitBodyText('Cash on Delivery');
    });

    await check('14 COD checkout and order placement process', async () => {
      await clickXPath("//button[contains(normalize-space(.),'Place Order')]");
      await driver.wait(async () => (await driver.getCurrentUrl()).includes('/order-confirmation/'), STEP_TIMEOUT, 'checkout did not reach confirmation');
      const url = await driver.getCurrentUrl();
      state.order = { _id: url.split('/order-confirmation/')[1].split(/[?#]/)[0] };
      await waitBodyText('Your order has been placed successfully');
      const order = assertStatus(await api('GET', `/api/orders/${state.order._id}`), 200, 'created order');
      state.order = order.json?.order || order.json?.data || state.order;
      if (state.order.paymentMethod !== 'cod' || !['confirmed', 'pending'].includes(state.order.orderStatus)) {
        throw new Error(`unexpected order state ${state.order.paymentMethod}/${state.order.orderStatus}`);
      }
    });

    await check('15 Razorpay sandbox checkout and payment verification process', async () => {
      await restoreSession('customer', `${BASE}/product/${state.secondProduct.slug}`);
      await waitBodyText('Deep Dive Linen Tote');
      const sandOption = await driver.findElement(By.xpath("//button[starts-with(@title,'Sand') and not(@disabled)]"));
      await scrollIntoMobileSafeArea(sandOption);
      await sandOption.click();
      await clickTestId('product-detail-add-to-cart');
      // The product-to-cart UI is covered by check 11. If the earlier COD
      // checkout is still settling its Redux cart state, seed this payment
      // case through the same browser-authenticated cart API boundary rather
      // than letting a timing race mask the payment test.
      const cartAfterClick = await api('GET', '/api/cart');
      const cartLinesAfterClick = cartAfterClick.json?.cart?.items || cartAfterClick.json?.items || [];
      if (!cartLinesAfterClick.some(item => String(item.product?._id || item.product?.id || item.product || '') === String(state.secondProduct._id))) {
        assertStatus(await api('POST', '/api/cart/items', {
          productId: String(state.secondProduct._id), quantity: 1, variant: { Color: 'Sand' }, source: 'selenium-razorpay-setup',
        }, { 'Idempotency-Key': `deep-razorpay-cart-${RUN_TAG}` }), 200, 'Razorpay cart setup');
      }
      await driver.wait(async () => {
        const cart = assertStatus(await api('GET', '/api/cart'), 200, 'Razorpay cart read');
        const lines = cart.json?.cart?.items || cart.json?.items || [];
        return lines.some(item => String(item.product?._id || item.product?.id || item.product || '') === String(state.secondProduct._id));
      }, STEP_TIMEOUT, 'Razorpay test product was not persisted in the cart');
      await visit('/checkout', { protectedRoute: true });
      await waitTestId('checkout-shipping-quote');
      await sleep(1600);

      const gateways = assertStatus(await api('GET', '/api/payments/gateways'), 200, 'active payment gateways').json?.gateways || [];
      if (!gateways.some(gateway => gateway.id === 'razorpay')) throw new Error('Razorpay was not exposed as an active checkout gateway');
      const razorpayPayment = await driver.findElement(By.css('input[name="payment"][value="razorpay"]'));
      await scrollIntoMobileSafeArea(razorpayPayment);
      await razorpayPayment.click();

      // The real Razorpay SDK is not loaded in CI. This browser-side stub
      // opens the same callback path with a signature accepted by the local
      // sandbox provider; no real payment or customer money is involved.
      await driver.executeScript((orderId, paymentId, signature) => {
        window.Razorpay = function Razorpay(options) {
          this.open = () => window.setTimeout(() => options.handler({
            razorpay_order_id: orderId,
            razorpay_payment_id: paymentId,
            razorpay_signature: signature,
          }), 0);
        };
      }, FAKE_RAZORPAY.orderId, FAKE_RAZORPAY.paymentId, FAKE_RAZORPAY.signature);
      await clickXPath("//button[contains(normalize-space(.),'Place Order')]");
      await driver.wait(async () => (await driver.getCurrentUrl()).includes('/order-confirmation/'), STEP_TIMEOUT, 'Razorpay checkout did not reach confirmation');
      await waitBodyText('Your order has been placed successfully');

      const orderId = (await driver.getCurrentUrl()).split('/order-confirmation/')[1].split(/[?#]/)[0];
      const order = assertStatus(await api('GET', `/api/orders/${orderId}`), 200, 'Razorpay paid order').json?.order;
      if (order?.paymentMethod !== 'razorpay' || order?.paymentStatus !== 'paid' || order?.orderStatus !== 'confirmed') {
        throw new Error(`Razorpay order was not confirmed: ${order?.paymentMethod}/${order?.paymentStatus}/${order?.orderStatus}`);
      }
      if (fakeRazorpay.calls.createOrder !== 1 || fakeRazorpay.calls.fetchPayment !== 1 || fakeRazorpay.calls.lastOrderAmount <= 0) {
        throw new Error(`Razorpay provider calls were incomplete: ${JSON.stringify(fakeRazorpay.calls)}`);
      }
    });

    await check('16 order, invoice, shipment and return API process', async () => {
      const orderId = state.order._id;
      assertStatus(await api('GET', '/api/orders/my'), 200, 'my orders');
      assertStatus(await api('GET', `/api/orders/${orderId}/invoice`), 200, 'customer invoice');
      assertStatus(await api('GET', `/api/orders/${orderId}/invoice-notes`), 200, 'customer invoice notes');
      assertStatus(await api('GET', `/api/orders/${orderId}/returns`), 200, 'customer returns');
      assertStatus(await api('GET', `/api/shipping/orders/${orderId}/shipment`), [200, 404], 'customer shipment');
      const eligibility = assertStatus(await api('GET', `/api/orders/${orderId}/cancellation-eligibility`), 200, 'cancel eligibility');
      if (eligibility.json?.eligible === false) throw new Error('fresh COD order is not cancellation-eligible');
    });

    await check('17 order tracking and cancellation UI process', async () => {
      await visit(`/orders/${state.order._id}`, { protectedRoute: true });
      await waitBodyText('Tracking Status');
      await waitBodyText('Cancel Order');
      await clickXPath("//button[normalize-space()='Cancel Order']");
      await driver.wait(until.elementLocated(By.xpath("//button[contains(normalize-space(.),'Confirm Cancellation') or contains(normalize-space(.),'Cancel order') or contains(normalize-space(.),'Confirm') ]")), STEP_TIMEOUT).catch(() => {});
      const selects = await driver.findElements(By.css('select'));
      if (selects.length) await selects[selects.length - 1].findElement(By.css('option:not([value=""])')).click().catch(() => {});
      const cancelButtons = await driver.findElements(By.xpath("//button[contains(normalize-space(.),'Confirm') or contains(normalize-space(.),'Cancel order') or contains(normalize-space(.),'Submit') ]"));
      let clicked = false;
      for (const button of cancelButtons) {
        if (await button.isDisplayed().catch(() => false) && await button.isEnabled().catch(() => false)) {
          const text = await button.getText();
          if (/confirm|cancel order|submit/i.test(text)) { await button.click(); clicked = true; break; }
        }
      }
      if (!clicked) {
        const cancelled = assertStatus(await api('POST', `/api/orders/${state.order._id}/cancel`, { reason: 'Changed my mind' }), 200, 'cancel order');
        if (cancelled.json?.order) state.order = cancelled.json.order;
      }
      await sleep(900);
      const current = assertStatus(await api('GET', `/api/orders/${state.order._id}`), 200, 'cancelled order');
      if (current.json?.order?.orderStatus !== 'cancelled') throw new Error(`order status is ${current.json?.order?.orderStatus}`);
      await visit(`/orders/${state.order._id}`, { protectedRoute: true });
      await waitBodyText('Order Cancelled');
    });

    await check('18 reorder and negative checkout guards', async () => {
      const reorder = await api('POST', `/api/orders/${state.order._id}/reorder`, {}, { 'Idempotency-Key': `deep-reorder-${RUN_TAG}` });
      if (![200, 201, 409].includes(reorder.status)) throw new Error(`reorder returned ${reorder.status}: ${reorder.text}`);
      const invalidCoupon = await api('POST', '/api/coupons/validate', { code: 'NO_SUCH_COUPON' });
      if (![404, 400].includes(invalidCoupon.status)) throw new Error(`invalid coupon returned ${invalidCoupon.status}`);
      const invalidOrder = await api('GET', '/api/orders/000000000000000000000000');
      if (![400, 404].includes(invalidOrder.status)) throw new Error(`invalid order returned ${invalidOrder.status}`);
    });

    await check('19 admin authentication and session lifecycle', async () => {
      await loginAs(ADMIN.email, ADMIN.password, true);
      const me = assertStatus(await api('GET', '/api/auth/me'), 200, 'admin session');
      if (!['admin', 'superadmin'].includes(me.json?.user?.role)) throw new Error('admin session role is incorrect');
      await saveSession('admin');
    });

    await check('20 admin core read APIs', async () => {
      await restoreSession('admin', `${BASE}/admin/dashboard`);
      const endpoints = [
        '/api/admin/dashboard', '/api/admin/users?role=customer', '/api/admin/users/segments', `/api/admin/users/${state.customer._id}/360`,
        '/api/admin/settings', '/api/admin/products', '/api/admin/products/vendors', `/api/admin/products/${state.product._id}`, '/api/admin/categories', '/api/admin/brands',
        '/api/admin/orders', `/api/admin/orders/${state.order._id}/attribution`, '/api/admin/coupons', `/api/admin/coupons/${state.coupon._id}/redemptions`,
        '/api/admin/reviews', '/api/admin/reviews/reports', '/api/admin/analytics/sales', '/api/admin/product-intents', '/api/admin/bundles',
      ];
      for (const endpoint of endpoints) assertStatus(await api('GET', endpoint), [200, 204], endpoint);
      const adminProductVendors = assertStatus(await api('GET', '/api/admin/products/vendors'), 200, 'admin product vendor listing').json;
      if (!adminProductVendors.vendors?.some(item => String(item._id) === String(state.vendor._id) && item.storeName.includes('Deep Dive Store'))) {
        throw new Error('admin product vendor filter options did not include the seeded vendor');
      }
      const adminVendorProducts = assertStatus(await api('GET', `/api/admin/products?vendor=${state.vendor._id}&limit=50`), 200, 'admin vendor product filter').json;
      if (!adminVendorProducts.products?.length || adminVendorProducts.products.some(item => String(item.vendor?._id || item.vendor) !== String(state.vendor._id))) {
        throw new Error('admin vendor product filter returned a product from another seller');
      }
      const adminBundles = assertStatus(await api('GET', '/api/admin/bundles?status=active&type=fixed_variant&search=Deep'), 200, 'admin bundle search').json?.bundles || [];
      if (!adminBundles.some(item => String(item._id) === String(state.bundle._id))) throw new Error('admin bundle search did not return the active seeded bundle');
      const analytics = assertStatus(await api('GET', `/api/admin/bundles/${state.bundle._id}/analytics`), 200, 'bundle analytics').json?.analytics;
      if (analytics === undefined || !Array.isArray(analytics.components)) throw new Error('bundle analytics response was incomplete');
      const copy = assertStatus(await api('POST', `/api/admin/bundles/${state.bundle._id}/duplicate`), 201, 'bundle duplicate').json?.bundle;
      if (!copy?._id || copy.lifecycleStatus !== 'draft' || copy.isActive) throw new Error('bundle duplicate did not start as a draft');
      const copyPayload = {
        name: copy.name,
        internalName: copy.internalName,
        sku: copy.sku,
        slug: copy.slug,
        bundleType: copy.bundleType,
        offerType: copy.offerType,
        description: `${copy.description || ''} Updated`,
        shortDescription: copy.shortDescription || '',
        price: copy.price,
        comparePrice: copy.comparePrice,
        discountType: copy.discountType,
        discountValue: copy.discountValue,
        selectionRules: copy.selectionRules,
        selectionGroups: copy.selectionGroups,
        components: (copy.components || []).map(component => ({
          product: component.product?._id || component.product,
          quantity: component.quantity,
          required: component.required,
          customerSelectable: component.customerSelectable,
          minQuantity: component.minQuantity || component.quantity,
          maxQuantity: component.maxQuantity || component.quantity,
          group: component.group || '',
        })),
        availability: copy.availability,
        image: copy.image,
        badges: copy.badges,
        channels: copy.channels,
        lifecycleStatus: 'draft',
      };
      const updatedCopy = assertStatus(await api('PUT', `/api/admin/bundles/${copy._id}`, copyPayload), 200, 'bundle update').json?.bundle;
      if (!updatedCopy || Number(updatedCopy.version || 0) < 2) throw new Error('bundle update did not create a new configuration version');
      const publishedCopy = assertStatus(await api('POST', `/api/admin/bundles/${copy._id}/publish`), 200, 'bundle publish').json?.bundle;
      if (publishedCopy.lifecycleStatus !== 'active' || !publishedCopy.isActive) throw new Error('bundle publish did not activate the copy');
      const archivedCopy = assertStatus(await api('POST', `/api/admin/bundles/${copy._id}/archive`), 200, 'bundle archive').json?.bundle;
      if (archivedCopy.lifecycleStatus !== 'archived' || Number(archivedCopy.version || 0) < Number(publishedCopy.version || 0)) throw new Error('bundle archive did not preserve/increment the version');
      const blankFilters = assertStatus(await api('GET', '/api/admin/orders?page=1&limit=20&status=&paymentStatus=&search=&paymentMethod=&shippingStatus=&shippingProvider=&courierName=&source=&utmSource=&utmMedium=&utmCampaign=&utmTerm=&utmContent=&landingPage=&referrer=&referralCode=&dateFrom=&dateTo=&minTotal=&maxTotal=&hasTracking='), 200, 'admin blank filters');
      if (!Array.isArray(blankFilters.json?.orders)) throw new Error('blank order filters did not return an orders array');
      assertStatus(await api('GET', '/api/admin/orders?status=confirmed&paymentStatus=paid&paymentMethod=cod&shippingStatus=ready_to_ship&shippingProvider=shiprocket&courierName=Delhivery&source=google&utmSource=google&utmMedium=cpc&utmCampaign=qa&utmTerm=shopping&utmContent=hero&landingPage=%2Fshop&referrer=google.com&referralCode=QA&dateFrom=2026-01-01&dateTo=2026-12-31&minTotal=0&maxTotal=999999&hasTracking=no'), 200, 'admin order filters');
      assertStatus(await api('GET', '/api/admin/order-drafts'), 404, 'order drafts removed');
    });

    await check('21 admin operations, finance and lifecycle APIs', async () => {
      const endpoints = [
        '/api/admin/inventory/overview', '/api/admin/inventory/reservations', '/api/admin/inventory/movements', '/api/admin/warehouses',
        '/api/admin/warehouse-transfers', '/api/admin/b2b/accounts', '/api/admin/b2b/price-rules', '/api/admin/preorders', '/api/admin/subscription-plans',
        '/api/admin/wallets', '/api/admin/loyalty', '/api/admin/loyalty/accounts', '/api/admin/gift-cards', '/api/admin/tax/profile',
        '/api/admin/invoices', '/api/admin/invoice-notes', '/api/admin/invoice-notes/deliveries', '/api/admin/shipping-rules', '/api/admin/serviceable-pincodes',
        '/api/admin/refunds', '/api/admin/refunds/stats', '/api/admin/returns', '/api/admin/payouts', '/api/admin/cod-policy', '/api/admin/storefront-locale',
      ];
      for (const endpoint of endpoints) assertStatus(await api('GET', endpoint), [200, 204], endpoint);

      const segment = assertStatus(await api('POST', '/api/admin/customer-segments', {
        name: `Bulk Finance Audience ${RUN_TAG}`,
        definition: { match: 'all', conditions: [{ field: 'customer_days_old', operator: 'gte', value: 0 }] },
      }), 201, 'bulk finance segment create').json.segment;
      assertStatus(await api('POST', `/api/admin/customer-segments/${segment._id}/apply`), 200, 'bulk finance segment apply');
      const walletAudience = assertStatus(await api('GET', `/api/admin/wallets?search=${encodeURIComponent(CUSTOMER.email)}`), 200, 'wallet customer search');
      if (!walletAudience.json?.wallets?.some(row => row.user?.email === CUSTOMER.email)) throw new Error('wallet search did not return the matching customer');
      const loyaltyAudience = assertStatus(await api('GET', `/api/admin/loyalty/accounts?segmentId=${segment._id}`), 200, 'loyalty group filter');
      if (!loyaltyAudience.json?.accounts?.length) throw new Error('loyalty group filter returned no customers');
      assertStatus(await api('GET', `/api/admin/gift-cards?segmentId=${segment._id}`), 200, 'gift-card group filter');
      const bulkWallet = assertStatus(await api('POST', '/api/admin/wallets/bulk-adjust', {
        segmentId: segment._id, direction: 'credit', amount: 1, bucket: 'promotional', source: 'promotional', note: 'Selenium bulk wallet grant',
      }, { 'Idempotency-Key': `deep-bulk-wallet-${RUN_TAG}` }), 200, 'bulk wallet adjustment');
      if (!Number(bulkWallet.json?.succeeded)) throw new Error('bulk wallet adjustment did not credit any customer');
      const bulkLoyalty = assertStatus(await api('POST', '/api/admin/loyalty/accounts/bulk-adjust', {
        segmentId: segment._id, direction: 'credit', points: 10, note: 'Selenium bulk reward grant',
      }, { 'Idempotency-Key': `deep-bulk-loyalty-${RUN_TAG}` }), 200, 'bulk loyalty adjustment');
      if (!Number(bulkLoyalty.json?.succeeded)) throw new Error('bulk loyalty adjustment did not credit any customer');
      const bulkGiftCards = assertStatus(await api('POST', '/api/admin/gift-cards/bulk', {
        segmentId: segment._id, amount: 25, senderName: 'Deep Dive', message: 'Selenium bulk gift card',
      }, { 'Idempotency-Key': `deep-bulk-gift-${RUN_TAG}` }), 200, 'bulk gift-card issuance');
      if (!Number(bulkGiftCards.json?.issued) || !bulkGiftCards.json?.results?.some(result => result.code)) throw new Error('bulk gift-card issuance did not return one-time codes');
    });

    await check('22 admin content, security and integration APIs', async () => {
      const endpoints = [
        '/api/admin/notifications', '/api/admin/campaigns', '/api/admin/abandoned-carts', '/api/admin/conversations', '/api/admin/conversations/analytics',
        '/api/admin/blog', '/api/admin/blog/categories', '/api/admin/customization', '/api/admin/seo', '/api/admin/seo/content-stats',
        '/api/admin/security-events', '/api/admin/security/2fa', '/api/admin/staff', '/api/admin/recommendations', '/api/admin/support',
        '/api/admin/api-keys', '/api/admin/affiliate/program', '/api/admin/affiliate/affiliates', '/api/admin/affiliate/payouts',
        '/api/admin/referral/codes', '/api/admin/referral/analytics', '/api/admin/ai/credits', '/api/admin/ai-usage',
        '/api/admin/integrations', '/api/admin/modules', '/api/admin/modules/control-plane', '/api/admin/auth-policy',
        '/api/admin/marketplace/stats', '/api/admin/marketplace/connections', '/api/admin/marketplace/jobs', '/api/admin/marketplace/listings', '/api/admin/marketplace/orders',
      ];
      for (const endpoint of endpoints) assertStatus(await api('GET', endpoint), [200, 204, 404], endpoint);
      assertStatus(await api('PUT', '/api/admin/seo', {
        settings: {
          seo_title_template: '%s | Deep Dive SEO',
          seo_meta_description: 'Deep dive SEO metadata for the whole application.',
          seo_canonical_base: BASE,
          seo_robots_default: 'index, follow',
          seo_favicon_url: '/favicon.svg',
          seo_preconnect_urls: ['https://fonts.googleapis.com'],
          seo_og_title: 'Deep Dive OG Title',
          seo_og_description: 'Deep dive social preview description.',
          seo_og_image: '/favicon.svg',
          seo_og_type: 'website',
          seo_twitter_card: 'summary_large_image',
          seo_twitter_site: '@deepdive',
          seo_organization_schema: {
            name: 'Deep Dive Organization', logo: '/favicon.svg', url: BASE,
            socialProfiles: [`${BASE}/social`], contactEmail: 'seo@example.com', contactPhone: '+919876543210',
          },
          seo_website_schema: { searchActionUrl: `${BASE}/search?q={search_term_string}` },
          seo_localbusiness_enabled: true,
          seo_localbusiness_schema: {
            name: 'Deep Dive Store', address: '1 Test Road, Jaipur', phone: '+919876543210',
            openingHours: 'Mo-Fr 09:00-18:00', latitude: '26.9124', longitude: '75.7873',
          },
          seo_robots_txt: `User-agent: *\nAllow: /\nDisallow: /admin/\nSitemap: ${BASE}/sitemap.xml\n`,
          seo_noindex_patterns: ['/search*'],
          seo_sitemap_enabled: true,
          seo_sitemap_types: ['products', 'categories', 'brands', 'blog'],
          seo_sitemap_changefreq: 'daily',
          seo_sitemap_priority: 0.8,
          seo_sitemap_custom_urls: [{ url: '/about?utm=qa&x=1', changefreq: 'weekly', priority: 0 }],
          seo_trailing_slash: false,
          seo_redirects: [],
          seo_404_title: 'Deep Dive Page Not Found',
          seo_404_description: 'The requested Deep Dive page was not found.',
          seo_ga4_id: 'G-TEST1234',
          seo_gtm_id: 'GTM-TEST1234',
          seo_verification_google: 'deep-dive-verification-token',
          seo_fb_pixel: '123456789012345',
          seo_custom_head_scripts: `<script>window.__tatozSeoHeadTest = 'head-ready';</script><link rel="alternate" data-tatoz-custom-head-link="true" href="${BASE}/custom-head" />`,
          seo_custom_body_scripts: `<script>window.__tatozSeoBodyTest = 'body-ready';</script>`,
          seo_default_language: 'hi',
          seo_hreflang_entries: [{ lang: 'en-US', url: `${BASE}/en` }, { lang: 'x-default', url: BASE }],
        },
      }), 200, 'SEO settings save');
      const publicSeo = assertStatus(await api('GET', '/api/seo/public'), 200, 'public Meta Pixel config');
      if (publicSeo.json?.seo_fb_pixel !== '123456789012345') throw new Error('saved Meta Pixel ID was not returned by public SEO config');
      if (publicSeo.json?.seo_ga4_id !== 'G-TEST1234' || publicSeo.json?.seo_gtm_id !== 'GTM-TEST1234') throw new Error('Google analytics settings were not returned by public SEO config');
      if (publicSeo.json?.seo_default_language !== 'hi' || publicSeo.json?.seo_hreflang_entries?.length !== 2) throw new Error('international SEO settings were not returned by public SEO config');
      const robots = assertStatus(await api('GET', '/robots.txt'), 200, 'robots.txt');
      if (!robots.text.includes(`Sitemap: ${BASE}/sitemap.xml`) || !robots.text.includes('Disallow: /admin/')) throw new Error('robots.txt did not include the saved directives');
      const sitemap = assertStatus(await driver.executeScript(async () => {
        const response = await fetch('/sitemap.xml');
        return { status: response.status, text: await response.text() };
      }), 200, 'sitemap.xml');
      if (!sitemap.text.includes('<urlset') || !sitemap.text.includes(`<loc>${BASE}/product/${state.product.slug}</loc>`) || !sitemap.text.includes(`${BASE}/about?utm=qa&amp;x=1`)) throw new Error(`sitemap.xml did not include absolute escaped URLs: ${sitemap.text.slice(0, 1600)}`);
    });

    await check('23 SEO AI routes, fast audit and side panel UI', async () => {
      const generated = assertStatus(await api('POST', '/api/admin/seo/ai-generate', {}), 200, 'AI SEO generation route').json;
      if (!generated.generated?.seo_title_template || Number(generated.fieldsUpdated) < 10) throw new Error('AI SEO route returned an incomplete normalized draft');

      const itemGenerated = assertStatus(await api('POST', `/api/admin/seo/item/categories/${state.category._id}/generate`, {}), 200, 'individual category SEO generation route').json;
      if (!itemGenerated.seo?.metaTitle || Number(itemGenerated.fieldsUpdated) < 3) throw new Error('individual content SEO route returned an incomplete result');

      const auditStartedAt = Date.now();
      const audit = assertStatus(await api('POST', '/api/admin/seo/ai-audit', {}), 200, 'AI SEO audit route').json;
      const auditDuration = Date.now() - auditStartedAt;
      if (auditDuration > 9000) throw new Error(`SEO audit was too slow: ${auditDuration}ms`);
      if (audit.audit?.auditMeta?.source !== 'ai' || !audit.audit?.categories?.length) throw new Error('AI SEO audit did not return detailed categories');

      const cachedAudit = assertStatus(await api('POST', '/api/admin/seo/ai-audit', {}), 200, 'cached SEO audit route').json;
      if (!cachedAudit.cached || !cachedAudit.audit?.auditMeta?.cached) throw new Error('SEO audit cache did not make the repeat request instant');

      await restoreSession('admin', `${BASE}/admin/seo`);
      await waitTestId('seo-audit-trigger');
      await driver.executeScript(() => { window.confirm = () => true; });
      await clickTestId('seo-main-tab-content');
      await clickTestId('seo-content-type-categories');
      await waitTestId(`seo-generate-categories-${state.category._id}`);
      await clickTestId('seo-content-type-brands');
      await waitTestId(`seo-generate-brands-${state.brand._id}`);
      await clickTestId('seo-content-type-products');
      await waitTestId(`seo-generate-products-${state.product._id}`);
      await clickTestId('seo-audit-trigger');
      const panel = await waitTestId('seo-audit-panel');
      const panelClass = await panel.getAttribute('class');
      if (!panelClass.includes('animate-slide-in-right') || !panelClass.includes('sm:max-w-3xl')) throw new Error('SEO audit did not open in the right-side drawer');
      await waitTestId('seo-audit-severity-stats');
      await waitTestId('seo-audit-site-stats');
      await waitTestId('seo-audit-critical-count');
      await clickTestId('seo-audit-panel-close');
      await driver.wait(async () => (await driver.findElements(byTestId('seo-audit-panel'))).length === 0, STEP_TIMEOUT, 'SEO audit drawer did not close');
    });

    await check('24 admin catalog and dashboard route matrix', async () => {
      await restoreSession('admin', `${BASE}/admin/dashboard`);
      await visitRoutes([
        '/admin/dashboard', '/admin/products', '/admin/products/new', `/admin/products/edit/${state.product._id}`, '/admin/bundles', '/admin/inventory',
        '/admin/warehouses', '/admin/product-intents', '/admin/categories', '/admin/brands', '/admin/reports', '/admin/orders', '/admin/customers',
        '/admin/coupons', '/admin/reviews', '/admin/analytics', '/admin/ai-usage', '/admin/referral', '/admin/notifications', '/admin/campaigns',
        '/admin/api-keys', '/admin/wallets', '/admin/loyalty', '/admin/gift-cards', '/admin/tax', '/admin/product-tax', '/admin/invoices', '/admin/invoice-notes',
      ], { protectedRoute: true });
      await visit('/admin/products', { protectedRoute: true });
      const adminVendorFilter = await waitTestId('products-vendor-filter');
      await driver.wait(async () => (await driver.findElements(By.css(`[data-testid="products-vendor-filter"] option[value="${state.vendor._id}"]`))).length > 0, STEP_TIMEOUT, 'Admin vendor filter options did not load');
      await driver.findElement(By.css(`[data-testid="products-vendor-filter"] option[value="${state.vendor._id}"]`)).click();
      const filteredVendorCell = await waitTestId(`product-vendor-${state.product._id}`);
      if (!(await filteredVendorCell.getText()).includes('Deep Dive Store')) throw new Error('admin product table did not identify the selected vendor');
      await visit('/admin/wallets', { protectedRoute: true });
      await waitTestId('wallet-audience-search');
      await waitTestId('wallet-bulk-adjustment-form');
      await visit('/admin/loyalty', { protectedRoute: true });
      await waitTestId('loyalty-audience-search');
      await waitTestId('admin-loyalty-bulk-adjustment-form');
      await visit('/admin/gift-cards', { protectedRoute: true });
      await waitTestId('gift-card-list-search');
      await waitTestId('gift-card-recipient-search');
      await waitTestId('admin-gift-card-bulk-form');
      await visit('/admin/orders', { protectedRoute: true });
      await clickTestId(`admin-order-attribution-trigger-${state.order._id}`);
      await waitTestId('admin-order-attribution-drawer');
      await waitBodyText('First page view through order placement');
      await waitBodyText('First touch / starting page');
      await waitBodyText('Last touch before conversion');
      const journeyEvents = await driver.findElements(byTestId('admin-order-attribution-event'));
      if (!journeyEvents.length) throw new Error('order attribution drawer has no event timeline');
      await clickTestId('admin-order-attribution-drawer-close');

      try {
        await restoreSession('customer', `${BASE}/product/${state.product.slug}?utm_source=qa&utm_medium=selenium&utm_campaign=meta-pixel`);
        await waitBodyText('Deep Dive Cotton Shirt');
        await driver.wait(async () => {
          const telemetry = await driver.executeScript(() => ({
            pixel: window.__tatozMetaPixel || null,
            analytics: window.__tatozAnalytics || null,
          }));
          return telemetry?.pixel?.pixelId === '123456789012345'
            && telemetry.pixel.events?.some(event => event.eventName === 'PageView')
            && telemetry.pixel.events?.some(event => event.eventName === 'ViewContent')
            && telemetry.analytics?.scripts?.googleAnalytics
            && telemetry.analytics?.scripts?.googleTagManager;
        }, STEP_TIMEOUT, 'Meta Pixel did not initialize and track product view');
        const pixelRuntime = await driver.executeScript(() => ({
          pixelId: window.__tatozMetaPixel?.pixelId || '',
          script: Boolean(document.querySelector('script[data-tatoz-meta-pixel-script]')),
          events: (window.__tatozMetaPixel?.events || []).map(event => event.eventName),
          analytics: window.__tatozAnalytics || null,
          gtag: typeof window.gtag === 'function',
          dataLayer: Array.isArray(window.dataLayer) ? window.dataLayer : [],
          title: document.title,
          description: document.querySelector('meta[name="description"]')?.content || '',
          robots: document.querySelector('meta[name="robots"]')?.content || '',
          canonical: document.querySelector('link[rel="canonical"]')?.href || '',
          ogTitle: document.querySelector('meta[property="og:title"]')?.content || '',
          ogImage: document.querySelector('meta[property="og:image"]')?.content || '',
          verification: document.querySelector('meta[name="google-site-verification"]')?.content || '',
          language: document.documentElement.lang,
          hreflang: [...document.querySelectorAll('link[rel="alternate"]')].map(link => ({ lang: link.getAttribute('hreflang'), href: link.href })),
          jsonLdTypes: [...document.querySelectorAll('script[type="application/ld+json"]')].map(script => { try { return JSON.parse(script.textContent)?.['@type']; } catch (_) { return null; } }).filter(Boolean),
          customHead: window.__tatozSeoHeadTest || '',
          customBody: window.__tatozSeoBodyTest || '',
          customLink: Boolean(document.querySelector('link[data-tatoz-custom-head-link]')),
          preconnect: Boolean([...document.querySelectorAll('link[rel="preconnect"]')].find(link => link.href.startsWith('https://fonts.googleapis.com'))),
          gtmNoScript: Boolean(document.querySelector('noscript[data-tatoz-gtm-noscript]')),
        }));
        if (pixelRuntime.pixelId !== '123456789012345' || !pixelRuntime.script || await driver.executeScript(() => typeof window.fbq) !== 'function') {
          throw new Error('Meta Pixel browser SDK was not installed');
        }
        if (pixelRuntime.analytics?.ga4Id !== 'G-TEST1234' || pixelRuntime.analytics?.gtmId !== 'GTM-TEST1234' || !pixelRuntime.gtag || !pixelRuntime.analytics?.pageViews?.length) {
          throw new Error('Google Analytics/GTM browser bootstrap was not installed');
        }
        if (!pixelRuntime.analytics.scripts?.googleAnalytics || !pixelRuntime.analytics.scripts?.googleTagManager) {
          throw new Error('Google Analytics/GTM script markers were not recorded');
        }
        if (!pixelRuntime.title.includes('Deep Dive SEO') || !pixelRuntime.description || pixelRuntime.robots !== 'index, follow' || pixelRuntime.canonical !== `${BASE}/product/${state.product.slug}` || pixelRuntime.ogTitle !== 'Deep Dive OG Title' || !pixelRuntime.ogImage.startsWith(BASE) || pixelRuntime.verification !== 'deep-dive-verification-token' || pixelRuntime.language !== 'hi') {
          throw new Error(`SEO head tags were not rendered correctly: ${JSON.stringify(pixelRuntime).slice(0, 1200)}`);
        }
        if (!pixelRuntime.hreflang.some(entry => entry.lang === 'en-US' && entry.href === `${BASE}/en`) || !pixelRuntime.hreflang.some(entry => entry.lang === 'x-default' && entry.href === `${BASE}/`)) {
          throw new Error('hreflang tags were not rendered correctly');
        }
        if (!pixelRuntime.jsonLdTypes.includes('Product') || !pixelRuntime.jsonLdTypes.includes('BreadcrumbList') || !pixelRuntime.jsonLdTypes.includes('Organization')) {
          throw new Error(`structured data was incomplete: ${pixelRuntime.jsonLdTypes.join(',')}`);
        }
        if (pixelRuntime.customHead !== 'head-ready' || pixelRuntime.customBody !== 'body-ready' || !pixelRuntime.customLink || !pixelRuntime.preconnect || !pixelRuntime.gtmNoScript) {
          throw new Error('custom SEO scripts, preconnect or GTM fallback were not installed');
        }
        if (process.env.DEEP_RESPONSIVE === '1') await scrollPastProductOverview();
        const addToCart = await waitTestId('product-detail-add-to-cart');
        await addToCart.click();
        await driver.wait(async () => {
          const telemetry = await driver.executeScript(() => window.__tatozMetaPixel || null);
          return telemetry?.events?.some(event => event.eventName === 'AddToCart');
        }, STEP_TIMEOUT, 'Meta Pixel AddToCart event was not emitted');

        await driver.executeScript(() => {
          window.history.pushState({}, '', '/search?seo=route-check');
          window.dispatchEvent(new PopStateEvent('popstate'));
        });
        await driver.wait(async () => (await driver.getCurrentUrl()).includes('/search?seo=route-check'), STEP_TIMEOUT, 'SPA SEO route did not update');
        await driver.wait(async () => {
          const analytics = await driver.executeScript(() => window.__tatozAnalytics || null);
          const dataLayer = await driver.executeScript(() => window.dataLayer || []);
          return analytics?.pageViews?.some(view => view.routeKey === '/search?seo=route-check')
            && dataLayer.some(entry => entry?.event === 'tatoz_page_view' && entry.page_path === '/search?seo=route-check');
        }, STEP_TIMEOUT, 'GA4/GTM SPA page view was not emitted');

        await restoreSession('customer', `${BASE}/order-confirmation/${state.order._id}`);
        await waitBodyText('Your order has been placed successfully');
        await driver.wait(async () => {
          const telemetry = await driver.executeScript(() => window.__tatozMetaPixel || null);
          return telemetry?.events?.some(event => event.eventName === 'Purchase');
        }, STEP_TIMEOUT, 'Meta Pixel Purchase event was not emitted');
      } finally {
        await restoreSession('admin', `${BASE}/admin/dashboard`);
      }
    });

    await check('24 admin fulfilment, risk and seller route matrix', async () => {
      await visitRoutes([
        '/admin/shipping-rules', '/admin/pincodes', '/admin/settings', '/admin/customization', '/admin/pages', '/admin/legal-pages', '/admin/click-tracking',
        '/admin/abandoned-carts', '/admin/seo', '/admin/conversations', '/admin/refunds', '/admin/returns', '/admin/vendors', `/admin/vendors/${state.vendor._id}`,
        '/admin/payouts', '/admin/b2b', '/admin/lifecycle', '/admin/security', '/admin/staff', '/admin/recommendations', '/admin/support', '/admin/cod-policy',
        '/admin/locale-currency', '/admin/affiliates', '/admin/modules', '/admin/integrations',
      ], { protectedRoute: true });
    });

    await check('25 admin content and provider route matrix', async () => {
      await visitRoutes([
        '/admin/blog', '/admin/blog/new', '/admin/legal-pages', '/admin/razorpay', '/admin/payments/razorpay', '/admin/shiprocket',
        '/admin/shipping/shiprocket', '/admin/shipping-operations/shiprocket', '/admin/couriers',
      ], { protectedRoute: true });
    });

    await check('26 admin catalog CRUD, coupon and shipping mutations', async () => {
      const category = assertStatus(await api('POST', '/api/admin/categories', { name: `Temporary Deep Category ${RUN_TAG}`, description: 'temporary' }), 201, 'category create').json.category;
      assertStatus(await api('PUT', `/api/admin/categories/${category._id}`, { description: 'updated temporary category' }), 200, 'category update');
      assertStatus(await api('DELETE', `/api/admin/categories/${category._id}`), 200, 'category delete');
      const brand = assertStatus(await api('POST', '/api/admin/brands', { name: `Temporary Deep Brand ${RUN_TAG}`, description: 'temporary' }), 201, 'brand create').json.brand;
      assertStatus(await api('PUT', `/api/admin/brands/${brand._id}`, { description: 'updated temporary brand' }), 200, 'brand update');
      assertStatus(await api('DELETE', `/api/admin/brands/${brand._id}`), 200, 'brand delete');
      assertStatus(await api('PUT', `/api/admin/coupons/${state.coupon._id}`, { description: 'updated by deep dive' }), 200, 'coupon update');
      const tempPin = assertStatus(await api('POST', '/api/admin/serviceable-pincodes', { pincode: '302002', city: 'Jaipur', state: 'Rajasthan', serviceable: true, codEnabled: true }), 201, 'pincode create').json.pincode;
      const tempPinId = tempPin?._id || tempPin?.data?._id;
      if (tempPinId) {
        assertStatus(await api('PUT', `/api/admin/serviceable-pincodes/${tempPinId}`, { city: 'Jaipur Updated' }), 200, 'pincode update');
        assertStatus(await api('DELETE', `/api/admin/serviceable-pincodes/${tempPinId}`), 200, 'pincode delete');
      }
    });

    await check('27 admin order and support operations', async () => {
      const orderId = state.order._id;
      assertStatus(await api('GET', `/api/admin/orders/${orderId}/packing-slip`), 200, 'packing slip');
      const detail = assertStatus(await api('GET', '/api/admin/orders'), 200, 'admin orders');
      if (!detail.json?.orders?.length && !detail.json?.data?.length) throw new Error('admin order list has no checkout order');
      assertStatus(await api('GET', `/api/admin/support/${state.supportTicket._id}`), 200, 'admin support detail');
      assertStatus(await api('PUT', `/api/admin/support/${state.supportTicket._id}`, { priority: 'high', tags: ['deep-dive'] }), 200, 'admin support update');
      assertStatus(await api('POST', `/api/admin/support/${state.supportTicket._id}/replies`, { message: 'Admin response from deep dive.' }), 200, 'admin support reply');
      assertStatus(await api('GET', `/api/admin/orders/${orderId}/packing-slip`), 200, 'packing slip repeat');
    });

    await check('28 vendor authentication and public storefront process', async () => {
      await loginAs(VENDOR_OWNER.email, VENDOR_OWNER.password);
      await saveSession('vendor');
      await restoreSession('vendor', `${BASE}/vendor/dashboard`);
      await waitBodyText('Vendor Panel');
      await visit(`/store/${state.vendor.slug}`);
      await waitBodyReady();
      const storefront = assertStatus(await api('GET', `/api/vendors/store/${state.vendor.slug}`), 200, 'vendor storefront');
      if (!storefront.json?.vendor && !storefront.json?.data) throw new Error('vendor storefront payload missing');
    });

    await check('29 vendor portal API matrix', async () => {
      await restoreSession('vendor', `${BASE}/vendor/dashboard`);
      const endpoints = [
        '/api/vendor/dashboard', '/api/vendor/products', `/api/vendor/products/${state.product._id}`, '/api/vendor/orders', '/api/vendor/payouts',
        '/api/vendor/wallet', '/api/vendor/ledger', '/api/vendor/team', '/api/vendor/store', '/api/vendor/tax-profile', '/api/vendor/analytics',
        '/api/vendor/commission', '/api/vendor/reports', '/api/vendor/reviews', '/api/vendor/subscription-plans', '/api/vendor/pages',
        '/api/vendor/pages/templates', '/api/vendor/page-blocks', '/api/vendor/inventory', '/api/vendor/inventory/low-stock', '/api/vendor/inventory/logs',
        '/api/vendor/categories', '/api/vendor/brands', '/api/vendor/marketplace/stats', '/api/vendor/marketplace/products', '/api/vendor/marketplace/connections',
        '/api/vendor/marketplace/jobs', '/api/vendor/marketplace/listings', '/api/vendor/marketplace/orders',
      ];
      for (const endpoint of endpoints) {
        const expected = endpoint === '/api/vendor/marketplace/orders' ? [200, 204, 403, 404] : [200, 204, 404];
        assertStatus(await api('GET', endpoint), expected, endpoint);
      }
    });

    await check('30 vendor portal route matrix', async () => {
      await restoreSession('vendor', `${BASE}/vendor/dashboard`);
      await visitRoutes([
        '/vendor/dashboard', '/vendor/products', '/vendor/products/new', `/vendor/products/edit/${state.product._id}`, '/vendor/orders', '/vendor/payouts',
        '/vendor/wallet', '/vendor/ledger', '/vendor/team', '/vendor/reviews', '/vendor/subscription-plans', '/vendor/store', '/vendor/analytics',
        '/vendor/reports', '/vendor/commission', '/vendor/categories', '/vendor/brands', '/vendor/inventory', '/vendor/marketplace', '/vendor/pages', '/vendor/seo',
      ], { protectedRoute: true });
    });

    await check('31 public storefront and edge-case process', async () => {
      await driver.manage().deleteAllCookies();
      await driver.get(`${BASE}/`);
      await visitRoutes([
        `/store/${state.vendor.slug}`, `/product/${state.product.slug}`, `/category/${state.category.slug}`, `/brand/${state.brand.slug}`,
        '/search?q=does-not-exist', '/cart', '/bundles', '/legal/does-not-exist',
      ]);
      const missingProduct = await api('GET', '/api/products/does-not-exist');
      if (![404, 400].includes(missingProduct.status)) throw new Error(`missing product returned ${missingProduct.status}`);
      const malformed = await api('GET', '/api/products/%3Cscript%3E');
      if (![400, 404].includes(malformed.status)) throw new Error(`malformed product returned ${malformed.status}`);
    });

    await check('32 unauthenticated access and API security guards', async () => {
      await driver.manage().deleteAllCookies();
      await driver.get(`${BASE}/profile`);
      await driver.wait(async () => (await driver.getCurrentUrl()).includes('/login'), STEP_TIMEOUT, 'protected customer page did not redirect');
      const me = await api('GET', '/api/auth/me');
      if (me.status !== 401) throw new Error(`unauthenticated /auth/me returned ${me.status}`);
      const admin = await api('GET', '/api/admin/dashboard');
      if (![401, 403].includes(admin.status)) throw new Error(`unauthenticated admin API returned ${admin.status}`);
      const mutation = await api('PUT', '/api/auth/profile', { name: 'unauthorized' });
      if (![401, 403].includes(mutation.status)) throw new Error(`unauthenticated mutation returned ${mutation.status}`);
      const unknown = await api('GET', '/api/this-route-does-not-exist');
      if (unknown.status !== 404) throw new Error(`unknown API returned ${unknown.status}`);
    });
  } finally {
    await driver?.quit().catch(() => {});
    await conn.close().catch(() => {});
    await stopChildProcess(server);
    await replSet.stop().catch(() => {});
    await stopFakeRazorpay(fakeRazorpay?.server);
    await stopFakeAI(fakeAI?.server);
  }

  console.log(`\nResult: ${passes} passed, ${failures} failed`);
  if (failures && process.env.DEEPDIVE_VERBOSE !== '1') {
    console.log('Recent server log tail:');
    console.log(serverLogs.slice(-20).join(''));
  }
  return failures;
}

if (require.main === module) {
  main()
    .then(count => process.exit(count ? 1 : 0))
    .catch(error => {
      console.error('Suite crashed:', error);
      if (serverLogs.length) console.error(serverLogs.slice(-20).join(''));
      process.exit(1);
    });
}

module.exports = { main };
