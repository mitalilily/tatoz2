import { useState } from 'react';
import DOMPurify from 'dompurify';

export default function Tabs({ data = {} }) {
  const tabs = Array.isArray(data.tabs) ? data.tabs : [];
  const [active, setActive] = useState(0);
  if (!tabs.length) return null;
  const current = tabs[Math.min(active, tabs.length - 1)] || tabs[0];
  const activeCls = data.style === 'pills'
    ? 'bg-gray-900 text-white'
    : 'border-b-2 border-indigo-600 text-indigo-700';
  const inactiveCls = data.style === 'pills'
    ? 'text-gray-700 hover:bg-gray-100'
    : 'border-b-2 border-transparent text-gray-500 hover:text-gray-900';
  const wrapperCls = data.style === 'pills' ? 'flex flex-wrap gap-2' : 'flex flex-wrap border-b border-gray-200';
  return (
    <section className="container mx-auto px-4">
      {data.heading && <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6">{data.heading}</h2>}
      <div className={wrapperCls}>
        {tabs.map((t, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={`px-4 py-2 text-sm font-semibold rounded-md transition ${i === active ? activeCls : inactiveCls}`}
          >
            {t.label || `Tab ${i + 1}`}
          </button>
        ))}
      </div>
      <div className="mt-6 prose prose-gray max-w-none" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(current.bodyHtml || '', { USE_PROFILES: { html: true } }) }} />
    </section>
  );
}
