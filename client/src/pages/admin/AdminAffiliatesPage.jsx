import { useCallback, useEffect, useState } from 'react';
import { Check, Clock3, IndianRupee, RefreshCw, ShieldCheck, Users, XCircle } from 'lucide-react';
import { affiliateAPI } from '../../services/api';
import Loader from '../../components/common/Loader';
import toast from 'react-hot-toast';

const statusStyle = {
 pending: 'bg-amber-50 text-amber-700', approved: 'bg-emerald-50 text-emerald-700',
 rejected: 'bg-red-50 text-red-700', suspended: 'bg-slate-100 text-slate-600',
 processing: 'bg-blue-50 text-blue-700', paid: 'bg-emerald-50 text-emerald-700',
};
const label = value => String(value || '').replace(/_/g, ' ');
const money = value => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const AdminAffiliatesPage = () => {
 const [program, setProgram] = useState(null);
 const [affiliates, setAffiliates] = useState([]);
 const [payouts, setPayouts] = useState([]);
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);

 const load = useCallback(async () => {
  setLoading(true);
  try {
   const [programRes, affiliatesRes, payoutsRes] = await Promise.all([
    affiliateAPI.adminGetProgram(), affiliateAPI.adminGetAffiliates(), affiliateAPI.adminGetPayouts({ limit: 50 }),
   ]);
   setProgram(programRes.data.program);
   setAffiliates(affiliatesRes.data.affiliates || []);
   setPayouts(payoutsRes.data.payouts || []);
  } catch (error) { toast.error(error.response?.data?.message || 'Failed to load affiliate operations'); }
  finally { setLoading(false); }
 }, []);

 useEffect(() => { load(); }, [load]);

 const saveProgram = async event => {
  event.preventDefault();
  setSaving(true);
  try {
   const form = new FormData(event.currentTarget);
   const response = await affiliateAPI.adminUpdateProgram({
    enabled: form.get('enabled') === 'on', requireApproval: form.get('requireApproval') === 'on',
    defaultCommissionRate: Number(form.get('defaultCommissionRate')), minimumPayout: Number(form.get('minimumPayout')),
   });
   setProgram(response.data.program); toast.success('Affiliate program settings saved');
  } catch (error) { toast.error(error.response?.data?.message || 'Could not save settings'); }
  finally { setSaving(false); }
 };

 const updateAffiliate = async (profile, status) => {
  try { await affiliateAPI.adminUpdateAffiliateStatus(profile._id, { status }); toast.success(`Affiliate ${label(status)}`); load(); }
  catch (error) { toast.error(error.response?.data?.message || 'Status update failed'); }
 };
 const payoutAction = async (payout, action) => {
  try {
   if (action === 'process') await affiliateAPI.adminProcessPayout(payout._id, {});
   if (action === 'complete') { const ref = window.prompt('Transaction reference (optional):') || ''; await affiliateAPI.adminCompletePayout(payout._id, { transactionRef: ref }); }
   if (action === 'reject') await affiliateAPI.adminRejectPayout(payout._id, { note: 'Rejected during affiliate payout review' });
   toast.success(`Payout ${action}d`); load();
  } catch (error) { toast.error(error.response?.data?.message || 'Payout update failed'); }
 };

 if (loading && !program) return <div className="flex justify-center py-20"><Loader size="lg" /></div>;
 return <div className="space-y-6 animate-fade-in" data-testid="admin-affiliate-page">
  <div className="flex items-start justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900"><ShieldCheck size={24} className="text-primary-600" /> Affiliate Operations</h1><p className="mt-1 text-sm text-gray-500">Approve affiliates, inspect tenant-scoped balances, and settle payout requests.</p></div><button onClick={load} className="btn-secondary flex items-center gap-2 text-sm"><RefreshCw size={14} /> Refresh</button></div>
  <form onSubmit={saveProgram} className="card grid gap-4 p-5 md:grid-cols-4" data-testid="affiliate-program">
   <div className="md:col-span-2"><h2 className="font-bold text-gray-900">Program controls</h2><p className="mt-1 text-xs text-gray-500">Business thresholds remain configurable per storefront.</p></div>
   <label className="flex items-center gap-2 text-sm"><input name="enabled" type="checkbox" defaultChecked={program?.enabled !== false} className="h-4 w-4 accent-indigo-600" /> Enabled</label>
   <label className="flex items-center gap-2 text-sm"><input name="requireApproval" type="checkbox" defaultChecked={program?.requireApproval !== false} className="h-4 w-4 accent-indigo-600" /> Require approval</label>
   <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Default commission %<input name="defaultCommissionRate" type="number" min="0" max="100" step="0.1" defaultValue={program?.defaultCommissionRate || 0} className="input mt-1 normal-case" /></label>
   <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Minimum payout<input name="minimumPayout" type="number" min="0" step="0.01" defaultValue={program?.minimumPayout || 0} className="input mt-1 normal-case" /></label>
   <div className="flex items-end md:col-span-2"><button disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save program settings'}</button></div>
  </form>
  <section className="card overflow-hidden" data-testid="affiliate-applicants"><div className="flex items-center gap-2 border-b border-gray-100 p-5"><Users size={18} className="text-primary-600" /><h2 className="font-bold">Affiliate accounts</h2><span className="ml-auto text-xs text-gray-500">{affiliates.length} profiles</span></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-left text-xs uppercase text-gray-500"><tr><th className="px-4 py-3">Affiliate</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Balance</th><th className="px-4 py-3">Codes</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-gray-100">{affiliates.length ? affiliates.map(profile => <tr key={profile._id}><td className="px-4 py-3"><p className="font-semibold">{profile.user?.name || '—'}</p><p className="text-xs text-gray-500">{profile.user?.email || profile.user?.phone || ''}</p></td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${statusStyle[profile.status] || statusStyle.suspended}`}>{label(profile.status)}</span></td><td className="px-4 py-3 font-semibold">{money(profile.wallet?.balance)}</td><td className="px-4 py-3">{profile.codes?.length || 0}</td><td className="px-4 py-3 text-right">{profile.status === 'pending' && <><button onClick={() => updateAffiliate(profile, 'approved')} className="mr-2 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white"><Check size={12} className="mr-1 inline" />Approve</button><button onClick={() => updateAffiliate(profile, 'rejected')} className="rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700"><XCircle size={12} className="mr-1 inline" />Reject</button></>}{profile.status === 'approved' && <button onClick={() => updateAffiliate(profile, 'suspended')} className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700">Suspend</button>}{profile.status === 'suspended' && <button onClick={() => updateAffiliate(profile, 'approved')} className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700">Restore</button>}</td></tr>) : <tr><td colSpan="5" className="p-10 text-center text-gray-400">No affiliate applications yet.</td></tr>}</tbody></table></div></section>
  <section className="card overflow-hidden" data-testid="affiliate-payouts"><div className="flex items-center gap-2 border-b border-gray-100 p-5"><IndianRupee size={18} className="text-primary-600" /><h2 className="font-bold">Payout requests</h2></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-left text-xs uppercase text-gray-500"><tr><th className="px-4 py-3">Affiliate</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Requested</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-gray-100">{payouts.length ? payouts.map(payout => <tr key={payout._id}><td className="px-4 py-3">{payout.affiliate?.name || payout.affiliate?.email || '—'}</td><td className="px-4 py-3 font-semibold">{money(payout.amount)}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${statusStyle[payout.status] || statusStyle.suspended}`}>{label(payout.status)}</span></td><td className="px-4 py-3 text-xs text-gray-500"><Clock3 size={12} className="mr-1 inline" />{new Date(payout.createdAt).toLocaleDateString('en-IN')}</td><td className="px-4 py-3 text-right">{payout.status === 'pending' && <><button onClick={() => payoutAction(payout, 'process')} className="mr-2 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white">Process</button><button onClick={() => payoutAction(payout, 'reject')} className="rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700">Reject</button></>}{payout.status === 'processing' && <button onClick={() => payoutAction(payout, 'complete')} className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white">Mark paid</button>}</td></tr>) : <tr><td colSpan="5" className="p-10 text-center text-gray-400">No payout requests yet.</td></tr>}</tbody></table></div></section>
 </div>;
};

export default AdminAffiliatesPage;
