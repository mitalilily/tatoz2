import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { gridStyle } from '../../page/grid';

export default function CategoriesShowcase({ data = {}, device = 'desktop' }) {
  const all = useSelector(s => s.products?.categories || []);
  const ids = Array.isArray(data.categoryIds) ? data.categoryIds : [];
  const list = ids.length ? ids.map(id => all.find(c => String(c._id) === String(id))).filter(Boolean) : all.slice(0, 8);
  if (!list.length) return <div className="py-8 text-center text-sm text-gray-400">Categories — no categories selected</div>;
  return (
    <section className="container mx-auto px-4">
      {data.heading && <h2 className="text-2xl font-bold text-gray-900 mb-4">{data.heading}</h2>}
      {data.layout === 'circle' ? (
        <div className="flex overflow-x-auto pb-2" style={{ gap: gridStyle(data).columnGap }}>
          {list.map(c => (
            <Link key={c._id} to={`/category/${c.slug}`} className="flex-shrink-0 flex flex-col items-center gap-2 min-w-[80px]">
              <div className="w-20 h-20 rounded-full overflow-hidden bg-gray-100 ring-2 ring-white shadow-sm">
                {c.image ? <img data-page-builder-media="content" src={c.image} alt={c.name} loading="lazy" decoding="async" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gradient-to-br from-indigo-200 to-purple-200" />}
              </div>
              <div className="text-xs font-medium text-gray-700 text-center">{c.name}</div>
            </Link>
          ))}
        </div>
      ) : (
        <div data-page-grid="categories" className="grid" style={gridStyle(data, { columns: device === 'mobile' ? 2 : 4 })}>
          {list.map(c => (
            <Link key={c._id} to={`/category/${c.slug}`} className="block relative aspect-square overflow-hidden rounded-xl bg-gray-100 group">
              {c.image && <img data-page-builder-media="content" src={c.image} alt={c.name} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition" />}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute bottom-3 left-3 text-white font-semibold">{c.name}</div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
