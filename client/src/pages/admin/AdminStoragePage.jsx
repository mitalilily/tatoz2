import { useCallback, useEffect, useState } from 'react';
import {
  ExternalLink,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  HardDrive,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { adminAPI } from '../../services/api';
import Pagination from '../../components/common/Pagination';
import Loader from '../../components/common/Loader';

const PAGE_SIZE = 10;

const mediaIcon = mediaType => {
  if (mediaType === 'video') return FileVideo;
  if (mediaType === 'audio') return FileAudio;
  if (mediaType === 'document') return FileText;
  return FileImage;
};

const mediaLabel = mediaType => {
  if (mediaType === 'video') return 'Video';
  if (mediaType === 'audio') return 'Audio';
  if (mediaType === 'document') return 'Document';
  return 'Image';
};

const MediaPreview = ({ asset }) => {
  if (asset.mediaType === 'image') {
    return (
      <img
        src={asset.thumbnailUrl || asset.url}
        alt={asset.name}
        loading="lazy"
        onError={event => {
          if (event.currentTarget.src !== asset.url) event.currentTarget.src = asset.url;
        }}
        className="h-full w-full object-cover"
      />
    );
  }

  if (asset.mediaType === 'video') {
    return <video src={asset.url} muted preload="metadata" className="h-full w-full object-cover" />;
  }

  const Icon = mediaIcon(asset.mediaType);
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-50 text-slate-400">
      <Icon size={34} strokeWidth={1.5} />
      <span className="text-[11px] font-bold uppercase tracking-wide">{mediaLabel(asset.mediaType)}</span>
    </div>
  );
};

export default function AdminStoragePage() {
  const [assets, setAssets] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);

  const loadAssets = useCallback(async (requestedPage = page) => {
    setLoading(true);
    try {
      const response = await adminAPI.getStorage({ page: requestedPage, limit: PAGE_SIZE });
      const nextPagination = response.data?.pagination || { page: requestedPage, pages: 1, total: 0 };
      setAssets(response.data?.assets || []);
      setSelectedIds([]);
      setPagination(nextPagination);
      if (nextPagination.page !== page) setPage(nextPagination.page);
    } catch (error) {
      toast.error(error.response?.data?.message || error.response?.data?.error || 'Failed to load storage');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    loadAssets(page);
  }, [loadAssets, page]);

  const deleteAsset = async asset => {
    const confirmed = window.confirm(
      `Delete “${asset.name}”?\n\nAny page, product, or setting using this file may stop displaying it. This cannot be undone.`,
    );
    if (!confirmed) return;

    setDeleting(asset.id);
    try {
      await adminAPI.deleteStorage(asset.id);
      toast.success('Media deleted');
      if (assets.length === 1 && page > 1) setPage(current => current - 1);
      else await loadAssets(page);
    } catch (error) {
      toast.error(error.response?.data?.message || error.response?.data?.error || 'Failed to delete media');
    } finally {
      setDeleting('');
    }
  };

  const toggleSelected = id => {
    setSelectedIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  };

  const selectCurrentPage = () => {
    const pageIds = assets.map(asset => asset.id);
    const allSelected = pageIds.length > 0 && pageIds.every(id => selectedIds.includes(id));
    setSelectedIds(current => allSelected
      ? current.filter(id => !pageIds.includes(id))
      : [...new Set([...current, ...pageIds])]);
  };

  const deleteSelected = async () => {
    if (!selectedIds.length) return;
    const confirmed = window.confirm(
      `Delete ${selectedIds.length} selected media file${selectedIds.length === 1 ? '' : 's'}?\n\nAny page, product, or setting using these files may stop displaying them. This cannot be undone.`,
    );
    if (!confirmed) return;

    setDeleting('bulk');
    try {
      const response = await adminAPI.deleteStorageBulk(selectedIds);
      const deletedCount = response.data?.deletedCount || 0;
      setSelectedIds([]);
      toast.success(`${deletedCount} media file${deletedCount === 1 ? '' : 's'} deleted`);
      await loadAssets(page);
    } catch (error) {
      toast.error(error.response?.data?.message || error.response?.data?.error || 'Failed to delete selected media');
    } finally {
      setDeleting('');
    }
  };

  const currentPageSelected = assets.length > 0 && assets.every(asset => selectedIds.includes(asset.id));

  return (
    <div className="space-y-6" data-testid="admin-storage-page">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900">
            <HardDrive className="text-primary-600" size={27} />
            Storage
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            View media stored by this project. You can remove unused assets from here.
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadAssets(page)}
          disabled={loading}
          className="btn-secondary inline-flex items-center gap-2 self-start"
          aria-label="Refresh storage"
          data-testid="storage-refresh"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Project media</p>
          <p className="mt-1 text-sm text-slate-600">{pagination.total || 0} asset{pagination.total === 1 ? '' : 's'} found</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={selectCurrentPage}
            disabled={!assets.length || Boolean(deleting)}
            className="btn-secondary inline-flex items-center gap-2 text-xs"
            data-testid="storage-select-page"
          >
            <input type="checkbox" checked={currentPageSelected} readOnly className="h-3.5 w-3.5 rounded border-slate-300 text-primary-600" />
            {currentPageSelected ? 'Clear page' : 'Select page'}
          </button>
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={deleteSelected}
              disabled={Boolean(deleting)}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="storage-delete-selected"
            >
              {deleting === 'bulk' ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Delete selected ({selectedIds.length})
            </button>
          )}
          <p className="text-xs font-semibold text-slate-400">10 per page</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader size="lg" /></div>
      ) : assets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <HardDrive className="mx-auto text-slate-300" size={42} strokeWidth={1.5} />
          <h2 className="mt-4 font-bold text-slate-800">No media found</h2>
          <p className="mt-1 text-sm text-slate-500">Project uploads will appear here when available.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {assets.map(asset => {
              const deletingThis = deleting === asset.id;
              const selected = selectedIds.includes(asset.id);
              return (
                <article key={asset.id} className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition ${selected ? 'border-primary-400 ring-2 ring-primary-100' : 'border-slate-200'}`}>
                  <div className="relative h-28 overflow-hidden bg-slate-100 sm:h-32">
                    <MediaPreview asset={asset} />
                    <label className="absolute left-2 top-2 flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-white/95 shadow-sm" title={`Select ${asset.name}`}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleSelected(asset.id)}
                        className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                        aria-label={`Select ${asset.name}`}
                      />
                    </label>
                    <span className="absolute right-2 top-2 rounded-full bg-slate-900/75 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                      {mediaLabel(asset.mediaType)}
                    </span>
                  </div>
                  <div className="space-y-2 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-800" title={asset.name}>{asset.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{asset.sizeLabel} · {new Date(asset.updatedAt).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={asset.url}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-secondary inline-flex flex-1 items-center justify-center gap-2 text-xs"
                        aria-label={`Open ${asset.name}`}
                      >
                        <ExternalLink size={14} />
                        Open
                      </a>
                      <button
                        type="button"
                        onClick={() => deleteAsset(asset)}
                        disabled={Boolean(deleting)}
                        className="inline-flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={`Delete ${asset.name}`}
                        title="Delete media"
                        data-testid={`storage-delete-${asset.id}`}
                      >
                        {deletingThis ? <RefreshCw size={15} className="animate-spin" /> : <Trash2 size={15} />}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <Pagination currentPage={pagination.page || page} totalPages={pagination.pages || 1} onPageChange={setPage} />
          </div>
        </>
      )}
    </div>
  );
}
