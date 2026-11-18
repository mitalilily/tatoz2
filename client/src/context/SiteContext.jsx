import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { siteAPI } from '../services/api';
import i18n from '../i18n';
import { PLATFORM_NAME, displayPlatformName } from '../constants/branding';

const defaultSettings = {
  siteName: PLATFORM_NAME,
  siteTagline: '',
  currency: 'INR',
  currencySymbol: '₹',
  freeShippingThreshold: 999,
  standardShippingCost: 49,
  taxRate: 18,
  country: 'India',
  timezone: 'Asia/Kolkata',
  locale: 'en-IN',
  baseCurrency: 'INR',
  settlementCurrency: 'INR',
  rateFromBase: 1,
  currencyDecimals: 2,
  dateFormat: 'DD/MM/YYYY',
  weightUnit: 'kg',
  phoneCode: '+91',
  codEnabled: true,
};

const defaultInternationalization = {
  source: 'default',
  baseCurrency: 'INR',
  currency: 'INR',
  currencySymbol: '₹',
  locale: 'en-IN',
  rateFromBase: 1,
  decimals: 2,
  defaultCurrency: 'INR',
  defaultLocale: 'en-IN',
  settlementCurrency: 'INR',
  supportedCurrencies: [{ code: 'INR', symbol: '₹', locale: 'en-IN', rateFromBase: 1, decimals: 2, enabled: true }],
  supportedLocales: [
    { code: 'en-IN', label: 'English (India)', enabled: true },
    { code: 'hi-IN', label: 'Hindi (India)', enabled: true },
  ],
};

const SiteContext = createContext({
  site: null,
  settings: defaultSettings,
  internationalization: defaultInternationalization,
  loading: true,
  refetch: () => {},
  updateDisplayPreferences: () => {},
});

export const useSite = () => useContext(SiteContext);

export const SiteProvider = ({ children }) => {
  const [site, setSite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [displayPreferences, setDisplayPreferences] = useState(() => {
    try {
      return {
        currency: window.localStorage.getItem('tatoz_display_currency') || '',
        locale: window.localStorage.getItem('tatoz_display_locale') || '',
      };
    } catch {
      return { currency: '', locale: '' };
    }
  });

  const fetchSite = useCallback(async () => {
    try {
      const params = Object.fromEntries(Object.entries(displayPreferences).filter(([, value]) => value));
      const res = await siteAPI.getSite(params);
      const data = res.data?.site || {};
      setSite({ ...data, settings: { ...data.settings, siteName: displayPlatformName(data.settings?.siteName) } });
      const selectedLanguage = String(data.settings?.locale || '').split('-')[0].toLowerCase();
      // The platform currently ships English and Hindi resources. Other
      // configured locales remain valid number/date locales and fall back to
      // English until their translation resource is added.
      await i18n.changeLanguage(['en', 'hi'].includes(selectedLanguage) ? selectedLanguage : 'en');
    } catch {
      setSite({});
    } finally {
      setLoading(false);
    }
  }, [displayPreferences]);

  useEffect(() => {
    fetchSite();
  }, [fetchSite]);

  // Refetch when user returns to the tab so admin changes appear without full reload
  useEffect(() => {
    const onFocus = () => fetchSite();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchSite]);

  const settings = site?.settings
    ? { ...defaultSettings, ...site.settings }
    : defaultSettings;
  const internationalization = site?.internationalization || defaultInternationalization;

  const updateDisplayPreferences = useCallback((next = {}) => {
    setDisplayPreferences(current => {
      const updated = {
        currency: next.currency ?? current.currency,
        locale: next.locale ?? current.locale,
      };
      try {
        if (updated.currency) window.localStorage.setItem('tatoz_display_currency', updated.currency);
        if (updated.locale) window.localStorage.setItem('tatoz_display_locale', updated.locale);
      } catch {}
      return updated;
    });
  }, []);

  // Apply theme tokens as CSS custom properties so any section/component can read them.
  useEffect(() => {
    const t = site?.theme;
    if (!t) return;
    const root = document.documentElement.style;
    root.setProperty('--pb-brand', t.brandColor || '#4f46e5');
    root.setProperty('--pb-accent', t.accentColor || '#a855f7');
    root.setProperty('--pb-text', t.textColor || '#111827');
    const radius = t.buttonStyle === 'pill' ? '9999px' : t.buttonStyle === 'square' ? '0px' : '0.5rem';
    root.setProperty('--pb-button-radius', radius);
    if (t.fontFamily) root.setProperty('--pb-font-family', t.fontFamily);
  }, [site?.theme]);

  return (
    <SiteContext.Provider value={{ site, settings, internationalization, loading, refetch: fetchSite, updateDisplayPreferences }}>
      {children}
    </SiteContext.Provider>
  );
};
