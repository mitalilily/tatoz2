/**
 * Multi-vendor E2E (Selenium, headless Chrome).
 *
 * Covers everything built for the seller lifecycle in a real browser against
 * an isolated stack: in-memory MongoDB + the production server (fresh build)
 * on localhost, so the shared development database is never touched.
 *
 * Flows: customer register → seller wizard → onboarding (docs/agreement) →
 * admin request-changes → seller resubmit → admin approve → seller portal
 * (dashboard/team/bulk/ledger/payout) → admin payout + settlement +
 * commission rules + reverify + audit trail.
 *
 * Run: npm run qa:selenium:multivendor
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

// Prefer the default selenium cache; fall back to the OS temp dir when the
// home directory is not writable (e.g. sandboxed CI runners).
if (!process.env.SE_CACHE_PATH) {
  try {
    fs.mkdirSync(path.join(os.homedir(), '.cache', 'selenium'), { recursive: true });
  } catch (_) {
    process.env.SE_CACHE_PATH = path.join(os.tmpdir(), 'selenium-cache');
  }
}
const SCRATCH_DIR = path.join(os.tmpdir(), 'mv-selenium');
try { fs.mkdirSync(SCRATCH_DIR, { recursive: true }); } catch (_) { /* use tmpdir directly */ }
const { spawn } = require('child_process');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

const PORT = Number(process.env.MV_PORT || 8123);
const BASE = `http://localhost:${PORT}`;
const ROOT = __dirname.includes('tests') ? path.join(__dirname, '..') : __dirname;
const STEP_TIMEOUT = 20000;

const SELLER = { name: 'Seller One', email: 'seller.one@mvtest.com', password: 'Pass1234' };
const MATE = { name: 'Seller Mate', email: 'seller.mate@mvtest.com', password: 'Pass1234' };
const ADMIN = { email: process.env.MV_ADMIN_EMAIL || 'mv.admin@mvtest.com', password: 'Admin1234' };
const STORE = 'Kumkum Handloom';

let failures = 0;
let passes = 0;

