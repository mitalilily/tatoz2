import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  BadgePercent,
  ChevronRight,
  Clock3,
  IndianRupee,
  Link2,
  MapPinned,
  Plus,
  ReceiptIndianRupee,
  Save,
  Store,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { adminAPI } from '../../services/api';
import { PLATFORM_NAME, displayPlatformName } from '../../constants/branding';
import Loader from '../../components/common/Loader';
import toast from 'react-hot-toast';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100';

const OPTIONS = {
 country: ['India', 'United States', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'France', 'Japan', 'Singapore', 'UAE', 'Saudi Arabia', 'Brazil'],
 phone_code: ['+91', '+1', '+44', '+61', '+49', '+33', '+81', '+65', '+971', '+966', '+55'],
 currency: ['INR', 'USD', 'GBP', 'EUR', 'CAD', 'AUD', 'JPY', 'SGD', 'AED', 'SAR', 'BRL'],
 timezone: ['Asia/Kolkata', 'America/New_York', 'America/Los_Angeles', 'America/Chicago', 'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Asia/Tokyo', 'Asia/Singapore', 'Asia/Dubai', 'Australia/Sydney', 'America/Sao_Paulo'],
 locale: ['en-IN', 'en-US', 'en-GB', 'en-AU', 'de-DE', 'fr-FR', 'ja-JP', 'pt-BR', 'ar-AE', 'ar-SA'],
 date_format: ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY', 'DD.MM.YYYY'],
 weight_unit: ['kg', 'g', 'lb', 'oz'],
 active_shipping_provider: ['shiprocket', 'delhivery', 'xpressbees', 'bluedart', 'dtdc'],
 active_payment_providers: ['razorpay', 'cashfree', 'stripe'],
 manual_payment_methods: ['manual', 'bank_transfer', 'upi'],
 attribution_model: ['last_click', 'first_click'],
 cancellation_max_status: ['confirmed', 'packed', 'shipped'],
};

const optionLabel = value => String(value || '').replace(/[_.-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());

const field = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra });

const SETTINGS_GROUPS = [
 { id: 'identity', title: 'Store identity', description: 'Name, tagline and the storefront basics.', icon: Store, tone: 'indigo', fields: [field('site_name', 'Site name', 'text', { help: 'Appears in the storefront, admin title and notifications.' }), field('site_tagline', 'Tagline', 'text', { help: 'Short line shown below your store identity.' })] },
 { id: 'region', title: 'Region & currency', description: 'Locale, currency and address formatting.', icon: MapPinned, tone: 'emerald', fields: [field('country', 'Country', 'select'), field('phone_code', 'Phone code', 'select'), field('currency', 'Currency code', 'select'), field('currency_symbol', 'Currency symbol', 'text')] },
 { id: 'formatting', title: 'Locale & formatting', description: 'Timezone, language and display formats.', icon: Clock3, tone: 'violet', fields: [field('timezone', 'Timezone', 'select'), field('locale', 'Locale', 'select'), field('date_format', 'Date format', 'select'), field('weight_unit', 'Weight unit', 'select')] },
 { id: 'shipping', title: 'Shipping charges', description: 'Default delivery pricing shown to customers.', icon: Truck, tone: 'orange', fields: [field('free_shipping_threshold', 'Free shipping threshold', 'number', { prefix: '₹' }), field('standard_shipping_cost', 'Standard shipping cost', 'number', { prefix: '₹' })] },
 { id: 'tax', title: 'Tax', description: 'Default GST or tax applied at checkout.', icon: BadgePercent, tone: 'yellow', fields: [field('tax_rate', 'GST / tax rate', 'number', { suffix: '%' })] },
 { id: 'cod', title: 'Cash on delivery', description: 'Control whether COD is available at checkout.', icon: IndianRupee, tone: 'green', fields: [field('cod_enabled', 'Enable COD', 'toggle', { help: 'Customers will see COD only when this is enabled.' })] },
 { id: 'manual_payments', title: 'Manual payments', description: 'Accept bank transfer, UPI or manually verified payments.', icon: ReceiptIndianRupee, tone: 'pink', fields: [field('manual_payment_enabled', 'Enable manual payments', 'toggle', { help: 'Orders stay pending until an admin verifies the payment.' }), field('manual_payment_methods', 'Manual payment methods', 'multiSelect', { help: 'Select the methods shown at checkout.' }), field('manual_payment_instructions', 'Payment instructions', 'textarea', { help: 'Bank account, UPI ID or payment proof instructions shown to customers.' })] },
 { id: 'referrals', title: 'Referral attribution', description: 'Decide which referral gets purchase credit.', icon: Link2, tone: 'pink', fields: [field('attribution_model', 'Attribution model', 'select')] },
 { id: 'refunds', title: 'Cancellation & refunds', description: 'Customer cancellation window and refund messaging.', icon: ReceiptIndianRupee, tone: 'red', superAdminOnly: true, fields: [field('cancellation_time_window', 'Cancellation window', 'number', { suffix: 'hours' }), field('cancellation_max_status', 'Cancel allowed up to', 'select'), field('cancellation_auto_refund', 'Auto-refund cancellation', 'toggle'), field('refund_processing_days_min', 'Refund time minimum', 'number', { suffix: 'business days' }), field('refund_processing_days_max', 'Refund time maximum', 'number', { suffix: 'business days' }), field('cancellation_reasons', 'Cancellation reasons', 'list')] },
];

