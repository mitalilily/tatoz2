import { useEffect, useState } from 'react';
import { History, Loader2, Plus, RotateCcw, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { templateAPI } from '../../services/api';

export default function TemplateVersionsModal({ template, onClose, onUseVersion }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState('');

  const load = async () => {
    if (!template?._id) return;
    setLoading(true);
    try {
      const response = await templateAPI.versions(template._id);
      setVersions(response.data?.versions || []);
    } catch (error) {
      toast.error(error.response?.data?.message || error.response?.data?.error || 'Could not load template versions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [template?._id]);

  if (!template) return null;

  const createSnapshot = async () => {
    setBusy('snapshot');
    try {
      await templateAPI.createVersion(template._id, note.trim() || 'Manual snapshot');
      setNote('');
      toast.success('Template version saved');
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || error.response?.data?.error || 'Could not save template version');
    } finally {
      setBusy(null);
    }
  };

  const restore = async (version) => {
    if (!window.confirm(`Restore template version v${version.version} into the current draft?`)) return;
    setBusy(version._id);
    try {
      await templateAPI.restoreVersion(template._id, version._id);
      toast.success(`Template restored to v${version.version}`);
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || error.response?.data?.error || 'Could not restore template version');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div data-testid="template-versions-modal" className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Template versions">
      <div className="w-full max-w-xl max-h-[min(720px,calc(100vh-2rem))] overflow-hidden rounded-xl bg-white shadow-2xl flex flex-col">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200">
          <History size={18} className="text-purple-600" />
          <div className="flex-1"><h2 className="font-semibold text-gray-900">{template.title} versions</h2><p className="text-xs text-gray-500">Snapshot and reuse stable template states without changing the source page.</p></div>
          <button data-testid="template-versions-close" onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-500"><X size={18} /></button>
        </div>
        <div className="border-b border-gray-100 p-4 bg-gray-50">
          <div className="flex gap-2"><input data-testid="template-version-note" value={note} onChange={event => setNote(event.target.value)} maxLength={500} placeholder="Snapshot note (optional)" className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" /><button data-testid="template-create-version" onClick={createSnapshot} disabled={busy === 'snapshot'} className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50">{busy === 'snapshot' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Snapshot</button></div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? <div className="py-10 text-center text-sm text-gray-500"><Loader2 size={18} className="mx-auto mb-2 animate-spin" />Loading versions…</div> : versions.length === 0 ? <div className="py-10 text-center text-sm text-gray-500">No template versions yet.</div> : <div className="space-y-2">{versions.map(version => <div data-testid={`template-version-${version._id}`} key={version._id} className="flex items-center gap-3 rounded-lg border border-gray-200 p-3"><div className="h-8 w-8 rounded-full bg-purple-50 text-purple-700 flex items-center justify-center text-xs font-bold">v{version.version}</div><div className="min-w-0 flex-1"><div className="text-sm font-semibold text-gray-900">Version {version.version}</div><div className="text-xs text-gray-500">{version.changeNote || 'Template snapshot'} · {new Date(version.createdAt).toLocaleString()}</div></div><button data-testid={`template-use-version-${version._id}`} onClick={() => onUseVersion(template, version)} className="rounded-md bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">Use for page</button><button data-testid={`template-restore-version-${version._id}`} onClick={() => restore(version)} disabled={busy === version._id} className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:border-amber-300 hover:text-amber-700 disabled:opacity-50"><RotateCcw size={12} />{busy === version._id ? 'Restoring…' : 'Restore'}</button></div>)}</div>}
        </div>
      </div>
    </div>
  );
}
