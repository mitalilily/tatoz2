const path = require('path');
const esbuild = require('../client/node_modules/esbuild');
const { validateLayout } = require('../models/sectionSchemas');

let api;
let builder;
const harness = { __pageBuilderTestAPI: {} };
const copy = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const fixture = () => ({
  _id: 'page-a', title: 'Builder', slug: '/builder', builderRevision: 0, mobileLayoutMode: 'auto',
  pageSettings: {},
  draftLayout: { sections: [{ id: 'image', type: 'imageBanner', data: { imageUrl: '/uploads/a.png' }, settings: { padding: { all: 16, left: 40 }, media: { width: { value: 100, unit: '%' }, opacity: null }, typography: { fontSize: null } }, responsiveOverrides: {} }] },
  mobileLayout: null,
});

beforeAll(async () => {
  const result = await esbuild.build({
    absWorkingDir: path.join(__dirname, '../client'),
    stdin: { contents: "export * from './src/store/slices/pageBuilderSlice'; export { default as reducer } from './src/store/slices/pageBuilderSlice'; export * from './src/components/page/responsive'; export { configureStore } from '@reduxjs/toolkit';", resolveDir: path.join(__dirname, '../client') },
    bundle: true, write: false, platform: 'node', format: 'cjs',
    plugins: [{ name: 'builder-ports', setup(build) {
      build.onResolve({ filter: /(?:services\/api|sections\/registry|page\/ChromeRenderer)$/ }, args => ({ path: args.path, namespace: 'test-port' }));
      build.onLoad({ filter: /.*/, namespace: 'test-port' }, args => ({ contents: args.path.endsWith('/api') ? 'export const adminPageAPI = globalThis.__pageBuilderTestAPI;' : args.path.endsWith('/registry') ? 'export const SECTION_REGISTRY = { imageBanner: { defaults: () => ({ imageUrl: "" }) } };' : 'export const invalidateChromeCache = () => {};' }));
    } }],
  });
  const compiled = { exports: {} };
  new Function('require', 'module', 'exports', 'globalThis', result.outputFiles[0].text)(require, compiled, compiled.exports, harness);
  builder = compiled.exports;
  api = harness.__pageBuilderTestAPI;
});

function storeFor(page = fixture()) {
  const store = builder.configureStore({ reducer: { pageBuilder: builder.reducer } });
  store.dispatch(builder.hydratePageBuilder(page));
  return store;
}

test('mobile media edits remain sparse and keep inheriting later desktop changes', () => {
  const store = storeFor();
  store.dispatch(builder.setDevice('mobile'));
  store.dispatch(builder.updateSectionSettings({ id: 'image', settings: { media: { height: { value: 120, unit: 'px' } } } }));
  store.dispatch(builder.setDevice('desktop'));
  store.dispatch(builder.updateSectionSettings({ id: 'image', settings: { media: { width: { value: 75, unit: '%' } } } }));
  const section = store.getState().pageBuilder.layout.sections[0];
  expect(section.responsiveOverrides.mobileSettings.media).toEqual({ height: { value: 120, unit: 'px' } });
  expect(builder.getResponsiveSettings(section, 'mobile').media.width.value).toBe(75);
  expect(section.settings.media.height).toBeUndefined();
});

test('delayed image changes retain the device and document where upload started', () => {
  const store = storeFor();
  store.dispatch(builder.setDevice('desktop'));
  store.dispatch(builder.updateSectionData({ id: 'image', device: 'mobile', layoutTarget: 'desktop', data: { imageUrl: '/uploads/mobile.png' } }));
  const section = store.getState().pageBuilder.layout.sections[0];
  expect(section.data.imageUrl).toBe('/uploads/a.png');
  expect(section.responsiveOverrides.mobile.imageUrl).toBe('/uploads/mobile.png');
});

