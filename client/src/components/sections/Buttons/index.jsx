import { Link } from 'react-router-dom';

const SIZE = { sm: 'px-3 py-1.5 text-xs', md: 'px-5 py-2.5 text-sm', lg: 'px-7 py-3 text-base' };
// Solid + outline default to brand color via the --pb-brand CSS var (set by SiteContext from theme tokens).
const STYLE = {
  solid: 'text-white hover:opacity-90 [background:var(--pb-brand,#111827)]',
  outline: 'border-2 [color:var(--pb-brand,#111827)] [border-color:var(--pb-brand,#111827)] hover:[background:var(--pb-brand,#111827)] hover:text-white',
  ghost: 'text-gray-900 hover:bg-gray-100',
};
const ALIGN = { left: 'justify-start', center: 'justify-center', right: 'justify-end' };

export default function Buttons({ data = {} }) {
  const buttons = Array.isArray(data.buttons) ? data.buttons : [];
  if (!buttons.length) return null;
  return (
    <section className="container mx-auto px-4">
      {data.heading && <h2 className={`text-xl font-bold text-gray-900 mb-3 ${data.align === 'center' ? 'text-center' : data.align === 'right' ? 'text-right' : 'text-left'}`}>{data.heading}</h2>}
      <div className={`flex flex-wrap gap-3 ${ALIGN[data.align] || ALIGN.center}`}>
        {buttons.map((b, i) => {
          const cls = `inline-flex items-center font-semibold transition ${SIZE[b.size] || SIZE.md} ${STYLE[b.style] || STYLE.solid}`;
          const styleAttr = { borderRadius: 'var(--pb-button-radius, 0.5rem)' };
          if (b.link?.startsWith('http') || b.link?.startsWith('#')) {
            return <a key={i} href={b.link} className={cls} style={styleAttr}>{b.label}</a>;
          }
          return <Link key={i} to={b.link || '/'} className={cls} style={styleAttr}>{b.label}</Link>;
        })}
      </div>
    </section>
  );
}
