import { useEffect, useState } from 'react';
import { pageAPI } from '../../services/api';
import PageRenderer from './PageRenderer';
import { useViewportDevice } from '../../hooks/useViewportDevice';

// Renders the global header or footer chrome page (kind="header" | "footer").
// Caches the response in window.__pbChromeCache so multiple route changes
// don't refetch on every navigation. Returns null when empty so it adds
// nothing to the DOM in the common (unconfigured) case.
export default function ChromeRenderer({ kind }) {
  const [layout, setLayout] = useState(() => window.__pbChromeCache?.[kind] || null);
  const [done, setDone] = useState(() => !!window.__pbChromeCache?.[kind]);
  const device = useViewportDevice();

  useEffect(() => {
    if (kind !== 'header' && kind !== 'footer') return;
    if (window.__pbChromeCache?.[kind]) return;
    let cancelled = false;
    pageAPI.getChrome(kind)
      .then(r => {
        if (cancelled) return;
        const next = r.data?.empty ? { sections: [] } : (r.data?.layout || { sections: [] });
        window.__pbChromeCache = { ...(window.__pbChromeCache || {}), [kind]: next };
        setLayout(next);
      })
      .catch(() => { if (!cancelled) setLayout({ sections: [] }); })
      .finally(() => { if (!cancelled) setDone(true); });
    return () => { cancelled = true; };
  }, [kind]);

  if (!done || !layout || !Array.isArray(layout.sections) || layout.sections.length === 0) return null;
  return <PageRenderer layout={layout} device={device} />;
}

// Helper for code that publishes a chrome page (e.g. PageBuilderPage on save)
// to invalidate the in-memory cache so the next navigation refetches.
export function invalidateChromeCache(kind) {
  if (typeof window === 'undefined' || !window.__pbChromeCache) return;
  if (kind) delete window.__pbChromeCache[kind];
  else window.__pbChromeCache = {};
}
