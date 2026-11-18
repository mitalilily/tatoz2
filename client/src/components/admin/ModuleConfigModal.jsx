import { useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Save,
  Trash2,
  X,
} from 'lucide-react';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-200 placeholder:text-slate-400 disabled:bg-slate-50';

const logoModules = import.meta.glob('../../assets/integrations/*.{png,svg,webp,jpg,jpeg,ico}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const logoById = Object.fromEntries(
  Object.entries(logoModules).map(([path, url]) => [path.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase(), url]),
);

const BRAND_DOMAINS = {
  razorpay: 'razorpay.com', googleauth: 'google.com', msg91: 'trustsignal.io', cashfree: 'cashfree.com', stripe: 'stripe.com',
  r2: 'cloudflare.com', cloudflare_turnstile: 'cloudflare.com', shiprocket: 'shiprocket.in', trustsignal: 'trustsignal.io', delhivery: 'delhivery.com',
  xpressbees: 'xpressbees.com', bluedart: 'bluedart.com', dtdc: 'dtdc.in', wati: 'wati.io', smtp: null,
  fcm: 'firebase.google.com', brevo: 'brevo.com', klaviyo: 'klaviyo.com', ga4: 'analytics.google.com', meta_capi: 'meta.com',
  algolia: 'algolia.com', opensearch: 'opensearch.org', cleartax: 'cleartax.in', iris_gst: 'irisgst.com', ondc: 'ondc.org',
  meesho: 'meesho.com', myntra: 'myntra.com', jiomart: 'jiomart.com', unicommerce: 'unicommerce.com', zoho_inventory: 'zoho.com',
  erpnext: 'erpnext.com', freshdesk: 'freshdesk.com', zendesk: 'zendesk.com', intercom: 'intercom.com', signifyd: 'signifyd.com',
  maxmind: 'maxmind.com', razorpay_risk: 'razorpay.com',
};

const PROVIDER_MARKS = {
  razorpay: 'R', googleauth: 'G', googleAuth: 'G', msg91: 'OTP', cashfree: 'CF', stripe: 'S', r2: 'R2', cloudflare_turnstile: 'CF',
  shiprocket: 'SR', trustsignal: 'TS', delhivery: 'D', xpressbees: 'XB', bluedart: 'BD', dtdc: 'D', wati: 'W', smtp: '@', fcm: 'F', brevo: 'B',
  klaviyo: 'K', ga4: 'GA', meta_capi: 'M', algolia: 'A', opensearch: 'OS', cleartax: 'CT', iris_gst: 'IG', ondc: 'O', meesho: 'M',
  myntra: 'MY', jiomart: 'J', unicommerce: 'UC', zoho_inventory: 'Z', erpnext: 'E', freshdesk: 'FD', zendesk: 'Z', intercom: 'I',
  signifyd: 'S', maxmind: 'MM', razorpay_risk: 'RR',
};

const COLORS = {
  orange: 'bg-orange-50 text-orange-700 border-orange-100',
  blue: 'bg-blue-50 text-blue-700 border-blue-100',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  violet: 'bg-violet-50 text-violet-700 border-violet-100',
  pink: 'bg-pink-50 text-pink-700 border-pink-100',
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
};

const categoryLabel = value => String(value || 'Other').replace(/[-_]/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const providerKey = integration => String(integration?.id || '').trim().toLowerCase();

export const buildModuleDraft = integration => ({
  enabled: Boolean(integration.enabled),
  environment: integration.environment || 'sandbox',
  values: Object.fromEntries((integration.fields || []).map(field => [field.key, field.value ?? ''])),
  clearFields: [],
  testToken: '',
});

const BrandLogo = ({ integration }) => {
  const [failed, setFailed] = useState(false);
  const key = providerKey(integration);
  const source = key === 'msg91' ? null : logoById[key];
  return <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm" data-brand-domain={BRAND_DOMAINS[key] || undefined}>
    {source && !failed
      ? <img src={source} alt={`${integration.name} logo`} loading="lazy" draggable="false" onError={() => setFailed(true)} className="h-[62%] w-[62%] object-contain" />
      : <span className="text-sm font-black tracking-tight text-slate-800">{PROVIDER_MARKS[integration.id] || PROVIDER_MARKS[key] || '•'}</span>}
  </div>;
};

const Toggle = ({ checked, onChange, disabled }) => <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className={`relative h-6 w-10 rounded-full transition ${checked ? 'bg-emerald-600' : 'bg-stone-300'} disabled:opacity-50`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition ${checked ? 'right-1' : 'left-1'}`} /></button>;

const SecretInput = ({ field, value, configured, onChange, onClear, disabled, dataTestId }) => {
  const [visible, setVisible] = useState(false);
  return <div className="relative">
    <input data-testid={dataTestId} className={`${inputClass} pr-16 font-mono text-xs`} type={visible ? 'text' : 'password'} value={value || ''} placeholder={configured ? 'Saved securely · enter to replace' : field.placeholder} disabled={disabled} onChange={event => onChange(event.target.value)} />
    <div className="absolute inset-y-0 right-1 flex items-center">
      <button type="button" disabled={disabled || !configured && !value} onClick={() => setVisible(current => !current)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30" aria-label={visible ? 'Hide secret' : 'Show secret'}>{visible ? <EyeOff size={14} /> : <Eye size={14} />}</button>
      {configured && <button type="button" disabled={disabled} onClick={onClear} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Clear ${field.label}`}><X size={14} /></button>}
    </div>
  </div>;
};

