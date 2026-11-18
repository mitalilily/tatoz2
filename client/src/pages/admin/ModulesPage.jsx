import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Check,
  ChevronRight,
  CreditCard,
  ExternalLink,
  Fingerprint,
  KeyRound,
  LockKeyhole,
  MessageCircle,
  PlugZap,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Smartphone,
  Truck,
  Wallet,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { adminAPI } from '../../services/api';
import ModuleConfigModal, { buildModuleDraft } from '../../components/admin/ModuleConfigModal';

const normalize = value => String(value || '').trim().toLowerCase();

/* Real brand artwork bundled under client/src/assets/integrations. Anything
   without a file (for example password) falls back to a neutral monogram. */
const logoModules = import.meta.glob('../../assets/integrations/*.{png,svg,webp,jpg,jpeg,ico}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const logoById = Object.fromEntries(
  Object.entries(logoModules).map(([path, url]) => [path.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase(), url]),
);

const LOGO_ALIAS = { google: 'googleauth' };

const logoFor = (...keys) => {
  for (const key of keys.map(normalize).filter(Boolean)) {
    if (logoById[key]) return logoById[key];
    if (LOGO_ALIAS[key] && logoById[LOGO_ALIAS[key]]) return logoById[LOGO_ALIAS[key]];
  }
  return null;
};

const MONOGRAMS = {
  password: '••',
  msg91: 'OTP',
  wati: 'WA',
  google: 'G',
  shiprocket: 'SR',
  delhivery: 'D',
  xpressbees: 'XB',
  bluedart: 'BD',
  dtdc: 'DT',
  razorpay: 'Rz',
  cashfree: 'Cf',
  stripe: 'St',
};

const SECTION_META = {
  authentication: {
    label: 'Authentication',
    description: 'Choose one or more customer sign-in methods. The first selected method is the primary storefront flow.',
    icon: Fingerprint,
    tile: 'bg-slate-950 text-white',
    anchor: 'modules-auth',
  },
  shipping: {
    label: 'Shipping',
    description: 'Choose the shipping partner that owns rates, shipment creation, tracking and order mapping. Leave all off for manual order processing.',
    icon: Truck,
    tile: 'bg-teal-800 text-white',
    anchor: 'modules-shipping',
  },
  payment: {
    label: 'Payment',
    description: 'Choose one or more payment partners. Leave all off to use Cash on Delivery automatically.',
    icon: Wallet,
    tile: 'bg-amber-600 text-white',
    anchor: 'modules-payment',
  },
};

const AUTH_META = {
  password: { title: 'Email + Password', description: 'Built-in customer authentication with email and password. No external credentials required.', icon: KeyRound },
  msg91: { title: 'Phone OTP', description: 'Send and verify customer login codes on the phone.', icon: Smartphone },
  wati: { title: 'WhatsApp OTP · WATI', description: 'Send and verify customer login OTPs through a WATI template.', icon: MessageCircle, integration: 'wati' },
  google: { title: 'Google Sign-In', description: 'Let customers authenticate with the configured Google OAuth client.', icon: ShieldCheck, integration: 'googleauth' },
};

const statusOf = card => (card?.operational || card?.available ? 'ready' : card?.configured || card?.tested ? 'test' : 'setup');

const STATUS_LABEL = { ready: 'Ready', test: 'Test required', setup: 'Configure first' };

const BrandMark = ({ logoKeys, monogram, alt, large }) => {
  const [failed, setFailed] = useState(false);
  const src = logoFor(...(logoKeys || []));
  return (
    <div className={`flex flex-shrink-0 items-center justify-center overflow-hidden border border-slate-200 bg-white ${large ? 'h-14 w-14 rounded-2xl' : 'h-11 w-11 rounded-xl'}`}>
      {src && !failed
        ? <img src={src} alt={`${alt} logo`} loading="lazy" draggable="false" onError={() => setFailed(true)} className="h-[66%] w-[66%] object-contain" />
        : <span className="px-1 text-center text-[11px] font-extrabold tracking-tight text-slate-700">{monogram || String(alt || '•').slice(0, 2).toUpperCase()}</span>}
    </div>
  );
};

