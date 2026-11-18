import { useEffect, useState } from 'react';
import { BadgePercent, FileText, Save, ShieldCheck } from 'lucide-react';
import { adminAPI } from '../../services/api';
import Loader from '../../components/common/Loader';
import toast from 'react-hot-toast';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100';
const blankProfile = {
  enabled: true,
  registrationType: 'unregistered',
  pricingMode: 'exclusive',
  defaultRate: 18,
  originState: '',
  sellerGstin: '',
  gstInvoiceOwner: 'seller',
  businessName: '',
  businessAddress: { line1: '', line2: '', city: '', state: '', pincode: '', country: 'India' },
  invoicePrefix: 'INV',
  shippingTaxable: false,
  invoiceNote: '',
  gstComponents: { cgst: true, sgst: true, igst: true, utgst: true, cess: false },
};

const AdminTaxPage = () => {
  const [profile, setProfile] = useState(blankProfile);
  const [source, setSource] = useState('legacy_settings');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminAPI.getTaxProfile()
      .then(response => {
        const next = response.data?.profile || {};
        setProfile({ ...blankProfile, ...next, businessAddress: { ...blankProfile.businessAddress, ...(next.businessAddress || {}) } });
        setSource(next.source || 'legacy_settings');
      })
      .catch(error => toast.error(error.message || 'Could not load tax profile'))
      .finally(() => setLoading(false));
  }, []);

  const update = (key, value) => setProfile(current => ({ ...current, [key]: value }));
  const updateAddress = (key, value) => setProfile(current => ({ ...current, businessAddress: { ...current.businessAddress, [key]: value } }));
  const updateComponent = (key, value) => setProfile(current => ({ ...current, gstComponents: { ...current.gstComponents, [key]: value } }));

  const save = async () => {
    setSaving(true);
    try {
      const response = await adminAPI.updateTaxProfile(profile);
      const next = response.data?.profile || profile;
      setProfile({ ...blankProfile, ...next, businessAddress: { ...blankProfile.businessAddress, ...(next.businessAddress || {}) } });
      setSource('tenant_profile');
      toast.success('Tax profile saved');
    } catch (error) {
      toast.error(error.message || 'Could not save tax profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex min-h-[320px] items-center justify-center"><Loader /></div>;

  return <main data-testid="tax-profile-page" className="min-h-full bg-slate-50 p-4 sm:p-6 lg:p-8">
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Commerce compliance</p><h1 className="mt-2 text-2xl font-bold text-slate-900">Tax & GST profile</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Configure the tenant tax authority used for checkout, order records and future GST invoices.</p></div>
        <span data-testid="tax-profile-source" className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500">{source === 'tenant_profile' ? 'Tenant profile active' : 'Legacy rate fallback'}</span>
      </header>

      <section className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3 border-b border-slate-100 pb-4"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><BadgePercent size={18} /></span><div><h2 className="font-bold text-slate-900">Checkout tax rules</h2><p className="mt-1 text-xs text-slate-500">These values are re-read by the server for every order.</p></div></div>
          <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"><span><span className="block text-sm font-semibold text-slate-800">Enable tax calculation</span><span className="mt-1 block text-xs text-slate-500">Turn off only when this store is tax-exempt.</span></span><input data-testid="tax-enabled" type="checkbox" checked={profile.enabled !== false} onChange={event => update('enabled', event.target.checked)} className="h-5 w-5 accent-indigo-600" /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Registration type<select data-testid="tax-registration-type" value={profile.registrationType} onChange={event => update('registrationType', event.target.value)} className={`${inputClass} mt-1 normal-case`}><option value="unregistered">Unregistered / other tax</option><option value="gstin">GST registered</option></select></label>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Pricing mode<select data-testid="tax-pricing-mode" value={profile.pricingMode} onChange={event => update('pricingMode', event.target.value)} className={`${inputClass} mt-1 normal-case`}><option value="exclusive">Tax exclusive</option><option value="inclusive">Tax inclusive</option></select></label>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Default GST / tax rate<input data-testid="tax-default-rate" type="number" min="0" max="100" step="0.01" value={profile.defaultRate ?? ''} onChange={event => update('defaultRate', event.target.value === '' ? '' : Number(event.target.value))} className={`${inputClass} mt-1 normal-case`} /></label>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Seller state<input data-testid="tax-origin-state" value={profile.originState || ''} onChange={event => update('originState', event.target.value)} maxLength={100} placeholder="Delhi" className={`${inputClass} mt-1 normal-case`} /></label>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500 sm:col-span-2">Seller GSTIN<input data-testid="tax-seller-gstin" value={profile.sellerGstin || ''} onChange={event => update('sellerGstin', event.target.value.toUpperCase().slice(0, 15))} maxLength={15} placeholder="29ABCDE1234F1Z5" className={`${inputClass} mt-1 normal-case`} /></label>
          </div>
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4" data-testid="tax-gst-owner">
            <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Invoice GST owner</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Choose whose GST identity is printed and used for tax on seller product lines. This policy is captured on each new order.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {[['seller', 'Seller GST', 'Use the GSTIN saved by the seller on their profile.'], ['admin', 'Admin / platform GST', 'Use this tenant GST profile for every invoice line.']].map(([value, label, help]) => (
                <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 ${profile.gstInvoiceOwner === value ? 'border-indigo-400 bg-white' : 'border-transparent bg-white/60'}`}>
                  <input type="radio" name="gstInvoiceOwner" value={value} checked={profile.gstInvoiceOwner === value} onChange={event => update('gstInvoiceOwner', event.target.value)} className="mt-1 h-4 w-4 accent-indigo-600" />
                  <span><span className="block text-sm font-semibold text-slate-800">{label}</span><span className="mt-1 block text-[11px] leading-4 text-slate-500">{help}</span></span>
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3"><input data-testid="tax-shipping-taxable" type="checkbox" checked={profile.shippingTaxable === true} onChange={event => update('shippingTaxable', event.target.checked)} className="h-4 w-4 accent-indigo-600" /><span><span className="block text-sm font-semibold text-slate-800">Apply tax to shipping charges</span><span className="mt-1 block text-xs text-slate-500">Apply the default tax rate to shipping charges when enabled.</span></span></label>
          <div className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">GST components</p><p className="mt-1 text-xs text-slate-500">The server chooses intra-state CGST + SGST or inter-state IGST from the seller and customer states.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{[['cgst', 'CGST'], ['sgst', 'SGST'], ['igst', 'IGST'], ['utgst', 'UTGST'], ['cess', 'Cess']].map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input data-testid={`tax-component-${key}`} type="checkbox" checked={profile.gstComponents?.[key] === true} onChange={event => updateComponent(key, event.target.checked)} className="h-4 w-4 accent-indigo-600" />{label}</label>)}</div></div>
        </div>

        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3 border-b border-slate-100 pb-4"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><FileText size={18} /></span><div><h2 className="font-bold text-slate-900">Invoice identity</h2><p className="mt-1 text-xs text-slate-500">Stored as an order snapshot for invoice generation.</p></div></div>
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Business name<input data-testid="tax-business-name" value={profile.businessName || ''} onChange={event => update('businessName', event.target.value)} maxLength={200} placeholder="Your registered business" className={`${inputClass} mt-1 normal-case`} /></label>
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Invoice number prefix<input data-testid="tax-invoice-prefix" value={profile.invoicePrefix || ''} onChange={event => update('invoicePrefix', event.target.value.toUpperCase())} placeholder="INV" maxLength={20} className={`${inputClass} mt-1 normal-case`} /><span className="mt-1 block text-[11px] font-normal normal-case text-slate-400">Used in tenant-scoped fiscal invoice numbers, for example INV/26-27/000001.</span></label>
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Address line 1<input value={profile.businessAddress?.line1 || ''} onChange={event => updateAddress('line1', event.target.value)} maxLength={200} className={`${inputClass} mt-1 normal-case`} /></label>
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold uppercase tracking-wide text-slate-500">City<input value={profile.businessAddress?.city || ''} onChange={event => updateAddress('city', event.target.value)} maxLength={100} className={`${inputClass} mt-1 normal-case`} /></label><label className="text-xs font-bold uppercase tracking-wide text-slate-500">Pincode<input value={profile.businessAddress?.pincode || ''} onChange={event => updateAddress('pincode', event.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} inputMode="numeric" className={`${inputClass} mt-1 normal-case`} /></label></div>
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Invoice note<textarea value={profile.invoiceNote || ''} onChange={event => update('invoiceNote', event.target.value)} rows="3" maxLength="500" placeholder="Thank you for shopping with us" className={`${inputClass} mt-1 resize-none normal-case`} /></label>
          <div className="flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs leading-5 text-emerald-700"><ShieldCheck size={15} className="mt-0.5 shrink-0" />Prices and tax are recalculated from MongoDB during order creation. Browser totals are display-only.</div>
          <button data-testid="tax-save" type="button" onClick={save} disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50">{saving ? <Loader size="sm" /> : <Save size={16} />}{saving ? 'Saving…' : 'Save tax profile'}</button>
        </div>
      </section>
    </div>
  </main>;
};

export default AdminTaxPage;
