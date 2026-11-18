import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { storefrontAPI } from '../../services/api';
import { Store as StoreIcon, Loader2, ArrowLeft } from 'lucide-react';
import PageRenderer from '../../components/page/PageRenderer';
import SEO from '../../components/common/SEO';
import { usePageFrame } from '../../context/PageFrameContext';
import { useViewportDevice } from '../../hooks/useViewportDevice';


export default function StorefrontPage() {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const slug = params.slug;
  const previewToken = searchParams.get('token') || '';
  const splat = params['*'] || '';
  const pagePath = splat ? `/${splat}` : '/';
  const isCustomPage = Boolean(splat);
  const [store, setStore] = useState(null);
  const [customPage, setCustomPage] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [sort, setSort] = useState('newest');
  const device = useViewportDevice();
  const { setPageFrame } = usePageFrame();

  useEffect(() => {
    if (isCustomPage && !customPage) return undefined;
    const settings = isCustomPage ? (customPage?.pageSettings || {}) : {};
    setPageFrame({ showHeader: settings.showHeader !== false, showFooter: settings.showFooter !== false });
    return () => setPageFrame();
  }, [setPageFrame, isCustomPage, customPage?.pageSettings?.showHeader, customPage?.pageSettings?.showFooter]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const pageRequest = storefrontAPI.getPage(slug, pagePath, previewToken).catch(() => null);
    const productRequest = isCustomPage ? Promise.resolve(null) : storefrontAPI.getProducts(slug, { page, sort, limit: 20 });
    Promise.all([storefrontAPI.getStore(slug), pageRequest, productRequest])
      .then(([storeResponse, pageResponse, productResponse]) => {
        if (cancelled) return;
        setStore(storeResponse.data.data);
        setCustomPage(pageResponse?.data?.page || null);
        if (isCustomPage && !pageResponse?.data?.page) {
          setError('Store page not found or not published yet');
          return;
        }
        if (productResponse) {
          setProducts((productResponse.data.data || []).filter(product => product && (product._id || product.slug)));
          setPagination(productResponse.data.pagination || {});
        }
      })
      .catch(err => { if (!cancelled) setError(err.response?.data?.error || err.message || 'Failed to load store'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug, pagePath, page, sort, isCustomPage, previewToken]);

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="animate-spin" size={32} /></div>;
  if (error) return <div className="px-4 py-16 text-center text-red-500 sm:py-20">{error}</div>;
  if (!store) return null;

  const theme = store.storefront?.theme || {};
  const surfaceColor = theme.surfaceColor || '#f8fafc';
  const primaryColor = theme.primaryColor || '#4f46e5';
  const usesSeparateMobileLayout = device === 'mobile' && customPage?.mobileLayoutMode === 'separate' && customPage.mobileLayout;
  const effectiveLayout = usesSeparateMobileLayout
    ? customPage.mobileLayout : customPage?.layout;

  return (
    <div className="min-h-screen" style={{ backgroundColor: customPage?.pageSettings?.backgroundColor || surfaceColor }}>
      <SEO title={customPage?.seo?.metaTitle || store.storefront?.seo?.metaTitle || store.storeName} description={customPage?.seo?.metaDescription || store.storefront?.seo?.metaDescription || store.description} ogImage={customPage?.seo?.ogImage || store.storefront?.seo?.ogImage || store.logo} canonical={customPage?.seo?.canonical || store.storefront?.seo?.canonical} robots={customPage?.seo?.robots || store.storefront?.seo?.robots} />
      <div className="relative h-44 bg-gradient-to-r from-slate-900 to-indigo-900 md:h-60">
        {store.banner && <img src={store.banner} alt="" loading="eager" fetchpriority="high" decoding="async" className="absolute inset-0 h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-black/20" />
      </div>

      <div className="relative mx-auto min-w-0 max-w-6xl px-4">
        <div className="-mt-12 flex min-w-0 flex-col gap-4 rounded-2xl bg-white p-4 shadow-sm sm:p-5 md:flex-row md:items-end">
          <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-white shadow-md">
            {store.logo ? <img src={store.logo} alt={store.storeName} loading="eager" decoding="async" className="h-full w-full object-cover" /> : <StoreIcon size={36} className="text-slate-400" />}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="break-anywhere text-xl font-bold text-slate-900 sm:text-2xl">{store.storeName}</h1>
            {(store.storefront?.tagline || store.description) && <p className="mt-1 break-anywhere text-sm text-slate-600">{store.storefront?.tagline || store.description}</p>}
            <div className="mt-2 text-xs text-slate-500">{store.stats?.totalProducts || 0} products · Joined {new Date(store.joinedAt).toLocaleDateString()}</div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {store.socialLinks?.website && <a href={store.socialLinks.website} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">Website</a>}
            {store.socialLinks?.instagram && <a href={`https://instagram.com/${store.socialLinks.instagram}`} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">Instagram</a>}
            {store.socialLinks?.facebook && <a href={store.socialLinks.facebook} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">Facebook</a>}
          </div>
        </div>

        {store.storefront?.announcement && <div className="mt-4 break-anywhere rounded-xl px-4 py-3 text-sm font-medium text-white" style={{ backgroundColor: primaryColor }}>{store.storefront.announcement}</div>}

        {customPage ? (
          <div className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm" style={{ backgroundColor: customPage.pageSettings?.backgroundColor || undefined }}>
            {isCustomPage && <Link to={`/store/${slug}`} className="inline-flex items-center gap-1 px-5 pt-4 text-xs font-semibold text-slate-500 hover:text-indigo-600"><ArrowLeft size={14} /> Store home</Link>}
            <PageRenderer layout={effectiveLayout} device={device} vendorSlug={slug} designSystem={customPage?.pageSettings?.designSystem} preview={Boolean(previewToken)} applyResponsiveOverrides={!usesSeparateMobileLayout} />
          </div>
        ) : (
          <>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 sm:mt-8">
              <h2 className="text-xl font-semibold text-slate-900">Products</h2>
              <select className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm sm:w-auto" value={sort} onChange={e => { setPage(1); setSort(e.target.value); }}><option value="newest">Newest</option><option value="price_asc">Price: Low to High</option><option value="price_desc">Price: High to Low</option><option value="bestselling">Best Selling</option></select>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {products.map(product => <Link to={`/product/${product.slug}`} key={product._id} className="overflow-hidden rounded-xl bg-white shadow-sm transition-shadow hover:shadow-md"><img src={product.thumbnail || product.images?.[0]?.url} alt={product.title} loading="lazy" decoding="async" className="aspect-square w-full object-cover" /><div className="p-3"><h3 className="line-clamp-2 text-sm font-medium">{product.title}</h3><div className="mt-1 flex items-baseline gap-2"><span className="font-bold">₹{product.price}</span>{product.comparePrice > product.price && <span className="text-xs text-slate-400 line-through">₹{product.comparePrice}</span>}</div>{product.ratings?.count > 0 && <div className="mt-1 text-xs text-slate-500">★ {product.ratings.average} ({product.ratings.count})</div>}</div></Link>)}
            </div>
            {products.length === 0 && <p className="py-12 text-center text-slate-400">No products from this store yet.</p>}
            {pagination.pages > 1 && <div className="mb-8 mt-6 flex flex-wrap items-center justify-center gap-2 text-center"><button disabled={page === 1} onClick={() => setPage(value => value - 1)} className="rounded border px-4 py-2 disabled:opacity-50">Prev</button><span className="px-2 py-2 sm:px-4">Page {page} of {pagination.pages}</span><button disabled={page >= pagination.pages} onClick={() => setPage(value => value + 1)} className="rounded border px-4 py-2 disabled:opacity-50">Next</button></div>}
          </>
        )}
      </div>
    </div>
  );
}