const DEFAULT_SETTINGS = {
 site_name: PLATFORM_NAME, site_tagline: 'AI-Powered Shopping', currency: 'INR', currency_symbol: '₹',
 country: 'India', timezone: 'Asia/Kolkata', locale: 'en-IN', date_format: 'DD/MM/YYYY', weight_unit: 'kg', phone_code: '+91',
 free_shipping_threshold: 999, standard_shipping_cost: 49, tax_rate: 18, attribution_model: 'last_click', cod_enabled: true,
 cancellation_time_window: 48, cancellation_max_status: 'packed', cancellation_auto_refund: true,
 cancellation_reasons: ['Changed my mind', 'Found a better price elsewhere', 'Ordered by mistake', 'Delivery taking too long'],
 refund_processing_days_min: 5, refund_processing_days_max: 7, active_shipping_provider: 'shiprocket', active_payment_provider: 'razorpay', active_payment_providers: ['razorpay'], manual_payment_enabled: false, manual_payment_methods: ['manual'], manual_payment_instructions: '',
};

const TONES = {
 indigo: { icon: 'bg-indigo-50 text-indigo-600', dot: 'bg-indigo-500', border: 'hover:border-indigo-300' },
 emerald: { icon: 'bg-emerald-50 text-emerald-600', dot: 'bg-emerald-500', border: 'hover:border-emerald-300' },
 violet: { icon: 'bg-violet-50 text-violet-600', dot: 'bg-violet-500', border: 'hover:border-violet-300' },
 orange: { icon: 'bg-orange-50 text-orange-600', dot: 'bg-orange-500', border: 'hover:border-orange-300' },
 blue: { icon: 'bg-blue-50 text-blue-600', dot: 'bg-blue-500', border: 'hover:border-blue-300' },
 yellow: { icon: 'bg-amber-50 text-amber-600', dot: 'bg-amber-500', border: 'hover:border-amber-300' },
 green: { icon: 'bg-green-50 text-green-600', dot: 'bg-green-500', border: 'hover:border-green-300' },
 pink: { icon: 'bg-pink-50 text-pink-600', dot: 'bg-pink-500', border: 'hover:border-pink-300' },
 red: { icon: 'bg-rose-50 text-rose-600', dot: 'bg-rose-500', border: 'hover:border-rose-300' },
 slate: { icon: 'bg-slate-100 text-slate-600', dot: 'bg-slate-500', border: 'hover:border-slate-300' },
};

