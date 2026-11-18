import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus, Search, Edit2, Trash2, Package, ChevronDown,
  Eye, EyeOff, RefreshCw, Download, Upload, Copy, CheckCircle2, XCircle,
} from 'lucide-react';
import { productAPI, categoryAPI, productImportAPI } from '../../services/api';
import Pagination from '../../components/common/Pagination';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import EmptyState from '../../components/common/EmptyState';
import Toggle from '../../components/common/Toggle';
import toast from 'react-hot-toast';
import { useSite } from '../../context/SiteContext';
import { formatPrice } from '../../utils/formatPrice';

const Skeleton = ({ className = '' }) => (
  <div className={`animate-pulse bg-gray-200 rounded-lg ${className}`} />
);
const productImageUrl = product => product?.thumbnail || (typeof product?.images?.[0] === 'string' ? product.images[0] : product?.images?.[0]?.url) || '';
const productBrandLabel = product => product?.brand?.name || product?.brandName || product?.brand || 'No Brand';
const productVendorLabel = product => product?.vendor?.storeName || (product?.vendor ? 'Vendor' : 'Platform');

const StatusBadge = ({ isActive, lifecycleStatus }) => {
  const status = lifecycleStatus || (isActive ? 'active' : 'inactive');
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  const colors = {
    active: ['bg-emerald-100 text-emerald-700', 'bg-emerald-500'],
    draft: ['bg-amber-100 text-amber-700', 'bg-amber-500'],
    archived: ['bg-slate-100 text-slate-600', 'bg-slate-400'],
    inactive: ['bg-gray-100 text-gray-500', 'bg-gray-400'],
  };
  const [badge, dot] = colors[status] || colors.inactive;
  return (
  <span
    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${badge}`}
  >
    <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
    {label}
  </span>
  );
};

const ApprovalBadge = ({ status }) => {
  const value = status || 'approved';
  const colors = {
    approved: 'bg-emerald-100 text-emerald-700',
    pending: 'bg-amber-100 text-amber-700',
    rejected: 'bg-red-100 text-red-700',
  };
  return <span data-testid={`approval-status-${value}`} className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[value] || 'bg-gray-100 text-gray-600'}`}>{value === 'pending' ? 'Pending approval' : value.charAt(0).toUpperCase() + value.slice(1)}</span>;
};