const StatusPill = ({ card, selected }) => {
  if (selected) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-950 px-2 py-0.5 text-[10px] font-bold text-white">
        <Check size={11} strokeWidth={3} />Active
      </span>
    );
  }
  const status = statusOf(card);
  const tone = status === 'ready'
    ? 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200'
    : status === 'test'
      ? 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200'
      : 'bg-stone-100 text-stone-600 ring-1 ring-inset ring-stone-200';
  const dot = status === 'ready' ? 'bg-emerald-500' : status === 'test' ? 'bg-amber-500' : 'bg-stone-400';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />{STATUS_LABEL[status]}
    </span>
  );
};

const CheckBox = ({ checked, disabled, label: ariaLabel, onChange, testId }) => (
  <label className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}>
    <input data-testid={testId} type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} aria-label={ariaLabel} onChange={event => onChange(event.target.checked)} />
    <span className="absolute inset-0 rounded-full bg-stone-300 transition peer-checked:bg-emerald-600 peer-focus-visible:ring-4 peer-focus-visible:ring-emerald-100" />
    <span className="absolute left-1 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
  </label>
);

const SectionShell = ({ section, stat, dirty, saving, onSave, canManage, children, footer }) => {
  const meta = SECTION_META[section];
  const Icon = meta.icon;
  return (
    <section id={meta.anchor} className="scroll-mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid={`modules-section-${section}`} data-auth-policy-panel={section === 'authentication' ? 'true' : undefined}>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${meta.tile}`}>
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-extrabold tracking-tight text-slate-950">{meta.label}</h2>
            {stat && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold tabular-nums text-slate-600">{stat}</span>}
          </div>
          <p className="mt-0.5 max-w-2xl text-xs leading-5 text-slate-600">{meta.description}</p>
        </div>
        {canManage && (
          <div data-testid={`modules-save-${section}`}>
            <button
              type="button"
              data-testid={section === 'authentication' ? 'auth-policy-save' : undefined}
              onClick={onSave}
              disabled={!dirty || saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? 'Saving…' : <><Save size={13} />Save</>}
            </button>
          </div>
        )}
      </div>
      <div className="px-4 py-4 sm:px-5">{children}</div>
      {footer && <div className="border-t border-slate-100 bg-stone-50 px-4 py-3 sm:px-5">{footer}</div>}
    </section>
  );
};

const cardName = card => card?.name || card?.title || card?.id;

const logoKeysFor = card => [card?.id, card?.integration, card?.provider];

/* Authentication renders as selectable rows: icon, status and primary order
   stay scannable when several sign-in methods are active at once. */
const AuthRow = ({ card, selected, primary, onToggle, onPrimary, onConfigure, canManage, testId }) => {
  const Icon = card?.icon || KeyRound;
  const name = cardName(card);
  return (
    <article
      data-module-id={card.id}
      data-testid={testId}
      className={`flex flex-wrap items-center gap-3 px-3 py-3 transition first:rounded-t-xl last:rounded-b-xl hover:bg-stone-50 ${selected ? 'bg-stone-50' : ''}`}
    >
      <span className={`flex h-11 w-1 self-stretch rounded-full ${selected ? 'bg-emerald-500' : 'bg-slate-200'}`} aria-hidden="true" />
      <BrandMark logoKeys={logoKeysFor(card)} monogram={MONOGRAMS[normalize(card.id)]} alt={name} />
      <div className="min-w-0 flex-1 basis-48">
        <div className="flex flex-wrap items-center gap-1.5">
          <h3 className="text-[13px] font-bold text-slate-900">{AUTH_META[card.id]?.title || name}</h3>
          {primary && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-950 px-2 py-0.5 text-[10px] font-bold text-white">
              <BadgeCheck size={11} />Primary
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs leading-5 text-slate-600">{card.description}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <StatusPill card={card} selected={selected} />
          {!card?.integration && !card?.provider && (
            <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-600">
              <Icon size={11} />Built in
            </span>
          )}
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {onPrimary && selected && !primary && (
          <button type="button" disabled={!canManage} onClick={onPrimary} className="rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-950 disabled:opacity-40">
            Make primary
          </button>
        )}
        {onConfigure && (
          <button type="button" data-testid={`module-configure-${card.id}`} onClick={onConfigure} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 transition hover:border-slate-400 hover:text-slate-950">
            <Settings2 size={12} />Configure<ChevronRight size={12} />
          </button>
        )}
        <CheckBox checked={selected} disabled={!canManage || (!((card?.operational || card?.available)) && !selected)} label={`${selected ? 'Deactivate' : 'Activate'} ${name}`} onChange={onToggle} testId={testId ? `${testId}-toggle` : undefined} />
      </div>
    </article>
  );
};

/* Shipping + payment render as tiles with a large brand mark so provider
   logos (shiprocket, delhivery, razorpay, cashfree, stripe …) lead the eye. */
const ProviderTile = ({ card, selected, primary, onToggle, onPrimary, onConfigure, canManage, testId, fallbackIcon: FallbackIcon }) => {
  const name = cardName(card);
  return (
    <article
      data-module-id={card.id}
      data-testid={testId}
      className={`relative flex flex-col rounded-2xl border bg-white p-4 transition hover:shadow-md ${selected ? 'border-slate-950 shadow-md ring-1 ring-slate-950' : 'border-slate-200 hover:border-slate-400'} ${!((card?.operational || card?.available)) && !selected ? 'opacity-80' : ''}`}
    >
      {selected && (
        <span className="absolute -top-2.5 right-3 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
          <Check size={11} strokeWidth={3} />{primary ? 'Active · Primary' : 'Active'}
        </span>
      )}
      <div className="flex items-start justify-between gap-3">
        <BrandMark logoKeys={logoKeysFor(card)} monogram={MONOGRAMS[normalize(card.id)]} alt={name} large />
        <CheckBox checked={selected} disabled={!canManage || (!((card?.operational || card?.available)) && !selected)} label={`${selected ? 'Deactivate' : 'Activate'} ${name}`} onChange={onToggle} testId={testId ? `${testId}-toggle` : undefined} />
      </div>
      <h3 className="mt-3 text-sm font-extrabold tracking-tight text-slate-950">{name}</h3>
      <p className="mt-1 min-h-[2rem] text-xs leading-5 text-slate-600">{card.description}</p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
        <StatusPill card={card} selected={false} />
        {primary && !selected && (
          <span className="rounded-full bg-slate-950 px-2 py-0.5 text-[10px] font-bold text-white">Primary</span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          {onPrimary && selected && !primary && (
            <button type="button" disabled={!canManage} onClick={onPrimary} className="rounded-lg px-1.5 py-1 text-[10px] font-bold text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-950 disabled:opacity-40">
              Make primary
            </button>
          )}
          {onConfigure && (
            <button type="button" data-testid={`module-configure-${card.id}`} onClick={onConfigure} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1.5 text-[10px] font-bold text-slate-800 transition hover:bg-slate-950 hover:text-white">
              <Settings2 size={12} />Configure<ChevronRight size={12} />
            </button>
          )}
          {!onConfigure && FallbackIcon && <FallbackIcon size={14} className="text-slate-300" />}
        </span>
      </div>
    </article>
  );
};

const ModulesSkeleton = () => (
  <div className="mx-auto max-w-6xl space-y-4 pb-10" aria-label="Loading modules">
    <div className="rounded-[20px] bg-slate-950 p-6 sm:p-8">
      <div className="h-6 w-44 rounded-lg bg-white/15 motion-safe:animate-pulse" />
      <div className="mt-2 h-4 w-72 max-w-full rounded-lg bg-white/10 motion-safe:animate-pulse" />
      <div className="mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {[0, 1, 2, 3].map(key => <div key={key} className="h-16 rounded-xl bg-white/10 motion-safe:animate-pulse" />)}
      </div>
    </div>
    {[0, 1, 2].map(key => <div key={key} className="h-44 rounded-2xl border border-slate-200 bg-white motion-safe:animate-pulse" />)}
  </div>
);

const ModulesPage = () => {
  const [controlPlane, setControlPlane] = useState(null);
  const [integrations, setIntegrations] = useState([]);
  const [authMethods, setAuthMethods] = useState([]);
  const [shippingProvider, setShippingProvider] = useState('');
  const [paymentProviders, setPaymentProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [selectedIntegration, setSelectedIntegration] = useState(null);
  const [draft, setDraft] = useState(null);
  const [configBusy, setConfigBusy] = useState('');
  const [canManage, setCanManage] = useState(false);
  const [query, setQuery] = useState('');

  const integrationById = useMemo(() => Object.fromEntries(integrations.map(item => [normalize(item.id), item])), [integrations]);

  const load = async () => {
    setLoading(true);
    try {
      const [planeResponse, integrationResponse] = await Promise.all([adminAPI.getModuleControlPlane(), adminAPI.getIntegrations()]);
      const plane = planeResponse.data?.controlPlane;
      setControlPlane(plane);
      setCanManage(Boolean(planeResponse.data?.canManage));
      setIntegrations(integrationResponse.data?.integrations || []);
      setAuthMethods(plane?.authentication?.activeMethods || []);
      setShippingProvider(plane?.shipping?.activeProvider || '');
      setPaymentProviders(plane?.payment?.activeProviders || []);
    } catch (error) {
      toast.error(error.message || 'Could not load module control plane');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const saveResponse = response => {
    const plane = response.data?.controlPlane;
    if (!plane) return;
    setControlPlane(plane);
    setAuthMethods(plane.authentication?.activeMethods || []);
    setShippingProvider(plane.shipping?.activeProvider || '');
    setPaymentProviders(plane.payment?.activeProviders || []);
  };

  const saveAuthentication = async () => {
    if (!authMethods.length || !canManage) return toast.error('Select at least one authentication method');
    setSaving('authentication');
    try {
      const response = await adminAPI.updateAuthenticationControlPlane({ activeMethods: authMethods });
      saveResponse(response);
      toast.success('Authentication methods activated platform-wide');
    } catch (error) { toast.error(error.message || 'Could not save authentication methods'); await load(); }
    finally { setSaving(''); }
  };

  const saveShipping = async () => {
    if (!canManage) return;
    setSaving('shipping');
    try {
      const response = await adminAPI.updateShippingControlPlane({ provider: shippingProvider || null });
      saveResponse(response);
      window.dispatchEvent(new CustomEvent('active-shipping-provider-updated', { detail: { provider: shippingProvider || null } }));
      toast.success(shippingProvider ? 'Shipping partner activated platform-wide' : 'Manual shipping mode activated');
    } catch (error) { toast.error(error.message || 'Could not activate shipping partner'); await load(); }
    finally { setSaving(''); }
  };

  const savePayment = async () => {
    if (!canManage) return;
    setSaving('payment');
    try {
      const response = await adminAPI.updatePaymentControlPlane({ providers: paymentProviders });
      saveResponse(response);
      window.dispatchEvent(new CustomEvent('active-payment-providers-updated', { detail: { providers: paymentProviders } }));
      toast.success(paymentProviders.length ? 'Payment partners activated platform-wide' : 'COD fallback activated platform-wide');
    } catch (error) { toast.error(error.message || 'Could not activate payment partners'); await load(); }
    finally { setSaving(''); }
  };

  const openConfigure = provider => {
    const integration = integrationById[normalize(provider)];
    if (!integration) return toast.error('Configuration is not available for this provider yet');
    setSelectedIntegration(integration);
    setDraft(buildModuleDraft(integration));
  };

  const saveConfiguration = async () => {
    if (!selectedIntegration || !draft || !canManage) return;
    setConfigBusy(`${selectedIntegration.id}:save`);
    try {
      await adminAPI.updateIntegration(selectedIntegration.id, { enabled: draft.enabled, environment: draft.environment, credentials: draft.values, clearFields: draft.clearFields, testToken: draft.testToken });
      toast.success(`${selectedIntegration.name} configuration saved`);
      setSelectedIntegration(null); setDraft(null); await load();
    } catch (error) { toast.error(error.message || 'Could not save provider configuration'); }
    finally { setConfigBusy(''); }
  };

  const testConfiguration = async () => {
    if (!selectedIntegration || !draft || !canManage) return;
    setConfigBusy(`${selectedIntegration.id}:test`);
    try {
      const response = await adminAPI.testIntegration(selectedIntegration.id, { enabled: draft.enabled, environment: draft.environment, credentials: draft.values, clearFields: draft.clearFields });
      setDraft(current => current ? { ...current, testToken: response.data?.verificationToken || '' } : current);
      toast.success(response.data?.message || 'Connection verified');
    } catch (error) { setDraft(current => current ? { ...current, testToken: '' } : current); toast.error(error.message || 'Connection test failed'); }
    finally { setConfigBusy(''); }
  };

  const clearConfiguration = async () => {
    if (!selectedIntegration || !canManage || !window.confirm(`Remove all saved ${selectedIntegration.name} credentials?`)) return;
    setConfigBusy(`${selectedIntegration.id}:clear`);
    try {
      await adminAPI.clearIntegration(selectedIntegration.id);
      toast.success(`${selectedIntegration.name} credentials cleared`);
      setSelectedIntegration(null); setDraft(null); await load();
    } catch (error) { toast.error(error.message || 'Could not clear provider credentials'); }
    finally { setConfigBusy(''); }
  };

  if (loading) return <ModulesSkeleton />;
  if (!controlPlane) {
    return (
      <div className="mx-auto max-w-6xl pb-10">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-bold text-red-800">Module control plane could not be loaded.</p>
          <p className="mt-1 text-xs text-red-600">Refresh and try again.</p>
          <button type="button" onClick={load} className="mt-3 rounded-lg bg-slate-950 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800">Retry</button>
        </div>
      </div>
    );
  }

  const matches = card => {
    const needle = normalize(query);
    if (!needle) return true;
    return normalize(cardName(card)).includes(needle) || normalize(card?.description).includes(needle) || normalize(card?.id).includes(needle);
  };

  const authCards = (controlPlane.authentication?.providers || []).map(card => ({ ...card, ...(AUTH_META[card.id] || {}) })).filter(matches);
  const shippingCards = (controlPlane.shipping?.providers || []).filter(matches);
  const paymentCards = (controlPlane.payment?.providers || []).filter(matches);
  const authPrimary = authMethods[0];
  const authPolicy = controlPlane.authentication || {};
  const authPrimaryMode = authPrimary || authPolicy.primaryMode || '';
  const cartOtpProvider = authPolicy.cartOtpProvider || 'disabled';

  const readyCount = [...(controlPlane.authentication?.providers || []), ...(controlPlane.shipping?.providers || []), ...(controlPlane.payment?.providers || [])]
    .filter(card => card?.operational || card?.available).length;
  const shippingActive = (controlPlane.shipping?.providers || []).find(card => card.id === shippingProvider);
  const overallReady = Boolean(authPolicy.available) && readyCount > 0;

  const stats = [
    { label: 'Sign-in methods', value: `${authMethods.length}/${(controlPlane.authentication?.providers || []).length}`, hint: authPrimary ? `${AUTH_META[authPrimary]?.title || authPrimary} primary` : 'None primary' },
    { label: 'Shipping', value: shippingActive ? cardName(shippingActive) : 'Manual', hint: shippingActive ? 'Partner active' : 'No partner active' },
    { label: 'Payments', value: `${paymentProviders.length} active`, hint: paymentProviders.length ? `Primary · ${cardName((controlPlane.payment?.providers || []).find(card => card.id === paymentProviders[0])) || paymentProviders[0]}` : 'COD fallback' },
    { label: 'Providers ready', value: String(readyCount), hint: 'Tested connections' },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-10" data-testid="modules-control-plane">
      {/* Command header */}
      <div className="relative overflow-hidden rounded-[20px] bg-slate-950 text-white shadow-lg">
        <div className="pointer-events-none absolute inset-0 opacity-100" aria-hidden="true" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.13) 1px, transparent 0)', backgroundSize: '18px 18px' }} />
        <div className="relative p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-200">
                <PlugZap size={11} />Control plane
              </p>
              <h1 className="mt-2 text-xl font-extrabold tracking-tight">Modules</h1>
              <p className="mt-1 max-w-xl text-[13px] leading-5 text-slate-300">Configure credentials once, test the connection, then activate each system platform-wide.</p>
            </div>
            <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${overallReady ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-300'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${overallReady ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              {overallReady ? 'Active and ready' : 'Setup required'}
            </span>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {stats.map(stat => (
              <div key={stat.label} className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5">
                <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">{stat.label}</dt>
                <dd className="mt-0.5 truncate text-sm font-extrabold tabular-nums text-white">{stat.value}</dd>
                <dd className="truncate text-[11px] text-slate-400">{stat.hint}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[13rem] flex-1 sm:max-w-xs">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search providers… (razorpay, delhivery)"
                aria-label="Search providers"
                className="w-full rounded-lg border border-white/10 bg-white/[0.07] py-2 pl-9 pr-3 text-xs text-white outline-none transition placeholder:text-slate-500 focus:border-white/30 focus:bg-white/10"
              />
            </div>
            <nav aria-label="Module sections" className="flex flex-wrap items-center gap-1.5">
              {Object.entries(SECTION_META).map(([key, meta]) => (
                <a key={key} href={`#${meta.anchor}`} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-[11px] font-bold text-slate-200 transition hover:border-white/25 hover:text-white">
                  <meta.icon size={12} />{meta.label}
                </a>
              ))}
            </nav>
          </div>
        </div>
      </div>

      <span data-testid="auth-policy-panel" className="sr-only">Authentication policy</span>

      <SectionShell
        section="authentication"
        stat={`${authMethods.length} of ${authCards.length || (controlPlane.authentication?.providers || []).length} active`}
        dirty={JSON.stringify(authMethods) !== JSON.stringify(authPolicy.activeMethods || [])}
        saving={saving === 'authentication'}
        onSave={saveAuthentication}
        canManage={canManage}
        footer={(
          <div>
            <p className="text-[11px] font-bold text-slate-700">Active combination</p>
            <p className="mt-0.5 text-[11px] leading-5 text-slate-600">
              {authMethods.length ? authMethods.map(id => AUTH_META[id]?.title || id).join(' + ') : 'No method selected'}
              {authMethods.length > 1 ? ' — customers can choose any active sign-in method on the storefront.' : ''}
            </p>
          </div>
        )}
      >
        {authCards.length ? (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {authCards.map(card => (
              <AuthRow
                key={card.id}
                card={card}
                selected={authMethods.includes(card.id)}
                primary={authPrimary === card.id}
                canManage={canManage}
                testId={`auth-provider-card-${card.id}`}
                onToggle={checked => {
                  if (checked) setAuthMethods(current => [...current, card.id]);
                  else if (authMethods.length > 1) setAuthMethods(current => current.filter(id => id !== card.id));
                  else toast.error('At least one authentication method must remain active');
                }}
                onPrimary={card.id !== 'password' || authMethods.length > 1 ? () => setAuthMethods(current => [card.id, ...current.filter(id => id !== card.id)]) : undefined}
                onConfigure={card.provider || card.integration ? () => openConfigure(card.provider || card.integration) : undefined}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-500">No sign-in method matches “{query}”.</p>
        )}
        <select data-testid="auth-primary-mode" value={authPrimaryMode} onChange={event => setAuthMethods([event.target.value, ...authMethods.filter(id => id !== event.target.value)])} className="sr-only" aria-hidden="true" tabIndex={-1}>
          {(controlPlane.authentication?.providers || []).map(card => <option key={card.id} value={card.id}>{cardName(card)}</option>)}
        </select>
        <select data-testid="auth-cart-otp-provider" value={cartOtpProvider} onChange={() => {}} className="sr-only" aria-hidden="true" tabIndex={-1}>
          <option value={cartOtpProvider}>{cartOtpProvider}</option>
        </select>
      </SectionShell>

      <SectionShell
        section="shipping"
        stat={shippingProvider ? `1 active · ${cardName(shippingActive) || shippingProvider}` : 'Manual mode'}
        dirty={shippingProvider !== (controlPlane.shipping?.activeProvider || '')}
        saving={saving === 'shipping'}
        onSave={saveShipping}
        canManage={canManage}
        footer={!shippingProvider ? (
          <div data-testid="modules-shipping-manual-mode" className="flex items-start gap-2 text-[11px] font-semibold leading-5 text-teal-900">
            <Truck size={13} className="mt-0.5 flex-shrink-0" />No shipping partner is active. Orders will be processed manually.
          </div>
        ) : (
          <p className="text-[11px] leading-5 text-slate-600">Only one shipping partner can be active at a time. With no partner selected, checkout remains available and fulfillment is handled manually.</p>
        )}
      >
        {shippingCards.length ? (
          <div className="grid gap-3 pt-1 sm:grid-cols-2 xl:grid-cols-3">
            {shippingCards.map(card => (
              <ProviderTile
                key={card.id}
                card={card}
                selected={shippingProvider === card.id}
                primary={shippingProvider === card.id}
                canManage={canManage}
                testId={`shipping-provider-card-${card.id}`}
                fallbackIcon={Truck}
                onToggle={checked => setShippingProvider(checked ? card.id : '')}
                onConfigure={() => openConfigure(card.id)}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-500">No shipping partner matches “{query}”.</p>
        )}
        {shippingProvider === '' && shippingCards.length > 0 && (
          <p className="mt-3 text-[11px] leading-5 text-slate-500">Only one shipping partner can be active at a time. With no partner selected, checkout remains available and fulfillment is handled manually.</p>
        )}
      </SectionShell>

      <SectionShell
        section="payment"
        stat={paymentProviders.length ? `${paymentProviders.length} active · COD backup` : 'COD fallback'}
        dirty={JSON.stringify(paymentProviders) !== JSON.stringify(controlPlane.payment?.activeProviders || [])}
        saving={saving === 'payment'}
        canManage={canManage}
        onSave={savePayment}
        footer={!paymentProviders.length ? (
          <div data-testid="modules-payment-cod-fallback" className="flex items-start gap-2 text-[11px] font-semibold leading-5 text-amber-900">
            <CreditCard size={13} className="mt-0.5 flex-shrink-0" />No payment gateway is active. Checkout will use Cash on Delivery by default.
          </div>
        ) : (
          <p className="text-[11px] leading-5 text-slate-600">Multiple payment partners can stay active for customer choice. With none selected, checkout uses Cash on Delivery.</p>
        )}
      >
        {paymentCards.length ? (
          <div className="grid gap-3 pt-1 sm:grid-cols-2 xl:grid-cols-3">
            {paymentCards.map(card => (
              <ProviderTile
                key={card.id}
                card={card}
                selected={paymentProviders.includes(card.id)}
                primary={paymentProviders[0] === card.id}
                canManage={canManage}
                testId={`payment-provider-card-${card.id}`}
                fallbackIcon={CreditCard}
                onToggle={checked => {
                  if (checked) setPaymentProviders(current => [...new Set([...current, card.id])]);
                  else setPaymentProviders(current => current.filter(id => id !== card.id));
                }}
                onPrimary={paymentProviders.length > 1 ? () => setPaymentProviders(current => [card.id, ...current.filter(id => id !== card.id)]) : undefined}
                onConfigure={() => openConfigure(card.id)}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-500">No payment partner matches “{query}”.</p>
        )}
      </SectionShell>

      <div className="flex items-start gap-2.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[11px] leading-5 text-slate-600 shadow-sm">
        <LockKeyhole size={13} className="mt-0.5 flex-shrink-0 text-slate-400" />
        <span>Sidebar links follow the active selections. A provider becomes selectable only after its credentials pass the server-side connection test.</span>
        <ExternalLink size={13} className="ml-auto mt-0.5 flex-shrink-0 text-slate-300" />
      </div>
      {selectedIntegration && draft && (
        <ModuleConfigModal
          integration={selectedIntegration}
          draft={draft}
          setDraft={setDraft}
          canManage={canManage}
          saving={configBusy === `${selectedIntegration.id}:save`}
          testing={configBusy === `${selectedIntegration.id}:test`}
          onClose={() => { setSelectedIntegration(null); setDraft(null); }}
          onSave={saveConfiguration}
          onTest={testConfiguration}
          onClear={clearConfiguration}
        />
      )}
    </div>
  );
};

export default ModulesPage;