const SettingsCard = ({ group, settings, onOpen }) => {
 const Icon = group.icon;
 const tone = TONES[group.tone] || TONES.slate;
 const configured = group.fields.filter(item => settings[item.key] !== undefined && settings[item.key] !== '').length;
 return <button type="button" onClick={() => onOpen(group)} className={`group w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${tone.border}`}>
  <div className="flex items-start justify-between gap-3"><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone.icon}`}><Icon size={18} /></span><ChevronRight size={17} className="mt-1 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-600" /></div>
  <div className="mt-4"><h2 className="text-sm font-bold text-slate-900">{group.title}</h2><p className="mt-1 min-h-[32px] text-xs leading-4 text-slate-500">{group.description}</p></div>
  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3"><span className="text-[11px] font-semibold text-slate-400">{configured}/{group.fields.length} controls</span><span className={`h-2 w-2 rounded-full ${tone.dot}`} /></div>
 </button>;
};

const Control = ({ setting, value, onChange }) => {
 if (setting.type === 'toggle') {
  const checked = value !== false && value !== 'false';
  return <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-7 w-12 rounded-full transition ${checked ? 'bg-indigo-600' : 'bg-slate-300'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'right-1' : 'left-1'}`} /></button>;
 }
 if (setting.type === 'list') return <ListEditor value={Array.isArray(value) ? value : []} onChange={onChange} />;
 if (setting.type === 'multiSelect') {
  const selected = Array.isArray(value) ? value : [];
  const toggle = option => {
   const next = selected.includes(option) ? selected.filter(item => item !== option) : [...selected, option];
   if (next.length) onChange(next);
  };
  return <div className="grid gap-2 sm:grid-cols-3">{(OPTIONS[setting.key] || []).map(option => { const checked = selected.includes(option); return <button key={option} type="button" role="checkbox" aria-checked={checked} onClick={() => toggle(option)} className={`rounded-xl border px-3 py-3 text-left text-xs font-bold transition ${checked ? 'border-indigo-500 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-100' : 'border-slate-200 bg-white text-slate-500 hover:border-indigo-300'}`}><span className={`mr-2 inline-flex h-4 w-4 items-center justify-center rounded border text-[10px] ${checked ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white'}`}>{checked ? '✓' : ''}</span>{optionLabel(option)}</button>; })}</div>;
 }
 if (setting.type === 'select') return <select value={value ?? ''} onChange={event => onChange(event.target.value)} className={inputClass}>{(OPTIONS[setting.key] || []).map(option => <option key={option} value={option}>{optionLabel(option)}</option>)}</select>;
 if (setting.type === 'textarea') return <textarea value={value ?? ''} onChange={event => onChange(event.target.value)} rows={5} className={inputClass} />;
 return <div className="relative">{setting.prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">{setting.prefix}</span>}<input type={setting.type} value={value ?? ''} onChange={event => onChange(event.target.value === '' ? '' : setting.type === 'number' ? Number(event.target.value) : event.target.value)} className={`${inputClass} ${setting.prefix ? 'pl-8' : ''} ${setting.suffix ? 'pr-28' : ''}`} />{setting.suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{setting.suffix}</span>}</div>;
};

const ListEditor = ({ value, onChange }) => {
 const [draft, setDraft] = useState('');
 const add = () => { if (!draft.trim()) return; onChange([...value, draft.trim()]); setDraft(''); };
 return <div className="space-y-2"><div className="space-y-2">{value.map((item, index) => <div key={`${item}-${index}`} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><span className="flex-1 text-sm text-slate-700">{item}</span><button type="button" onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></button></div>)}</div><div className="flex gap-2"><input value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); add(); } }} placeholder="Add a reason" className={`${inputClass} flex-1`} /><button type="button" onClick={add} className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 text-xs font-bold text-white hover:bg-indigo-600"><Plus size={14} />Add</button></div></div>;
};

const SettingsDrawer = ({ group, settings, savedSettings, onChange, onClose, onSave, saving }) => {
 const Icon = group.icon;
 const tone = TONES[group.tone] || TONES.slate;
 const dirty = JSON.stringify(settings) !== JSON.stringify(savedSettings);
 return <div className="fixed inset-0 z-[80] bg-slate-950/35 backdrop-blur-[2px]" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
  <aside className="absolute inset-y-0 right-0 flex w-full max-w-[480px] flex-col border-l border-slate-200 bg-white shadow-2xl">
   <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-5"><span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${tone.icon}`}><Icon size={18} /></span><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Settings control</p><h2 className="mt-1 text-lg font-bold text-slate-900">{group.title}</h2><p className="mt-1 text-xs text-slate-500">{group.description}</p></div><button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close settings"><X size={18} /></button></div>
   <div className="flex-1 overflow-y-auto px-5 py-5"><div className="space-y-5">{group.fields.map(setting => <div key={setting.key}><div className="mb-2 flex items-start justify-between gap-3"><div><label className="text-sm font-semibold text-slate-800">{setting.label}</label>{setting.help && <p className="mt-1 text-xs leading-4 text-slate-500">{setting.help}</p>}</div>{setting.type === 'toggle' && <Control setting={setting} value={settings[setting.key]} onChange={value => onChange(setting.key, value)} />}</div>{setting.type !== 'toggle' && <Control setting={setting} value={settings[setting.key]} onChange={value => onChange(setting.key, value)} />}</div>)}</div>{group.id === 'partners' && <p className="mt-6 rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-xs leading-5 text-indigo-700">Credentials are managed separately from the module configuration panel. This control only selects which tested partner handles new traffic.</p>}{group.id === 'refunds' && <p className="mt-6 rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs leading-5 text-rose-700">These controls affect customer-facing cancellation rules and refund expectations.</p>}</div>
   <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4"><span className={`text-xs font-semibold ${dirty ? 'text-amber-600' : 'text-slate-400'}`}>{dirty ? 'Unsaved changes' : 'All changes saved'}</span><div className="flex gap-2"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:border-slate-300">Cancel</button><button type="button" onClick={onSave} disabled={!dirty || saving} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40">{saving ? <Loader size="sm" /> : <Save size={14} />}Save changes</button></div></div>
  </aside>
 </div>;
};

