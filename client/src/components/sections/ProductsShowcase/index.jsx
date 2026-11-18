import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { productAPI, storefrontAPI } from '../../../services/api';
import ProductCard from '../../product/ProductCard';
import { gridStyle } from '../../page/grid';

export default function ProductsShowcase({ data = {}, vendorSlug = '', device = 'desktop' }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = { limit: data.count || 8 };
    let req;
    if (vendorSlug) {
      const sort = data.collection === 'bestsellers' ? 'bestselling'
        : data.collection === 'newest' ? 'newest'
          : data.collection === 'category' ? undefined : undefined;
      req = storefrontAPI.getProducts(vendorSlug, { ...params, sort });
    } else if (data.source === 'manual' && Array.isArray(data.manualProductIds) && data.manualProductIds.length) {
      req = productAPI.getAll({ ids: data.manualProductIds.join(','), limit: data.manualProductIds.length });
    } else if (data.collection === 'featured') {
      req = productAPI.getAll({ ...params, featured: true });
    } else if (data.collection === 'newest') {
      req = productAPI.getAll({ ...params, sort: 'newest' });
    } else if (data.collection === 'bestsellers') {
      req = productAPI.getAll({ ...params, sort: 'bestseller' });
    } else if (data.collection === 'category' && data.collectionRef) {
      req = productAPI.getAll({ ...params, category: data.collectionRef });
    } else if (data.collection === 'brand' && data.collectionRef) {
      req = productAPI.getAll({ ...params, brand: data.collectionRef });
    } else {
      req = productAPI.getAll(params);
    }
    req
      .then(r => {
        if (!cancelled) {
          const products = r.data?.products || r.data?.items || [];
          setItems(Array.isArray(products) ? products.filter(item => item && (item._id || item.slug)) : []);
        }
      })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [data.count, data.source, data.collection, data.collectionRef, JSON.stringify(data.manualProductIds), vendorSlug]);

  return (
    <section className="container mx-auto px-4">
      {(data.heading || data.seeAllLink) && (
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          {data.heading && <h2 className="min-w-0 break-anywhere text-xl font-bold text-gray-900 sm:text-2xl">{data.heading}</h2>}
          {data.seeAllLink && <Link to={data.seeAllLink} className="text-sm font-semibold text-indigo-600">See all →</Link>}
        </div>
      )}
      {loading ? (
        <div className="text-sm text-gray-400 py-6">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-gray-400 py-6">No products to show.</div>
      ) : data.layout === 'grid' ? (
        <div data-page-grid="products" className="grid" style={gridStyle(data, { columns: device === 'mobile' ? 2 : 4 })}>
          {items.map(p => <ProductCard key={p._id} product={p} variant={data.cardVariant} pageBuilderMedia />)}
        </div>
      ) : (
        <div className="flex overflow-x-auto pb-2" style={{ scrollbarWidth: 'none', gap: gridStyle(data).columnGap }}>
          {items.map(p => <div key={p._id} className="flex-shrink-0 w-48 md:w-56"><ProductCard product={p} variant={data.cardVariant} pageBuilderMedia /></div>)}
        </div>
      )}
    </section>
  );
}
