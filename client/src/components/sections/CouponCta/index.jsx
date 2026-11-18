import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Check, Tag } from 'lucide-react';

export default function CouponCta({ data = {} }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    if (!data.code) return;
    try {
      await navigator.clipboard.writeText(data.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) { /* clipboard blocked — silent fail */ }
  };
  const style = { backgroundColor: data.backgroundColor || '#fef3c7', color: data.textColor || '#92400e' };
  return (
    <section className="container mx-auto px-4">
      <div style={style} className="rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-center gap-5 md:gap-8">
        <Tag size={32} className="flex-shrink-0 opacity-70" />
        <div className="flex-1 text-center md:text-left">
          {data.heading && <h2 className="text-xl md:text-2xl font-bold">{data.heading}</h2>}
          {data.subheading && <p className="text-sm opacity-90 mt-1">{data.subheading}</p>}
        </div>
        {data.code && (
          <button
            onClick={onCopy}
            className="bg-white/40 hover:bg-white/60 backdrop-blur-sm border-2 border-dashed border-current rounded-lg px-4 py-2 font-mono font-bold text-base md:text-lg flex items-center gap-2 transition"
            title="Click to copy"
          >
            {data.code}
            {copied ? <Check size={16} /> : <Copy size={16} className="opacity-60" />}
          </button>
        )}
        {data.ctaLabel && (
          <Link to={data.ctaLink || '/'} className="bg-current text-white px-5 py-2.5 rounded-lg font-semibold hover:opacity-90 transition" style={{ color: data.backgroundColor || '#fef3c7' }}>
            {data.ctaLabel}
          </Link>
        )}
      </div>
    </section>
  );
}
