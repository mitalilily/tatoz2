import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { v4 as uuidv4 } from 'uuid';
import { adminPageAPI } from '../../services/api';
import { SECTION_REGISTRY } from '../../components/sections/registry';
import { DEFAULT_DESIGN_SYSTEM } from '../../components/page/designSystem';
import { getEffectiveSection, getResponsiveBreakpoint, getResponsiveSettings, mergeResponsivePatch, responsiveSettingsKey } from '../../components/page/responsive';

const HISTORY_LIMIT = 50;

const pageMetaSnapshot = page => ({
  title: page?.title || '',
  slug: page?.slug || '',
  publicSlug: page?.publicSlug || '',
  seo: page?.seo || {},
  pageSettings: {
    ...(page?.pageSettings || {}),
    designSystem: { ...DEFAULT_DESIGN_SYSTEM, ...(page?.pageSettings?.designSystem || {}) },
  },
  mobileLayoutMode: page?.mobileLayoutMode || 'auto',
});

export const createPageBuilderSnapshot = ({ layout, mobileLayout, page } = {}) => JSON.stringify({
  layout: layout || { sections: [] },
  mobileLayout: mobileLayout || null,
  page: pageMetaSnapshot(page),
});

const initial = {
  pageId: null,
  page: null,
  layout: { sections: [] },
  mobileLayout: null,                // populated when mobileLayoutMode === 'separate'
  selectedSectionId: null,
  selectedSectionIds: [],
  device: 'desktop',                 // 'desktop' | 'tablet' | 'mobile' — preview width
  editingMobileLayout: false,        // when true (separate mode), edits target mobileLayout
  loading: false,
  error: null,
  saveState: 'idle',
  pendingSaves: 0,
  operation: null,
  sessionId: null,
  conflict: null,
  previewCritique: null,
  lastSavedAt: null,
  lastSavedSnapshot: null,
  draftVersion: 0,
  lastSavedVersion: 0,
  history: { past: [], future: [] },
};

function snap(state) {
  return {
    layout: JSON.parse(JSON.stringify(state.layout)),
    mobileLayout: state.mobileLayout ? JSON.parse(JSON.stringify(state.mobileLayout)) : null,
    page: pageMetaSnapshot(state.page),
  };
}
function pushHistory(state) {
  state.history.past.push(snap(state));
  if (state.history.past.length > HISTORY_LIMIT) state.history.past.shift();
  state.history.future = [];
}
function activeLayout(state, context = {}) {
  const mobile = context.layoutTarget ? context.layoutTarget === 'mobile' : state.editingMobileLayout;
  return (mobile && state.mobileLayout) ? state.mobileLayout : state.layout;
}

function mobileCopy(layout) {
  return {
    sections: layout.sections.map(section => {
      const effective = getEffectiveSection(section, 'mobile');
      return JSON.parse(JSON.stringify({ ...effective, responsiveOverrides: { tablet: {}, mobile: {}, tabletSettings: {}, mobileSettings: {} } }));
    }),
  };
}

function responsiveBreakpoint(state, context = {}) {
  // A separate mobile layout is edited directly. In auto mode, tablet and
  // mobile changes are stored as breakpoint overrides on the base section.
  if (context.layoutTarget ? context.layoutTarget === 'mobile' : state.editingMobileLayout) return null;
  return getResponsiveBreakpoint(context.device || state.device);
}

function restoreSnapshot(state, snapshot) {
  state.layout = snapshot.layout;
  state.mobileLayout = snapshot.mobileLayout;
  if (snapshot.page && state.page) {
    state.page = {
      ...state.page,
      ...snapshot.page,
      pageSettings: {
        ...(state.page.pageSettings || {}),
        ...(snapshot.page.pageSettings || {}),
        designSystem: {
          ...DEFAULT_DESIGN_SYSTEM,
          ...(snapshot.page.pageSettings?.designSystem || {}),
        },
      },
    };
  }
  state.editingMobileLayout = state.page?.mobileLayoutMode === 'separate' && state.device === 'mobile';
}
function findActiveSection(state, id, context) {
  return activeLayout(state, context).sections.find(s => s.id === id);
}
export const fetchPage = createAsyncThunk('pageBuilder/fetch', async (id) => {
  const res = await adminPageAPI.get(id);
  return res.data?.page;
});

// Keep saves ordered. The editor can emit an autosave while a previous save
// is still in flight; serializing the requests prevents an older snapshot
// from arriving after a newer one and overwriting it on the server.
let saveQueue = Promise.resolve();

