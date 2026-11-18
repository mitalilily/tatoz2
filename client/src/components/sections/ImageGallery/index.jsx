import { useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { gridStyle } from '../../page/grid';

export default function ImageGallery({ data = {} }) {
  const images = (Array.isArray(data.images) ? data.images : []).filter(im => im.url);
  const [active, setActive] = useState(-1);
  if (!images.length) return <div className="py-8 text-center text-sm text-gray-400">Image Gallery — no images yet</div>;
  const grid = gridStyle(data);
  const isMasonry = data.layout === 'masonry';

  return (
    <section className="container mx-auto px-4">
      {data.heading && <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6">{data.heading}</h2>}
      {isMasonry ? (
        <div data-page-grid="masonry" style={{ columnCount: data.columns || 3, columnGap: grid.columnGap }}>
          {images.map((im, i) => (
            <button key={i} onClick={() => data.enableLightbox && setActive(i)} style={{ marginBottom: grid.rowGap, breakInside: 'avoid' }} className="block w-full overflow-hidden rounded-lg cursor-zoom-in hover:opacity-90 transition">
              <img data-page-builder-media="content" src={im.url} alt={im.altText || ''} className="w-full h-auto" />
            </button>
          ))}
        </div>
      ) : (
        <div data-page-grid="gallery" className="grid" style={grid}>
          {images.map((im, i) => (
            <button key={i} onClick={() => data.enableLightbox && setActive(i)} className="block overflow-hidden rounded-lg cursor-zoom-in aspect-square hover:opacity-90 transition">
              <img data-page-builder-media="content" src={im.url} alt={im.altText || ''} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {data.enableLightbox && active >= 0 && images[active] && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center" onClick={() => setActive(-1)}>
          <button className="absolute top-4 right-4 text-white/70 hover:text-white p-2" onClick={() => setActive(-1)}><X size={24} /></button>
          {images.length > 1 && (
            <>
              <button className="absolute left-4 text-white/70 hover:text-white p-2" onClick={(e) => { e.stopPropagation(); setActive((active - 1 + images.length) % images.length); }}><ChevronLeft size={32} /></button>
              <button className="absolute right-4 text-white/70 hover:text-white p-2" onClick={(e) => { e.stopPropagation(); setActive((active + 1) % images.length); }}><ChevronRight size={32} /></button>
            </>
          )}
          <img data-page-builder-media="lightbox" src={images[active].url} alt={images[active].altText || ''} className="max-h-[85vh] max-w-[90vw] object-contain" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </section>
  );
}
