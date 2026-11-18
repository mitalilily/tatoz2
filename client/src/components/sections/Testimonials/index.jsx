import { Star, Quote } from 'lucide-react';

import { gridStyle } from '../../page/grid';

function Card({ item }) {
  return (
    <div className="min-w-0 break-words bg-white border border-gray-200 rounded-xl p-5 shadow-sm h-full flex flex-col">
      <Quote size={18} className="text-indigo-300 mb-3" />
      {item.rating > 0 && (
        <div className="flex gap-0.5 mb-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} size={14} className={i < item.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-200'} />
          ))}
        </div>
      )}
      {item.quote && <p className="text-sm text-gray-700 leading-relaxed flex-1">"{item.quote}"</p>}
      <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-100">
        {item.avatarUrl
          ? <img data-page-builder-media="content" src={item.avatarUrl} alt={item.authorName || ''} className="w-10 h-10 rounded-full object-cover" />
          : <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-200 to-purple-200" />}
        <div>
          {item.authorName && <div className="text-sm font-semibold text-gray-900">{item.authorName}</div>}
          {item.authorTitle && <div className="text-xs text-gray-500">{item.authorTitle}</div>}
        </div>
      </div>
    </div>
  );
}

export default function Testimonials({ data = {} }) {
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) return <div className="py-8 text-center text-sm text-gray-400">Testimonials — no items yet</div>;
  return (
    <section className="container mx-auto px-4">
      {data.heading && <h2 className="text-2xl md:text-3xl font-bold text-gray-900 text-center mb-6">{data.heading}</h2>}
      {data.layout === 'carousel' ? (
        <div className="flex overflow-x-auto pb-2 snap-x" style={{ scrollbarWidth: 'none', gap: gridStyle(data).columnGap }}>
          {items.map((it, i) => <div key={i} className="flex-shrink-0 w-[85%] sm:w-[400px] snap-start"><Card item={it} /></div>)}
        </div>
      ) : (
        <div data-page-grid="testimonials" className="grid" style={gridStyle(data)}>
          {items.map((it, i) => <Card key={i} item={it} />)}
        </div>
      )}
    </section>
  );
}
