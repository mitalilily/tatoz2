import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { siteApi } from '../lib/api';

const SiteContext = createContext(null);

export function SiteProvider({ children }) {
  const [site, setSite] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const result = await siteApi.get();
      setSite(result.site || {});
    } catch (_) {
      setSite(current => current || {});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);

  const theme = useMemo(() => {
    const source = site?.theme || {};
    return {
      brand: source.brandColor || '#4f46e5',
      accent: source.accentColor || '#a855f7',
      text: source.textColor || '#111827',
      buttonStyle: source.buttonStyle || 'rounded',
    };
  }, [site]);

  const value = useMemo(() => ({ site, settings: site?.settings || {}, header: site?.header || {}, footer: site?.footer || {}, theme, loading, refresh }), [site, theme, loading, refresh]);
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSite() {
  const value = useContext(SiteContext);
  if (!value) throw new Error('useSite must be used inside SiteProvider');
  return value;
}
