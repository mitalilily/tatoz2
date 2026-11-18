import { useEffect, useState } from 'react';

export const MOBILE_BREAKPOINT = 768;
export const TABLET_BREAKPOINT = 1024;

export function getViewportDevice(width) {
  const viewportWidth = Number.isFinite(Number(width))
    ? Number(width)
    : (typeof window !== 'undefined' ? window.innerWidth : TABLET_BREAKPOINT);
  if (viewportWidth < MOBILE_BREAKPOINT) return 'mobile';
  if (viewportWidth < TABLET_BREAKPOINT) return 'tablet';
  return 'desktop';
}

export function useViewportDevice() {
  const [device, setDevice] = useState(() => getViewportDevice());
  useEffect(() => {
    const onResize = () => setDevice(getViewportDevice());
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return device;
}