export const savePage = createAsyncThunk('pageBuilder/save', async (_, { getState, dispatch, rejectWithValue }) => {
  const { pageId: requestedId, sessionId } = getState().pageBuilder;
  // Read state only when this queued request reaches the front. A manual save
  // fired while autosave is in flight must use the revision returned by the
  // earlier request, plus the newest in-memory draft.
  const request = async () => {
    const { pageBuilder } = getState();
    if (!requestedId || pageBuilder.pageId !== requestedId || pageBuilder.sessionId !== sessionId) throw new Error('Editor changed before the save could run');
    const p = pageBuilder.page || {};
    const version = pageBuilder.draftVersion;
    const payload = {
      draftLayout: pageBuilder.layout,
      mobileLayout: pageBuilder.mobileLayout,
      builderRevision: Number.isInteger(p.builderRevision) ? p.builderRevision : 0,
      title: p.title,
      slug: p.slug,
      publicSlug: p.publicSlug,
      seo: p.seo,
      pageSettings: p.pageSettings,
      mobileLayoutMode: p.mobileLayoutMode,
    };
    const res = await adminPageAPI.update(pageBuilder.pageId, payload);
    const page = res.data?.page;
    if (!page?._id) throw new Error('The server did not return the saved page');
    const snapshot = createPageBuilderSnapshot({ layout: page.draftLayout, mobileLayout: page.mobileLayout, page });
    // Advance the CAS token before releasing the queue to the next request.
    dispatch(syncServerRevision({ pageId: requestedId, sessionId, revision: page.builderRevision }));
    return { page, snapshot, version, sessionId };
  };
  const next = saveQueue.catch(() => {}).then(request);
  saveQueue = next.catch(() => {});
  try {
    return await next;
  } catch (error) {
    return rejectWithValue({ message: error.message || 'Save failed', code: error.code, latestRevision: error.latestRevision, pageId: requestedId, sessionId });
  }
});

export const publishPage = createAsyncThunk('pageBuilder/publish', async (_, { getState, dispatch }) => {
  const { pageBuilder } = getState();
  const saved = await dispatch(savePage()).unwrap();
  const res = await adminPageAPI.publish(pageBuilder.pageId, { builderRevision: saved.page.builderRevision });
  // If this was a chrome page, invalidate the in-memory chrome cache so the
  // next time the customer-side <ChromeRenderer> mounts it refetches the
  // freshly published layout.
  const kind = pageBuilder.page?.kind;
  if (kind === 'header' || kind === 'footer') {
    try {
      const mod = await import('../../components/page/ChromeRenderer');
      mod.invalidateChromeCache?.(kind);
    } catch (_) { /* preview may run in a context without the renderer */ }
  }
  return { page: res.data?.page, version: saved.version, sessionId: saved.sessionId };
});

export const discardDraft = createAsyncThunk('pageBuilder/discard', async (_, { getState }) => {
  const { pageId, sessionId } = getState().pageBuilder;
  await saveQueue;
  const current = getState().pageBuilder;
  if (current.pageId !== pageId || current.sessionId !== sessionId) throw new Error('Editor changed before discard');
  const res = await adminPageAPI.discardDraft(pageId, { builderRevision: current.page?.builderRevision || 0 });
  return { page: res.data?.page, sessionId };
});

const PADDING_MAP = { none: 0, sm: 8, md: 16, lg: 24, xl: 32 };
const defaultSectionSettings = () => ({
  padding: { all: 16 },
  margin: { all: 0 },
  backgroundColor: '',
  backgroundToken: 'none',
  textToken: 'text',
  backgroundImage: '',
  typography: { fontFamily: 'inherit', fontSize: null, lineHeight: null, letterSpacing: null, fontWeight: null },
  fullWidth: false,
  sectionAlign: 'center',
  width: null,
  height: null,
  minHeight: null,
  overflow: 'visible',
  zIndex: null,
  media: {
    width: null,
    height: null,
    maxWidth: null,
    maxHeight: null,
    aspectRatio: 'auto',
    objectFit: null,
    objectPosition: null,
    align: 'center',
    borderRadius: null,
    opacity: null,
  },
  visibility: 'all',
  schedule: { from: null, until: null },
});

