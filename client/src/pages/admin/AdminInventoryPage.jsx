import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
 Package,
 Search,
 AlertTriangle,
 CheckCircle,
 XCircle,
 Loader2,
  Save,
  RefreshCw,
  Download,
  Upload,
} from 'lucide-react';
import { productAPI, inventoryAPI, inventoryImportAPI, categoryAPI } from '../../services/api';
import Pagination from '../../components/common/Pagination';
import Loader from '../../components/common/Loader';
import toast from 'react-hot-toast';

const LIMIT = 20;
const PLACEHOLDER_IMG = 'https://via.placeholder.com/80/f3f4f6/9ca3af?text=No+img';

const StockBadge = ({ stock, lowStockThreshold }) => {
 if (stock === 0) {
 return (
 <span className="inline-flex min-w-max items-center gap-1 whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
 <XCircle size={12} /> Out of stock
 </span>
 );
 }
 if (lowStockThreshold != null && stock <= lowStockThreshold) {
 return (
 <span className="inline-flex min-w-max items-center gap-1 whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
 <AlertTriangle size={12} /> Low stock
 </span>
 );
 }
 return (
 <span className="inline-flex min-w-max items-center gap-1 whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
 <CheckCircle size={12} /> In stock
 </span>
 );
};

const AdminInventoryPage = () => {
 const [searchParams] = useSearchParams();
 const [products, setProducts] = useState([]);
 const [categories, setCategories] = useState([]);
 const [loading, setLoading] = useState(true);
 const [search, setSearch] = useState(() => searchParams.get('search') || '');
 const [stockFilter, setStockFilter] = useState(() => ['low_stock', 'out_of_stock'].includes(searchParams.get('status')) ? searchParams.get('status') : ''); // '', 'low_stock', 'out_of_stock'
 const [page, setPage] = useState(1);
 const [pagination, setPagination] = useState({ pages: 1, total: 0 });
 const [summary, setSummary] = useState({ availableStock: 0, reservedStock: 0, soldStock: 0, incomingStock: 0, activeReservations: 0 });
 const [savingId, setSavingId] = useState(null);
 const [edits, setEdits] = useState({}); // { productId: { stock, lowStockThreshold } }
 const [importing, setImporting] = useState(false);

 const fetchProducts = useCallback(async () => {
 try {
 setLoading(true);
 const params = { page, limit: LIMIT };
 if (search.trim()) params.search = search.trim();
 if (stockFilter === 'low_stock') params.status = 'low_stock';
 if (stockFilter === 'out_of_stock') params.status = 'out_of_stock';
 const res = await inventoryAPI.getOverview(params);
 setProducts(res.data.products || []);
 setPagination(res.data.pagination || { pages: 1, total: 0 });
 setSummary(res.data.summary || {});
 setEdits({});
 } catch (err) {
 toast.error(err.message || 'Failed to fetch inventory');
 } finally {
 setLoading(false);
 }
 }, [page, search, stockFilter]);

 useEffect(() => {
 fetchProducts();
 }, [fetchProducts]);

 useEffect(() => {
 categoryAPI.adminGetAll().then((res) => setCategories(res.data.categories || [])).catch(() => {});
 }, []);

 const getEdit = (product) => {
 const id = product._id;
 const e = edits[id];
 return {
 stock: e?.stock !== undefined ? e.stock : product.stock,
 lowStockThreshold: e?.lowStockThreshold !== undefined ? e.lowStockThreshold : (product.lowStockThreshold ?? 10),
 };
 };

 const setEdit = (productId, field, value) => {
 const num = field === 'stock' || field === 'lowStockThreshold' ? Math.max(0, parseInt(value, 10) || 0) : value;
 setEdits((prev) => ({
 ...prev,
 [productId]: {
 ...prev[productId],
 [field]: num,
 },
 }));
 };

 const hasChanges = (product) => {
 const e = edits[product._id];
 if (!e) return false;
 const current = getEdit(product);
 return (
 (e.stock !== undefined && e.stock !== product.stock) ||
 (e.lowStockThreshold !== undefined && e.lowStockThreshold !== (product.lowStockThreshold ?? 10))
 );
 };

 const handleSave = async (product) => {
 const id = product._id;
 const { stock, lowStockThreshold } = getEdit(product);
 if (stock === product.stock && (product.lowStockThreshold ?? 10) === lowStockThreshold) {
 setEdits((prev) => {
 const next = { ...prev };
 delete next[id];
 return next;
 });
 return;
 }
 setSavingId(id);
 try {
 const res = await productAPI.update(id, { stock, lowStockThreshold });
 const updated = res.data.product;
 setProducts((prev) => prev.map((p) => (p._id === id ? { ...p, ...updated } : p)));
 setEdits((prev) => {
 const next = { ...prev };
 delete next[id];
 return next;
 });
 toast.success('Inventory updated');
 } catch (err) {
 toast.error(err.message || 'Failed to update');
 } finally {
 setSavingId(null);
 }
 };

 const download = async (request, filename) => {
  try {
   const response = await request();
   const url = window.URL.createObjectURL(new Blob([response.data]));
   const anchor = document.createElement('a');
   anchor.href = url;
   anchor.download = filename;
   anchor.click();
   window.URL.revokeObjectURL(url);
  } catch (error) {
   toast.error(error.message || 'Download failed');
  }
 };

 const handleInventoryImport = async event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  setImporting(true);
  try {
   const formData = new FormData();
   formData.append('file', file);
   const response = await inventoryImportAPI.importCSV(formData);
   const result = response.data || {};
   toast.success(`Inventory updated: ${result.updated || 0}; unchanged: ${result.unchanged || 0}`);
   if (result.errors?.length) toast.error(`${result.errors.length} row(s) need attention`);
   await fetchProducts();
  } catch (error) {
   toast.error(error.response?.data?.message || error.message || 'Inventory import failed');
  } finally {
   setImporting(false);
  }
 };

 return (
 <div className="space-y-6" data-testid="admin-inventory-page">
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
 <div>
 <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
 <Package className="text-primary-600" size={28} />
 Inventory
 </h1>
 <p className="text-gray-500 mt-1">
 Track available, reserved, sold and incoming units without hiding payment holds.
 </p>
 </div>

 <div className="flex flex-wrap gap-2 self-start sm:self-center">
  <button type="button" onClick={() => download(inventoryImportAPI.exportCSV, `inventory-export-${Date.now()}.csv`)} className="btn-secondary flex items-center gap-2" data-testid="inventory-export">
   <Download size={16} /> Export CSV
  </button>
  <button type="button" onClick={() => download(inventoryImportAPI.downloadTemplate, 'inventory-import-template.csv')} className="btn-secondary flex items-center gap-2" data-testid="inventory-template">
   <Download size={16} /> Template
  </button>
  <label className={`btn-primary flex items-center gap-2 cursor-pointer ${importing ? 'opacity-60 pointer-events-none' : ''}`} data-testid="inventory-import">
   <Upload size={16} /> {importing ? 'Importing...' : 'Import CSV'}
   <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleInventoryImport} disabled={importing} />
  </label>
  <button type="button" onClick={() => fetchProducts()} disabled={loading} className="btn-secondary flex items-center gap-2" aria-label="Refresh inventory" title="Refresh inventory" data-testid="inventory-refresh">
   <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
  </button>
 </div>
 </div>

 <div className="grid grid-cols-2 items-stretch gap-3 md:grid-cols-4" data-testid="inventory-summary">
 <div className="flex h-full min-h-[110px] flex-col rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Available</p><p className="mt-1 text-2xl font-black text-emerald-900">{Number(summary.availableStock || 0).toLocaleString()}</p></div>
 <div className="flex h-full min-h-[110px] flex-col rounded-2xl border border-amber-100 bg-amber-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Reserved</p><p className="mt-1 text-2xl font-black text-amber-900">{Number(summary.reservedStock || 0).toLocaleString()}</p><p className="mt-1 text-[11px] text-amber-700">{Number(summary.activeReservations || 0)} active holds</p></div>
 <div className="flex h-full min-h-[110px] flex-col rounded-2xl border border-indigo-100 bg-indigo-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Sold</p><p className="mt-1 text-2xl font-black text-indigo-900">{Number(summary.soldStock || 0).toLocaleString()}</p></div>
 <div className="flex h-full min-h-[110px] flex-col rounded-2xl border border-sky-100 bg-sky-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Incoming</p><p className="mt-1 text-2xl font-black text-sky-900">{Number(summary.incomingStock || 0).toLocaleString()}</p></div>
 </div>

 <div className="flex flex-wrap gap-3">
 <div className="relative flex-1 min-w-[200px]">
 <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
 <input data-testid="inventory-search"
 type="text"
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 placeholder="Search by title or SKU..."
 className="input pl-10 w-full"
 />
 </div>
 <select data-testid="inventory-stock-filter"
 value={stockFilter}
 onChange={(e) => { setStockFilter(e.target.value); setPage(1); }}
 className="input w-44"
 >
 <option value="">All products</option>
 <option value="low_stock">Low stock</option>
 <option value="out_of_stock">Out of stock</option>
 </select>
 </div>

 {loading ? (
 <div className="flex justify-center py-12">
 <Loader size="lg" />
 </div>
 ) : (
 <>
 <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
 <div className="overflow-x-auto">
 <table className="w-full min-w-[1120px] text-left">
 <thead>
 <tr className="border-b border-gray-200 bg-gray-50">
 <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Product</th>
 <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">SKU</th>
 <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
 <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Available</th>
 <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Reserved</th>
 <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Sold</th>
 <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Incoming</th>
 <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Low stock at</th>
 <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
 <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Action</th>
 </tr>
 </thead>
 <tbody>
 {products.length === 0 ? (
 <tr>
 <td colSpan={10} className="px-4 py-12 text-center text-gray-500">
 No products match your filters.
 </td>
 </tr>
 ) : (
 products.map((p) => {
 const { stock, lowStockThreshold } = getEdit(p);
 const saving = savingId === p._id;
 const changed = hasChanges(p);
 return (
 <tr key={p._id} className="border-b border-gray-100 hover:bg-gray-50/50">
 <td className="min-w-[260px] px-4 py-3">
 <div className="flex items-center gap-3">
 <img
 src={p.thumbnail || p.images?.[0]?.url || PLACEHOLDER_IMG}
 alt=""
 onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = PLACEHOLDER_IMG; }}
 className="w-12 h-12 rounded-lg object-cover bg-gray-100"
 />
 <span className="block max-w-[240px] truncate whitespace-nowrap font-medium text-gray-900" title={p.title}>{p.title}</span>
 </div>
 </td>
 <td className="min-w-[150px] whitespace-nowrap px-4 py-3 text-sm text-gray-600">{p.sku || '—'}</td>
 <td className="px-4 py-3 text-sm text-gray-600">{p.category?.name || '—'}</td>
 <td className="whitespace-nowrap px-4 py-3">
 <input
  type="number"
  min={0}
  value={stock}
  onChange={(e) => setEdit(p._id, 'stock', e.target.value)}
  className="input w-20 py-1.5 text-center text-sm"
 />
 </td>
 <td className="px-4 py-3 text-sm font-semibold text-amber-700">{Number(p.reservedStock || 0).toLocaleString()}</td>
 <td className="px-4 py-3 text-sm font-semibold text-indigo-700">{Number(p.soldStock || 0).toLocaleString()}</td>
 <td className="px-4 py-3 text-sm font-semibold text-sky-700">{Number(p.incomingStock || 0).toLocaleString()}</td>
 <td className="px-4 py-3">
  <input
 type="number"
 min={0}
 value={lowStockThreshold}
 onChange={(e) => setEdit(p._id, 'lowStockThreshold', e.target.value)}
 className="input w-20 py-1.5 text-center text-sm"
 />
 </td>
 <td className="px-4 py-3">
 <StockBadge stock={stock} lowStockThreshold={lowStockThreshold} />
 </td>
 <td className="px-4 py-3">
 <button
 onClick={() => handleSave(p)}
 disabled={saving || !changed}
 className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed"
 >
 {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
 {saving ? 'Saving...' : 'Save'}
 </button>
 </td>
 </tr>
 );
 })
 )}
 </tbody>
 </table>
 </div>
 </div>

 {pagination.pages > 1 && (
 <Pagination
 currentPage={page}
 totalPages={pagination.pages}
 onPageChange={setPage}
 />
 )}
 </>
 )}
 </div>
 );
};

export default AdminInventoryPage;
