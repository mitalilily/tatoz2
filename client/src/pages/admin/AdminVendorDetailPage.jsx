import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, ExternalLink, Eye, Save, ShieldCheck, Store, XCircle, PauseCircle, PlayCircle } from 'lucide-react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminVendorAPI } from '../../services/api';

const featureOptions = [
  ['catalog', 'Catalog & products'], ['orders', 'Orders'], ['inventory', 'Inventory'],
  ['payouts', 'Payouts'], ['analytics', 'Analytics'], ['seo', 'SEO workspace'],
  ['pageBuilder', 'Pages & AI builder'], ['customStorefront', 'Custom storefront'],
  ['coupons', 'Vendor coupons'], ['customDomain', 'Custom domain'], ['commissions', 'Commission view'],
  ['reports', 'Reports'], ['reviews', 'Reviews'], ['subscriptions', 'Subscription plans'],
];

const defaultFeatures = Object.fromEntries(featureOptions.map(([key]) => [key, true]));

function makeDraft(vendor) {
  return {
    features: { ...defaultFeatures, ...(vendor.features || {}) },
    settings: { minPayoutThreshold: 1000, autoPayout: false, notifyOnNewOrder: true, ...(vendor.settings || {}) },
    storefront: {
      tagline: vendor.storefront?.tagline || '',
      announcement: vendor.storefront?.announcement || '',
      seo: { metaTitle: '', metaDescription: '', canonical: '', ogImage: '', robots: 'index, follow', ...(vendor.storefront?.seo || {}) },
    },
  };
}