test('separate mobile starts from resolved mobile overrides and undo restores edit targeting', () => {
  const store = storeFor();
  store.dispatch(builder.setDevice('mobile'));
  store.dispatch(builder.updateSectionData({ id: 'image', data: { imageUrl: '/uploads/mobile.png' } }));
  store.dispatch(builder.updatePageMeta({ mobileLayoutMode: 'separate' }));
  expect(store.getState().pageBuilder.mobileLayout.sections[0].data.imageUrl).toBe('/uploads/mobile.png');
  store.dispatch(builder.undo());
  expect(store.getState().pageBuilder.editingMobileLayout).toBe(false);
  store.dispatch(builder.redo());
  expect(store.getState().pageBuilder.editingMobileLayout).toBe(true);
  store.dispatch(builder.updateSectionData({ id: 'image', data: { imageUrl: '/uploads/separate.png' } }));
  expect(store.getState().pageBuilder.layout.sections[0].data.imageUrl).toBe('/uploads/a.png');
  store.dispatch(builder.setDevice('desktop'));
  expect(store.getState().pageBuilder.editingMobileLayout).toBe(false);
});

test('linked spacing replaces stale sides and invalid reordering cannot corrupt a layout', () => {
  const store = storeFor();
  store.dispatch(builder.updateSectionSettings({ id: 'image', settings: { padding: { all: 0 } } }));
  expect(store.getState().pageBuilder.layout.sections[0].settings.padding).toEqual({ all: 0 });
  store.dispatch(builder.moveSection({ fromIndex: 12, toIndex: 0 }));
  expect(store.getState().pageBuilder.layout.sections).toHaveLength(1);
});

test('queued saves use fresh revisions, retain newer edits and adopt canonical persisted data', async () => {
  let release;
  const firstPending = new Promise(resolve => { release = resolve; });
  const store = storeFor();
  let serverPage = fixture();
  const calls = [];
  api.update = async (id, payload) => {
    calls.push(copy(payload));
    if (calls.length === 1) await firstPending;
    if (payload.builderRevision !== serverPage.builderRevision) throw { code: 'PAGE_REVISION_CONFLICT', message: 'stale' };
    serverPage = { ...serverPage, ...copy(payload), draftLayout: validateLayout(payload.draftLayout), builderRevision: serverPage.builderRevision + 1 };
    return { data: { page: copy(serverPage) } };
  };
  store.dispatch(builder.updateSectionData({ id: 'image', data: { altText: 'first' } }));
  const first = store.dispatch(builder.savePage());
  await tick();
  store.dispatch(builder.updateSectionData({ id: 'image', data: { altText: 'newest' } }));
  const second = store.dispatch(builder.savePage());
  release();
  await first.unwrap();
  await second.unwrap();
  expect(calls.map(call => call.builderRevision)).toEqual([0, 1]);
  const state = store.getState().pageBuilder;
  expect(state.layout.sections[0].data.altText).toBe('newest');
  expect(state.layout.sections[0].settings.media.opacity).toBeNull();
  expect(state.pendingSaves).toBe(0);
  expect(state.lastSavedSnapshot).toBe(builder.createPageBuilderSnapshot(state));
});

test('failed saves preserve the document and expose a retryable error', async () => {
  const store = storeFor();
  api.update = async () => { throw { message: 'Connection lost' }; };
  store.dispatch(builder.updateSectionData({ id: 'image', data: { altText: 'keep me' } }));
  await store.dispatch(builder.savePage());
  expect(store.getState().pageBuilder.layout.sections[0].data.altText).toBe('keep me');
  expect(store.getState().pageBuilder.saveState).toBe('error');
  expect(store.getState().pageBuilder.error).toBe('Connection lost');
});

test('an old save response cannot replace a different editor session', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const store = storeFor();
  api.update = async () => { await gate; return { data: { page: { ...fixture(), builderRevision: 99 } } }; };
  const pending = store.dispatch(builder.savePage());
  await tick();
  store.dispatch(builder.hydratePageBuilder({ ...fixture(), _id: 'page-b' }));
  release();
  await pending;
  expect(store.getState().pageBuilder.pageId).toBe('page-b');
  expect(store.getState().pageBuilder.page.builderRevision).toBe(0);
});
