import DOMPurify from 'dompurify';

const WIDTH = { narrow: 'max-w-2xl', normal: 'max-w-3xl', wide: 'max-w-5xl', full: 'max-w-none' };

export default function CustomHtml({ data = {} }) {
  const html = data.html || '';
  // Always sanitize. We allow iframes (for embeds) but strip <script> by default.
  // If admin explicitly opts into allowScripts they must be on a trusted page — still sanitized to remove on*= attrs.
  const safe = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'src', 'width', 'height', 'loading'],
    FORBID_TAGS: data.allowScripts ? [] : ['script'],
  });
  const w = WIDTH[data.maxWidth] || WIDTH.normal;
  return (
    <section className="container mx-auto px-4">
      <div className={`${w} mx-auto`} dangerouslySetInnerHTML={{ __html: safe }} />
    </section>
  );
}
