import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { X, RotateCcw, History } from 'lucide-react';
import { adminPageAPI } from '../../../services/api';
import { fetchPage } from '../../../store/slices/pageBuilderSlice';

export default function VersionHistoryDrawer({ open, onClose }) {
  const dispatch = useDispatch();
  const page = useSelector(s => s.pageBuilder.page);
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(null);
  const [selectedVersion, setSelectedVersion] = useState(null);

  useEffect(() => {
    if (!open || !page) return;
    setLoading(true);
    adminPageAPI.versions(page._id)
      .then(r => setVersions(r.data?.versions || []))
      .catch(() => setVersions([]))
      .finally(() => setLoading(false));
  }, [open, page]);

  if (!open || !page) return null;

  const onRollback = async (versionId) => {
    if (!confirm('Restore this version? Current published layout will be snapshotted before rollback.')) return;
    setRestoring(versionId);
    try {
      await adminPageAPI.rollback(page._id, versionId);
      toast.success('Rolled back to selected version');
      await dispatch(fetchPage(page._id));
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Rollback failed');
    } finally {
      setRestoring(null);
    }
  };

  const onCompare = async (versionId) => {
    try {
      const response = await adminPageAPI.version(page._id, versionId);
      setSelectedVersion(response.data?.version || null);
    } catch (_) {
      toast.error('Could not load version details');
    }
  };

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="absolute right-0 top-0 bottom-0 w-[420px] bg-white shadow-xl border-l border-gray-200 overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="text-lg font-bold flex items-center gap-2"><History size={18} /> Version history</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <div className="p-5">
          {loading ? (
            <div className="text-sm text-gray-400 py-6 text-center">Loading…</div>
          ) : versions.length === 0 ? (
            <div className="text-sm text-gray-500 py-6 text-center">No prior versions yet — they'll appear here after each publish.</div>
          ) : (
            <ul className="space-y-2">
              {versions.map(v => (
                <li key={v._id} className="border border-gray-200 rounded-lg p-3 hover:border-indigo-200 transition">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900">{new Date(v.publishedAt).toLocaleString()}</div>
                      {v.changeNote && <div className="text-xs text-gray-500 mt-0.5 truncate">{v.changeNote}</div>}
                      <div className="text-[11px] text-gray-400 mt-1">v.{String(v._id).slice(-6)}</div>
                      <button type="button" onClick={() => onCompare(v._id)} className="mt-2 text-[11px] font-semibold text-slate-600 hover:text-indigo-600">Compare snapshot</button>
                    </div>
                    <button
                      onClick={() => onRollback(v._id)}
                      disabled={restoring === v._id}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-indigo-50 disabled:opacity-50"
                    >
                      <RotateCcw size={12} /> {restoring === v._id ? 'Restoring…' : 'Restore'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {selectedVersion?.documentSnapshot && (
            <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-xs text-slate-700">
              <div className="font-semibold text-indigo-900">Snapshot details</div>
              <div className="mt-2 space-y-1">
                <div><span className="font-medium">Title:</span> {selectedVersion.documentSnapshot.title || '—'}</div>
                <div><span className="font-medium">Slug:</span> {selectedVersion.documentSnapshot.slug || '—'}</div>
                <div><span className="font-medium">Sections:</span> {selectedVersion.documentSnapshot.layout?.sections?.length || 0} desktop · {selectedVersion.documentSnapshot.mobileLayout?.sections?.length || 0} mobile</div>
                <div><span className="font-medium">Mobile mode:</span> {selectedVersion.documentSnapshot.mobileLayoutMode || 'auto'}</div>
                <div><span className="font-medium">SEO title:</span> {selectedVersion.documentSnapshot.seo?.metaTitle || '—'}</div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
