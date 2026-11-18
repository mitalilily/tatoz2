import { useState, useEffect, useRef, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

function buildEmbedUrl(url) {
  if (!url) return null;
  const match = url.match(/instagram\.com\/(?:p|reel|tv)\/([\w-]+)/);
  if (match) return `https://www.instagram.com/p/${match[1]}/embed/`;
  return null;
}

async function fetchThumbnail(url) {
  try {
    const oembedUrl = `https://graph.facebook.com/v18.0/instagram_oembed?url=${encodeURIComponent(url)}&maxwidth=480`;
    const res = await fetch(oembedUrl);
    if (!res.ok) throw new Error('oEmbed fetch failed');
    const data = await res.json();
    return data.thumbnail_url || null;
  } catch {
    return null;
  }
}

function getReducedMotion() {
  if (typeof window === 'undefined') return false;
  const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const saveData = navigator.connection?.saveData === true;
  return prefersReduced || saveData;
}

function useAutoplayOnView(videoRef) {
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (getReducedMotion()) return;
    if (typeof IntersectionObserver === 'undefined') return; // autoplay attr handles it

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            el.pause();
            try { el.currentTime = 0; } catch {}
            return;
          }
          const playPromise = el.play();
          if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => { /* autoplay blocked; ignore */ });
          }
        });
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [videoRef]);
}

