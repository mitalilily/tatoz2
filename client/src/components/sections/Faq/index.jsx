import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function Faq({ data = {} }) {
  const items = Array.isArray(data.items) ? data.items : [];
  const [openIdx, setOpenIdx] = useState(data.expandFirst ? 0 : -1);
  if (!items.length) return <div className="py-8 text-center text-sm text-gray-400">FAQ — no items yet</div>;
  const toggle = (i) => setOpenIdx(prev => prev === i ? -1 : i);
  return (
    <section className="container mx-auto px-4">
      {data.heading && <h2 className="text-2xl md:text-3xl font-bold text-gray-900 text-center mb-6">{data.heading}</h2>}
      <div className="max-w-2xl mx-auto divide-y divide-gray-200 border border-gray-200 rounded-xl bg-white overflow-hidden">
        {items.map((it, i) => {
          const open = openIdx === i;
          return (
            <div key={i}>
              <button onClick={() => toggle(i)} className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-gray-50 transition">
                <span className="font-semibold text-gray-900">{it.question || `Question ${i + 1}`}</span>
                <ChevronDown size={18} className={`text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && it.answer && (
                <div className="px-5 pb-4 text-sm text-gray-600 leading-relaxed">{it.answer}</div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