export default function ProductsListPage({ mode = 'admin' }) {
  const navigate = useNavigate();
  const { settings } = useSite();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [vendors, setVendors] = useState([]);
  const [hasPlatformProducts, setHasPlatformProducts] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkAction, setBulkAction] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [duplicating, setDuplicating] = useState(null);

  const isAdmin = mode === 'admin';
  const baseNav = isAdmin ? '/admin' : '/vendor';

  const fetchVendors = useCallback(() => {
    if (!isAdmin) return;
    productAPI.adminGetVendors()
      .then((res) => {
        setVendors(res.data.vendors || []);
        setHasPlatformProducts(Boolean(res.data.hasPlatformProducts));
      })
      .catch(() => {});
  }, [isAdmin]);

  const fetchCategories = useCallback(() => {
    (isAdmin ? categoryAPI.adminGetAll() : categoryAPI.getAll())
      .then((res) => setCategories(res.data.categories || []))
      .catch(() => {});
  }, [isAdmin]);

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      const params = { page, limit: 15 };
      if (search.trim()) params.search = search.trim();
      if (categoryFilter) params.category = categoryFilter;
      if (isAdmin && vendorFilter) params.vendor = vendorFilter;
      if (statusFilter !== '') {
        if (isAdmin) {
          params.status = statusFilter;
        } else if (statusFilter === 'pending_approval' || statusFilter === 'rejected') {
          params.approvalStatus = statusFilter === 'pending_approval' ? 'pending' : 'rejected';
        } else {
          params.isActive = statusFilter === 'active';
        }
      }
      const res = isAdmin
        ? await productAPI.adminGetAll(params)
        : await productAPI.vendorGetAll(params);
      setProducts(res.data.products || []);
      setTotalPages(res.data.pagination?.pages || 1);
      setTotalItems(res.data.pagination?.total || 0);
    } catch (err) {
      toast.error(err.message || 'Failed to fetch products');
    } finally {
      setLoading(false);
    }
  }, [page, search, categoryFilter, vendorFilter, statusFilter, isAdmin]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);
  useEffect(() => { fetchCategories(); }, [fetchCategories]);
  useEffect(() => { fetchVendors(); }, [fetchVendors]);

  useEffect(() => {
    const t = setTimeout(() => { setPage(1); }, 500);
    return () => clearTimeout(t);
  }, [search]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      if (isAdmin) await productAPI.delete(deleteTarget._id);
      else await productAPI.vendorDelete(deleteTarget._id);
      toast.success('Product deleted successfully');
      setDeleteTarget(null);
      fetchProducts();
    } catch (err) {
      toast.error(err.message || 'Failed to delete product');
    } finally {
      setDeleting(false);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === products.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(products.map((p) => p._id));
    }
  };

  const handleBulkAction = async () => {
    if (!bulkAction || selectedIds.length === 0) return;
    try {
      const updateFn = isAdmin ? productAPI.update : productAPI.vendorUpdate;
      const isLifecycleAction = ['activate', 'deactivate'].includes(bulkAction);
      const update = isLifecycleAction
        ? { isActive: bulkAction === 'activate' }
        : { bulkOrderEnabled: bulkAction === 'enable_bulk_order' };
      await Promise.all(selectedIds.map((id) => updateFn(id, update)));
      const actionLabel = isLifecycleAction
        ? (bulkAction === 'activate' ? 'activated' : 'deactivated')
        : (bulkAction === 'enable_bulk_order' ? 'bulk ordering enabled for' : 'bulk ordering disabled for');
      toast.success(`${selectedIds.length} products ${actionLabel}`);
      setSelectedIds([]);
      setBulkAction('');
      fetchProducts();
    } catch (err) {
      toast.error(err.message || 'Bulk action failed');
    }
  };

  const toggleStatus = async (product) => {
    try {
      const updateFn = isAdmin ? productAPI.update : productAPI.vendorUpdate;
      await updateFn(product._id, { isActive: !product.isActive });
      toast.success(isAdmin ? `Product ${product.isActive ? 'deactivated' : 'activated'}` : 'Product submitted for admin approval');
      fetchProducts();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const reviewProduct = async (product, status) => {
    if (!isAdmin) return;
    let note = '';
    if (status === 'rejected') note = window.prompt('Reason for rejecting this product (optional):', '') || '';
    try {
      await productAPI.review(product._id, { status, ...(note ? { note } : {}) });
      toast.success(status === 'approved' ? 'Product approved and published' : status === 'rejected' ? 'Product rejected' : 'Product moved to pending approval');
      fetchProducts();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Could not review product');
    }
  };

  const toggleBulkOrder = async (product) => {
    try {
      const updateFn = isAdmin ? productAPI.update : productAPI.vendorUpdate;
      await updateFn(product._id, { bulkOrderEnabled: !product.bulkOrderEnabled });
      toast.success(product.bulkOrderEnabled ? 'Bulk-order pricing disabled' : 'Bulk-order pricing enabled');
      fetchProducts();
    } catch (err) {
      toast.error(err.message || 'Failed to update bulk-order setting');
    }
  };

  const handleDuplicate = async (product) => {
    if (!isAdmin || duplicating) return;
    try {
      setDuplicating(product._id);
      const res = await productAPI.duplicate(product._id);
      toast.success('Draft copy created');
      navigate(`${baseNav}/products/edit/${res.data.product._id}`);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to duplicate product');
    } finally {
      setDuplicating(null);
    }
  };

  const handleExport = async () => {
    if (!isAdmin) return;
    setExporting(true);
    try {
      const res = await productImportAPI.exportCSV();
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `products-export-${Date.now()}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Products exported!');
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async () => {
    if (!importFile || !isAdmin) return;
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const res = await productImportAPI.importCSV(formData);
      setImportResult(res.data);
      toast.success(`Created: ${res.data.created}, Updated: ${res.data.updated}`);
      fetchProducts();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const res = await productImportAPI.downloadTemplate();
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'products-import-template.csv';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download template');
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Products</h2>
          <p className="text-sm text-gray-500 mt-0.5">{totalItems} products total</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchProducts} className="p-2.5 rounded-xl border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors" title="Refresh product list" aria-label="Refresh product list" data-testid="products-refresh">
            <RefreshCw size={16} />
          </button>
          {isAdmin && (
            <button onClick={handleExport} disabled={exporting}
              className="inline-flex items-center gap-1.5 border border-gray-200 text-gray-600 font-medium px-3 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors"
              title="Export CSV">
              <Download size={15} /> Export
            </button>
          )}
          {isAdmin && (
            <button onClick={() => { setShowImportModal(true); setImportFile(null); setImportResult(null); }}
              className="inline-flex items-center gap-1.5 border border-gray-200 text-gray-600 font-medium px-3 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors"
              title="Import CSV">
              <Upload size={15} /> Import
            </button>
          )}
          <Link to={`${baseNav}/products/new`} className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-medium px-4 py-2.5 rounded-xl text-sm transition-colors shadow-sm">
            <Plus size={16} /> Add Product
          </Link>
        </div>
      </div>
      {!isAdmin && <div data-testid="vendor-product-approval-note" className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-xs leading-5 text-indigo-900"><strong>Admin approval required:</strong> new or edited products remain hidden from shoppers until an admin approves them.</div>}

      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
              className="w-full pl-9 pr-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          {isAdmin && (
            <div className="relative">
              <select
                data-testid="products-vendor-filter"
                value={vendorFilter}
                onChange={(e) => { setVendorFilter(e.target.value); setPage(1); setSelectedIds([]); }}
                className="appearance-none pl-3 pr-8 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer min-w-[150px]"
              >
                <option value="">All Vendors</option>
                {hasPlatformProducts && <option value="platform">Platform products</option>}
                {vendors.map((vendor) => (
                  <option key={vendor._id} value={vendor._id}>{vendor.storeName}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          )}
          <div className="relative">
            <select
              data-testid="products-category-filter"
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
              className="appearance-none pl-3 pr-8 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer min-w-[140px]"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
          <div className="relative">
            <select
              data-testid="products-status-filter"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="appearance-none pl-3 pr-8 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer min-w-[120px]"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
              <option value="pending_approval">Pending approval</option>
              {!isAdmin && <option value="rejected">Rejected</option>}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedIds.length > 0 && (
          <div className="mt-3 flex items-center gap-3 pt-3 border-t border-gray-100">
            <span className="text-sm font-medium text-gray-600">{selectedIds.length} selected</span>
            <select
              data-testid="products-bulk-action"
              value={bulkAction}
              onChange={(e) => setBulkAction(e.target.value)}
              className="text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Bulk Action</option>
              <option value="activate">Activate</option>
              <option value="deactivate">Deactivate</option>
              <option value="enable_bulk_order">Enable bulk ordering</option>
              <option value="disable_bulk_order">Disable bulk ordering</option>
            </select>
            <button onClick={handleBulkAction} disabled={!bulkAction}
              data-testid="products-bulk-apply"
              className="text-sm bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white px-3 py-1.5 rounded-lg transition-colors">Apply</button>
            <button onClick={() => setSelectedIds([])} className="text-sm text-gray-500 hover:text-gray-700">Clear</button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className={`w-full ${isAdmin ? 'min-w-[1200px]' : 'min-w-[1080px]'} text-xs`}>
            <thead>
              <tr className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="px-3 py-2.5 text-left w-10">
                  <input data-testid="products-select-all" type="checkbox" aria-label="Select all products" checked={products.length > 0 && selectedIds.length === products.length}
                    onChange={toggleSelectAll} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                </th>
                <th className="px-3 py-2.5 text-left">Product</th>
                {isAdmin && <th className="px-3 py-2.5 text-left">Vendor</th>}
                <th className="px-3 py-2.5 text-left">Category</th>
                <th className="px-3 py-2.5 text-left">Price</th>
                <th className="px-3 py-2.5 text-left">Stock</th>
                <th className="px-3 py-2.5 text-left">Bulk order</th>
                <th className="px-3 py-2.5 text-left">Status</th>
                <th className="px-3 py-2.5 text-left">Approval</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2.5"><Skeleton className="w-4 h-4" /></td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <Skeleton className="w-8 h-8 rounded-md flex-shrink-0" />
                        <div className="space-y-1.5 flex-1">
                          <Skeleton className="h-3.5 w-40" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5"><Skeleton className="h-3.5 w-20" /></td>
                    {isAdmin && <td className="px-3 py-2.5"><Skeleton className="h-3.5 w-28" /></td>}
                    <td className="px-3 py-2.5"><Skeleton className="h-3.5 w-16" /></td>
                    <td className="px-3 py-2.5"><Skeleton className="h-3.5 w-12" /></td>
                    <td className="px-3 py-2.5"><Skeleton className="h-5 w-12 rounded-full" /></td>
                    <td className="px-3 py-2.5"><Skeleton className="h-5 w-16 rounded-full" /></td>
                    <td className="px-3 py-2.5"><Skeleton className="h-5 w-24 rounded-full" /></td>
                    <td className="px-3 py-2.5"><Skeleton className="h-8 w-20 ml-auto" /></td>
                  </tr>
                ))
              ) : products.length === 0 ? (
                <tr>
                    <td colSpan={isAdmin ? 10 : 9}>
                    <EmptyState
                      icon={Package}
                      title="No products found"
                      description="Try adjusting your search or filters."
                      actionLabel="Add Product"
                      onAction={() => navigate(`${baseNav}/products/new`)}
                    />
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product._id} className={`hover:bg-slate-50 ${selectedIds.includes(product._id) ? 'bg-primary-50' : ''}`}>
                    <td className="px-3 py-2">
                      <input data-testid={`product-select-${product._id}`} type="checkbox" aria-label={`Select ${product.title}`} checked={selectedIds.includes(product._id)}
                        onChange={() => toggleSelect(product._id)} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-3">
                        {productImageUrl(product) ? (
                          <img src={productImageUrl(product)} alt={product.title}
                            onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = 'https://via.placeholder.com/80/f3f4f6/9ca3af?text=No+img'; }}
                            className="w-8 h-8 rounded-md object-cover flex-shrink-0 border border-gray-100" />
                        ) : (
                          <div className="w-8 h-8 rounded-md bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <Package size={16} className="text-gray-400" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <Link
                            to={product.slug && (product.approvalStatus || 'approved') === 'approved' && product.isActive !== false ? `/product/${product.slug}` : `${baseNav}/products/edit/${product._id}`}
                            target={product.slug && (product.approvalStatus || 'approved') === 'approved' && product.isActive !== false ? '_blank' : undefined}
                            rel={product.slug && (product.approvalStatus || 'approved') === 'approved' && product.isActive !== false ? 'noreferrer' : undefined}
                            className="block text-xs font-semibold text-gray-900 truncate max-w-[240px] hover:text-primary-600"
                            title={product.slug && (product.approvalStatus || 'approved') === 'approved' && product.isActive !== false ? 'Open live product page' : 'Open product editor'}
                          >{product.title}</Link>
                          <p className="text-[10px] text-gray-500" data-testid={`product-brand-${product._id}`}>{productBrandLabel(product)}</p>
                        </div>
                      </div>
                    </td>
                    {isAdmin && <td className="px-3 py-2 align-top" data-testid={`product-vendor-${product._id}`}>
                      {product.vendor?._id ? (
                        <Link to={`${baseNav}/vendors/${product.vendor._id}`} className="font-medium text-indigo-600 hover:underline" title={product.vendor.slug ? `/${product.vendor.slug}` : undefined}>
                          {productVendorLabel(product)}
                        </Link>
                      ) : (
                        <span className="font-medium text-gray-500">{productVendorLabel(product)}</span>
                      )}
                      {product.vendor?.status && <span className="mt-0.5 block text-[10px] capitalize text-gray-400">{product.vendor.status}</span>}
                    </td>}
                    <td className="px-3 py-2 text-xs text-gray-600">{product.category?.name || '-'}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-xs font-semibold text-gray-900">{formatPrice(product.price, settings)}</span>
                          {product.comparePrice > product.price && (
                            <span className="text-[10px] text-gray-500 line-through">{formatPrice(product.comparePrice, settings)}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-medium ${
                        product.stock <= 5 ? 'text-red-600' : product.stock <= product.lowStockThreshold ? 'text-amber-600' : 'text-gray-700'
                      }`}>{product.stock}</span>
                    </td>
                    <td className="px-3 py-2">
                      <Toggle
                        checked={Boolean(product.bulkOrderEnabled)}
                        onChange={() => toggleBulkOrder(product)}
                        aria-label={`${product.bulkOrderEnabled ? 'Disable' : 'Enable'} bulk ordering for ${product.title}`}
                        title={`${product.bulkOrderEnabled ? 'Bulk ordering enabled. Disable' : 'Bulk ordering disabled. Enable'} for ${product.title}`}
                        data-state={product.bulkOrderEnabled ? 'on' : 'off'}
                        className="scale-75 origin-left"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge isActive={product.isActive} lifecycleStatus={product.lifecycleStatus} />
                    </td>
                    <td className="px-3 py-2"><ApprovalBadge status={product.approvalStatus} /></td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-2">
                        {isAdmin && product.vendor && product.approvalStatus === 'pending' && <><button data-testid={`approve-product-${product._id}`} onClick={() => reviewProduct(product, 'approved')} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50" title="Approve and publish"><CheckCircle2 size={15} /></button><button data-testid={`reject-product-${product._id}`} onClick={() => reviewProduct(product, 'rejected')} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50" title="Reject product"><XCircle size={15} /></button></>}
                        {isAdmin && product.vendor && product.approvalStatus === 'rejected' && <button data-testid={`approve-product-${product._id}`} onClick={() => reviewProduct(product, 'approved')} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50" title="Approve and publish"><CheckCircle2 size={15} /></button>}
                        <button onClick={() => toggleStatus(product)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                          title={product.isActive ? 'Deactivate' : 'Activate'}>
                          {product.isActive ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                        <Link to={`${baseNav}/products/edit/${product._id}`}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors" title="Edit">
                          <Edit2 size={15} />
                        </Link>
                        {isAdmin && (
                          <button onClick={() => handleDuplicate(product)} disabled={duplicating === product._id}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50" title="Duplicate">
                            {duplicating === product._id ? <RefreshCw size={15} className="animate-spin" /> : <Copy size={15} />}
                          </button>
                        )}
                        <button onClick={() => setDeleteTarget(product)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && totalPages > 1 && (
          <div className="px-4 py-4 border-t border-gray-100">
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Product"
        message={`Are you sure you want to delete "${deleteTarget?.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        isDanger
        isLoading={deleting}
      />

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => !importing && setShowImportModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg text-gray-900 mb-1">Import Products from CSV</h3>
            <p className="text-xs text-gray-500 mb-5">Upload a CSV file to bulk create or update products.</p>

            <button onClick={handleDownloadTemplate} className="text-xs text-primary-600 hover:underline mb-4 block">
              Download CSV template
            </button>

            <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center mb-4">
              {importFile ? (
                <div>
                  <p className="text-sm font-medium text-gray-700">{importFile.name}</p>
                  <p className="text-xs text-gray-400 mt-1">{(importFile.size / 1024).toFixed(1)} KB</p>
                  <button onClick={() => setImportFile(null)} className="text-xs text-red-500 hover:underline mt-2">Remove</button>
                </div>
              ) : (
                <label className="cursor-pointer">
                  <Upload size={24} className="mx-auto text-gray-400 mb-2" />
                  <p className="text-sm text-gray-500">Click to select CSV file</p>
                  <input type="file" accept=".csv" className="hidden" onChange={e => setImportFile(e.target.files?.[0] || null)} />
                </label>
              )}
            </div>

            {importResult && (
              <div className="bg-gray-50 rounded-xl p-4 mb-4 text-sm space-y-1">
                <p className="text-green-600 font-medium">Created: {importResult.created}</p>
                <p className="text-blue-600 font-medium">Updated: {importResult.updated}</p>
                {importResult.errors?.length > 0 && (
                  <div className="mt-2">
                    <p className="text-red-600 font-medium">Errors: {importResult.errors.length}</p>
                    <div className="max-h-24 overflow-y-auto mt-1 space-y-0.5">
                      {importResult.errors.map((e, i) => (
                        <p key={i} className="text-xs text-red-500">Row {e.row}: {e.message}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setShowImportModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={handleImport} disabled={!importFile || importing}
                className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5">
                {importing ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
                {importing ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
