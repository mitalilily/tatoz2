import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { brandAPI } from '../../../services/api';

export default function BrandStrip({ data = {} }) {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    brandAPI.getAll().then(r => setBrands(r.data?.brands || [])).catch(() => setBrands([])).finally(() => setLoading(false));
  }, []);
  const ids = Array.isArray(data.brandIds) ? data.brandIds : [];
  const list = ids.length ? brands.filter(b => ids.includes(String(b._id))) : brands.slice(0, 8);
  if (loading) return <div className="py-6 text-center text-sm text-gray-400">Loading…</div>;
  if (!list.length) return <div className="py-6 text-center text-sm text-gray-400">Brand strip — no brands selected</div>;
  const cls = `${data.grayscale ? 'grayscale opacity-70 hover:grayscale-0 hover:opacity-100' : ''} transition`;
  if (data.style === 'marquee') {
    const doubled = [...list, ...list];
    return (
      <section className="container mx-auto px-4">
        {data.heading && <h2 className="text-center text-sm font-semibold text-gray-500 uppercase tracking-wider mb-6">{data.heading}</h2>}
        <div className="overflow-hidden">
          <div className="flex gap-12 whitespace-nowrap" style={{ animationName: 'pb-marquee', animationDuration: '30s', animationTimingFunction: 'linear', animationIterationCount: 'infinite' }}>
            {doubled.map((b, i) => (
              <Link key={i} to={`/brand/${b.slug}`} className="flex-shrink-0 inline-flex items-center h-12">
                {b.logo ? <img data-page-builder-media="content" src={b.logo} alt={b.name} loading="lazy" decoding="async" className={`h-10 max-w-[140px] object-contain ${cls}`} /> : <span className={`text-gray-700 font-semibold ${cls}`}>{b.name}</span>}
              </Link>
            ))}
          </div>
        </div>
        <style>{`@keyframes pb-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
      </section>
    );
  }
  return (
    <section className="container mx-auto px-4">
      {data.heading && <h2 className="text-center text-sm font-semibold text-gray-500 uppercase tracking-wider mb-6">{data.heading}</h2>}
      <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
        {list.map(b => (
          <Link key={b._id} to={`/brand/${b.slug}`} className="flex-shrink-0">
            {b.logo ? <img data-page-builder-media="content" src={b.logo} alt={b.name} loading="lazy" decoding="async" className={`h-10 max-w-[140px] object-contain ${cls}`} /> : <span className={`text-gray-700 font-semibold ${cls}`}>{b.name}</span>}
          </Link>
        ))}
      </div>
    </section>
  );
}