const AdminSettingsPage = () => {
 const { user } = useSelector(state => state.auth);
 const isSuperAdmin = user?.role === 'superadmin';
 const [settings, setSettings] = useState(DEFAULT_SETTINGS);
 const [savedSettings, setSavedSettings] = useState(DEFAULT_SETTINGS);
 const [selectedGroup, setSelectedGroup] = useState(null);
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);

 useEffect(() => {
 adminAPI.getSettings().then(response => {
   const raw = response.data.settings || {};
   const hasPaymentProviders = Object.prototype.hasOwnProperty.call(raw, 'active_payment_providers');
   const paymentProviders = Array.isArray(raw.active_payment_providers)
    ? raw.active_payment_providers
    : raw.active_payment_provider ? [raw.active_payment_provider] : hasPaymentProviders ? [] : [DEFAULT_SETTINGS.active_payment_provider];
   const activeShippingProvider = Object.prototype.hasOwnProperty.call(raw, 'active_shipping_provider')
    ? raw.active_shipping_provider || null
    : DEFAULT_SETTINGS.active_shipping_provider;
   const next = { ...DEFAULT_SETTINGS, ...raw, site_name: displayPlatformName(raw.site_name || DEFAULT_SETTINGS.site_name), active_shipping_provider: activeShippingProvider, active_payment_providers: paymentProviders, active_payment_provider: paymentProviders[0] || null };
   setSettings(next); setSavedSettings(next);
  }).catch(error => toast.error(error.message || 'Could not load settings')).finally(() => setLoading(false));
 }, []);

 const groups = SETTINGS_GROUPS.filter(group => !group.superAdminOnly || isSuperAdmin);

 const openGroup = group => setSelectedGroup(group);
 const updateSetting = (key, value) => setSettings(current => ({ ...current, [key]: value }));
 const saveGroup = async () => {
  if (!selectedGroup) return;
  setSaving(true);
  try {
   const changed = Object.fromEntries(selectedGroup.fields.filter(item => JSON.stringify(settings[item.key]) !== JSON.stringify(savedSettings[item.key])).map(item => [item.key, settings[item.key]]));
   if (Object.keys(changed).length) await adminAPI.updateSettings(changed);
   const hasPaymentProviders = Object.prototype.hasOwnProperty.call(changed, 'active_payment_providers');
   const hasShippingProvider = Object.prototype.hasOwnProperty.call(changed, 'active_shipping_provider');
   const paymentSync = hasPaymentProviders ? { active_payment_provider: changed.active_payment_providers?.[0] || null } : {};
   const nextSaved = { ...savedSettings, ...changed, ...paymentSync };
   setSavedSettings(nextSaved); setSettings(current => ({ ...current, ...changed, ...paymentSync }));
   if (hasShippingProvider) window.dispatchEvent(new CustomEvent('active-shipping-provider-updated', { detail: { provider: changed.active_shipping_provider || null } }));
   if (hasPaymentProviders) window.dispatchEvent(new CustomEvent('active-payment-providers-updated', { detail: { providers: changed.active_payment_providers || [] } }));
   setSelectedGroup(null); toast.success(`${selectedGroup.title} updated`);
  } catch (error) { toast.error(error.message || 'Could not save settings'); }
  finally { setSaving(false); }
 };

 if (loading) return <div className="flex justify-center py-20"><Loader size="lg" /></div>;

 return <>
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
   {groups.map(group => <SettingsCard key={group.id} group={group} settings={settings} onOpen={openGroup} />)}
  </div>
  {selectedGroup && <SettingsDrawer group={selectedGroup} settings={settings} savedSettings={savedSettings} onChange={updateSetting} onClose={() => { setSettings(savedSettings); setSelectedGroup(null); }} onSave={saveGroup} saving={saving} />}
 </>;
};

export default AdminSettingsPage;
