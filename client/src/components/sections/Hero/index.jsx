import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const ASPECT_CLASS = {
  '21/9': 'aspect-[21/9]',
  '16/9': 'aspect-video',
  '2.15/1': 'aspect-[2.15]',
  '2/1': 'aspect-[2/1]',
  '4/3': 'aspect-[4/3]',
  '1/1': 'aspect-square',
};

function sizingProps(data) {
  const ar = data.aspectRatio || '2.15/1';
  if (ar === 'custom') {
    const v = data.customHeight?.value ?? 60;
    const u = data.customHeight?.unit ?? 'vh';
    return { className: '', style: { height: `${v}${u}` } };
  }
  return { className: ASPECT_CLASS[ar] || ASPECT_CLASS['2.15/1'], style: undefined };
}

function alignClasses(a) {
  return a === 'left' ? 'items-start text-left'
       : a === 'right' ? 'items-end text-right'
       : 'items-center text-center';
}

function Arrow({ dir, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`absolute top-1/2 -translate-y-1/2 ${dir === 'left' ? 'left-3 md:left-5' : 'right-3 md:right-5'} z-20 w-10 h-10 rounded-full bg-white/80 hover:bg-white text-gray-900 flex items-center justify-center shadow-md transition`}
      aria-label={dir === 'left' ? 'Previous slide' : 'Next slide'}
    >
      {dir === 'left' ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
    </button>
  );
}

function Dots({ count, idx, setIdx, theme = 'light' }) {
  if (count < 2) return null;
  const onClass = theme === 'dark' ? 'bg-gray-900' : 'bg-white';
  const offClass = theme === 'dark' ? 'bg-gray-900/30' : 'bg-white/50';
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-20">
      {Array.from({ length: count }).map((_, i) => (
        <button key={i} onClick={() => setIdx(i)} aria-label={`Go to slide ${i + 1}`}
          className={`h-1.5 rounded-full transition-all ${i === idx ? `w-6 ${onClass}` : `w-2 ${offClass}`}`} />
      ))}
    </div>
  );
}

