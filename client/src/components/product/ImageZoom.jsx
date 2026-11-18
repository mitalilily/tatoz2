import { useState, useRef, useCallback, useEffect } from 'react';
import { X, ZoomIn } from 'lucide-react';

const ImageZoom = ({ src, alt = '', zoomScale = 2.5, className = '' }) => {
 const fallbackSrc = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800"%3E%3Crect width="800" height="800" fill="%23f3f4f6"/%3E%3Cpath d="M245 570l115-130 86 96 61-72 94 106H245z" fill="%239ca3af"/%3E%3Ccircle cx="515" cy="280" r="54" fill="%239ca3af"/%3E%3C/svg%3E';
 const [resolvedSrc, setResolvedSrc] = useState(src || fallbackSrc);
 const containerRef = useRef(null);
 const zoomRef = useRef(null);
 const rectRef = useRef(null);
 const rafRef = useRef(0);
 const [hover, setHover] = useState(false);
 const [fullscreen, setFullscreen] = useState(false);

 useEffect(() => { setResolvedSrc(src || fallbackSrc); }, [src]);

 useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

 const handleImageError = useCallback((event) => {
  if (resolvedSrc === fallbackSrc) return;
  setResolvedSrc(fallbackSrc);
  event.currentTarget.src = fallbackSrc;
 }, [fallbackSrc, resolvedSrc]);

 const isTouchDevice = typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;

 // Fast path: no React re-render per mousemove. The cached rect is read once on
 // enter and the zoom layer is moved via direct DOM style writes (rAF-throttled),
 // so hovering never triggers layout thrash or component renders.
 const handleMouseEnter = useCallback(() => {
  rectRef.current = containerRef.current?.getBoundingClientRect() || null;
  setHover(true);
 }, []);

 const handleMouseMove = useCallback((e) => {
  if (rafRef.current) return;
  const clientX = e.clientX;
  const clientY = e.clientY;
  rafRef.current = requestAnimationFrame(() => {
   rafRef.current = 0;
   const rect = rectRef.current;
   const zoomEl = zoomRef.current;
   if (!rect || !zoomEl) return;
   const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
   const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
   zoomEl.style.backgroundPosition = `${x}% ${y}%`;
  });
 }, []);

 const handleMouseLeave = useCallback(() => {
  if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
  rectRef.current = null;
  setHover(false);
 }, []);

 return (
 <>
 <div
 ref={containerRef}
 className={`relative overflow-hidden cursor-crosshair group ${className}`}
 onMouseMove={!isTouchDevice ? handleMouseMove : undefined}
 onMouseEnter={!isTouchDevice ? handleMouseEnter : undefined}
 onMouseLeave={!isTouchDevice ? handleMouseLeave : undefined}
 onClick={() => setFullscreen(true)}
 >
 {/* Normal image */}
 <img
 src={resolvedSrc}
 alt={alt}
 loading="eager"
 decoding="async"
 className="w-full h-full object-cover"
 style={{ opacity: hover && !isTouchDevice ? 0 : 1 }}
 draggable={false}
 onError={handleImageError}
 />

 {/* Zoomed image (replaces normal image on hover) */}
 {hover && !isTouchDevice && (
 <div
 ref={zoomRef}
 className="absolute inset-0"
 style={{
 backgroundImage: `url(${resolvedSrc})`,
 backgroundSize: `${zoomScale * 100}%`,
 backgroundPosition: '50% 50%',
 backgroundRepeat: 'no-repeat',
 }}
 />
 )}

 {/* Zoom hint */}
 {!hover && (
 <div className="absolute bottom-3 right-3 bg-black/50 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 pointer-events-none">
 <ZoomIn size={16} />
 </div>
 )}
 </div>

 {/* Fullscreen overlay */}
 {fullscreen && (
 <div className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center" onClick={() => setFullscreen(false)}>
 <button
 onClick={() => setFullscreen(false)}
 className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
 >
 <X size={20} />
 </button>
 <div className="w-full h-full overflow-auto p-4 flex items-center justify-center" style={{ touchAction: 'pinch-zoom pan-x pan-y' }}>
 <img src={resolvedSrc} alt={alt} loading="lazy" decoding="async" className="max-w-[90vw] max-h-[90vh] object-contain" draggable={false} onError={handleImageError} />
 </div>
 </div>
 )}
 </>
 );
};

export default ImageZoom;
