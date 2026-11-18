import { useCallback, useEffect, useState } from 'react';
import { Globe2, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminAPI } from '../../services/api';
import Loader from '../../components/common/Loader';

const EMPTY = {
  baseCurrency: 'INR',
  defaultCurrency: 'INR',
  defaultLocale: 'en-IN',
  supportedLocales: [
    { code: 'en-IN', label: 'English (India)', enabled: true },
    { code: 'hi-IN', label: 'Hindi (India)', enabled: true },
  ],
  supportedCurrencies: [
    { code: 'INR', symbol: '₹', locale: 'en-IN', rateFromBase: 1, decimals: 2, enabled: true },
  ],
};

const inputClass = 'input w-full';
const clone = value => JSON.parse(JSON.stringify(value));

const normalize = config => ({
  ...EMPTY,
  ...config,
  supportedLocales: Array.isArray(config?.supportedLocales) && config.supportedLocales.length ? config.supportedLocales : clone(EMPTY.supportedLocales),
  supportedCurrencies: Array.isArray(config?.supportedCurrencies) && config.supportedCurrencies.length ? config.supportedCurrencies : clone(EMPTY.supportedCurrencies),
});

export default function AdminLocaleCurrencyPage() {
  const [config, setConfig] = useState(EMPTY);
  const [savedConfig, setSavedConfig] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshingRates, setRefreshingRates] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getStorefrontLocale();
      const next = normalize(response.data?.config || {});
      setConfig(next);
      setSavedConfig(clone(next));
    } catch (error) {
      toast.error(error.message || 'Could not load storefront language and currency settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async event => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await adminAPI.updateStorefrontLocale({
        baseCurrency: config.baseCurrency,
        defaultCurrency: config.defaultCurrency,
        defaultLocale: config.defaultLocale,
        supportedLocales: config.supportedLocales,
        supportedCurrencies: config.supportedCurrencies,
      });
      const next = normalize(response.data?.config || config);
      setConfig(next);
      setSavedConfig(clone(next));
      toast.success('Storefront language and currency settings saved');
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Could not save storefront settings');
    } finally {
      setSaving(false);
    }
  };

  const refreshRates = async () => {
    setRefreshingRates(true);
    try {
      const response = await adminAPI.refreshStorefrontRates();
      const next = normalize(response.data?.config || config);
      setConfig(next);
      setSavedConfig(clone(next));
      toast.success('Currency display rates refreshed');
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Could not refresh currency rates');
    } finally {
      setRefreshingRates(false);
    }
  };

  const updateLocale = (index, key, value) => setConfig(current => ({
    ...current,
    supportedLocales: current.supportedLocales.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
  }));
  const updateCurrency = (index, key, value) => setConfig(current => ({
    ...current,
    supportedCurrencies: current.supportedCurrencies.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
  }));
  const dirty = JSON.stringify(config) !== JSON.stringify(savedConfig);

  if (loading) return <div className="flex justify-center py-20"><Loader size="lg" /></div>;

  return <div className="space-y-6" data-testid="admin-locale-currency-page">
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900"><Globe2 className="text-indigo-600" /> Language & Currency</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">Configure each storefront tenant independently. Prices are converted for display from the base currency; server checkout, invoices and payment settlement remain authoritative in the configured base currency.</p>
      </div>
      <button type="button" className="btn-secondary flex items-center gap-2" onClick={load} disabled={loading}><RefreshCw size={15} /> Refresh</button>
    </div>

    <form onSubmit={save} className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-black text-slate-900">Storefront defaults</h2>
        <p className="mt-1 text-xs text-slate-500">These values are used when a visitor has not selected a display preference.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="text-xs font-bold text-slate-600">Base/catalog currency<input data-testid="admin-locale-base-currency" className={`${inputClass} mt-1 uppercase`} maxLength="3" value={config.baseCurrency} onChange={event => setConfig(current => ({ ...current, baseCurrency: event.target.value.toUpperCase() }))} /></label>
          <label className="text-xs font-bold text-slate-600">Default display currency<select data-testid="admin-locale-default-currency" className={`${inputClass} mt-1`} value={config.defaultCurrency} onChange={event => setConfig(current => ({ ...current, defaultCurrency: event.target.value }))}>{config.supportedCurrencies.map(item => <option key={item.code} value={item.code}>{item.code} — {item.symbol}</option>)}</select></label>
          <label className="text-xs font-bold text-slate-600">Default locale<select data-testid="admin-locale-default-locale" className={`${inputClass} mt-1`} value={config.defaultLocale} onChange={event => setConfig(current => ({ ...current, defaultLocale: event.target.value }))}>{config.supportedLocales.map(item => <option key={item.code} value={item.code}>{item.label} ({item.code})</option>)}</select></label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-black text-slate-900">Supported languages</h2><p className="mt-1 text-xs text-slate-500">Disabled options are hidden from the storefront selector. English and Hindi translations are bundled; other locales use the English fallback until a resource is added.</p></div><button type="button" className="btn-secondary flex items-center gap-1" onClick={() => setConfig(current => ({ ...current, supportedLocales: [...current.supportedLocales, { code: 'en-US', label: 'English (United States)', enabled: true }] }))}><Plus size={14} /> Add language</button></div>
        <div className="mt-4 space-y-3">
          {config.supportedLocales.map((item, index) => <div className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 md:grid-cols-[1fr_1fr_auto_auto]" key={`${item.code}-${index}`}>
            <input className={inputClass} aria-label={`Language code ${index + 1}`} placeholder="en-IN" value={item.code} onChange={event => updateLocale(index, 'code', event.target.value)} />
            <input className={inputClass} aria-label={`Language label ${index + 1}`} placeholder="English (India)" value={item.label} onChange={event => updateLocale(index, 'label', event.target.value)} />
            <label className="flex items-center gap-2 px-2 text-xs font-bold text-slate-600"><input type="checkbox" checked={item.enabled !== false} onChange={event => updateLocale(index, 'enabled', event.target.checked)} /> Enabled</label>
            <button type="button" className="rounded-lg p-2 text-rose-500 hover:bg-rose-50 disabled:opacity-30" disabled={config.supportedLocales.length <= 1} onClick={() => setConfig(current => ({ ...current, supportedLocales: current.supportedLocales.filter((_, itemIndex) => itemIndex !== index) }))} aria-label={`Remove language ${index + 1}`}><Trash2 size={15} /></button>
          </div>)}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-black text-slate-900">Supported currencies & display rates</h2><p className="mt-1 text-xs text-slate-500">Rates are refreshed automatically from the configured reference source and can also be refreshed here. Checkout and settlement remain in the base currency.</p>{config.ratesUpdatedAt && <p className="mt-1 text-[11px] text-emerald-600">Last refreshed {new Date(config.ratesUpdatedAt).toLocaleString()} {config.ratesDate ? `(${config.ratesDate})` : ''}</p>}</div><div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary flex items-center gap-1" onClick={refreshRates} disabled={refreshingRates}><RefreshCw size={14} className={refreshingRates ? 'animate-spin' : ''} /> {refreshingRates ? 'Refreshing...' : 'Refresh rates'}</button><button type="button" className="btn-secondary flex items-center gap-1" onClick={() => setConfig(current => ({ ...current, supportedCurrencies: [...current.supportedCurrencies, { code: 'USD', symbol: '$', locale: 'en-US', rateFromBase: '', decimals: 2, enabled: true }] }))}><Plus size={14} /> Add currency</button></div></div>
        <div className="mt-4 space-y-3">
          {config.supportedCurrencies.map((item, index) => <div className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 md:grid-cols-[.7fr_.7fr_1fr_1fr_.7fr_auto_auto]" key={`${item.code}-${index}`}>
            <input className={`${inputClass} uppercase`} maxLength="3" aria-label={`Currency code ${index + 1}`} placeholder="USD" value={item.code} onChange={event => updateCurrency(index, 'code', event.target.value.toUpperCase())} />
            <input className={inputClass} aria-label={`Currency symbol ${index + 1}`} placeholder="$" value={item.symbol} onChange={event => updateCurrency(index, 'symbol', event.target.value)} />
            <input className={inputClass} aria-label={`Currency locale ${index + 1}`} placeholder="en-US" value={item.locale || ''} onChange={event => updateCurrency(index, 'locale', event.target.value)} />
            <input className={inputClass} type="number" min="0.000001" step="0.000001" aria-label={`Currency rate ${index + 1}`} placeholder="Rate from base" value={item.rateFromBase} onChange={event => updateCurrency(index, 'rateFromBase', event.target.value === '' ? '' : Number(event.target.value))} />
            <input className={inputClass} type="number" min="0" max="4" step="1" aria-label={`Currency decimals ${index + 1}`} value={item.decimals ?? 2} onChange={event => updateCurrency(index, 'decimals', Number(event.target.value))} />
            <label className="flex items-center gap-2 px-2 text-xs font-bold text-slate-600"><input type="checkbox" checked={item.enabled !== false} onChange={event => updateCurrency(index, 'enabled', event.target.checked)} /> Enabled</label>
            <button type="button" className="rounded-lg p-2 text-rose-500 hover:bg-rose-50 disabled:opacity-30" disabled={item.code === config.baseCurrency || config.supportedCurrencies.length <= 1} onClick={() => setConfig(current => ({ ...current, supportedCurrencies: current.supportedCurrencies.filter((_, itemIndex) => itemIndex !== index) }))} aria-label={`Remove currency ${index + 1}`}><Trash2 size={15} /></button>
          </div>)}
        </div>
      </section>

      <div className="flex items-center justify-between gap-3"><p className={`text-xs font-semibold ${dirty ? 'text-amber-600' : 'text-slate-400'}`}>{dirty ? 'Unsaved changes' : 'All changes saved'}</p><button data-testid="admin-locale-save" className="btn-primary flex items-center gap-2" disabled={saving || !dirty}><Save size={15} /> {saving ? 'Saving...' : 'Save storefront settings'}</button></div>
    </form>
  </div>;
}