const slice = createSlice({
  name: 'pageBuilder',
  initialState: initial,
  reducers: {
    setDevice(state, a) {
      const device = ['desktop', 'tablet', 'mobile'].includes(a.payload) ? a.payload : 'desktop';
      state.device = device;
      if (state.page?.mobileLayoutMode === 'separate') state.editingMobileLayout = device === 'mobile';
      else state.editingMobileLayout = false;
      const ids = new Set(activeLayout(state).sections.map(section => section.id));
      state.selectedSectionIds = state.selectedSectionIds.filter(id => ids.has(id));
      if (!ids.has(state.selectedSectionId)) state.selectedSectionId = null;
    },
    syncServerRevision(state, a) {
      if (state.pageId === a.payload.pageId && state.sessionId === a.payload.sessionId && state.page && a.payload.revision != null) {
        state.page.builderRevision = a.payload.revision;
      }
    },
    setEditingMobileLayout(state, a) {
      pushHistory(state);
      state.editingMobileLayout = !!a.payload;
      if (state.editingMobileLayout) {
        if (state.page) state.page.mobileLayoutMode = 'separate';
        if (!state.mobileLayout) state.mobileLayout = mobileCopy(state.layout);
        state.device = 'mobile';
      } else if (state.device === 'mobile') {
        state.device = 'desktop';
      }
      state.selectedSectionId = null;
      state.selectedSectionIds = [];
      state.draftVersion += 1;
    },
    selectSection(state, a) {
      state.selectedSectionId = a.payload;
      state.selectedSectionIds = a.payload ? [a.payload] : [];
    },
    toggleSectionSelection(state, a) {
      const id = a.payload;
      if (!id) return;
      const selected = state.selectedSectionIds || [];
      if (selected.includes(id)) {
        state.selectedSectionIds = selected.filter(sectionId => sectionId !== id);
        state.selectedSectionId = state.selectedSectionIds[state.selectedSectionIds.length - 1] || null;
      } else {
        state.selectedSectionIds = [...selected, id];
        state.selectedSectionId = id;
      }
    },

    markDraftChanged(state) {
      state.draftVersion += 1;
    },

    setPreviewCritique(state, a) {
      state.previewCritique = a.payload || null;
    },

    hydratePageBuilder(state, a) {
      const page = a.payload;
      if (!page) return;
      state.page = page;
      state.sessionId = uuidv4();
      state.pendingSaves = 0;
      state.pageId = page._id || null;
      state.layout = page.draftLayout || { sections: [] };
      state.mobileLayout = page.mobileLayout || null;
      state.device = 'desktop';
      state.editingMobileLayout = false;
      state.selectedSectionId = null;
      state.selectedSectionIds = [];
      state.lastSavedSnapshot = createPageBuilderSnapshot({
        layout: state.layout,
        mobileLayout: state.mobileLayout,
        page,
      });
      state.draftVersion = 0;
      state.lastSavedVersion = 0;
      state.saveState = 'saved';
      state.lastSavedAt = Date.now();
      state.loading = false;
      state.error = null;
      state.conflict = null;
      state.history = { past: [], future: [] };
    },

    addSection(state, a) {
      pushHistory(state);
      const type = a.payload;
      const entry = SECTION_REGISTRY[type];
      if (!entry) return;
      const newId = uuidv4();
      const newSection = {
        id: newId,
        type,
        data: entry.defaults(),
        settings: defaultSectionSettings(),
        responsiveOverrides: { tablet: {}, mobile: {}, tabletSettings: {}, mobileSettings: {} },
      };
      const target = activeLayout(state);
      const insertAt = state.selectedSectionId
        ? target.sections.findIndex(s => s.id === state.selectedSectionId) + 1
        : target.sections.length;
      target.sections.splice(insertAt, 0, newSection);
      state.selectedSectionId = newId;
      state.selectedSectionIds = [newId];
      state.draftVersion += 1;
    },

    removeSection(state, a) {
      pushHistory(state);
      const target = activeLayout(state);
      target.sections = target.sections.filter(s => s.id !== a.payload);
      if (state.selectedSectionId === a.payload) state.selectedSectionId = null;
      state.selectedSectionIds = (state.selectedSectionIds || []).filter(id => id !== a.payload);
      state.draftVersion += 1;
    },

    removeSelectedSections(state) {
      const ids = new Set(state.selectedSectionIds || []);
      if (!ids.size) return;
      pushHistory(state);
      const target = activeLayout(state);
      target.sections = target.sections.filter(section => !ids.has(section.id));
      if (ids.has(state.selectedSectionId)) state.selectedSectionId = null;
      state.selectedSectionIds = [];
      state.draftVersion += 1;
    },

    duplicateSection(state, a) {
      pushHistory(state);
      const target = activeLayout(state);
      const idx = target.sections.findIndex(s => s.id === a.payload);
      if (idx < 0) return;
      const copy = JSON.parse(JSON.stringify(target.sections[idx]));
      copy.id = uuidv4();
      target.sections.splice(idx + 1, 0, copy);
      state.selectedSectionId = copy.id;
      state.selectedSectionIds = [copy.id];
      state.draftVersion += 1;
    },

    insertBlock(state, a) {
      const sections = Array.isArray(a.payload?.sections) ? a.payload.sections : [];
      if (!sections.length) return;
      pushHistory(state);
      const target = activeLayout(state);
      const copies = sections.map(section => {
        const copy = JSON.parse(JSON.stringify(section));
        copy.id = uuidv4();
        return copy;
      });
      const selectedIndex = state.selectedSectionId
        ? target.sections.findIndex(section => section.id === state.selectedSectionId)
        : -1;
      const insertAt = selectedIndex >= 0 ? selectedIndex + 1 : target.sections.length;
      target.sections.splice(insertAt, 0, ...copies);
      state.selectedSectionId = copies[copies.length - 1].id;
      state.selectedSectionIds = copies.map(section => section.id);
      state.draftVersion += 1;
    },

    moveSection(state, a) {
      const target = activeLayout(state);
      const { fromIndex, toIndex } = a.payload;
      if (![fromIndex, toIndex].every(index => Number.isInteger(index) && index >= 0 && index < target.sections.length) || fromIndex === toIndex) return;
      pushHistory(state);
      const [moved] = target.sections.splice(fromIndex, 1);
      target.sections.splice(toIndex, 0, moved);
      state.draftVersion += 1;
    },

    toggleSectionVisibility(state, a) {
      pushHistory(state);
      const s = findActiveSection(state, a.payload);
      if (!s) return;
      const breakpoint = responsiveBreakpoint(state);
      const currentVisibility = breakpoint
        ? getResponsiveSettings(s, state.device).visibility
        : s.settings.visibility;
      if (breakpoint) {
        s.responsiveOverrides = s.responsiveOverrides || {};
        const key = responsiveSettingsKey(breakpoint);
        s.responsiveOverrides[key] = mergeResponsivePatch(s.responsiveOverrides[key], {
          visibility: currentVisibility === 'hidden' ? 'all' : 'hidden',
        });
      } else {
        s.settings.visibility = currentVisibility === 'hidden' ? 'all' : 'hidden';
      }
      state.draftVersion += 1;
    },

    toggleSelectedSectionsVisibility(state) {
      const ids = new Set(state.selectedSectionIds || []);
      if (!ids.size) return;
      const target = activeLayout(state);
      const selectedSections = target.sections.filter(section => ids.has(section.id));
      if (!selectedSections.length) return;
      pushHistory(state);
      const breakpoint = responsiveBreakpoint(state);
      const shouldHide = selectedSections.some(section => {
        const visibility = breakpoint ? getResponsiveSettings(section, state.device).visibility : section.settings?.visibility;
        return visibility !== 'hidden';
      });
      selectedSections.forEach(section => {
        if (breakpoint) {
          section.responsiveOverrides = section.responsiveOverrides || {};
          const key = responsiveSettingsKey(breakpoint);
          section.responsiveOverrides[key] = mergeResponsivePatch(section.responsiveOverrides[key], { visibility: shouldHide ? 'hidden' : 'all' });
        } else {
          section.settings.visibility = shouldHide ? 'hidden' : 'all';
        }
      });
      state.draftVersion += 1;
    },

    updateSectionData(state, a) {
      const { id, data } = a.payload;
      const s = findActiveSection(state, id, a.payload);
      if (!s) return;
      pushHistory(state);
      const breakpoint = responsiveBreakpoint(state, a.payload);
      if (breakpoint) {
        s.responsiveOverrides = s.responsiveOverrides || { mobile: {} };
        s.responsiveOverrides[breakpoint] = { ...(s.responsiveOverrides[breakpoint] || {}), ...data };
      } else {
        s.data = { ...s.data, ...data };
      }
      state.draftVersion += 1;
    },

    updateSectionSettings(state, a) {
      const { id, settings } = a.payload;
      const s = findActiveSection(state, id, a.payload);
      if (!s) return;
      pushHistory(state);
      const breakpoint = responsiveBreakpoint(state, a.payload);
      if (breakpoint) {
        s.responsiveOverrides = s.responsiveOverrides || { mobile: {} };
        const key = responsiveSettingsKey(breakpoint);
        s.responsiveOverrides[key] = mergeResponsivePatch(s.responsiveOverrides[key], settings);
      } else {
        s.settings = mergeResponsivePatch(s.settings, settings);
      }
      state.draftVersion += 1;
    },

    applyAILayout(state, a) {
      const { layout, target = 'desktop' } = a.payload || {};
      if (!layout || !Array.isArray(layout.sections)) return;
      pushHistory(state);
      if (target === 'mobile' && state.mobileLayout) state.mobileLayout = layout;
      else state.layout = layout;
      state.selectedSectionId = null;
      state.previewCritique = null;
      state.draftVersion += 1;
    },

    clearMobileOverride(state, a) {
      pushHistory(state);
      const s = findActiveSection(state, a.payload);
      if (!s) return;
      const breakpoint = responsiveBreakpoint(state) || 'mobile';
      s.responsiveOverrides = s.responsiveOverrides || {};
      s.responsiveOverrides[breakpoint] = {};
      s.responsiveOverrides[responsiveSettingsKey(breakpoint)] = {};
      state.draftVersion += 1;
    },

    updatePageMeta(state, a) {
      const { title, slug, publicSlug, seo, pageSettings, mobileLayoutMode } = a.payload || {};
      if (!state.page) return;
      pushHistory(state);
      if (title != null) state.page.title = title;
      if (slug != null) state.page.slug = slug;
      if (publicSlug != null) state.page.publicSlug = publicSlug;
      if (seo) state.page.seo = { ...(state.page.seo || {}), ...seo };
      if (pageSettings) state.page.pageSettings = {
        ...(state.page.pageSettings || {}), ...pageSettings,
        designSystem: { ...(state.page.pageSettings?.designSystem || {}), ...(pageSettings.designSystem || {}) },
      };
      if (mobileLayoutMode) {
        state.page.mobileLayoutMode = mobileLayoutMode;
        if (mobileLayoutMode === 'separate' && !state.mobileLayout) {
          state.mobileLayout = mobileCopy(state.layout);
        }
        state.editingMobileLayout = mobileLayoutMode === 'separate' && state.device === 'mobile';
      }
      state.draftVersion += 1;
    },

    undo(state) {
      const prev = state.history.past.pop();
      if (!prev) return;
      state.history.future.push(snap(state));
      restoreSnapshot(state, prev);
      state.selectedSectionId = null;
      state.selectedSectionIds = [];
      state.draftVersion += 1;
    },

    redo(state) {
      const next = state.history.future.pop();
      if (!next) return;
      state.history.past.push(snap(state));
      restoreSnapshot(state, next);
      state.selectedSectionId = null;
      state.selectedSectionIds = [];
      state.draftVersion += 1;
    },
  },
  extraReducers: (b) => {
    b.addCase(fetchPage.pending, (s, a) => { s.sessionId = a.meta.requestId; s.pendingSaves = 0; s.loading = true; s.error = null; s.saveState = 'idle'; s.conflict = null; s.previewCritique = null; });
    b.addCase(fetchPage.fulfilled, (s, a) => {
      if (s.sessionId !== a.meta.requestId) return;
      s.loading = false;
      s.saveState = 'idle';
      s.page = a.payload;
      s.pageId = a.payload?._id || null;
      s.layout = a.payload?.draftLayout || { sections: [] };
      s.mobileLayout = a.payload?.mobileLayout || null;
      s.device = 'desktop';
      s.editingMobileLayout = false;
      s.selectedSectionId = null;
      s.selectedSectionIds = [];
      s.lastSavedSnapshot = createPageBuilderSnapshot({ layout: s.layout, mobileLayout: s.mobileLayout, page: s.page });
      s.draftVersion = 0;
      s.lastSavedVersion = 0;
      s.conflict = null;
      s.previewCritique = null;
      s.history = { past: [], future: [] };
    });
    b.addCase(fetchPage.rejected, (s, a) => { if (s.sessionId !== a.meta.requestId) return; s.loading = false; s.page = null; s.error = a.error?.message || 'Load failed'; });

    b.addCase(savePage.pending, s => { s.pendingSaves += 1; s.saveState = 'saving'; s.error = null; });
    b.addCase(savePage.fulfilled, (s, a) => {
      const result = a.payload || {};
      if (result.page?._id !== s.pageId || result.sessionId !== s.sessionId) return;
      s.pendingSaves = Math.max(0, s.pendingSaves - 1);
      s.saveState = s.pendingSaves ? 'saving' : 'saved';
      s.conflict = null;
      s.lastSavedAt = Date.now();
      if (result.version >= s.lastSavedVersion) {
        s.lastSavedSnapshot = result.snapshot || s.lastSavedSnapshot;
        s.lastSavedVersion = result.version;
      }
      // A response from an older queued save still advances the server
      // revision. Keep that token without replacing a newer draft payload.
      if (result.page?.builderRevision != null && s.page) s.page.builderRevision = result.page.builderRevision;
      // Do not replace a newer in-memory draft with an older response that
      // was queued before the user made another edit.
      if (result.version === s.draftVersion && result.page) {
        s.page = result.page;
        s.layout = result.page.draftLayout || { sections: [] };
        s.mobileLayout = result.page.mobileLayout || null;
      }
    });
    b.addCase(savePage.rejected, (s, a) => {
      if (a.payload?.sessionId !== s.sessionId) return;
      s.pendingSaves = Math.max(0, s.pendingSaves - 1);
      const conflict = a.payload?.code === 'PAGE_REVISION_CONFLICT';
      s.saveState = conflict ? 'conflict' : 'error';
      s.conflict = conflict ? { message: a.payload.message, latestRevision: a.payload.latestRevision } : null;
      s.error = a.payload?.message || 'Save failed';
    });

    b.addCase(publishPage.pending, s => { s.operation = 'publishing'; });
    b.addCase(discardDraft.pending, s => { s.operation = 'discarding'; });
    b.addCase(publishPage.rejected, s => { s.operation = null; });
    b.addCase(discardDraft.rejected, s => { s.operation = null; });
    b.addCase(publishPage.fulfilled, (s, a) => {
      if (a.payload.sessionId !== s.sessionId || a.payload.page?._id !== s.pageId) return;
      s.operation = null;
      if (a.payload.version === s.draftVersion) s.page = a.payload.page;
      else if (s.page) {
        s.page.status = a.payload.page.status;
        s.page.builderRevision = a.payload.page.builderRevision;
        s.page.publishedDocument = a.payload.page.publishedDocument;
        s.page.publishedLayout = a.payload.page.publishedLayout;
        s.page.publishedMobileLayout = a.payload.page.publishedMobileLayout;
      }
    });
    b.addCase(discardDraft.fulfilled, (s, a) => {
      if (a.payload.sessionId !== s.sessionId || a.payload.page?._id !== s.pageId) return;
      s.operation = null;
      s.page = a.payload.page;
      s.layout = s.page?.draftLayout || { sections: [] };
      s.mobileLayout = s.page?.mobileLayout || null;
      s.editingMobileLayout = s.page?.mobileLayoutMode === 'separate' && s.device === 'mobile';
      s.selectedSectionId = null;
      s.selectedSectionIds = [];
      s.lastSavedSnapshot = createPageBuilderSnapshot({ layout: s.layout, mobileLayout: s.mobileLayout, page: s.page });
      s.draftVersion += 1;
      s.lastSavedVersion = s.draftVersion;
      s.saveState = 'saved';
      s.error = null;
      s.conflict = null;
      s.history = { past: [], future: [] };
    });
  },
});

