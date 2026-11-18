import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Search, Tags } from 'lucide-react';
import { Link } from 'react-router-dom';
import { brandAPI } from '../../services/api';
import SEO from '../../components/common/SEO';
import EmptyState from '../../components/common/EmptyState';
import Loader from '../../components/common/Loader';

const imageFallback = 'https://via.placeholder.com/640x480/fef3c7/92400e?text=Brand';

const BrandsPage = () => {
  const [brands, setBrands] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadBrands = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await brandAPI.getAll();
      setBrands((response.data.brands || []).filter(brand => brand && brand.slug));
    } catch {
      setError('Brands could not be loaded right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadBrands(); }, []);

  const filteredBrands = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return brands;
    return brands.filter(brand => `${brand.name || ''} ${brand.description || ''}`.toLowerCase().includes(normalizedQuery));
  }, [brands, query]);

  return (
    <div className="page-container py-6 sm:py-8" data-testid="brands-page">
      <SEO
        title="Brands"
        description="Discover products from all the brands available in our catalog."
        breadcrumbs={[{ name: 'Home', url: '/' }, { name: 'Brands', url: '/brands' }]}
      />

      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-600">Shop with confidence</p>
          <h1 className="text-2xl font-black tracking-tight text-gray-900 sm:text-3xl">Explore brands</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">Browse trusted names and see every product from a brand in one place.</p>
        </div>
        <Link to="/search" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 transition hover:border-primary-300 hover:text-primary-600">
          Browse all products <ArrowRight size={15} />
        </Link>
      </div>

      <div className="relative mb-7 max-w-xl">
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search brands"
          aria-label="Search brands"
          className="input w-full rounded-2xl bg-white py-3 pl-11 pr-4 shadow-sm"
        />
      </div>

      {loading ? (
        <div className="flex min-h-52 items-center justify-center"><Loader size="lg" text="Loading brands" /></div>
      ) : error ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-8 text-center" role="alert">
          <p className="text-sm font-semibold text-red-700">{error}</p>
          <button type="button" onClick={loadBrands} className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700">Try again</button>
        </div>
      ) : filteredBrands.length === 0 ? (
        <EmptyState icon={Tags} title="No brands found" description={query ? 'Try a different search term.' : 'Brands will appear here once they are added.'} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4" data-testid="brand-directory">
          {filteredBrands.map(brand => (
            <Link
              key={brand._id || brand.slug}
              to={`/brand/${brand.slug}`}
              data-testid={`brand-directory-${brand.slug}`}
              className="group overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-lg"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-amber-50">
                {brand.image ? (
                  <img
                    src={brand.image}
                    alt={brand.name}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = imageFallback; }}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-gradient-to-br from-amber-100 via-orange-50 to-white text-4xl font-black text-amber-200" aria-hidden="true">
                    {brand.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-amber-600 shadow-sm transition group-hover:bg-amber-500 group-hover:text-white">
                  <ArrowRight size={15} />
                </span>
              </div>
              <div className="p-3.5">
                <h2 className="truncate text-base font-extrabold text-gray-900 group-hover:text-amber-600">{brand.name}</h2>
                {brand.description && <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">{brand.description}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default BrandsPage;
