import { useState, useEffect, useCallback } from 'react';
import {
  Package, Search, AlertTriangle, CheckCircle, XCircle,
  Loader2, Save, RefreshCw, ClipboardList, Boxes,
} from 'lucide-react';
import { vendorAPI } from '../../services/api';
import Pagination from '../../components/common/Pagination';
import Loader from '../../components/common/Loader';
import Modal from '../../components/common/Modal';
import toast from 'react-hot-toast';

const LIMIT = 20;
const PLACEHOLDER_IMG = 'https://via.placeholder.com/80/f3f4f6/9ca3af?text=No+img';

const StockBadge = ({ stock, lowStockThreshold }) => {
  if (stock === 0) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700"><XCircle size={12} /> Out of stock</span>;
  if (lowStockThreshold > 0 && stock <= lowStockThreshold) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700"><AlertTriangle size={12} /> Low stock</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700"><CheckCircle size={12} /> In stock</span>;
};

export default function VendorInventoryPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ pages: 1, total: 0 });
  const [savingId, setSavingId] = useState(null);
  const [edits, setEdits] = useState({});
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkStock, setBulkStock] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      const params = { page, limit: LIMIT };
      if (search.trim()) params.search = search.trim();
      if (stockFilter) params.status = stockFilter;
      const res = await vendorAPI.getInventory(params);
      setProducts(res.data.data || []);
      setPagination(res.data.pagination || { pages: 1, total: 0 });
      setEdits({});
      setSelectedIds(new Set());
    } catch { toast.error('Failed to fetch inventory'); }
    finally { setLoading(false); }
  }, [page, search, stockFilter]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const getEdit = (p) => {
    const e = edits[p._id];
    return {
      stock: e?.stock !== undefined ? e.stock : p.stock,
      lowStockThreshold: e?.lowStockThreshold !== undefined ? e.lowStockThreshold : (p.lowStockThreshold ?? 10),
    };
  };

  const setEdit = (productId, field, value) => {
    const num = field === 'stock' || field === 'lowStockThreshold' ? Math.max(0, parseInt(value, 10) || 0) : value;
    setEdits(prev => ({ ...prev, [productId]: { ...prev[productId], [field]: num } }));
  };

  const hasChanges = (p) => {
    const e = edits[p._id];
    if (!e) return false;
    const cur = getEdit(p);
    return (e.stock !== undefined && e.stock !== p.stock) ||
      (e.lowStockThreshold !== undefined && e.lowStockThreshold !== (p.lowStockThreshold ?? 10));
  };

  const handleSave = async (product) => {
    const id = product._id;
    const { stock, lowStockThreshold } = getEdit(product);
    if (stock === product.stock && (product.lowStockThreshold ?? 10) === lowStockThreshold) {
      setEdits(prev => { const n = { ...prev }; delete n[id]; return n; });
      return;
    }
    setSavingId(id);
    try {
      await vendorAPI.updateStock(id, { stock, lowStockThreshold });
      setProducts(prev => prev.map(p => p._id === id ? { ...p, stock, lowStockThreshold } : p));
      setEdits(prev => { const n = { ...prev }; delete n[id]; return n; });
      toast.success('Stock updated');
    } catch (err) { toast.error(err.message || 'Failed to update'); }
    finally { setSavingId(null); }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === products.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(products.map(p => p._id)));
  };

  const handleBulkUpdate = async () => {
    const stock = parseInt(bulkStock, 10);
    if (isNaN(stock) || stock < 0) { toast.error('Enter a valid stock value'); return; }
    setBulkSaving(true);
    try {
      const items = Array.from(selectedIds).map(productId => ({ productId, stock }));
      await vendorAPI.bulkUpdateStock(items);
      toast.success(`Updated ${items.length} products`);
      setShowBulkModal(false);
      setBulkStock('');
      setSelectedIds(new Set());
      fetchProducts();
    } catch (err) { toast.error(err.message || 'Bulk update failed'); }
    finally { setBulkSaving(false); }
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    try { const res = await vendorAPI.getInventoryLogs({ limit: 50 }); setLogs(res.data.data || []); }
    catch {} finally { setLogsLoading(false); }
  };

  const toggleLogs = () => {
    if (!showLogs) loadLogs();
    setShowLogs(s => !s);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Boxes className="text-primary-600" size={28} /> Inventory
          </h1>
          <p className="text-gray-500 mt-1">View and update product stock and low-stock thresholds</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={toggleLogs} className="btn-secondary flex items-center gap-2 text-sm">
            <ClipboardList size={16} /> {showLogs ? 'Hide logs' : 'Restock history'}
          </button>
          <button onClick={() => fetchProducts()} disabled={loading} className="btn-secondary flex items-center gap-2">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by title or SKU..." className="input pl-10 w-full" />
        </div>
        <select value={stockFilter} onChange={e => { setStockFilter(e.target.value); setPage(1); }} className="input w-44">
          <option value="">All products</option>
          <option value="low_stock">Low stock</option>
          <option value="out_of_stock">Out of stock</option>
        </select>
        {selectedIds.size > 0 && (
          <button onClick={() => setShowBulkModal(true)} className="btn-primary flex items-center gap-2">
            <Save size={16} /> Bulk update ({selectedIds.size})
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader size="lg" /></div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 w-10">
                      <input type="checkbox" checked={products.length > 0 && selectedIds.size === products.length}
                        onChange={toggleSelectAll} className="rounded" />
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Product</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">SKU</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Stock</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Low stock at</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {products.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-500">No products match your filters.</td></tr>
                  ) : products.map(p => {
                    const { stock, lowStockThreshold } = getEdit(p);
                    const saving = savingId === p._id;
                    const changed = hasChanges(p);
                    return (
                      <tr key={p._id} className="border-b border-gray-100 hover:bg-gray-50/50">
                        <td className="px-4 py-3">
                          <input type="checkbox" checked={selectedIds.has(p._id)}
                            onChange={() => toggleSelect(p._id)} className="rounded" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <img src={p.thumbnail || p.images?.[0]?.url || PLACEHOLDER_IMG} alt=""
                              className="w-12 h-12 rounded-lg object-cover bg-gray-100" />
                            <span className="font-medium text-gray-900 line-clamp-2">{p.title}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{p.sku || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{p.category?.name || '—'}</td>
                        <td className="px-4 py-3">
                          <input type="number" min={0} value={stock}
                            onChange={e => setEdit(p._id, 'stock', e.target.value)}
                            className="input w-20 py-1.5 text-center text-sm" />
                        </td>
                        <td className="px-4 py-3">
                          <input type="number" min={0} value={lowStockThreshold}
                            onChange={e => setEdit(p._id, 'lowStockThreshold', e.target.value)}
                            className="input w-20 py-1.5 text-center text-sm" />
                        </td>
                        <td className="px-4 py-3"><StockBadge stock={stock} lowStockThreshold={lowStockThreshold} /></td>
                        <td className="px-4 py-3">
                          <button onClick={() => handleSave(p)} disabled={saving || !changed}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed">
                            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            {saving ? 'Saving...' : 'Save'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {pagination.pages > 1 && <Pagination currentPage={page} totalPages={pagination.pages} onPageChange={setPage} />}
        </>
      )}

      {/* Restock history */}
      {showLogs && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <ClipboardList size={18} className="text-gray-500" /> Restock History
          </h3>
          {logsLoading ? (
            <div className="flex justify-center py-6"><Loader size="sm" /></div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-gray-400">No restock history yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Date</th>
                    <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Product</th>
                    <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Type</th>
                    <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Previous</th>
                    <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">New</th>
                    <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Delta</th>
                    <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">By</th>
                    <th className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log._id} className="border-b border-gray-100">
                      <td className="px-3 py-2 text-gray-600">{new Date(log.createdAt).toLocaleDateString()}</td>
                      <td className="px-3 py-2 font-medium">{log.product?.title || 'Deleted product'}</td>
                      <td className="px-3 py-2"><span className="capitalize text-xs px-2 py-0.5 rounded-full bg-gray-100">{log.type.replace(/_/g, ' ')}</span></td>
                      <td className="px-3 py-2">{log.previousStock}</td>
                      <td className="px-3 py-2">{log.newStock}</td>
                      <td className="px-3 py-2 font-medium" style={{ color: log.delta > 0 ? '#16a34a' : '#dc2626' }}>{log.delta > 0 ? '+' : ''}{log.delta}</td>
                      <td className="px-3 py-2 text-gray-600">{log.user?.name || 'System'}</td>
                      <td className="px-3 py-2 text-gray-400 max-w-[150px] truncate">{log.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Bulk update modal */}
      {showBulkModal && (
        <Modal onClose={() => setShowBulkModal(false)} title={`Bulk update ${selectedIds.size} products`}>
          <div className="p-4 space-y-4">
            <p className="text-sm text-gray-500">Set stock to the same value for all selected products.</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New stock value</label>
              <input type="number" min={0} value={bulkStock} onChange={e => setBulkStock(e.target.value)}
                className="input w-full" placeholder="e.g. 50" />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowBulkModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleBulkUpdate} disabled={bulkSaving || !bulkStock}
                className="btn-primary disabled:opacity-60">
                {bulkSaving ? 'Updating...' : `Update ${selectedIds.size} products`}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