// Selector helpers (read-only)
export const selectActiveSections = (state) =>
  (state.pageBuilder.editingMobileLayout && state.pageBuilder.mobileLayout)
    ? state.pageBuilder.mobileLayout.sections
    : state.pageBuilder.layout.sections;
export const selectActiveSection = (state, id) => selectActiveSections(state).find(s => s.id === id);
export const selectResponsiveBreakpoint = (state) => responsiveBreakpoint(state.pageBuilder);
export const selectIsResponsiveOverrideMode = (state) => Boolean(selectResponsiveBreakpoint(state));
// Backwards-compatible selector name used by older builder integrations.
export const selectIsMobileOverrideMode = selectIsResponsiveOverrideMode;
export const selectCanUndo = (state) => state.pageBuilder.history.past.length > 0;
export const selectCanRedo = (state) => state.pageBuilder.history.future.length > 0;

export const {
  syncServerRevision,
  setDevice, setEditingMobileLayout, selectSection, toggleSectionSelection,
  markDraftChanged, hydratePageBuilder,
  addSection, removeSection, removeSelectedSections, duplicateSection, insertBlock, moveSection, toggleSectionVisibility, toggleSelectedSectionsVisibility,
  updateSectionData, updateSectionSettings, clearMobileOverride,
  applyAILayout,
  setPreviewCritique,
  updatePageMeta, undo, redo,
} = slice.actions;

export default slice.reducer;
