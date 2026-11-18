import { gridStyle } from '../../page/grid';

export default function Stats({ data = {} }) {
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) return null;
  const styleClass = data.style === 'card'
    ? 'bg-white border border-gray-200 rounded-xl p-6 shadow-sm'
    : data.style === 'split'
    ? 'border-l-4 border-indigo-500 pl-4'
    : '';
  return (
    <section className="container mx-auto px-4">
      {data.heading && <h2 className="text-2xl md:text-3xl font-bold text-gray-900 text-center mb-8">{data.heading}</h2>}
      <div data-page-grid="stats" className="grid" style={gridStyle(data, { columns: 4 })}>
        {items.map((it, i) => (
          <div key={i} className={`min-w-0 break-words text-center ${styleClass}`}>
            <div className="text-3xl md:text-4xl font-bold text-gray-900">{it.value}</div>
            <div className="text-xs md:text-sm text-gray-500 mt-1 uppercase tracking-wider">{it.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
