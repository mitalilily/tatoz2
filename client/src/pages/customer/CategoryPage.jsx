import { useEffect, useState, useMemo } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { SlidersHorizontal, X, Package, LayoutGrid, List, ChevronDown } from 'lucide-react';
import { brandAPI, categoryAPI, productAPI } from '../../services/api';
import { useSite } from '../../context/SiteContext';
import SEO from '../../components/common/SEO';
import AmazonProductCard from '../../components/product/AmazonProductCard';
import FilterSidebar from '../../components/product/FilterSidebar';
import Pagination from '../../components/common/Pagination';
import EmptyState from '../../components/common/EmptyState';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest Arrivals' },
  { value: 'popular', label: 'Most Popular' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'bestseller', label: 'Best Sellers' },
];

const PAGE_SIZE = 20;

const CategoryPage = () => {
  const { slug } = useParams();
  const { settings } = useSite();
  const [searchParams, setSearchParams] = useSearchParams();
  const [category, setCategory] = useState(null);
  const [products, setProducts] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [brands, setBrands] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('grid');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    sort: searchParams.get('sort') || 'newest',
    minPrice: searchParams.get('minPrice') || '',
    maxPrice: searchParams.get('maxPrice') || '',
    availability: searchParams.get('availability') || '',
    minRating: searchParams.get('minRating') || '',
    featured: searchParams.get('featured') || '',
    flashDeal: searchParams.get('flashDeal') || '',
    size: searchParams.get('size') || '',
    color: searchParams.get('color') || '',
    vendor: searchParams.get('vendor') || '',
    brand: searchParams.get('brand') || '',
    page: parseInt(searchParams.get('page')) || 1,
  });

  useEffect(() => {
    let cancelled = false;
    productAPI.getVendors()
      .then(res => { if (!cancelled) setVendors(res.data.vendors || []); })
      .catch(() => {});
    brandAPI.getAll()
      .then(res => { if (!cancelled) setBrands((res.data.brands || []).filter(brand => brand && (brand.slug || brand._id))); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    categoryAPI.getBySlug(slug).then(res => setCategory(res.data.category)).catch(() => {});
  }, [slug]);

  useEffect(() => {
    const fetchProducts = async () => {
      if (!category) return;
      setLoading(true);
      try {
        const res = await productAPI.getAll({ ...filters, category: category._id, limit: PAGE_SIZE });
        setProducts(res.data.products);
        setPagination(res.data.pagination);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, [category, filters]);

  // Lock body scroll when the mobile filter drawer is open
  useEffect(() => {
    document.body.style.overflow = filtersOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [filtersOpen]);

  const updateFilter = (key, value) => {
    if (key === 'category') return;
    const updated = { ...filters, [key]: value, ...(key !== 'page' && { page: 1 }) };
    setFilters(updated);
    setSearchParams(Object.fromEntries(Object.entries(updated).filter(([, v]) => v)));
  };

  const clearFilters = () => {
    const cleared = { sort: 'newest', minPrice: '', maxPrice: '', availability: '', minRating: '', featured: '', flashDeal: '', size: '', color: '', vendor: '', brand: '', page: 1 };
    setFilters(cleared);
    setSearchParams({});
  };

  const activeCount = useMemo(() => (
    [filters.minPrice, filters.maxPrice, filters.availability, filters.minRating, filters.featured, filters.flashDeal, filters.size, filters.color, filters.vendor, filters.brand]
      .filter(Boolean).length
  ), [filters]);

  const total = pagination?.total || 0;
  const currentPage = filters.page || 1;
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, total);

  const sidebar = (
    <FilterSidebar
      filters={filters}
      categories={[]}
      vendors={vendors}
      brands={brands}
      currencySymbol={settings?.currencySymbol || '₹'}
      onUpdate={updateFilter}
      onClear={clearFilters}
      activeCount={activeCount}
      lockedCategoryId={category?._id || 'locked'}
    />
  );

  return (
    <div className="animate-fade-in bg-gray-100 pb-10">
      <SEO
        title={category?.seo?.metaTitle || category?.name}
        description={category?.seo?.metaDescription || category?.description}
        keywords={category?.seo?.keywords}
        breadcrumbs={category ? [{ name: 'Home', url: '/' }, { name: category.name, url: `/category/${slug}` }] : []}
      />

      {/* Category header strip */}
      <div className="border-b border-gray-200 bg-white">
        <div className="px-2 py-4 sm:px-3">
          {(category?.breadcrumbs?.length > 0 || category?.parent) && (
            <div className="mb-1 flex items-center gap-1.5 text-[13px] text-gray-500">
              {(category.breadcrumbs || [category.parent]).map((crumb, index, list) => <span key={crumb._id || crumb.slug} className="inline-flex items-center gap-1.5">
                {index > 0 && <span>/</span>}
                {index === list.length - 1 ? <span className="font-medium text-gray-800">{crumb.name}</span> : <Link to={`/category/${crumb.slug}`} className="text-cyan-800 hover:text-orange-700 hover:underline">{crumb.name}</Link>}
              </span>)}
              {(!category.breadcrumbs || category.breadcrumbs[category.breadcrumbs.length - 1]?._id?.toString() !== category._id?.toString()) && <><span>/</span><span className="font-medium text-gray-800">{category.name}</span></>}
            </div>
          )}
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{category?.name || 'Category'}</h1>
          {category?.description && <p className="mt-1 line-clamp-2 text-sm text-gray-500">{category.description}</p>}
        </div>
      </div>

      {/* Sub-categories */}
      {(category?.children || category?.subCategories)?.length > 0 && (
        <div className="border-b border-gray-200 bg-white">
          <div className="flex gap-2 overflow-x-auto px-2 py-3 scrollbar-hide sm:px-3">
            {(category.children || category.subCategories).map(sub => (
              <Link
                key={sub._id}
                to={`/category/${sub.slug}`}
                className="flex flex-shrink-0 items-center gap-2 rounded-full border border-gray-300 bg-white py-1.5 pl-1.5 pr-4 shadow-sm transition-colors hover:border-orange-400"
              >
                {sub.image ? (
                  <img src={sub.image} alt={sub.name} className="h-7 w-7 rounded-full object-cover" />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                    <Package size={14} />
                  </span>
                )}
                <span className="whitespace-nowrap text-[13px] font-medium text-gray-800">{sub.name}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Results toolbar */}
      <div className="border-b border-gray-300 bg-white shadow-[0_1px_4px_rgba(15,23,42,0.08)]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-2 py-2.5 sm:px-3">
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-400 bg-white px-3 py-1.5 text-[13px] font-medium text-gray-800 shadow-sm lg:hidden"
          >
            <SlidersHorizontal size={14} /> Filters{activeCount > 0 && ` (${activeCount})`}
          </button>
          <p className="text-[13px] text-gray-700" aria-live="polite">
            {loading ? 'Loading results…' : total > 0
              ? <><span className="font-medium">{rangeStart}–{rangeEnd}</span> of <span className="font-medium">{total}</span> results in <span className="font-semibold text-orange-700">{category?.name}</span></>
              : 'No results'}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-1 rounded-full border border-gray-300 p-0.5 sm:inline-flex" role="group" aria-label="Change layout">
              <button
                type="button"
                onClick={() => setView('grid')}
                aria-pressed={view === 'grid'}
                title="Grid view"
                className={`rounded-full p-1.5 transition-colors ${view === 'grid' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
              >
                <LayoutGrid size={14} />
              </button>
              <button
                type="button"
                onClick={() => setView('list')}
                aria-pressed={view === 'list'}
                title="List view"
                className={`rounded-full p-1.5 transition-colors ${view === 'list' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
              >
                <List size={14} />
              </button>
            </div>
            <label className="flex items-center gap-1.5 rounded-lg border border-gray-400 bg-gray-50 py-1.5 pl-3 pr-1.5 text-[13px] text-gray-700 shadow-sm">
              <span className="hidden text-gray-500 sm:inline">Sort by:</span>
              <span className="relative inline-flex items-center">
                <select
                  value={filters.sort}
                  onChange={e => updateFilter('sort', e.target.value)}
                  aria-label="Sort results"
                  className="cursor-pointer appearance-none bg-transparent py-0.5 pl-1 pr-6 text-[13px] font-medium text-gray-900 focus:outline-none"
                >
                  {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-1 text-gray-500" />
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Body: sidebar + results — full-bleed, no outer container */}
      <div className="mt-3 flex items-start gap-3 px-2 sm:px-3">
        <aside className="sticky top-3 hidden max-h-[calc(100vh-1.5rem)] w-60 shrink-0 overflow-y-auto rounded-lg border border-gray-200 bg-white px-4 py-3 lg:block" aria-label="Product filters">
          {sidebar}
        </aside>

        <main className="min-w-0 flex-1" aria-label="Product results">
          {loading ? (
            view === 'list' ? (
              <div className="space-y-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="flex gap-4 rounded-lg border border-gray-100 p-3">
                    <div className="skeleton h-40 w-36 shrink-0 sm:h-48 sm:w-48" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="skeleton h-4 w-3/4 rounded" />
                      <div className="skeleton h-3 w-1/4 rounded" />
                      <div className="skeleton h-6 w-1/3 rounded" />
                      <div className="skeleton h-8 w-32 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {[...Array(12)].map((_, i) => (
                  <div key={i} className="rounded-lg border border-gray-200 bg-white">
                    <div className="skeleton aspect-square rounded-b-none" />
                    <div className="space-y-2 p-3">
                      <div className="skeleton h-3 w-full rounded" />
                      <div className="skeleton h-3 w-1/3 rounded" />
                      <div className="skeleton h-5 w-1/2 rounded" />
                      <div className="skeleton h-8 w-full rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : products.length === 0 ? (
            <EmptyState icon={Package} title="No products found" description="Try adjusting your filters" />
          ) : (
            <>
              {view === 'list' ? (
                <div className="space-y-3">
                  {products.map(p => <AmazonProductCard key={p._id} product={p} layout="list" />)}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                  {products.map(p => <AmazonProductCard key={p._id} product={p} layout="grid" />)}
                </div>
              )}
              <div className="mt-6">
                <Pagination
                  currentPage={currentPage}
                  totalPages={pagination?.pages || 1}
                  onPageChange={page => {
                    updateFilter('page', page);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                />
              </div>
            </>
          )}
        </main>
      </div>

      {/* Mobile filter drawer */}
      {filtersOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Product filters">
          <div className="absolute inset-0 bg-black/50" onClick={() => setFiltersOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[85%] max-w-xs flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <span className="text-[15px] font-bold text-gray-900">Filters</span>
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                aria-label="Close filters"
                className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2">{sidebar}</div>
            <div className="flex gap-2 border-t border-gray-200 p-3">
              <button
                type="button"
                onClick={clearFilters}
                className="flex-1 rounded-full border border-gray-400 bg-white py-2 text-sm font-medium text-gray-700"
              >
                Clear all
              </button>
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className="flex-1 rounded-full border border-amber-300 bg-amber-300 py-2 text-sm font-medium text-gray-900"
              >
                Show {total} result{total === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoryPage;