const log = (ok, name, extra = '') => {
  if (ok) { passes += 1; console.log(`  PASS ${name}`); }
  else { failures += 1; console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`); }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer() {
  const deadline = Date.now() + 90000;
  for (;;) {
    try {
      const res = await fetch(`${BASE}/api/auth/config`);
      if (res.ok) return;
    } catch (_) { /* not up yet */ }
    if (Date.now() > deadline) throw new Error('Test server did not become ready');
    await sleep(1000);
  }
}

async function boot() {
  const mongod = await MongoMemoryServer.create({
    instance: { dbName: 'mvtest' },
    binary: { version: '7.0.14', downloadDir: path.join(SCRATCH_DIR, 'mongo-bins') },
  });
  const mongoUri = mongod.getUri('mvtest');
  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(PORT),
      MONGO_URI: mongoUri,
      JWT_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      INTEGRATION_ENCRYPTION_KEY: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      CLIENT_URL: BASE,
      CLIENT_ORIGINS: BASE,
      TRUST_PROXY_HOPS: '1',
      // A full browser run issues several hundred API calls (page data +
      // component polls) inside one limiter window; raise the budgets so the
      // suite measures product behaviour, not rate-limit behaviour.
      RATE_LIMIT_API_MAX: '100000',
      RATE_LIMIT_AUTH_MAX: '100000',
      RATE_LIMIT_STRICT_MAX: '100000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
  server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
  await waitForServer();

  const conn = await mongoose.createConnection(mongoUri).asPromise();
  const Tenant = conn.model('Tenant', require(path.join(ROOT, 'models/Tenant')).schema);
  const AuthPolicy = conn.model('AuthPolicy', require(path.join(ROOT, 'models/AuthPolicy')).schema);
  let tenant = await Tenant.findOne({ type: 'platform' });
  if (!tenant) {
    tenant = await Tenant.create({
      key: 'platform', name: 'MV Test Platform', slug: 'platform', type: 'platform',
      domains: [{ host: 'localhost', verified: true, primary: true }],
    });
  }
  await AuthPolicy.findOneAndUpdate(
    { tenant: tenant._id },
    { tenant: tenant._id, primaryMode: 'password', activeMethods: ['password'], cartOtpProvider: 'disabled' },
    { upsert: true },
  );
  return { mongod, server, conn, mongoUri };
}

async function buildDriver() {
  const options = new chrome.Options()
    .addArguments('--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1366,900');
  const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
  await driver.manage().setTimeouts({ implicit: 0, pageLoad: 30000, script: 15000 });
  return driver;
}

const byTestId = (id) => By.css(`[data-testid="${id}"]`);

async function waitXPath(driver, xpath, timeout = STEP_TIMEOUT) {
  return withStaleRetry(async () => {
    await driver.wait(until.elementLocated(By.xpath(xpath)), timeout);
    const el = await driver.findElement(By.xpath(xpath));
    await driver.wait(until.elementIsVisible(el), timeout);
    await driver.wait(until.elementIsEnabled(el), timeout);
    return el;
  });
}

async function waitTestId(driver, id, timeout = STEP_TIMEOUT) {
  await driver.wait(until.elementLocated(byTestId(id)), timeout);
  const el = await driver.findElement(byTestId(id));
  await driver.wait(until.elementIsVisible(el), timeout);
  return el;
}

// React re-renders can replace a node between find and click; retry those.
async function withStaleRetry(fn, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (error) {
      if (!/stale element/i.test(String(error && error.message || '')) || i === tries - 1) throw error;
      await sleep(600);
    }
  }
}

async function fill(driver, id, value) {
  return withStaleRetry(async () => {
    const el = await waitTestId(driver, id);
    await el.click();
    await el.sendKeys(require('selenium-webdriver').Key.chord(
      require('selenium-webdriver').Key.CONTROL, 'a',
    ), require('selenium-webdriver').Key.BACK_SPACE, String(value));
  });
}

async function clickTestId(driver, id) {
  return withStaleRetry(async () => {
    const el = await waitTestId(driver, id);
    await driver.wait(until.elementIsEnabled(el), STEP_TIMEOUT);
    await el.click();
  });
}

// Sessions are preserved across role switches by saving cookies: the seller's
// login predates the admin's approval (vendors cannot password-login
// afterwards — passwordLogin is customer-only by design), and the admin must
// stay under the auth rate limiter (one login per role for the whole run).
// Restored JWTs stay valid: protect reloads the user fresh, and vendorAuth
// accepts the flipped vendor role on the now-active store.
async function saveSession(driver, slot) {
  global.__sessions = global.__sessions || {};
  global.__sessions[slot] = await driver.manage().getCookies();
}

async function restoreSession(driver, slot, url, markerText) {
  await driver.manage().deleteAllCookies();
  await driver.get(`${BASE}/`);
  for (const c of (global.__sessions || {})[slot] || []) {
    const cookie = { name: c.name, value: c.value, path: c.path || '/' };
    if (c.domain) cookie.domain = c.domain;
    if (c.expiry) cookie.expiry = c.expiry;
    if (c.secure) cookie.secure = true;
    if (c.httpOnly) cookie.httpOnly = true;
    if (c.sameSite) cookie.sameSite = c.sameSite;
    await driver.manage().addCookie(cookie);
  }
  await driver.get(url);
  await waitBodyText(driver, markerText);
}

async function saveSellerSession(driver) {
  return saveSession(driver, 'seller');
}

async function restoreSellerSession(driver) {
  return restoreSession(driver, 'seller', `${BASE}/vendor/dashboard`, 'Vendor Panel');
}

async function saveAdminSession(driver) {
  return saveSession(driver, 'admin');
}

async function restoreAdminSession(driver) {
  return restoreSession(driver, 'admin', `${BASE}/admin/payouts`, 'Payouts & Settlements');
}

async function waitBodyText(driver, text, timeout = STEP_TIMEOUT) {
  await driver.wait(async () => {
    const body = await driver.findElement(By.css('body')).getText();
    return body.includes(text);
  }, timeout, `Timed out waiting for text: ${text}`);
}

// Authenticated JSON call from inside the page (cookies + CSRF handled).
// NOTE: selenium serializes an omitted argument as null, so the page must
// treat null like undefined — otherwise GET/HEAD calls carry a body and the
// browser rejects the fetch.
async function api(driver, method, apiPath, body) {
  return driver.executeScript(async (m, p, b) => {
    const csrf = (document.cookie.split('; ').find((c) => c.startsWith('csrf_token=')) || '').slice('csrf_token='.length);
    const res = await fetch(p, {
      method: m,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(csrf ? { 'x-csrf-token': decodeURIComponent(csrf) } : {}) },
      body: b == null ? undefined : JSON.stringify(b),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) { /* non-JSON */ }
    return { status: res.status, json, text: text.slice(0, 500) };
  }, method, apiPath, body === undefined ? undefined : body);
}

async function loginAs(driver, email, password, admin = false) {
  // Cookies can only be cleared while the app domain is loaded (on
  // about:blank there is nothing to clear, so the old session would leak
  // into the next role). Park on blank AFTER clearing to kill the outgoing
  // shell's polling, whose 401 handler would otherwise steal navigation.
  await driver.manage().deleteAllCookies();
  await driver.get('about:blank');
  await driver.get(`${BASE}${admin ? '/admin/login' : '/login'}`);
  const target = `${BASE}${admin ? '/admin/login' : '/login'}`;
  if (admin) {
    await driver.wait(until.elementLocated(By.css('input[name="email"]')), STEP_TIMEOUT);
    await driver.findElement(By.css('input[name="email"]')).sendKeys(email);
    await driver.findElement(By.css('input[name="password"]')).sendKeys(password);
    await driver.findElement(By.css('button[type="submit"]')).click();
    await driver.wait(async () => (await driver.getCurrentUrl()).startsWith(`${BASE}/admin`) && !(await driver.getCurrentUrl()).includes('/login'), STEP_TIMEOUT);
  } else {
    try {
      await fill(driver, 'auth-email', email);
      await fill(driver, 'auth-password', password);
      await clickTestId(driver, 'auth-password-submit');
      await driver.wait(async () => {
        const url = await driver.getCurrentUrl();
        return !url.includes('/login') && !url.includes('/register');
      }, STEP_TIMEOUT);
    } catch (error) {
      // Report the authoritative server verdict instead of a bare timeout.
      const probe = await api(driver, 'POST', '/api/auth/login', { email, password }).catch((e) => ({ status: 'error', text: String(e).slice(0, 120) }));
      if (probe.status === 200) {
        await driver.wait(async () => {
          const url = await driver.getCurrentUrl();
          return !url.includes('/login') && !url.includes('/register');
        }, STEP_TIMEOUT);
      } else {
        throw new Error(`login failed (at ${target}): api=${probe.status} ${probe.json?.message || probe.text || ''}`.slice(0, 300));
      }
    }
  }
}

async function acceptAlert(driver, text) {
  const alert = await driver.wait(until.alertIsPresent(), STEP_TIMEOUT);
  if (text !== undefined) await alert.sendKeys(text);
  await alert.accept();
}

async function check(name, fn) {
  try {
    await fn();
    log(true, name);
  } catch (error) {
    let extra = String(error && error.message || error).split('\n')[0];
    if (global.__driver) {
      try {
        const body = await global.__driver.findElement(By.css('body')).getText();
        extra += ` | page: ${body.slice(0, 220).replace(/\n/g, ' ')}`;
        const dump = path.join(SCRATCH_DIR, `fail-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}.html`);
        fs.writeFileSync(dump, await global.__driver.getPageSource());
        extra += ` | dom: ${dump}`;
      } catch (_) { /* page already gone */ }
    }
    log(false, name, extra);
  }
}

async function registerCustomerUI(driver, user) {
  await driver.manage().deleteAllCookies();
  await driver.get(`${BASE}/register`);
  await fill(driver, 'auth-name', user.name);
  await fill(driver, 'auth-email', user.email);
  await fill(driver, 'auth-password', user.password);
  await clickTestId(driver, 'auth-password-submit');
  await driver.wait(async () => {
    const url = await driver.getCurrentUrl();
    return !url.includes('/login') && !url.includes('/register');
  }, STEP_TIMEOUT);
}

const WIZARD = {
  'vendor-store-name': `${STORE} ${Date.now().toString(36)}`,
  'vendor-contact-email': SELLER.email,
  'vendor-contact-phone': '9876543210',
  'vendor-description': 'Handloom sarees direct from weavers.',
  'vendor-addr-fullname': SELLER.name,
  'vendor-addr-phone': '9876543210',
  'vendor-addr-street': '14 MG Road',
  'vendor-addr-city': 'Jaipur',
  'vendor-addr-state': 'Rajasthan',
  'vendor-address-pincode': '302001',
};

async function fillVendorWizard(driver) {
  await driver.get(`${BASE}/vendor/register`);
  await waitTestId(driver, 'vendor-registration-page');
  for (const [id, value] of Object.entries(WIZARD)) await fill(driver, id, value);
  await clickTestId(driver, 'vendor-wizard-next');
  await fill(driver, 'vendor-legal-name', 'Kumkum Handloom LLP');
  await fill(driver, 'vendor-pan', 'ABCDE1234F');
  await fill(driver, 'vendor-gstin', '29ABCDE1234F1Z5');
  await driver.findElement(By.css('select[data-testid="vendor-gst-registration"] option[value="gstin"]')).click();
  await clickTestId(driver, 'vendor-wizard-next');
  await fill(driver, 'vendor-bank-holder', SELLER.name);
  await fill(driver, 'vendor-bank-account', '50100234567890');
  await fill(driver, 'vendor-bank-ifsc', 'HDFC0001234');
  await fill(driver, 'vendor-bank-name', 'HDFC Bank');
  await fill(driver, 'vendor-bank-upi', 'sellerone@upi');
  await clickTestId(driver, 'vendor-wizard-next');
  await clickTestId(driver, 'vendor-register-submit');
  await waitTestId(driver, 'vendor-registration-submitted');
}

function writeKycPng() {
  // Minimal valid 1x1 PNG for the KYC upload input.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const file = path.join(SCRATCH_DIR, 'mv-kyc.png');
  fs.writeFileSync(file, png);
  return file;
}

async function selectOption(driver, testid, value) {
  const select = await waitTestId(driver, testid);
  await select.findElement(By.css(`option[value="${value}"]`)).click();
}

async function seedWallet(conn) {
  const Vendor = conn.model('Vendor', require(path.join(ROOT, 'models/Vendor')).schema);
  const VendorLedger = conn.model('VendorLedger', require(path.join(ROOT, 'models/VendorLedger')).schema);
  const vendor = await Vendor.findOne({ contactEmail: SELLER.email });
  if (!vendor) throw new Error('vendor not found for wallet seeding');
  vendor.walletBalance = 5000;
  await vendor.save();
  await VendorLedger.create({
    vendor: vendor._id, type: 'sale_credit', amount: 5000, balanceAfter: 5000,
    note: 'E2E seed: delivered order earnings',
  });
  return vendor._id;
}

async function main() {
  console.log('Booting isolated stack (memory Mongo + production server)…');
  const { mongod, server, conn } = await boot();
  const driver = await buildDriver();
  global.__driver = driver;
  const kycFile = writeKycPng();
  let vendorId = null;
  try {
    await check('customer registers via UI', () => registerCustomerUI(driver, SELLER));
    await check('seller wizard submits application', () => fillVendorWizard(driver));

    await check('onboarding status shows pending', async () => {
      await driver.get(`${BASE}/vendor/onboarding`);
      await waitTestId(driver, 'onboarding-state');
      // The badge is CSS-capitalized, so match the rendered text.
      await waitBodyText(driver, 'Pending');
    });
    await check('KYC document upload reaches review', async () => {
      const input = await driver.findElement(By.css('input[data-slot="gstCertificate"]'));
      await input.sendKeys(kycFile);
      await waitBodyText(driver, 'Submitted — choose a file to replace');
    });
    await check('seller agreement acceptance', async () => {
      await clickTestId(driver, 'onboarding-accept-agreement');
      await waitBodyText(driver, 'Accepted');
    });

    await check('teammate registers via UI', () => registerCustomerUI(driver, MATE));

    await check('admin logs in via UI', async () => {
      await loginAs(driver, ADMIN.email, ADMIN.password, true);
      await saveAdminSession(driver);
    });
    await check('admin vendor list shows the application', async () => {
      await driver.get(`${BASE}/admin/vendors`);
      await waitBodyText(driver, WIZARD['vendor-store-name']);
    });
    await check('admin opens vendor control center', async () => {
      await driver.findElement(By.linkText(WIZARD['vendor-store-name'])).click();
      await waitTestId(driver, 'vendor-audit-trail');
      vendorId = (await driver.getCurrentUrl()).split('/').pop();
    });
    await check('admin requests changes with reason code', async () => {
      await fill(driver, 'rc-note', 'GST certificate is blurry, please re-upload.');
      await clickTestId(driver, 'rc-send');
      await waitBodyText(driver, 'DOC_MISSING');
    });

    await check('seller sees changes-requested state', async () => {
      await loginAs(driver, SELLER.email, SELLER.password);
      await driver.get(`${BASE}/vendor/onboarding`);
      await waitBodyText(driver, 'Changes Requested');
    });
    await check('seller resubmits application', async () => {
      await clickTestId(driver, 'onboarding-resubmit');
      await waitBodyText(driver, 'Pending');
      await saveSellerSession(driver);
    });

    await check('admin approves vendor', async () => {
      await restoreAdminSession(driver);
      await driver.get(`${BASE}/admin/vendors/${vendorId}`);
      await waitTestId(driver, 'vendor-audit-trail');
      await (await waitXPath(driver, "//button[contains(.,'Approve')]")).click();
      await sleep(2500);
      const res = await api(driver, 'GET', `/api/admin/vendors/${vendorId}`);
      console.log(`    diag after approve: status=${res.json?.data?.status} onboarding=${res.json?.data?.onboarding?.state} updatedAt=${res.json?.data?.updatedAt}`);
      if (res.json?.data?.status !== 'active') throw new Error(`status is ${res.json?.data?.status}`);
      await waitBodyText(driver, 'approve');
    });

    await check('seller dashboard loads after approval', async () => {
      await restoreSellerSession(driver);
    });

    await check('wallet seeding for payout flow', async () => { await seedWallet(conn); });

    await check('seller invites teammate', async () => {
      await driver.get(`${BASE}/vendor/team`);
      await fill(driver, 'team-invite-email', MATE.email);
      await clickTestId(driver, 'team-invite-send');
      await waitBodyText(driver, MATE.email);
    });
    await check('teammate accepts invite and sees team', async () => {
      await loginAs(driver, MATE.email, MATE.password);
      const res = await api(driver, 'POST', '/api/vendor/team/accept', {});
      if (res.status !== 200) throw new Error(`accept: ${res.status} ${res.text}`);
      await driver.get(`${BASE}/vendor/team`);
      await waitBodyText(driver, MATE.email);
    });

    await check('bulk catalog create reports per-row errors', async () => {
      await restoreSellerSession(driver);
      await driver.get(`${BASE}/vendor/products`);
      const Category = conn.model('Category', require(path.join(ROOT, 'models/Category')).schema);
      const category = await Category.create({ name: 'MV E2E Fashion', slug: 'mv-e2e-fashion' });
      const res = await api(driver, 'POST', '/api/vendor/products/bulk', { items: [
        { title: 'MV E2E Saree One', description: 'Handloom cotton saree', price: 1499, stock: 10, category: String(category._id) },
        { title: 'MV E2E Saree Two', description: 'Handloom silk saree', price: 2999, stock: 5, category: String(category._id) },
        { price: 99 },
      ] });
      if (res.status !== 201) throw new Error(`bulk: ${res.status} ${res.text}`);
      if (res.json.data.created.length !== 2 || res.json.data.errors.length !== 1) {
        throw new Error(`expected 2 created + 1 error, got ${JSON.stringify(res.json.data)}`);
      }
    });

    await check('ledger page shows earnings credit', async () => {
      await driver.get(`${BASE}/vendor/ledger`);
      // Match the seeded entry note, not the type-filter option labels.
      await waitBodyText(driver, 'delivered order earnings');
    });

    await check('seller requests payout via UI', async () => {
      await driver.get(`${BASE}/vendor/payouts`);
      await clickTestId(driver, 'payout-request-open');
      await fill(driver, 'payout-amount', '2000');
      await clickTestId(driver, 'payout-submit');
      const list = await api(driver, 'GET', '/api/vendor/payouts');
      if (!list.json.data.some((p) => p.amount === 2000 && p.status === 'pending')) {
        throw new Error(`payout missing: ${JSON.stringify(list.json).slice(0, 200)}`);
      }
    });

    await check('admin processes payout via UI', async () => {
      await restoreAdminSession(driver);
      await driver.get(`${BASE}/admin/payouts`);
      await (await waitXPath(driver, "//button[normalize-space()='Process']")).click();
      await sleep(2000);
      const list = await api(driver, 'GET', '/api/admin/payouts?status=processing');
      if (!list.json.data.length) throw new Error('no processing payout found');
    });
    await check('admin completes payout with UTR via UI prompt', async () => {
      await selectOption(driver, 'payout-status-filter', 'processing');
      await sleep(1500);
      await (await waitXPath(driver, "//button[normalize-space()='Complete']")).click();
      await acceptAlert(driver, 'UTRTEST123456');
      await sleep(2000);
      const list = await api(driver, 'GET', '/api/admin/payouts?status=completed');
      const done = list.json.data.find((p) => p.utrNumber === 'UTRTEST123456');
      if (!done) throw new Error('completed payout with UTR not found');
    });

    await check('ledger shows payout debit after completion', async () => {
      await restoreSellerSession(driver);
      await driver.get(`${BASE}/vendor/ledger`);
      // The completed payout writes its UTR into the ledger note.
      await waitBodyText(driver, 'UTRTEST123456');
    });

    await check('admin runs settlement via UI', async () => {
      await restoreAdminSession(driver);
      await driver.get(`${BASE}/admin/payouts`);
      await clickTestId(driver, 'tab-settlements');
      // Native date inputs ignore keystrokes unpredictably and plain .value
      // assignment bypasses React's value tracker, so drive the official
      // setter and dispatch input events React actually listens to.
      await driver.executeScript(`
        for (const [testid, date] of [['settlement-start', '2024-01-01'], ['settlement-end', '2024-01-31']]) {
          const el = document.querySelector('[data-testid="' + testid + '"]');
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(el, date);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }`);
      await clickTestId(driver, 'settlement-run');
      await waitBodyText(driver, 'settled');
    });

    await check('admin creates commission rule via UI', async () => {
      await clickTestId(driver, 'tab-commissions');
      await fill(driver, 'rule-name', 'MV E2E Fashion Rule');
      await fill(driver, 'rule-percent', '12');
      await clickTestId(driver, 'rule-add');
      await waitBodyText(driver, 'MV E2E Fashion Rule');
    });

    await check('admin flags re-verification via UI confirm', async () => {
      await driver.get(`${BASE}/admin/vendors/${vendorId}`);
      await waitTestId(driver, 'vendor-audit-trail');
      await fill(driver, 'reverify-note', 'E2E annual re-check');
      await clickTestId(driver, 'reverify-send');
      const alert = await driver.wait(until.alertIsPresent(), STEP_TIMEOUT);
      await alert.accept();
      await waitBodyText(driver, 're-verification');
    });

    await check('audit rows exist in DB (diagnostic)', async () => {
      const VendorAudit = conn.model('VendorAudit', require(path.join(ROOT, 'models/VendorAudit')).schema);
      const rows = await VendorAudit.aggregate([{ $group: { _id: '$action', n: { $sum: 1 } } }, { $sort: { _id: 1 } }]);
      console.log('    diag audit rows in DB:', JSON.stringify(rows));
    });

    await check('audit trail records the lifecycle', async () => {
      const res = await api(driver, 'GET', `/api/admin/vendors/${vendorId}/audit?limit=30`);
      const actions = (res.json.data || []).map((e) => e.action);
      for (const expected of ['registered', 'request_changes', 'resubmitted', 'approve', 'team_change', 'payout_complete', 'reverify']) {
        if (!actions.includes(expected)) throw new Error(`missing audit action: ${expected} (have ${actions.join(',')})`);
      }
    });

    await check('admin search filters and bulk suspend/reactivate via UI', async () => {
      await restoreAdminSession(driver);
      await driver.get(`${BASE}/admin/vendors`);
      await fill(driver, 'admin-vendor-search', 'Kumkum');
      const Key = require('selenium-webdriver').Key;
      await driver.findElement(byTestId('admin-vendor-search')).sendKeys(Key.ENTER);
      await sleep(1500);
      await waitBodyText(driver, WIZARD['vendor-store-name']);
      await driver.findElement(byTestId('vendor-select')).click();
      await clickTestId(driver, 'bulk-suspend');
      await sleep(1500);
      await waitBodyText(driver, 'suspended');
      await driver.findElement(byTestId('vendor-select')).click();
      await clickTestId(driver, 'bulk-reactivate');
      await sleep(1500);
      await waitBodyText(driver, 'active');
    });

    await check('invalid reason code is rejected with 422', async () => {
      const res = await api(driver, 'PUT', `/api/admin/vendors/${vendorId}/request-changes`, { reasonCode: 'NOPE' });
      if (res.status !== 422) throw new Error(`expected 422, got ${res.status}`);
    });
  } finally {
    await driver.quit().catch(() => {});
    server.kill('SIGTERM');
    await conn.close().catch(() => {});
    await mongod.stop().catch(() => {});
  }

  console.log(`\nResult: ${passes} passed, ${failures} failed`);
  return failures;
}

if (require.main === module) {
  main().then((failuresCount) => process.exit(failuresCount ? 1 : 0)).catch((error) => {
    console.error('Suite crashed:', error);
    process.exit(1);
  });
}

module.exports = { main };
