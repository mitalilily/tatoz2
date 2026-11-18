import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Save, Send, Trash2, Monitor, Tablet, Smartphone,
  Settings as SettingsIcon, Calendar, History, Link2, Undo2, Redo2, Circle, Box,
} from 'lucide-react';
import {
  fetchPage, savePage, publishPage, discardDraft, setDevice,
  undo, redo, selectCanUndo, selectCanRedo, createPageBuilderSnapshot,
} from '../../store/slices/pageBuilderSlice';
import { adminPageAPI } from '../../services/api';
import WidgetsPanel from '../../components/admin/pageBuilder/WidgetsPanel';
import WidgetEditorPanel from '../../components/admin/pageBuilder/WidgetEditorPanel';
import PageBuilderAIChat from '../../components/admin/pageBuilder/PageBuilderAIChat';
import PreviewFrame from '../../components/admin/pageBuilder/PreviewFrame';
import PageSettingsDrawer from '../../components/admin/pageBuilder/PageSettingsDrawer';
import SchedulePopover from '../../components/admin/pageBuilder/SchedulePopover';
import VersionHistoryDrawer from '../../components/admin/pageBuilder/VersionHistoryDrawer';
import PageBlocksModal from '../../components/admin/pageBuilder/PageBlocksModal';

export default function PageBuilderPage() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const { page, layout, mobileLayout, loading, operation, error, saveState, conflict, lastSavedAt, device, draftVersion, lastSavedVersion, lastSavedSnapshot, selectedSectionId } = useSelector(s => s.pageBuilder);
  const canUndo = useSelector(selectCanUndo);
  const canRedo = useSelector(selectCanRedo);
  const [pageSettingsOpen, setPageSettingsOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [blocksOpen, setBlocksOpen] = useState(false);
  const [blocksMode, setBlocksMode] = useState('browse');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  useEffect(() => { if (id) dispatch(fetchPage(id)); }, [id, dispatch]);

  const currentSnapshot = useMemo(
    () => createPageBuilderSnapshot({ layout, mobileLayout, page }),
    [layout, mobileLayout, page],
  );

  useEffect(() => {
    if (!page || !lastSavedSnapshot) return;
    setHasUnsavedChanges(currentSnapshot !== lastSavedSnapshot);
  }, [currentSnapshot, lastSavedSnapshot, page]);

  // Autosave settled edits, while the thunk serializes requests so rapid
  // changes cannot arrive out of order and overwrite a newer draft.
  useEffect(() => {
    if (operation || !page || !hasUnsavedChanges || draftVersion <= lastSavedVersion || ['saving', 'conflict', 'error'].includes(saveState)) return undefined;
    const timer = setTimeout(() => { dispatch(savePage()).unwrap().catch(() => {}); }, 900);
    return () => clearTimeout(timer);
  }, [dispatch, page, hasUnsavedChanges, draftVersion, lastSavedVersion, saveState, operation]);

  // Warn before closing with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Keyboard shortcuts: Cmd/Ctrl+Z = undo, Cmd/Ctrl+Shift+Z = redo
  useEffect(() => {
    const onKey = (e) => {
      if (operation) return;
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const k = e.key.toLowerCase();
      const editingText = e.target?.matches?.('input, textarea, [contenteditable="true"]') || e.target?.closest?.('[contenteditable="true"]');
      if (editingText && ['z', 'y'].includes(k)) return;
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); dispatch(undo()); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); dispatch(redo()); }
      else if (k === 's') { e.preventDefault(); dispatch(savePage()); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, operation]);

  const onPublish = async () => {
    try { await dispatch(publishPage()).unwrap(); toast.success('Published'); }
    catch (error) { toast.error(errorMessage(error, 'Publish failed')); }
  };
  const onDiscard = async () => {
    if (!confirm('Discard all draft changes since last publish?')) return;
    try { await dispatch(discardDraft()).unwrap(); toast.success('Reverted to published version'); }
    catch (error) { toast.error(errorMessage(error, 'Discard failed')); }
  };
  const onManualSave = async () => {
    try { await dispatch(savePage()).unwrap(); toast.success('Saved'); }
    catch (error) { toast.error(errorMessage(error, 'Save failed')); }
  };
  const onCopyPreviewLink = async () => {
    try {
      await dispatch(savePage()).unwrap();
      const r = await adminPageAPI.previewToken(page._id);
      const token = r.data?.token;
      if (!token) throw new Error('No token returned');
      if (page.scope === 'vendor' && (page.vendorStoreSlug || page.vendor?.slug)) {
        const path = `${window.location.origin}/store/${page.vendorStoreSlug || page.vendor.slug}?token=${encodeURIComponent(token)}`;
        await navigator.clipboard.writeText(path);
        toast.success('Store preview link copied to clipboard (24h expiry)');
        return;
      }
      const slug = page.slug && page.slug !== '/' ? page.slug.replace(/^\//, '') : '';
      const path = page.isHomepage
        ? `${window.location.origin}/?token=${encodeURIComponent(token)}`
        : `${window.location.origin}/${slug}?token=${encodeURIComponent(token)}`;
      await navigator.clipboard.writeText(path);
      toast.success('Preview link copied to clipboard (24h expiry)');
    } catch (e) {
      toast.error(e.response?.data?.error || e.message || 'Failed to generate link');
    }
  };

  const handleClose = () => {
    if (hasUnsavedChanges) {
      if (confirm('You have unsaved changes. Are you sure you want to close?')) {
        closeBuilderWindow();
      }
    } else {
      closeBuilderWindow();
    }
  };

  if (!loading && !page && error) return <div className="p-8 text-sm text-red-600">{error}<button className="ml-3 underline" onClick={() => dispatch(fetchPage(id))}>Retry</button></div>;
  if (loading || !page) return <div className="h-full w-full flex items-center justify-center text-sm text-gray-500">Loading editor…</div>;

  const saveLabel = saveState === 'saving' ? 'Saving…'
    : saveState === 'saved' && !hasUnsavedChanges ? `Saved · ${timeAgo(lastSavedAt)}`
    : saveState === 'conflict' ? 'Conflict — reload latest'
    : saveState === 'error' ? `Save failed: ${error || 'Please retry'}`
    : hasUnsavedChanges ? 'Unsaved changes'
    : saveState === 'error' ? 'Save failed' : '';

  const statusBadge = page.scheduledPublishAt
    ? { dot: 'bg-amber-500', text: `Scheduled · ${new Date(page.scheduledPublishAt).toLocaleString()}` }
    : page.status === 'published'
      ? { dot: 'bg-green-500', text: 'Published' }
      : { dot: 'bg-amber-500', text: 'Draft' };

  return (
    <div className="h-full w-full flex flex-col relative" aria-busy={Boolean(operation)}>
      {operation && <div className="absolute inset-0 z-50 bg-white/40 flex items-center justify-center cursor-wait" role="status"><span className="rounded-lg bg-white px-5 py-3 shadow text-sm">{operation === 'publishing' ? 'Publishing…' : 'Restoring published draft…'}</span></div>}
      {/* Header */}
      <header data-testid="page-builder-shell" className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-200">
        <button onClick={handleClose} className="p-1.5 rounded hover:bg-gray-100" title="Close"><ArrowLeft size={18} /></button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
          <div className="font-semibold text-gray-900 truncate">{page.title}</div>
          {hasUnsavedChanges && (
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 font-medium bg-amber-50 px-1.5 py-0.5 rounded">
              <Circle size={6} fill="currentColor" /> Unsaved
            </span>
          )}
        </div>
          <div className="text-xs text-gray-500 flex items-center gap-2">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${statusBadge.dot}`} />
            <span className="truncate">{statusBadge.text}</span>
            {saveLabel && <span className={saveState === 'conflict' ? 'text-red-600' : 'text-gray-400'}>· {saveLabel}</span>}
            {saveState === 'conflict' && (
              <button data-testid="page-builder-reload-latest" className="text-indigo-600 hover:underline font-semibold" title={conflict?.message} onClick={() => dispatch(fetchPage(page._id))}>
                Reload latest
              </button>
            )}
          </div>
        </div>

        <button onClick={() => dispatch(undo())} disabled={!canUndo} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent" title="Undo (Cmd+Z)"><Undo2 size={16} /></button>
        <button onClick={() => dispatch(redo())} disabled={!canRedo} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent" title="Redo (Cmd+Shift+Z)"><Redo2 size={16} /></button>

        <div className="flex items-center bg-gray-100 rounded-md p-0.5 ml-2">
          {[['desktop', Monitor], ['tablet', Tablet], ['mobile', Smartphone]].map(([d, Icon]) => (
            <button data-testid={`page-builder-device-${d}`} key={d} onClick={() => dispatch(setDevice(d))} className={`p-1.5 rounded ${device === d ? 'bg-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`} title={`Preview ${d}`}><Icon size={16} /></button>
          ))}
        </div>

        <button onClick={() => setVersionsOpen(true)} className="text-sm text-gray-700 flex items-center gap-1.5 px-2.5 py-1.5 rounded hover:bg-gray-50" title="Version history"><History size={14} /></button>
        <button onClick={onCopyPreviewLink} className="text-sm text-gray-700 flex items-center gap-1.5 px-2.5 py-1.5 rounded hover:bg-gray-50" title="Copy preview link"><Link2 size={14} /></button>
        <button onClick={() => setPageSettingsOpen(true)} className="text-sm text-gray-700 flex items-center gap-1.5 px-2.5 py-1.5 rounded hover:bg-gray-50" title="Page settings"><SettingsIcon size={14} /></button>
        <button data-testid="page-builder-open-blocks" onClick={() => { setBlocksMode('browse'); setBlocksOpen(true); }} className="text-sm text-gray-700 flex items-center gap-1.5 px-2.5 py-1.5 rounded hover:bg-gray-50" title="Reusable blocks"><Box size={14} /> Blocks</button>
        {selectedSectionId && <button data-testid="page-builder-save-selected-block" onClick={() => { setBlocksMode('save'); setBlocksOpen(true); }} className="text-sm text-indigo-700 flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-indigo-50 hover:bg-indigo-100" title="Save selected section as reusable block"><Box size={14} /> Save block</button>}

        <button onClick={onDiscard} className="text-sm text-gray-700 hover:text-red-600 flex items-center gap-1.5 px-3 py-1.5 rounded hover:bg-gray-50"><Trash2 size={14} /> Discard</button>
        <button data-testid="page-builder-save" onClick={onManualSave} className="text-sm text-gray-700 flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50"><Save size={14} /> Save</button>
        <button onClick={() => setScheduleOpen(true)} className="text-sm text-gray-700 flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50" title="Schedule publish"><Calendar size={14} /> Schedule</button>
        <button data-testid="page-builder-publish" onClick={onPublish} className="text-sm text-white bg-indigo-600 hover:bg-indigo-700 flex items-center gap-1.5 px-4 py-1.5 rounded font-semibold"><Send size={14} /> Publish</button>
      </header>

      {/* Body */}
      <div className="flex-1 flex min-h-0">
        <aside className="w-[202px] shrink-0 bg-white border-r border-gray-200 flex flex-col min-h-0">
          <WidgetsPanel />
        </aside>
        <main className="flex-1 min-w-0 flex"><PreviewFrame /></main>
        <aside className="w-[360px] xl:w-[380px] shrink-0 bg-white border-l border-gray-200 flex flex-col min-h-0">
          <WidgetEditorPanel key={`${page._id}:${selectedSectionId}:${device}:${page.mobileLayoutMode}`} />
        </aside>
      </div>

      <PageBuilderAIChat pageId={id} />
      <PageSettingsDrawer open={pageSettingsOpen} onClose={() => setPageSettingsOpen(false)} />
      <SchedulePopover open={scheduleOpen} onClose={() => setScheduleOpen(false)} />
      <VersionHistoryDrawer open={versionsOpen} onClose={() => setVersionsOpen(false)} />
      <PageBlocksModal open={blocksOpen} initialMode={blocksMode} onClose={() => setBlocksOpen(false)} />
    </div>
  );
}

function errorMessage(error, fallback) {
  return error?.payload?.message
    || error?.response?.data?.message
    || error?.response?.data?.error
    || error?.message
    || fallback;
}

function closeBuilderWindow() {
  if (window.opener) {
    window.close();
    return;
  }
  if (window.history.length > 1) window.history.back();
}

function timeAgo(ts) {
  if (!ts) return '';
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 5) return 'just now';
  if (sec < 60) return sec + 's ago';
  return Math.floor(sec / 60) + 'm ago';
}
