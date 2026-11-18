/**
 * Focused Page Builder browser regression check.
 *
 * This boots the production server against a disposable Mongo replica set,
 * signs in as the auto-seeded admin, edits an image widget, switches to the
 * tablet override, and verifies both the persisted document and the real
 * same-origin preview iframe.
 *
 * Run: node tests/selenium.pagebuilder.cjs
 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const { Builder, By, Key, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const fs = require('fs');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PAGE_BUILDER_E2E_PORT || 8137);
const BASE = `http://localhost:${PORT}`;
const SCRATCH_DIR = path.join(os.tmpdir(), 'tatoz-pagebuilder-e2e');
const ADMIN = { email: `pagebuilder.${Date.now()}@example.com`, password: 'Admin1234' };

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const byTestId = id => By.css(`[data-testid="${id}"]`);
const model = (conn, name, file) => conn.models[name] || conn.model(name, require(path.join(ROOT, 'models', file)).schema);

async function waitForServer() {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/api/auth/config`);
      if (response.ok) return;
    } catch (_) { /* server is still booting */ }
    await sleep(500);
  }
  throw new Error('server did not become ready');
}

async function retryStale(task, attempts = 4) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      if (!/stale element/i.test(String(error?.message || error)) || attempt === attempts - 1) throw error;
      await sleep(250);
    }
  }
  return undefined;
}

async function visible(driver, locator, timeout = 20000) {
  return retryStale(async () => {
    const element = await driver.wait(until.elementLocated(locator), timeout);
    await driver.wait(until.elementIsVisible(element), timeout);
    return element;
  });
}

async function click(driver, locator) {
  return retryStale(async () => {
    const element = await visible(driver, locator);
    await driver.executeScript('arguments[0].scrollIntoView({block:"center"});', element);
    await element.click();
  });
}

async function clickHidden(driver, locator) {
  return retryStale(async () => {
    const element = await driver.wait(until.elementLocated(locator), 20000);
    await driver.executeScript('arguments[0].click();', element);
  });
}

async function fill(driver, locator, value) {
  return retryStale(async () => {
    const element = await visible(driver, locator);
    await driver.executeScript('arguments[0].scrollIntoView({block:"center"});', element);
    await element.click();
    await element.clear();
    await element.sendKeys(String(value));
  });
}

async function selectValue(driver, locator, value) {
  return retryStale(async () => {
    const select = await visible(driver, locator);
    await driver.executeScript('arguments[0].scrollIntoView({block:"center"});', select);
    await select.findElement(By.css(`option[value="${value}"]`)).click();
  });
}

async function browserApi(driver, method, apiPath, body) {
  return driver.executeAsyncScript((m, p, b, done) => {
    const csrfCookie = document.cookie.split('; ').find(cookie => cookie.startsWith('csrf_token='));
    const csrf = csrfCookie ? decodeURIComponent(csrfCookie.slice('csrf_token='.length)) : '';
    fetch(p, {
      method: m,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(csrf ? { 'x-csrf-token': csrf } : {}) },
      body: b == null ? undefined : JSON.stringify(b),
    }).then(async response => done({ status: response.status, text: await response.text() }))
      .catch(error => done({ status: 0, text: String(error) }));
  }, method, apiPath, body);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise(resolve => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 10000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  });
}

async function chooseSection(driver, id) {
  const checkbox = await driver.wait(until.elementLocated(byTestId(`page-builder-select-section-${id}`)), 20000);
  await driver.executeScript('arguments[0].closest("label").parentElement.click();', checkbox);
  await visible(driver, byTestId('page-builder-widget-inspector'));
}

