import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Archive, Box, Check, Loader2, Plus, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { pageBlockAPI } from '../../../services/api';
import { insertBlock, selectActiveSection, selectActiveSections } from '../../../store/slices/pageBuilderSlice';
import { SECTION_REGISTRY } from '../../sections/registry';

export default function PageBlocksModal({ open, onClose, initialMode = 'browse' }) {
  const dispatch = useDispatch();
  const page = useSelector(state => state.pageBuilder.page);
  const selectedId = useSelector(state => state.pageBuilder.selectedSectionId);
  const selectedIds = useSelector(state => state.pageBuilder.selectedSectionIds || []);
  const selectedSection = useSelector(state => selectActiveSection(state, selectedId));
  const activeSections = useSelector(selectActiveSections);
  const [mode, setMode] = useState(initialMode);
  const [blocks, setBlocks] = useState([]);
  const [search, setSearch] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setTitle('');
    setDescription('');
  }, [open, initialMode]);

  const loadBlocks = async (query = '') => {
    setLoading(true);
    try {
      const response = await pageBlockAPI.list(query ? { search: query } : {});
      setBlocks(response.data?.items || []);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not load reusable blocks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && mode === 'browse') loadBlocks();
  }, [open, mode]);

  const filteredBlocks = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return blocks;
    return blocks.filter(block => `${block.title} ${block.description || ''}`.toLowerCase().includes(query));
  }, [blocks, search]);

  const selectedSections = useMemo(() => {
    const ids = selectedIds.length ? selectedIds : (selectedSection ? [selectedSection.id] : []);
    return activeSections.filter(section => ids.includes(section.id));
  }, [activeSections, selectedIds, selectedSection]);

  if (!open) return null;

  const save = async (event) => {
    event.preventDefault();
    if (!selectedSections.length) {
      toast.error('Select at least one section first');
      return;
    }
    if (!title.trim()) return;
    setBusy(true);
    try {
      await pageBlockAPI.create({
        title: title.trim(),
        description: description.trim(),
        sections: selectedSections,
        sourcePageId: page?._id,
      });
      toast.success('Reusable block saved');
      setMode('browse');
      setTitle('');
      setDescription('');
      await loadBlocks();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not save reusable block');
    } finally {
      setBusy(false);
    }
  };

  const insert = (block) => {
    if (!Array.isArray(block.sections) || !block.sections.length) return;
    dispatch(insertBlock({ sections: block.sections }));
    toast.success(`Inserted “${block.title}”`);
    onClose();
  };

  const archive = async (block) => {
    if (!window.confirm(`Archive reusable block “${block.title}”?`)) return;
    try {
      await pageBlockAPI.archive(block._id);
      setBlocks(current => current.filter(item => item._id !== block._id));
      toast.success('Reusable block archived');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not archive block');
    }
  };

  return (
    <div data-testid="page-builder-blocks-modal" className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Reusable blocks">
      <div className="w-full max-w-2xl max-h-[min(720px,calc(100vh-2rem))] overflow-hidden rounded-xl bg-white shadow-2xl flex flex-col">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200">
          <div className="h-9 w-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center"><Box size={18} /></div>
          <div className="flex-1">
            <h2 className="font-semibold text-gray-900">Reusable blocks</h2>
            <p className="text-xs text-gray-500">Save a polished section once, then reuse it on any page.</p>
          </div>
          <button data-testid="page-builder-blocks-close" onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="Close"><X size={18} /></button>
        </div>

        <div className="flex items-center gap-1 px-5 pt-3 border-b border-gray-100">
          <button data-testid="page-builder-blocks-browse" onClick={() => setMode('browse')} className={`px-3 py-2 text-sm font-medium border-b-2 ${mode === 'browse' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500'}`}><Search size={14} className="inline mr-1.5" />Browse blocks</button>
          <button data-testid="page-builder-blocks-save" onClick={() => setMode('save')} className={`px-3 py-2 text-sm font-medium border-b-2 ${mode === 'save' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500'}`}><Plus size={14} className="inline mr-1.5" />Save selected</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {mode === 'save' ? (
            <form onSubmit={save} className="space-y-4">
              {selectedSections.length ? (
                <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-sm text-indigo-900">
                  <strong data-testid="page-builder-block-selection-count">{selectedSections.length} section{selectedSections.length === 1 ? '' : 's'} selected</strong>
                  <div className="mt-1 text-xs text-indigo-700">{selectedSections.map(section => SECTION_REGISTRY[section.type]?.label || section.type).join(' · ')}</div>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Select a section in the Widget Tree or preview before saving it.</div>
              )}
              <label className="block text-sm font-medium text-gray-700">Block name<input data-testid="page-builder-block-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={120} required placeholder="e.g. Premium hero" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" /></label>
              <label className="block text-sm font-medium text-gray-700">Description <span className="font-normal text-gray-400">(optional)</span><textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={500} rows={3} placeholder="Where should this block be used?" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" /></label>
              <button data-testid="page-builder-save-block-submit" type="submit" disabled={busy || !selectedSections.length || !title.trim()} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save reusable block</button>
            </form>
          ) : (
            <>
              <div className="flex gap-2 mb-4">
                <div className="relative flex-1"><Search size={15} className="absolute left-3 top-2.5 text-gray-400" /><input data-testid="page-builder-block-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search saved blocks" className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm" /></div>
                <button onClick={() => loadBlocks(search)} className="rounded-lg border border-gray-300 px-3 text-sm text-gray-700 hover:bg-gray-50">Search</button>
              </div>
              {loading ? <div className="py-10 text-center text-sm text-gray-500"><Loader2 size={18} className="mx-auto mb-2 animate-spin" />Loading blocks…</div> : filteredBlocks.length === 0 ? <div data-testid="page-builder-blocks-empty" className="py-10 text-center text-sm text-gray-500">No reusable blocks saved yet.</div> : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {filteredBlocks.map(block => (
                    <div data-testid={`page-builder-block-card-${block._id}`} key={block._id} className="rounded-lg border border-gray-200 p-3 hover:border-indigo-200 hover:shadow-sm">
                      <div className="flex items-start gap-2">
                        <Box size={16} className="mt-0.5 text-indigo-500 flex-shrink-0" />
                        <div className="min-w-0 flex-1"><div className="font-semibold text-sm text-gray-900 truncate">{block.title}</div><div className="text-xs text-gray-500 line-clamp-2 mt-0.5">{block.description || `${block.sectionCount || block.sections?.length || 1} section`}</div></div>
                      </div>
                      <div className="flex items-center gap-2 mt-3"><button data-testid={`page-builder-insert-block-${block._id}`} onClick={() => insert(block)} className="flex-1 rounded-md bg-indigo-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">Insert</button><button data-testid={`page-builder-archive-block-${block._id}`} onClick={() => archive(block)} className="rounded-md border border-gray-200 p-1.5 text-gray-500 hover:border-red-200 hover:text-red-600" title="Archive"><Archive size={14} /></button></div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
