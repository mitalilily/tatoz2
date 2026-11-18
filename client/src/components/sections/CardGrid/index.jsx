import { Link } from 'react-router-dom';
import { gridStyle } from '../../page/grid';

export default function CardGrid({ data = {} }) {
  const cards = Array.isArray(data.cards) ? data.cards : [];
  if (!cards.length) return <div className="py-8 text-center text-sm text-gray-400">Card Grid — no cards yet</div>;
  return (
    <section className="container mx-auto px-4">
      {data.heading && <h2 className="text-2xl font-bold text-gray-900 mb-4">{data.heading}</h2>}
      <div data-page-grid="cards" className="grid" style={gridStyle(data)}>
        {cards.map((c, i) => {
          const W = c.link ? Link : 'div';
          const p = c.link ? { to: c.link } : {};
          return (
            <W key={i} {...p} className="block min-w-0 break-words group relative overflow-hidden rounded-xl bg-gray-100">
              {c.imageUrl ? (
                <img data-page-builder-media="content" src={c.imageUrl} alt={c.heading || ''} className="w-full aspect-square object-cover group-hover:scale-105 transition-transform" />
              ) : <div className="w-full aspect-square bg-gradient-to-br from-gray-200 to-gray-300" />}
              {data.cardStyle === 'overlay' && (c.heading || c.subtext) && (
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex flex-col justify-end p-3 text-white">
                  {c.heading && <div className="font-semibold">{c.heading}</div>}
                  {c.subtext && <div className="text-xs opacity-90">{c.subtext}</div>}
                </div>
              )}
              {data.cardStyle === 'belowImage' && (c.heading || c.subtext) && (
                <div className="p-3">
                  {c.heading && <div className="font-semibold text-gray-900">{c.heading}</div>}
                  {c.subtext && <div className="text-xs text-gray-500">{c.subtext}</div>}
                </div>
              )}
            </W>
          );
        })}
      </div>
    </section>
  );
}