async function previewState(driver, id) {
  return driver.executeScript(sectionId => {
    const frame = document.querySelector('iframe[title="preview"]');
    const doc = frame?.contentDocument;
    const section = doc?.querySelector(`[data-section-id="${sectionId}"]`);
    if (!section) return null;
    const win = frame.contentWindow;
    const grid = section.querySelector('[data-page-grid]');
    const style = grid && win.getComputedStyle(grid);
    return {
      device: doc.querySelector('[data-page-device]')?.dataset.pageDevice,
      viewport: win.innerWidth,
      font: win.getComputedStyle(section).fontFamily,
      headingSize: section.querySelector('h2') && win.getComputedStyle(section.querySelector('h2')).fontSize,
      gap: style?.gap, rowGap: style?.rowGap, columnGap: style?.columnGap,
      areas: style?.gridTemplateAreas, gridHeight: style?.height,
      images: [...section.querySelectorAll('img')].map(img => ({ opacity: win.getComputedStyle(img).opacity, width: img.clientWidth, height: img.clientHeight, loaded: img.complete && img.naturalWidth > 0 })),
      overflow: doc.documentElement.scrollWidth > win.innerWidth,
    };
  }, id);
}

(async () => {
  let replSet;
  let server;
  let conn;
  let driver;
  let serverOutput = '';
  try {
    console.log('Booting focused Page Builder browser check…');
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
      instanceOpts: [{ dbName: 'pagebuilder' }],
      binary: { version: '7.0.14', downloadDir: path.join(SCRATCH_DIR, 'mongo-bins') },
    });
    const mongoUri = replSet.getUri('pagebuilder');
    server = spawn(process.execPath, ['server.js'], {
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
        RATE_LIMIT_API_MAX: '100000',
        RATE_LIMIT_AUTH_MAX: '100000',
        RATE_LIMIT_STRICT_MAX: '100000',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout.on('data', data => { serverOutput += String(data); });
    server.stderr.on('data', data => { serverOutput += String(data); });
    await waitForServer();

    conn = await mongoose.createConnection(mongoUri).asPromise();
    const Tenant = model(conn, 'Tenant', 'Tenant');
    const AuthPolicy = model(conn, 'AuthPolicy', 'AuthPolicy');
    let tenant = await Tenant.findOne({ type: 'platform' });
    if (!tenant) {
      tenant = await Tenant.create({
        key: 'platform', name: 'Page Builder Test Platform', slug: 'platform', type: 'platform',
        domains: [{ host: 'localhost', verified: true, primary: true }],
      });
    }
    await AuthPolicy.findOneAndUpdate(
      { tenant: tenant._id },
      { tenant: tenant._id, primaryMode: 'password', activeMethods: ['password'], cartOtpProvider: 'disabled' },
      { upsert: true, new: true },
    );

    const User = model(conn, 'User', 'User');
    let adminReady = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (await User.findOne({ email: ADMIN.email.toLowerCase(), role: 'superadmin' })) {
        adminReady = true;
        break;
      }
      await sleep(300);
    }
    if (!adminReady) throw new Error(`auto-seeded admin was not found: ${serverOutput.slice(-1000)}`);

    const Page = model(conn, 'Page', 'Page');
    const sectionId = 'e2e-image-banner';
    const mosaicSections = ['1+2', 'L', 'T', '2x2'].map((preset, index) => ({
      id: `mosaic-${index}`, type: 'mosaic',
      data: { preset, heading: `Mosaic ${preset}`, gap: 16, aspectRatio: '2/1', tiles: Array.from({ length: 4 }, (_, i) => ({ imageUrl: '/favicon.svg', heading: `Tile ${i + 1}` })) },
      settings: { padding: { all: 0 }, typography: { fontSize: null, lineHeight: null }, media: { opacity: null } },
    }));
    const gridSections = [
      { id: 'cards-grid', type: 'cardGrid', data: { cards: Array.from({ length: 3 }, () => ({ imageUrl: '/favicon.svg' })) } },
      { id: 'gallery-grid', type: 'imageGallery', data: { images: Array.from({ length: 3 }, () => ({ url: '/favicon.svg' })) } },
      { id: 'stats-grid', type: 'stats', data: { items: [{ value: '10', label: 'Items' }, { value: '20', label: 'Views' }, { value: '30', label: 'Visits' }] } },
      { id: 'benefits-grid', type: 'uspRow', data: { items: [{ heading: 'One' }, { heading: 'Two' }, { heading: 'Three' }] } },
    ].map(section => ({ ...section, data: { ...section.data, columns: 3, gap: 0, rowGap: 7, columnGap: 9 }, settings: { padding: { all: 0 } } }));
    const responsiveHero = { id: 'responsive-hero', type: 'hero', data: { slides: [1, 2, 3].map(i => ({ imageUrl: '/favicon.svg', headline: `Desktop slide ${i}` })) }, responsiveOverrides: { mobile: { slides: [{ imageUrl: '/favicon.svg', headline: 'Mobile slide' }] } }, settings: { padding: { all: 0 } } };
    const page = await Page.create({
      tenant: tenant._id,
      slug: `/page-builder-e2e-${Date.now()}`,
      title: 'Page Builder E2E',
      status: 'draft',
      pageSettings: { showHeader: false, showFooter: false },
      draftLayout: {
        sections: [{
          id: sectionId,
          type: 'imageBanner',
          data: { imageUrl: '/favicon.svg', altText: 'E2E image', fullBleed: false, aspectRatio: 'banner' },
          settings: {
            padding: { all: 16 }, margin: { all: 0 }, visibility: 'all', fullWidth: false,
            media: { width: null, height: null, maxWidth: null, maxHeight: null, aspectRatio: 'auto', objectFit: null, objectPosition: null, align: 'center', borderRadius: null, opacity: null },
          },
          responsiveOverrides: { tablet: {}, mobile: {}, tabletSettings: {}, mobileSettings: {} },
        }, ...mosaicSections, ...gridSections, responsiveHero, { id: 'rich-text', type: 'richText', data: { html: '<h2>Platform heading</h2><p>Paragraph text</p><ul><li>List item</li></ul>', maxWidth: 'narrow' }, settings: { padding: { all: 16 } } }],
      },
    });

    const options = new chrome.Options().addArguments('--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1366,900');
    options.setLoggingPrefs({ browser: 'ALL' });
    driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
    await driver.manage().setTimeouts({ implicit: 0, pageLoad: 30000, script: 20000 });

    console.log('  Login and load builder');
    await driver.get(`${BASE}/admin/login`);
    await fill(driver, By.css('input[name="email"]'), ADMIN.email);
    await fill(driver, By.css('input[name="password"]'), ADMIN.password);
    await click(driver, By.css('button[type="submit"]'));
    await driver.wait(async () => {
      const url = await driver.getCurrentUrl();
      return url.startsWith(`${BASE}/admin`) && !url.includes('/login');
    }, 20000);

    await driver.get(`${BASE}/admin/page-builder/${page._id}`);
    await visible(driver, byTestId('page-builder-shell'));
    await visible(driver, byTestId('page-builder-widget-search'));
    await visible(driver, byTestId('page-builder-widget-inspector-empty'));

    console.log('  Edit image width and height');
    await click(driver, byTestId('page-builder-tree-tab'));
    console.log('  Reorder widgets with the keyboard drag handle');
    const handle = await visible(driver, byTestId(`page-builder-drag-${sectionId}`));
    await handle.sendKeys(Key.SPACE);
    await sleep(200);
    await handle.sendKeys(Key.ARROW_DOWN);
    await sleep(250);
    await handle.sendKeys(Key.SPACE);
    await driver.wait(async () => driver.executeScript(() => document.querySelector('[data-testid="page-builder-widget-tree"] input[type="checkbox"]')?.getAttribute('data-testid') === 'page-builder-select-section-mosaic-0'), 10000);
    await chooseSection(driver, sectionId);
    await visible(driver, byTestId('page-builder-widget-inspector'));
    await visible(driver, byTestId('page-builder-media-controls'));
    await fill(driver, byTestId('page-builder-media-width-value'), '240');
    await fill(driver, byTestId('page-builder-media-height-value'), '120');
    await selectValue(driver, byTestId('page-builder-media-height-unit'), 'px');
    await click(driver, byTestId('page-builder-save'));
    await sleep(1200);

    console.log('  Add tablet-specific media override');
    await click(driver, byTestId('page-builder-device-tablet'));
    await chooseSection(driver, sectionId);
    await visible(driver, byTestId('page-builder-media-controls'));
    await fill(driver, byTestId('page-builder-media-width-value'), '80');
    await selectValue(driver, byTestId('page-builder-media-width-unit'), '%');
    await fill(driver, byTestId('page-builder-media-height-value'), '260');
    await click(driver, byTestId('page-builder-save'));
    await sleep(1200);

    const saved = await browserApi(driver, 'GET', `/api/admin/pages/${page._id}`);
    if (saved.status !== 200) throw new Error(`builder GET returned ${saved.status}: ${saved.text}`);
    const payload = JSON.parse(saved.text);
    const savedSection = payload.page.draftLayout.sections.find(item => item.id === sectionId);
    const baseMedia = savedSection.settings.media;
    const tabletMedia = savedSection.responsiveOverrides.tabletSettings.media;
    if (baseMedia.width?.value !== 240 || baseMedia.height?.value !== 120) {
      throw new Error(`base media did not persist: ${JSON.stringify(baseMedia)}`);
    }
    if (tabletMedia.width?.value !== 80 || tabletMedia.width?.unit !== '%' || tabletMedia.height?.value !== 260) {
      throw new Error(`tablet media did not persist: ${JSON.stringify(tabletMedia)}`);
    }
    if (payload.page.builderRevision < 2) throw new Error(`builder revision did not advance: ${payload.page.builderRevision}`);

    const iframe = await visible(driver, By.css('iframe[title="preview"]'));
    await driver.wait(async () => driver.executeScript(frame => Boolean(frame.contentDocument?.querySelector('[data-page-builder-media]')), iframe), 20000);
    const computed = await driver.executeScript((frame, id) => {
      const section = frame.contentDocument.querySelector(`[data-section-id="${id}"]`);
      const media = section.querySelector('[data-page-builder-media]');
      const style = getComputedStyle(media);
      const sectionStyle = section ? getComputedStyle(section) : null;
      return {
        width: style.width,
        height: style.height,
        objectFit: style.objectFit,
        mediaWidthVariable: sectionStyle?.getPropertyValue('--page-builder-media-width').trim() || '',
        sectionClass: section?.className || '',
      };
    }, iframe, sectionId);
    if (computed.mediaWidthVariable !== '80%' || computed.height !== '260px') {
      throw new Error(`tablet preview geometry mismatch: ${JSON.stringify(computed)}`);
    }

    console.log('  Confirm desktop values remain isolated');
    await click(driver, byTestId('page-builder-device-desktop'));
    await chooseSection(driver, sectionId);
    await visible(driver, byTestId('page-builder-media-controls'));
    const desktopValues = await Promise.all([
      driver.findElement(byTestId('page-builder-media-width-value')).getAttribute('value'),
      driver.findElement(byTestId('page-builder-media-height-value')).getAttribute('value'),
    ]);
    if (desktopValues[0] !== '240' || desktopValues[1] !== '120') {
      throw new Error(`desktop values changed after tablet override: ${JSON.stringify(desktopValues)}`);
    }

    console.log('  Exercise mosaic gaps, typography and instant device switching');
    await chooseSection(driver, 'mosaic-0');
    await fill(driver, byTestId('page-builder-grid-gap'), '0');
    await fill(driver, byTestId('page-builder-grid-row-gap'), '12');
    await fill(driver, byTestId('page-builder-grid-column-gap'), '20');
    await click(driver, By.xpath('//button[.//span[normalize-space()="Typography"]]'));
    await fill(driver, byTestId('page-builder-font-size'), '30');
    await fill(driver, byTestId('page-builder-line-height'), '1.4');
    await fill(driver, byTestId('page-builder-letter-spacing'), '-1');
    await selectValue(driver, byTestId('page-builder-font-family'), 'system');
    const frameMarker = await driver.executeScript(() => {
      const win = document.querySelector('iframe[title="preview"]').contentWindow;
      win.__builderTestMarker = 'same-iframe';
      return win.__builderTestMarker;
    });
    await click(driver, byTestId('page-builder-device-mobile'));
    await chooseSection(driver, 'mosaic-0');
    await fill(driver, byTestId('page-builder-grid-gap'), '4');
    await fill(driver, byTestId('page-builder-grid-row-gap'), '6');
    await fill(driver, byTestId('page-builder-grid-column-gap'), '8');
    await click(driver, byTestId('page-builder-device-desktop'));
    await driver.wait(async () => {
      const state = await previewState(driver, 'mosaic-0');
      return state?.viewport === 1440 && state.device === 'desktop' && state.rowGap === '12px';
    }, 10000);
    const desktop = await previewState(driver, 'mosaic-0');
    assert.equal(desktop.rowGap, '12px');
    assert.equal(desktop.columnGap, '20px');
    assert.equal(desktop.headingSize, '30px');
    assert.match(desktop.font, /Inter/);
    assert.equal(await driver.executeScript(() => document.querySelector('iframe[title="preview"]').contentWindow.__builderTestMarker), frameMarker);

    for (const device of ['mobile', 'tablet', 'desktop', 'mobile', 'desktop']) {
      if (device === 'mobile') {
        await driver.executeScript(() => document.querySelector('iframe[title="preview"]').contentDocument.querySelector('[data-section-id="responsive-hero"] [aria-label="Go to slide 3"]')?.click());
        await sleep(50);
      }
      await click(driver, byTestId(`page-builder-device-${device}`));
      await driver.wait(async () => (await previewState(driver, 'mosaic-0'))?.device === device, 10000);
      for (let index = 0; index < 4; index += 1) {
        const result = await previewState(driver, `mosaic-${index}`);
        assert.ok(result.images.every(image => image.loaded && image.width > 0 && image.height > 0 && image.opacity === '1'), JSON.stringify({ device, index, result }));
        assert.equal(result.overflow, false);
        assert.notEqual(result.areas, 'none');
      }
      for (const section of gridSections) {
        const result = await previewState(driver, section.id);
        assert.equal(result.rowGap, '7px');
        assert.equal(result.columnGap, '9px');
        assert.equal(result.overflow, false);
      }
      assert.ok(await previewState(driver, 'responsive-hero'), 'Hero survives replacing three desktop slides with one mobile slide');
    }

    console.log('  Save, reload and compare persisted grids with public rendering');
    await click(driver, byTestId('page-builder-save'));
    await driver.wait(async () => (await Page.findById(page._id).lean()).draftLayout.sections.find(s => s.id === 'mosaic-0')?.responsiveOverrides?.mobile?.gap === 4, 15000);
    await sleep(500);
    await driver.navigate().refresh();
    await visible(driver, byTestId('page-builder-shell'));
    await driver.wait(async () => (await previewState(driver, 'mosaic-0'))?.headingSize === '30px', 15000);
    await click(driver, byTestId('page-builder-device-mobile'));
    await driver.wait(async () => (await previewState(driver, 'mosaic-0'))?.rowGap === '6px', 15000);

    console.log('  Publish and enforce immutable public content plus revision conflicts');
    await click(driver, byTestId('page-builder-publish'));
    await driver.wait(async () => (await Page.findById(page._id).lean()).status === 'published', 15000);
    await sleep(400);
    const published = await Page.findById(page._id).lean();
    const stale = await browserApi(driver, 'PUT', `/api/admin/pages/${page._id}`, { title: 'Stale title', builderRevision: published.builderRevision - 1 });
    assert.equal(stale.status, 409);
    const beforePublic = copyDocument(published.publishedDocument);
    const draftChange = await browserApi(driver, 'PUT', `/api/admin/pages/${page._id}`, { title: 'Draft title only', builderRevision: published.builderRevision });
    assert.equal(draftChange.status, 200);
    assert.deepEqual((await Page.findById(page._id).lean()).publishedDocument, beforePublic);
    const edited = JSON.parse(draftChange.text).page;
    const discarded = await browserApi(driver, 'POST', `/api/admin/pages/${page._id}/discard-draft`, { builderRevision: edited.builderRevision });
    assert.equal(discarded.status, 200);
    assert.equal(JSON.parse(discarded.text).page.title, published.title);
    assert.ok(JSON.parse(discarded.text).page.builderRevision > edited.builderRevision);

    console.log('  Shared mobile versus separate mobile documents');
    const latest = await Page.findById(page._id).lean();
    const mobileOnly = { sections: [{ id: 'mobile-only', type: 'richText', data: { html: '<p>Separate mobile content</p>' }, settings: { padding: { all: 0 } } }] };
    const separate = await browserApi(driver, 'PUT', `/api/admin/pages/${page._id}`, { builderRevision: latest.builderRevision, mobileLayoutMode: 'separate', mobileLayout: mobileOnly });
    assert.equal(separate.status, 200);
    await driver.navigate().refresh();
    await visible(driver, byTestId('page-builder-shell'));
    await click(driver, byTestId('page-builder-device-mobile'));
    await driver.wait(async () => Boolean(await previewState(driver, 'mobile-only')), 15000);
    await click(driver, byTestId('page-builder-device-desktop'));
    await driver.wait(async () => Boolean(await previewState(driver, 'mosaic-0')), 15000);
    assert.equal(await previewState(driver, 'mobile-only'), null);

    await driver.get(`${BASE}${page.slug}`);
    await driver.wait(until.elementLocated(By.css('[data-page-grid="mosaic"]')), 15000);
    for (const width of [1440, 820, 390, 320]) {
      await driver.sendDevToolsCommand('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
      await sleep(250);
      const publicState = await driver.executeScript(() => {
        const s = document.querySelector('[data-section-id="mosaic-0"]');
        const g = getComputedStyle(s.querySelector('[data-page-grid]'));
        return { rowGap: g.rowGap, columnGap: g.columnGap, areas: g.gridTemplateAreas, overflow: document.documentElement.scrollWidth > innerWidth, font: getComputedStyle(s).fontFamily };
      });
      assert.equal(publicState.rowGap, width < 768 ? '6px' : '12px');
      assert.equal(publicState.columnGap, width < 768 ? '8px' : '20px');
      assert.equal(publicState.overflow, false);
      assert.match(publicState.font, /Inter/);
    }
    console.log('PASS Page Builder: media visibility, 4 mosaic patterns, gaps, typography, switching, save/reload, isolated layouts, publish/discard, stale revision rejection, 320–1440px public rendering');
  } catch (error) {
    if (driver) {
      fs.writeFileSync(path.join(os.tmpdir(), 'tatoz-pagebuilder-failure.png'), await driver.takeScreenshot().catch(() => ''), 'base64');
      console.error((await driver.manage().logs().get('browser').catch(() => [])).filter(entry => entry.level.name === 'SEVERE').slice(-4).map(entry => entry.message.slice(0, 700)).join('\n'));
    }
    console.error(`FAIL Page Builder browser check: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (driver) await driver.quit().catch(() => {});
    if (conn) await conn.close().catch(() => {});
    await stopProcess(server);
    if (replSet) await replSet.stop().catch(() => {});
  }
})();

function copyDocument(value) { return JSON.parse(JSON.stringify(value)); }
