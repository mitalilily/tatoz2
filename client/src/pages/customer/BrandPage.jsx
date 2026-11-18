import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { SlidersHorizontal, X } from 'lucide-react';
import { brandAPI, productAPI } from '../../services/api';
import { useSite } from '../../context/SiteContext';
import SEO from '../../components/common/SEO';
import ProductCard from '../../components/product/ProductCard';
import Pagination from '../../components/common/Pagination';
import Loader from '../../components/common/Loader';
import EmptyState from '../../components/common/EmptyState';
import { Package } from 'lucide-react';

const SORT_OPTIONS = [
 { value: 'newest', label: 'Newest First' },
 { value: 'popular', label: 'Most Popular' },
 { value: 'price_asc', label: 'Price: Low to High' },
 { value: 'price_desc', label: 'Price: High to Low' },
 { value: 'bestseller', label: 'Best Sellers' },
];

const BrandPage = () => {
 const { slug } = useParams();
 const { settings } = useSite();
 const [searchParams, setSearchParams] = useSearchParams();
 const [brand, setBrand] = useState(null);
 const [products, setProducts] = useState([]);
 const [vendors, setVendors] = useState([]);
 const [pagination, setPagination] = useState(null);
 const [loading, setLoading] = useState(true);
 const [filterOpen, setFilterOpen] = useState(false);
 const [filters, setFilters] = useState({
 sort: searchParams.get('sort') || 'newest',
 minPrice: searchParams.get('minPrice') || '',
 maxPrice: searchParams.get('maxPrice') || '',
 vendor: searchParams.get('vendor') || '',
 page: parseInt(searchParams.get('page'), 10) || 1,
 });

 useEffect(() => {
 let cancelled = false;
 productAPI.getVendors()
 .then(res => { if (!cancelled) setVendors(res.data.vendors || []); })
 .catch(() => {});
 return () => { cancelled = true; };
 }, []);

 useEffect(() => {
 brandAPI.getBySlug(slug).then((res) => setBrand(res.data.brand)).catch(() => {});
 }, [slug]);

 useEffect(() => {
 const fetchProducts = async () => {
 if (!brand) return;
 setLoading(true);
 try {
 const res = await productAPI.getAll({ ...filters, brand: slug, limit: 20 });
 setProducts(res.data.products);
 setPagination(res.data.pagination);
 } catch (e) {
 console.error(e);
 } finally {
 setLoading(false);
 }
 };
 fetchProducts();
 }, [brand, slug, filters]);

 const updateFilter = (key, value) => {
 const updated = { ...filters, [key]: value, page: 1 };
 setFilters(updated);
 setSearchParams(Object.fromEntries(Object.entries(updated).filter(([, v]) => v)));
 };

 const clearFilters = () => {
 setFilters({ sort: 'newest', minPrice: '', maxPrice: '', vendor: '', page: 1 });
 setSearchParams({});
 };

 return (
 <div className="page-container py-6 sm:py-8 animate-fade-in">
 <SEO
 title={brand?.seo?.metaTitle || brand?.name}
 description={brand?.seo?.metaDescription || brand?.description}
 keywords={brand?.seo?.keywords}
 breadcrumbs={brand ? [{ name: 'Home', url: '/' }, { name: brand.name, url: `/brand/${slug}` }] : []}
 />
 <div className="flex flex-col gap-3 mb-5 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
 <div className="min-w-0">
 <h1 className="text-xl sm:text-2xl font-bold text-gray-900 break-anywhere">{brand?.name || 'Brand'}</h1>
 {brand?.description && <p className="text-gray-500 text-sm mt-1">{brand.description}</p>}
 {pagination && <p className="text-sm text-gray-400 mt-1">{pagination.total} products</p>}
 </div>
 <div className="flex w-full items-center gap-2 sm:w-auto sm:gap-3">
 <select
 value={filters.sort}
 onChange={(e) => updateFilter('sort', e.target.value)}
 className="input min-w-0 flex-1 py-2 pr-8 text-sm sm:w-40 sm:flex-none bg-white"
 >
 {SORT_OPTIONS.map((o) => (
 <option key={o.value} value={o.value}>{o.label}</option>
 ))}
 </select>
 <button
 onClick={() => setFilterOpen(!filterOpen)}
 className="flex shrink-0 items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50 transition-colors sm:px-4"
 >
 <SlidersHorizontal size={16} /> Filters
 </button>
 </div>
 </div>

 {filterOpen && (
 <div className="card p-4 mb-6 animate-slide-up">
 <div className="flex items-center justify-between mb-4">
 <h3 className="font-semibold text-gray-900">Filters</h3>
 <button onClick={clearFilters} className="text-sm text-red-500 hover:text-red-600 flex items-center gap-1">
 <X size={14} /> Clear all
 </button>
 </div>
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 sm:gap-4">
 <div>
 <label className="text-xs font-medium text-gray-600 mb-1.5 block">Min Price ({settings?.currencySymbol || '₹'})</label>
 <input type="number" value={filters.minPrice} onChange={(e) => updateFilter('minPrice', e.target.value)} className="input py-2 text-sm" placeholder="0" />
 </div>
 <div>
 <label className="text-xs font-medium text-gray-600 mb-1.5 block">Max Price ({settings?.currencySymbol || '₹'})</label>
 <input type="number" value={filters.maxPrice} onChange={(e) => updateFilter('maxPrice', e.target.value)} className="input py-2 text-sm" placeholder="99999" />
 </div>
 {vendors.length > 0 && <div>
 <label className="text-xs font-medium text-gray-600 mb-1.5 block">Seller</label>
 <select data-testid="product-vendor-filter" value={filters.vendor} onChange={(e) => updateFilter('vendor', e.target.value)} className="input w-full bg-white py-2 text-sm">
 <option value="">All Sellers</option>
 {vendors.map(vendor => <option key={vendor._id} value={vendor._id}>{vendor.storeName}</option>)}
 </select>
 </div>}
 </div>
 </div>
 )}

 {loading ? (
 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
 {[...Array(12)].map((_, i) => (
 <div key={i} className="card">
 <div className="skeleton aspect-square" />
 <div className="p-3 space-y-2">
 <div className="skeleton h-3 w-1/3 rounded" />
 <div className="skeleton h-4 w-full rounded" />
 <div className="skeleton h-5 w-1/2 rounded" />
 </div>
 </div>
 ))}
 </div>
 ) : products.length === 0 ? (
 <EmptyState icon={Package} title="No products found" description="Try adjusting your filters" />
 ) : (
 <>
 {/* Mobile: compact 2-col cards */}
 <div className="sm:hidden grid grid-cols-2 gap-2 mb-8">
 {products.map((p) => <ProductCard key={p._id} product={p} compact />)}
 </div>
 {/* Desktop: grid cards */}
 <div className="hidden sm:grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
 {products.map((p) => <ProductCard key={p._id} product={p} />)}
 </div>
 <Pagination currentPage={filters.page} totalPages={pagination?.pages || 1} onPageChange={(page) => updateFilter('page', page)} />
 </>
 )}
 </div>
 );
};

export default BrandPage;
