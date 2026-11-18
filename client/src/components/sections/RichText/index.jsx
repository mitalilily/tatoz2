import DOMPurify from 'dompurify';

const WIDTH = { narrow: 'max-w-2xl', normal: 'max-w-3xl', wide: 'max-w-5xl', full: 'max-w-none' };
const ALIGN = { left: 'text-left', center: 'text-center', right: 'text-right' };

export default function RichText({ data = {} }) {
  const safe = DOMPurify.sanitize(data.html || '', { USE_PROFILES: { html: true } });
  const w = WIDTH[data.maxWidth] || WIDTH.normal;
  const a = ALIGN[data.align] || ALIGN.left;
  return (
    <section className={`container mx-auto px-4 ${a}`}>
      <div className={`${w} ${data.align === 'center' ? 'mx-auto' : data.align === 'right' ? 'ml-auto' : ''} page-rich-text`} dangerouslySetInnerHTML={{ __html: safe }} />
    </section>
  );
}