function Lightbox({ reel, onClose, onPrev, onNext, hasPrev, hasNext }) {
  const [loading, setLoading] = useState(true);
  const videoRef = useRef(null);
  useAutoplayOnView(videoRef);
  const embedUrl = buildEmbedUrl(reel.url);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) onPrev();
      if (e.key === 'ArrowRight' && hasNext) onNext();
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}
      onClick={onClose}
    >
      <div className="relative max-w-2xl w-full mx-4" onClick={e => e.stopPropagation()}>
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white hover:text-gray-200 p-2"
          aria-label="Close"
        >
          <X size={24} />
        </button>

        {/* Prev button */}
        {hasPrev && (
          <button
            onClick={onPrev}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-12 text-white hover:text-gray-200 p-2"
            aria-label="Previous reel"
          >
            <ChevronLeft size={32} />
          </button>
        )}

        {/* Embed / Video */}
        <div className="aspect-[9/16] max-h-[85vh] mx-auto rounded-xl overflow-hidden bg-black relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
              <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {reel.videoUrl ? (
            <video
              data-page-builder-media="content"
              ref={videoRef}
              src={reel.videoUrl}
              controls
              autoPlay
              playsInline
              className="w-full h-full"
              onLoadedData={() => setLoading(false)}
              onError={() => setLoading(false)}
            />
          ) : embedUrl ? (
            <iframe
              data-page-builder-media="content"
              className="w-full h-full"
              src={embedUrl}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              title="Instagram Reel"
              onLoad={() => setLoading(false)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white">
              <a href={reel.url} target="_blank" rel="noreferrer" className="underline">
                Open in Instagram
              </a>
            </div>
          )}
        </div>

        {/* Next button */}
        {hasNext && (
          <button
            onClick={onNext}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-12 text-white hover:text-gray-200 p-2"
            aria-label="Next reel"
          >
            <ChevronRight size={32} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function InstaReels({ data = {} }) {
  const [thumbnails, setThumbnails] = useState({});
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const fetchedUrls = useRef({});

  const reels = data.reels || [];
  const validReels = reels.filter(r => r.url || r.videoUrl);

  // Fetch thumbnails for reels without custom thumbnails
  useEffect(() => {
    let cancelled = false;
    validReels.forEach((reel, i) => {
      if (reel.videoUrl) return; // skip: <video> will use its own first frame as poster
      if (reel.useCustomThumbnail && reel.customThumbnail) {
        if (!cancelled) setThumbnails(prev => prev[i] !== reel.customThumbnail ? { ...prev, [i]: reel.customThumbnail } : prev);
        return;
      }
      // Skip if already fetched this URL
      if (fetchedUrls.current[reel.url]) return;
      fetchedUrls.current[reel.url] = true;
      fetchThumbnail(reel.url).then(url => {
        if (!cancelled && url) setThumbnails(prev => ({ ...prev, [i]: url }));
      });
    });
    return () => { cancelled = true; };
  }, [validReels.length]);

  const colClass = { 2: 'grid-cols-2', 3: 'grid-cols-2 md:grid-cols-3', 4: 'grid-cols-2 md:grid-cols-4' }[data.columns || 3];

  function ReelCell({ reel, i, thumb, onOpen }) {
    const videoRef = useRef(null);
    useAutoplayOnView(videoRef);

    const handleError = (e) => {
      console.warn(`[InstaReels] video failed to load (reel ${i + 1})`, e);
      // hide the broken <video> element; the surrounding button still shows the poster
      e.currentTarget.style.display = 'none';
    };

    if (reel.videoUrl) {
      const poster = reel.useCustomThumbnail && reel.customThumbnail ? reel.customThumbnail : undefined;
      return (
        <button
          onClick={() => onOpen(i)}
          className="relative aspect-[9/16] bg-gray-100 rounded-xl overflow-hidden group cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400"
          aria-label={`Play reel ${i + 1}`}
        >
          <video
            data-page-builder-media="content"
            ref={videoRef}
            src={reel.videoUrl}
            poster={poster}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            className="w-full h-full object-cover"
            onError={handleError}
          />
        </button>
      );
    }

    // No videoUrl: existing thumbnail/lightbox cell (unchanged)
    return (
      <button
        onClick={() => onOpen(i)}
        className="relative aspect-[9/16] bg-gray-100 rounded-xl overflow-hidden group cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400"
        aria-label={`Open Instagram Reel ${i + 1}`}
      >
        {thumb ? (
          <img
            data-page-builder-media="content"
            src={thumb}
            alt={`Instagram Reel`}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center">
            <svg className="w-12 h-12 text-white opacity-60" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2.2c3.3 0 3.7 0 5 .1 1.2 0 2 .2 2.5.5.6.2 1 .6 1.5 1 .5.5.8.9 1 1.5.3.6.5 1.4.5 2.6.1 1.3.1 1.7.1 5s0 3.7-.1 5c0 1.2-.2 2-.5 2.6-.2.6-.6 1-1 1.5-.5.4-.9.8-1.5 1-.6.3-1.4.5-2.6.5-1.3.1-1.7.1-5 .1s-3.7 0-5-.1c-1.2 0-2-.2-2.5-.5-.6-.2-1-.6-1.5-1-.5-.5-.8-.9-1-1.5-.3-.6-.5-1.4-.5-2.6-.1-1.3-.1-1.7-.1-5s0-3.7.1-5c0-1.2.2-2 .5-2.6.2-.6.6-1 1-1.5.5-.4.9-.8 1.5-1 .6-.3 1.4-.5 2.6-.5 1.3-.1 1.7-.1 5-.1z"/>
              <circle cx="12" cy="12" r="4"/>
            </svg>
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-12 h-12 bg-white/80 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-gray-800 ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        </div>
      </button>
    );
  }

  if (!validReels.length) {
    return (
      <section className="container mx-auto px-4 py-12 text-center text-sm text-gray-400">
        Instagram Reels — no reels added yet
      </section>
    );
  }

  return (
    <>
      <section className="container mx-auto px-4 py-8">
        {data.heading && (
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 text-center mb-8">{data.heading}</h2>
        )}

        <div className={`grid ${colClass} gap-4`}>
          {validReels.map((reel, i) => (
            <ReelCell
              key={i}
              reel={reel}
              i={i}
              thumb={thumbnails[i]}
              onOpen={setLightboxIndex}
            />
          ))}
        </div>
      </section>

      {lightboxIndex !== null && (
        <Lightbox
          reel={validReels[lightboxIndex]}
          onClose={() => setLightboxIndex(null)}
          onPrev={() => setLightboxIndex(i => Math.max(0, i - 1))}
          onNext={() => setLightboxIndex(i => Math.min(validReels.length - 1, i + 1))}
          hasPrev={lightboxIndex > 0}
          hasNext={lightboxIndex < validReels.length - 1}
        />
      )}
    </>
  );
}