export default function ModuleConfigModal({ integration, draft, setDraft, canManage, saving, testing, onClose, onSave, onTest, onClear }) {
  const setValue = (key, value) => setDraft(current => ({ ...current, values: { ...current.values, [key]: value }, clearFields: current.clearFields.filter(item => item !== key), testToken: '' }));
  const clearValue = key => setDraft(current => ({ ...current, values: { ...current.values, [key]: '' }, clearFields: current.clearFields.includes(key) ? current.clearFields : [...current.clearFields, key], testToken: '' }));
  const accent = COLORS[integration.accent] || COLORS.slate;

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" data-testid="module-config-modal" onMouseDown={onClose}>
    <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl" onMouseDown={event => event.stopPropagation()}>
      <div className={`flex items-start justify-between border-b p-5 ${accent}`}><div className="flex min-w-0 items-start gap-3"><BrandLogo integration={integration} /><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{categoryLabel(integration.category)} module</p><h2 className="mt-1 truncate text-lg font-bold">Configure {integration.name}</h2><p className="mt-1 text-xs opacity-80">{integration.description}</p></div></div><button type="button" onClick={onClose} className="rounded-xl p-2 opacity-60 hover:bg-white/60 hover:opacity-100" aria-label="Close configuration"><X size={18} /></button></div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5"><LockKeyhole size={16} className="mt-0.5 flex-shrink-0 text-emerald-700" /><p className="text-xs leading-5 text-emerald-900"><b>{integration.source === 'environment' ? 'Protected server configuration.' : 'Encrypted module configuration.'}</b> Secret values are never returned to the browser. Leave a saved secret blank to retain it.</p></div>
        <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4"><div><p className="text-sm font-semibold text-slate-800">Provider connection</p><p className="mt-1 text-xs text-slate-500">The module switch on the card controls runtime availability.</p></div><Toggle checked={draft.enabled} onChange={value => setDraft(current => ({ ...current, enabled: value, testToken: '' }))} disabled={!canManage} /></div>
        {integration.id === 'delhivery' && <label className="mb-5 block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">API environment</span><select className={inputClass} value={draft.environment || 'sandbox'} disabled={!canManage} onChange={event => setDraft(current => ({ ...current, environment: event.target.value, testToken: '' }))}><option value="sandbox">Sandbox / Testing</option><option value="production">Production</option></select><span className="mt-1.5 block text-[11px] leading-4 text-slate-500">Use the environment that issued your Delhivery API key. Sandbox and production tokens are different.</span></label>}
        <div className="grid gap-4 sm:grid-cols-2">
          {integration.fields.map(field => field.type === 'boolean' ? <label key={field.key} className="flex items-center justify-between rounded-2xl border border-slate-200 p-3 sm:col-span-2"><span className="text-sm font-medium text-slate-700">{field.label}</span><Toggle checked={Boolean(draft.values[field.key])} onChange={value => setValue(field.key, value)} disabled={!canManage} /></label> : <label key={field.key} className="block"><span className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-600">{field.label}{field.required && <b className="text-red-500">*</b>}{field.secret && <KeyRound size={11} className="text-slate-400" />}</span>{field.secret ? <SecretInput field={field} value={draft.values[field.key]} configured={field.configured && !draft.clearFields.includes(field.key)} onChange={value => setValue(field.key, value)} onClear={() => clearValue(field.key)} disabled={!canManage} dataTestId={`integration-field-${field.key}`} /> : field.type === 'select' ? <select data-testid={`integration-field-${field.key}`} className={inputClass} value={draft.values[field.key] ?? field.defaultValue ?? ''} disabled={!canManage} onChange={event => setValue(field.key, event.target.value)}><option value="sandbox">Sandbox / Testing</option><option value="production">Production</option></select> : <input data-testid={`integration-field-${field.key}`} className={inputClass} type={field.type || 'text'} value={draft.values[field.key] ?? ''} placeholder={field.placeholder} disabled={!canManage} onChange={event => setValue(field.key, event.target.value)} />}</label>)}
        </div>
        {draft.testToken && <p className="mt-4 flex gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-xs leading-5 text-emerald-700"><CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" />Credentials verified. You can save them now.</p>}
        {integration.lastTest?.status === 'failed' && <p className="mt-4 flex gap-2 rounded-2xl border border-red-100 bg-red-50 p-3 text-xs leading-5 text-red-700"><AlertCircle size={14} className="mt-0.5 flex-shrink-0" />{integration.lastTest.message}</p>}
        {integration.docsUrl && <a href={integration.docsUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-slate-900 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-500">Open provider documentation <ExternalLink size={12} /></a>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 p-4"><div>{canManage && <button type="button" onClick={onClear} className="inline-flex items-center gap-1.5 rounded-xl px-2 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"><Trash2 size={14} />Clear</button>}</div><div className="flex gap-2"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">Cancel</button>{canManage && <><button type="button" data-testid="integration-test" onClick={onTest} disabled={testing || saving} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50">{testing ? 'Testing…' : <><Activity size={14} />Test credentials</>}</button><button type="button" data-testid="integration-save" onClick={onSave} disabled={saving || testing || !draft.testToken} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50">{saving ? 'Saving…' : <><Save size={14} />Save configuration</>}</button></>}</div></div>
    </div>
  </div>;
}