export default function Hero({ data = {} }) {
  const slides = Array.isArray(data.slides) ? data.slides : [];
  const [idx, setIdx] = useState(0);
  const variant = data.variant || 'classic';
  const showArrows = data.showArrows !== false;
  const showDots = data.showDots !== false;
  const transition = data.transition || 'fade';

  useEffect(() => {
    if (!data.autoplay || slides.length < 2) return;
    const id = setInterval(() => setIdx(i => (i + 1) % slides.length), data.intervalMs || 5000);
    return () => clearInterval(id);
  }, [data.autoplay, data.intervalMs, slides.length]);

  // Keep idx in range when slide count changes
  useEffect(() => { if (idx >= slides.length) setIdx(0); }, [slides.length, idx]);

  if (!slides.length) return <div className="h-64 bg-gray-100 flex items-center justify-center text-sm text-gray-400">Hero — no slides yet</div>;

  // ─────────────────────────────────────────── STRIP ────────────────────────────────────────────
  // Continuously scrolling marquee row. Each image keeps its native aspect ratio at a fixed height.
  if (variant === 'strip') {
    const sh = data.stripHeight || { value: 400, unit: 'px' };
    const sg = data.stripGap || { value: 8, unit: 'px' };
    const heightCss = `${sh.value}${sh.unit}`;
    const gapCss = `${sg.value}${sg.unit}`;
    const speed = data.stripSpeed || 40;
    const animDirection = data.stripDirection === 'right' ? 'reverse' : 'normal';
    const pauseOnHover = data.stripPauseOnHover !== false;
    // Duplicate the list so the loop appears seamless when transform: translateX(-50%)
    const doubled = [...slides, ...slides];
    return (
      <section className={`overflow-hidden bg-gray-100 ${pauseOnHover ? 'pb-hero-strip-wrap' : ''}`} aria-roledescription="carousel">
        <div
          className="flex items-stretch"
          style={{
            height: heightCss,
            gap: gapCss,
            width: 'max-content',
            animation: `pb-hero-strip ${speed}s linear infinite ${animDirection}`,
          }}
        >
          {doubled.map((s, i) => {
            const W = s.ctaLink ? Link : 'div';
            const p = s.ctaLink ? { to: s.ctaLink } : {};
            return (
              <W key={i} {...p} className="flex-shrink-0 relative group/slide overflow-hidden" style={{ height: heightCss }} aria-hidden={i >= slides.length}>
                {s.imageUrl
                  ? <img data-page-builder-media="content" src={s.imageUrl} alt={s.headline || ''} loading={i === 0 ? 'eager' : 'lazy'} decoding="async" className="h-full w-auto block select-none" draggable={false} />
                  : <div className="h-full bg-gray-200" style={{ width: '400px' }} />}
                {(s.headline || s.subheadline) && (
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-transparent flex flex-col justify-end p-4 text-white opacity-0 group-hover/slide:opacity-100 transition-opacity">
                    {s.headline && <div className="font-bold text-base md:text-lg drop-shadow">{s.headline}</div>}
                    {s.subheadline && <div className="text-xs md:text-sm opacity-90 mt-0.5 line-clamp-2">{s.subheadline}</div>}
                  </div>
                )}
              </W>
            );
          })}
        </div>
        <style>{`
          @keyframes pb-hero-strip { from { transform: translateX(0); } to { transform: translateX(-50%); } }
          .pb-hero-strip-wrap:hover > div { animation-play-state: paused; }
        `}</style>
      </section>
    );
  }

  const next = () => setIdx(i => (i + 1) % slides.length);
  const prev = () => setIdx(i => (i - 1 + slides.length) % slides.length);
  const sizing = sizingProps(data);
  // A responsive override can replace the slide list before the index-reset
  // effect runs. Resolve a valid slide during that render as well.
  const slide = slides[idx] || slides[0];

  // ─────────────────────────────────────────── CLASSIC ───────────────────────────────────────────
  if (variant === 'classic') {
    return (
      <section className={`relative w-full overflow-hidden bg-gray-200 ${sizing.className}`} style={sizing.style}>
        {/* Slides — fade transition stacks them; slide transition translates the row */}
        {transition === 'fade' ? slides.map((s, i) => (
          <div key={i} className={`absolute inset-0 transition-opacity duration-700 ${i === idx ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            {s.imageUrl && <img data-page-builder-media="content" src={s.imageUrl} alt={s.headline || ''} loading="eager" fetchpriority="high" decoding="async" className="absolute inset-0 w-full h-full object-cover" />}
            <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${s.overlayOpacity ?? 0.4})` }} />
          </div>
        )) : (
          <div className="absolute inset-0 flex transition-transform duration-500 ease-out" style={{ width: `${slides.length * 100}%`, transform: `translateX(-${idx * (100 / slides.length)}%)` }}>
            {slides.map((s, i) => (
              <div key={i} className="relative h-full" style={{ width: `${100 / slides.length}%` }}>
                {s.imageUrl && <img data-page-builder-media="content" src={s.imageUrl} alt={s.headline || ''} loading="eager" fetchpriority="high" decoding="async" className="absolute inset-0 w-full h-full object-cover" />}
                <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${s.overlayOpacity ?? 0.4})` }} />
              </div>
            ))}
          </div>
        )}
        {/* Foreground text — only the active slide */}
        <div className={`relative h-full flex flex-col justify-center px-8 md:px-16 ${alignClasses(slide.alignment)} z-10`}>
          {slide.headline && <h1 className="text-3xl md:text-5xl font-bold text-white max-w-2xl drop-shadow">{slide.headline}</h1>}
          {slide.subheadline && <p className="mt-3 text-white/90 max-w-xl text-base md:text-lg">{slide.subheadline}</p>}
          {slide.ctaLabel && (
            <Link to={slide.ctaLink || '/'} className="mt-5 inline-block px-5 py-2.5 bg-white text-gray-900 font-semibold rounded-lg hover:bg-gray-100 transition">{slide.ctaLabel}</Link>
          )}
        </div>
        {showArrows && slides.length > 1 && <><Arrow dir="left" onClick={prev} /><Arrow dir="right" onClick={next} /></>}
        {showDots && <Dots count={slides.length} idx={idx} setIdx={setIdx} theme="light" />}
      </section>
    );
  }

  // ─────────────────────────────────────────── SPLIT ────────────────────────────────────────────
  if (variant === 'split') {
    const imgFirst = slide.imagePosition !== 'right';
    const bg = slide.bgColor || '#0f172a';
    const fg = slide.textColor || '#ffffff';
    const Image = (
      <div className="relative w-full md:w-1/2 h-1/2 md:h-full bg-gray-200">
        {slide.imageUrl && <img data-page-builder-media="content" src={slide.imageUrl} alt={slide.headline || ''} loading="eager" fetchpriority="high" decoding="async" className="absolute inset-0 w-full h-full object-cover" />}
      </div>
    );
    const Text = (
      <div className={`w-full md:w-1/2 h-1/2 md:h-full flex flex-col justify-center px-8 md:px-12 ${alignClasses(slide.alignment)}`} style={{ backgroundColor: bg, color: fg }}>
        {slide.headline && <h1 className="text-3xl md:text-5xl font-bold max-w-md">{slide.headline}</h1>}
        {slide.subheadline && <p className="mt-3 opacity-90 max-w-md text-base md:text-lg">{slide.subheadline}</p>}
        {slide.ctaLabel && (
          <Link to={slide.ctaLink || '/'} className="mt-6 inline-block self-start px-5 py-2.5 bg-white text-gray-900 font-semibold rounded-lg hover:bg-gray-100 transition">{slide.ctaLabel}</Link>
        )}
      </div>
    );
    return (
      <section className={`relative w-full overflow-hidden ${sizing.className}`} style={sizing.style}>
        <div className="flex flex-col md:flex-row h-full">
          {imgFirst ? Image : Text}
          {imgFirst ? Text : Image}
        </div>
        {showArrows && slides.length > 1 && <><Arrow dir="left" onClick={prev} /><Arrow dir="right" onClick={next} /></>}
        {showDots && <Dots count={slides.length} idx={idx} setIdx={setIdx} theme={fg === '#ffffff' ? 'light' : 'dark'} />}
      </section>
    );
  }

  // ─────────────────────────────────────────── MINIMAL ──────────────────────────────────────────
  if (variant === 'minimal') {
    const bg = slide.bgColor || '#f9fafb';
    const fg = slide.textColor || '#111827';
    return (
      <section className={`relative w-full overflow-hidden ${sizing.className}`} style={{ ...sizing.style, backgroundColor: bg, color: fg }}>
        <div className={`relative h-full flex flex-col justify-center px-8 md:px-16 ${alignClasses(slide.alignment)} max-w-5xl mx-auto`}>
          {slide.headline && <h1 className="text-4xl md:text-6xl font-bold tracking-tight max-w-3xl">{slide.headline}</h1>}
          {slide.subheadline && <p className="mt-4 opacity-80 max-w-xl text-base md:text-lg">{slide.subheadline}</p>}
          {slide.ctaLabel && (
            <Link to={slide.ctaLink || '/'} className="mt-6 inline-block self-start px-5 py-2.5 font-semibold rounded-lg transition" style={{ backgroundColor: fg, color: bg }}>{slide.ctaLabel}</Link>
          )}
        </div>
        {showArrows && slides.length > 1 && <><Arrow dir="left" onClick={prev} /><Arrow dir="right" onClick={next} /></>}
        {showDots && <Dots count={slides.length} idx={idx} setIdx={setIdx} theme="dark" />}
      </section>
    );
  }

  // ──────────────────────────────────────────── CARD ────────────────────────────────────────────
  // Contained centered card with image background and text overlay — not full-bleed.
  return (
    <section className="container mx-auto px-4">
      <div className={`relative w-full overflow-hidden rounded-2xl bg-gray-200 ${sizing.className}`} style={sizing.style}>
        {slide.imageUrl && <img data-page-builder-media="content" src={slide.imageUrl} alt={slide.headline || ''} loading="eager" fetchpriority="high" decoding="async" className="absolute inset-0 w-full h-full object-cover" />}
        <div className="absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${slide.overlayOpacity ?? 0.4})` }} />
        <div className={`relative h-full flex flex-col justify-center px-8 md:px-12 ${alignClasses(slide.alignment)} z-10`}>
          {slide.headline && <h1 className="text-3xl md:text-5xl font-bold text-white max-w-xl drop-shadow">{slide.headline}</h1>}
          {slide.subheadline && <p className="mt-3 text-white/90 max-w-md text-base md:text-lg">{slide.subheadline}</p>}
          {slide.ctaLabel && (
            <Link to={slide.ctaLink || '/'} className="mt-5 inline-block self-start px-5 py-2.5 bg-white text-gray-900 font-semibold rounded-lg hover:bg-gray-100 transition">{slide.ctaLabel}</Link>
          )}
        </div>
        {showArrows && slides.length > 1 && <><Arrow dir="left" onClick={prev} /><Arrow dir="right" onClick={next} /></>}
        {showDots && <Dots count={slides.length} idx={idx} setIdx={setIdx} theme="light" />}
      </div>
    </section>
  );
}