export default function AdminVendorDetailPage() {
  const { id } = useParams();
  const [vendor, setVendor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newRate, setNewRate] = useState('');
  const [draft, setDraft] = useState(null);
  const [verificationStatus, setVerificationStatus] = useState('pending');
  const [verificationReason, setVerificationReason] = useState('');
  const [reasonCodes, setReasonCodes] = useState([]);
  const [audit, setAudit] = useState([]);
  const [changeCode, setChangeCode] = useState('DOC_MISSING');
  const [changeNote, setChangeNote] = useState('');
  const [reverifyNote, setReverifyNote] = useState('');
  const [gstForm, setGstForm] = useState({ registrationType: 'unregistered', gstNumber: '' });

  const load = async () => {
    setLoading(true);
    try {
      const response = await adminVendorAPI.getVendorDetail(id);
      const data = response.data.data;
      setVendor(data); setNewRate(data.commissionRate ?? ''); setDraft(makeDraft(data)); setGstForm({ registrationType: data.businessDetails?.gstRegistrationType || 'unregistered', gstNumber: data.businessDetails?.gstNumber || '' });
      setVerificationStatus(data.verification?.status || 'pending'); setVerificationReason(data.verification?.rejectionReason || '');
      const [codes, trail] = await Promise.allSettled([adminVendorAPI.getReasonCodes(), adminVendorAPI.getVendorAudit(id, { limit: 20 })]);
      if (codes.status === 'fulfilled') setReasonCodes(codes.value.data?.data || []);
      if (trail.status === 'fulfilled') setAudit(trail.value.data?.data || []);
    } catch (error) { toast.error(error.response?.data?.error || 'Could not load vendor'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  const storeUrl = useMemo(() => vendor ? (vendor.storeUrl || `${window.location.origin}/store/${vendor.slug}`) : '', [vendor]);
  const copyStoreUrl = async () => { try { await navigator.clipboard.writeText(storeUrl); toast.success('Store preview URL copied'); } catch (_) { toast.error(storeUrl); } };

  const updateStatus = async (action, message) => {
    try { await adminVendorAPI[action](id); toast.success(message); load(); }
    catch (error) { toast.error(error.response?.data?.error || 'Action failed'); }
  };

  const reject = async () => {
    const reason = window.prompt('Reason for rejecting this vendor application:', vendor.rejectionReason || '');
    if (reason === null) return;
    try { await adminVendorAPI.rejectVendor(id, reason); toast.success('Vendor rejected'); load(); }
    catch (error) { toast.error(error.response?.data?.error || 'Reject failed'); }
  };

  const requestChanges = async () => {
    try { await adminVendorAPI.requestChanges(id, { reasonCode: changeCode, note: changeNote }); toast.success('Changes requested'); setChangeNote(''); load(); }
    catch (error) { toast.error(error.response?.data?.message || 'Request failed'); }
  };

  const reverify = async () => {
    if (!window.confirm('Flag this store for re-verification? Payouts pause until documents are approved; the catalog stays live.')) return;
    try { await adminVendorAPI.reverifyVendor(id, { reasonCode: 'ANNUAL_RECHECK', note: reverifyNote }); toast.success('Flagged for re-verification'); setReverifyNote(''); load(); }
    catch (error) { toast.error(error.response?.data?.message || 'Re-verify failed'); }
  };

  const saveCommission = async () => {
    try { await adminVendorAPI.updateCommission(id, Number(newRate)); toast.success('Commission updated'); load(); }
    catch (error) { toast.error(error.response?.data?.error || 'Commission update failed'); }
  };

  const saveSettings = async () => {
    setSaving(true);
    try { await adminVendorAPI.updateSettings(id, draft); toast.success('Vendor controls saved'); load(); }
    catch (error) { toast.error(error.response?.data?.error || 'Settings save failed'); }
    finally { setSaving(false); }
  };

  const saveVerification = async () => {
    try { await adminVendorAPI.updateVerification(id, { status: verificationStatus, rejectionReason: verificationReason }); toast.success('Verification status saved'); load(); }
    catch (error) { toast.error(error.response?.data?.error || 'Verification update failed'); }
  };

  const approveGstChange = async () => {
    const note = window.prompt('Admin note for this GST approval (optional):', 'GST documents reviewed by admin') || '';
    try { await adminVendorAPI.approveGSTChange(id, { ...gstForm, note }); toast.success('GST change approved and locked'); load(); }
    catch (error) { toast.error(error.response?.data?.message || error.response?.data?.error || error.message || 'GST approval failed'); }
  };

  if (loading) return <div className="py-12 text-center text-sm text-slate-400">Loading vendor control center…</div>;
  if (!vendor || !draft) return <div className="py-12 text-center text-red-500">Vendor not found</div>;
  const stats = vendor.operationalStats || {};

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-3"><h1 className="text-2xl font-bold text-slate-900">{vendor.storeName}</h1><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${vendor.status === 'active' ? 'bg-emerald-50 text-emerald-700' : vendor.status === 'suspended' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{vendor.status}</span></div><p className="mt-1 text-sm text-slate-500">Vendor control center · /{vendor.slug}</p></div><div className="flex flex-wrap gap-2"><a href={storeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-indigo-300"><ExternalLink size={15} /> Open store</a><button onClick={copyStoreUrl} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-indigo-300"><Copy size={15} /> Copy preview URL</button>{vendor.status === 'pending' && <button onClick={() => updateStatus('approveVendor', 'Vendor approved')} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"><CheckCircle2 size={15} /> Approve</button>}{vendor.status === 'active' && <button onClick={() => updateStatus('suspendVendor', 'Vendor suspended')} className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white"><PauseCircle size={15} /> Suspend</button>}{vendor.status === 'suspended' && <button onClick={() => updateStatus('reactivateVendor', 'Vendor reactivated')} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"><PlayCircle size={15} /> Reactivate</button>}{vendor.status === 'pending' && <button onClick={reject} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-600"><XCircle size={15} /> Reject</button>}</div></div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">{[['Products', stats.totalProducts], ['Active', stats.activeProducts], ['Orders', stats.totalOrders], ['Store pages', stats.totalPages], ['Published pages', stats.publishedPages]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-xl font-bold text-slate-900">{value ?? 0}</div></div>)}</div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold text-slate-900">Vendor permissions</h2><p className="text-xs text-slate-500">Control which modules this vendor can access. API permissions follow these flags.</p></div><ShieldCheck size={20} className="text-indigo-500" /></div><div className="grid gap-2 sm:grid-cols-2">{featureOptions.map(([key, label]) => <label key={key} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2.5 text-sm text-slate-700"><span>{label}</span><input type="checkbox" checked={draft.features[key] !== false} onChange={e => setDraft({ ...draft, features: { ...draft.features, [key]: e.target.checked } })} className="h-4 w-4 accent-indigo-600" /></label>)}</div><div className="mt-5 grid gap-3 sm:grid-cols-3"><label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Min payout (₹)<input type="number" min="0" value={draft.settings.minPayoutThreshold} onChange={e => setDraft({ ...draft, settings: { ...draft.settings, minPayoutThreshold: Number(e.target.value) } })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal normal-case" /></label><label className="flex items-center gap-2 text-sm text-slate-700 sm:items-end"><input type="checkbox" checked={draft.settings.autoPayout === true} onChange={e => setDraft({ ...draft, settings: { ...draft.settings, autoPayout: e.target.checked } })} className="h-4 w-4 accent-indigo-600" /> Auto payout</label><label className="flex items-center gap-2 text-sm text-slate-700 sm:items-end"><input type="checkbox" checked={draft.settings.notifyOnNewOrder !== false} onChange={e => setDraft({ ...draft, settings: { ...draft.settings, notifyOnNewOrder: e.target.checked } })} className="h-4 w-4 accent-indigo-600" /> Order alerts</label></div></section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-4 font-semibold text-slate-900">Verification / KYC</h2><div className="space-y-3"><label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Review status<select value={verificationStatus} onChange={e => setVerificationStatus(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal normal-case"><option value="pending">Pending</option><option value="under_review">Under review</option><option value="verified">Verified</option><option value="rejected">Rejected</option></select></label><label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Reviewer note<textarea rows="3" value={verificationReason} onChange={e => setVerificationReason(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal normal-case" placeholder="Missing document, review note, rejection reason…" /></label><button onClick={saveVerification} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">Save verification</button></div><div className="mt-4 border-t border-slate-100 pt-4 text-xs text-slate-500"><div>GST: {vendor.businessDetails?.gstNumber || 'Not provided'}</div><div>PAN: {vendor.businessDetails?.panNumber || 'Not provided'}</div><div>Business type: {vendor.businessDetails?.businessType || 'Not provided'}</div></div></section>
      </div>
      <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-semibold text-slate-900">Admin GST approval</h2><p className="mt-1 text-xs text-slate-600">Seller GST identity is locked after registration. Review the uploaded GST certificate and approve only through this admin action.</p></div><ShieldCheck size={20} className="text-amber-600" /></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Registration type<select value={gstForm.registrationType} onChange={e => setGstForm({ ...gstForm, registrationType: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal normal-case"><option value="unregistered">Unregistered</option><option value="gstin">GST registered</option></select></label><label className="text-xs font-semibold uppercase tracking-wide text-slate-500 sm:col-span-2">GSTIN<input value={gstForm.gstNumber} onChange={e => setGstForm({ ...gstForm, gstNumber: e.target.value.toUpperCase() })} disabled={gstForm.registrationType !== 'gstin'} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal uppercase disabled:bg-slate-100" placeholder="29ABCDE1234F1Z5" /></label></div><button onClick={approveGstChange} className="mt-4 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white">Approve GST change</button></section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold text-slate-900">Storefront controls & SEO defaults</h2><p className="text-xs text-slate-500">These values apply to the store root; vendors can still set SEO on individual pages.</p></div><Store size={20} className="text-indigo-500" /></div><div className="grid gap-4 md:grid-cols-2"><label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Store tagline<input value={draft.storefront.tagline} onChange={e => setDraft({ ...draft, storefront: { ...draft.storefront, tagline: e.target.value } })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal normal-case" /></label><label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Announcement bar<input value={draft.storefront.announcement} onChange={e => setDraft({ ...draft, storefront: { ...draft.storefront, announcement: e.target.value } })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal normal-case" /></label><label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Meta title<input value={draft.storefront.seo.metaTitle} onChange={e => setDraft({ ...draft, storefront: { ...draft.storefront, seo: { ...draft.storefront.seo, metaTitle: e.target.value } } })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal normal-case" /></label><label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Robots<select value={draft.storefront.seo.robots} onChange={e => setDraft({ ...draft, storefront: { ...draft.storefront, seo: { ...draft.storefront.seo, robots: e.target.value } } })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal normal-case"><option>index, follow</option><option>noindex, follow</option><option>noindex, nofollow</option></select></label><label className="text-xs font-semibold uppercase tracking-wide text-slate-500 md:col-span-2">Meta description<textarea rows="2" value={draft.storefront.seo.metaDescription} onChange={e => setDraft({ ...draft, storefront: { ...draft.storefront, seo: { ...draft.storefront.seo, metaDescription: e.target.value } } })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal normal-case" /></label><label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Canonical URL<input value={draft.storefront.seo.canonical} onChange={e => setDraft({ ...draft, storefront: { ...draft.storefront, seo: { ...draft.storefront.seo, canonical: e.target.value } } })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal normal-case" /></label><label className="text-xs font-semibold uppercase tracking-wide text-slate-500">OG image URL<input value={draft.storefront.seo.ogImage} onChange={e => setDraft({ ...draft, storefront: { ...draft.storefront, seo: { ...draft.storefront.seo, ogImage: e.target.value } } })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal normal-case" /></label></div><div className="mt-4 flex justify-end"><button onClick={saveSettings} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save size={15} />{saving ? 'Saving…' : 'Save vendor controls'}</button></div></section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-1 font-semibold text-slate-900">Request changes</h2><p className="mb-3 text-xs text-slate-500">Send the application back for corrections. The seller can resubmit from the portal.</p><div className="space-y-3"><label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Reason code<select data-testid="rc-code" value={changeCode} onChange={e => setChangeCode(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal normal-case">{reasonCodes.filter(c => (c.appliesTo || []).includes('changes_requested')).map(c => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}</select></label><label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Note for seller<textarea data-testid="rc-note" rows="2" value={changeNote} onChange={e => setChangeNote(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal normal-case" placeholder="What exactly needs fixing…" /></label><button data-testid="rc-send" onClick={requestChanges} className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white">Send back for changes</button></div></section>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-1 font-semibold text-slate-900">Periodic re-verification</h2><p className="mb-3 text-xs text-slate-500">Payouts pause until documents are approved again. The catalog stays live.</p><div className="space-y-3"><label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Note<textarea data-testid="reverify-note" rows="2" value={reverifyNote} onChange={e => setReverifyNote(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal normal-case" placeholder="Annual re-check, compliance review…" /></label><button data-testid="reverify-send" onClick={reverify} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">Flag for re-verification</button></div>{vendor.onboarding?.slaDueAt && <p className="mt-3 text-xs text-slate-500">Review SLA: {new Date(vendor.onboarding.slaDueAt).toLocaleString()} · Risk: {vendor.onboarding.riskTier || 'standard'}</p>}</section>
      </div>

      <section data-testid="vendor-audit-trail" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-3 font-semibold text-slate-900">Audit trail</h2>{audit.length === 0 ? <p className="text-sm text-slate-400">No lifecycle events recorded yet.</p> : <div className="divide-y divide-slate-100">{audit.map(entry => <div key={entry._id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm"><div><span className="font-medium capitalize text-slate-800">{String(entry.action || '').replaceAll('_', ' ')}</span>{entry.reasonCode && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{entry.reasonCode}</span>}{entry.note && <p className="text-xs text-slate-500">{entry.note}</p>}</div><div className="text-xs text-slate-400">{entry.actor?.name || entry.actor?.email || 'System'} · {new Date(entry.createdAt).toLocaleString()}</div></div>)}</div>}</section>

      <div className="grid gap-6 lg:grid-cols-3"><section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-3 font-semibold text-slate-900">Store info</h2><div className="space-y-1 text-sm"><div><span className="text-slate-500">Email:</span> {vendor.contactEmail}</div><div><span className="text-slate-500">Phone:</span> {vendor.contactPhone || '—'}</div><div><span className="text-slate-500">Joined:</span> {new Date(vendor.createdAt).toLocaleDateString()}</div><div className="pt-2"><a href={storeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-600"><Eye size={14} /> Public store preview</a></div></div></section><section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-3 font-semibold text-slate-900">Owner</h2><div className="text-sm"><div className="font-medium">{vendor.owner?.name || '—'}</div><div className="text-slate-500">{vendor.owner?.email || '—'}</div><div className="text-slate-500">{vendor.owner?.phone || '—'}</div></div></section><section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-3 font-semibold text-slate-900">Financials</h2><div className="space-y-2 text-sm"><div className="flex justify-between"><span className="text-slate-500">Wallet</span><strong>₹{vendor.walletBalance?.toLocaleString()}</strong></div><div className="flex justify-between"><span className="text-slate-500">Pending payout</span><span>₹{vendor.pendingPayout?.toLocaleString()}</span></div><div className="flex justify-between"><span className="text-slate-500">Total earnings</span><span>₹{vendor.totalEarnings?.toLocaleString()}</span></div></div><div className="mt-4 border-t border-slate-100 pt-4"><label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Commission (%)<div className="mt-1 flex gap-2"><input type="number" min="0" max="100" value={newRate} onChange={e => setNewRate(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal normal-case" /><button onClick={saveCommission} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">Save</button></div></label></div></section></div>
    </div>
  );
}
