import { useEffect, useMemo, useState } from 'react';
import { Award, RefreshCw } from 'lucide-react';
import { loyaltyAPI } from '../../services/api';
import Loader from '../../components/common/Loader';
import Pagination from '../../components/common/Pagination';
import SEO from '../../components/common/SEO';
import CustomerAudienceToolbar, { useCustomerGroups } from '../../components/admin/CustomerAudienceToolbar';

const defaults = { enabled: false, earnPointsPerCurrency: 1, redeemPointsPerCurrency: 100, minimumRedeemPoints: 100, maxRedeemPercent: 50, expiryDays: 365 };
const initialAdjustment = { direction: 'credit', points: '', expiresAt: '', note: '' };
const errorMessage = error => error?.response?.data?.message || error?.message || 'Request failed';

const AdjustmentFields = ({ form, setForm, prefix }) => (
  <>
    <div className="grid grid-cols-2 gap-2">
      <label className="text-xs font-semibold text-slate-600">Direction<select className="input mt-1" value={form.direction} onChange={event => setForm({ ...form, direction: event.target.value })} data-testid={`${prefix}-direction`}><option value="credit">Credit points</option><option value="debit">Deduct points</option></select></label>
      <label className="text-xs font-semibold text-slate-600">Points<input className="input mt-1" type="number" min="1" step="1" inputMode="numeric" value={form.points} onChange={event => setForm({ ...form, points: event.target.value })} required data-testid={`${prefix}-points`} /></label>
    </div>
    {form.direction === 'credit' && <label className="block text-xs font-semibold text-slate-600">Expiry (optional)<input className="input mt-1" type="datetime-local" value={form.expiresAt} onChange={event => setForm({ ...form, expiresAt: event.target.value })} data-testid={`${prefix}-expiry`} /></label>}
    <label className="block text-xs font-semibold text-slate-600">Note<textarea className="input mt-1 min-h-20" maxLength={500} value={form.note} onChange={event => setForm({ ...form, note: event.target.value })} placeholder="Reason for this adjustment" data-testid={`${prefix}-note`} /></label>
  </>
);

const normalizeAdjustment = form => ({
  ...form,
  points: Number(form.points),
  expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
});

export default function AdminLoyaltyPage() {
  const { groups, loadingGroups } = useCustomerGroups();
  const [program, setProgram] = useState(defaults);
  const [accounts, setAccounts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [form, setForm] = useState(defaults);
  const [adjustment, setAdjustment] = useState(initialAdjustment);
  const [bulkAdjustment, setBulkAdjustment] = useState(initialAdjustment);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [groupId, setGroupId] = useState('');
  const [pagination, setPagination] = useState({ page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async (page = pagination.page) => {
    setLoading(true); setError('');
    try {
      const [programResponse, accountsResponse] = await Promise.all([loyaltyAPI.getAdmin(), loyaltyAPI.getAccounts({ page, limit: 10, search, segmentId: groupId || undefined })]);
      const next = programResponse.data.program || defaults;
      setProgram(next); setForm(next); setAccounts(accountsResponse.data.accounts || []); setPagination(accountsResponse.data.pagination || { page, pages: 1 });
    } catch (requestError) { setError(errorMessage(requestError) || 'Unable to load loyalty settings'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(1); }, [search, groupId]);

  const visibleIds = useMemo(() => accounts.map(row => String(row.user?._id)), [accounts]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
  const selectedCount = selectedIds.size;
  const toggleSelected = id => setSelectedIds(current => { const next = new Set(current); if (next.has(String(id))) next.delete(String(id)); else next.add(String(id)); return next; });
  const toggleAll = () => setSelectedIds(current => { const next = new Set(current); if (allVisibleSelected) visibleIds.forEach(id => next.delete(id)); else visibleIds.forEach(id => next.add(id)); return next; });

  const save = async event => {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    try {
      const response = await loyaltyAPI.updateAdmin({ ...form, earnPointsPerCurrency: Number(form.earnPointsPerCurrency), redeemPointsPerCurrency: Number(form.redeemPointsPerCurrency), minimumRedeemPoints: Number(form.minimumRedeemPoints), maxRedeemPercent: Number(form.maxRedeemPercent), expiryDays: Number(form.expiryDays) });
      setProgram(response.data.program); setForm(response.data.program); setNotice('Loyalty settings saved.');
    } catch (requestError) { setError(errorMessage(requestError) || 'Unable to save loyalty settings'); }
    finally { setSaving(false); }
  };

  const adjust = async event => {
    event.preventDefault();
    if (!selected) { setError('Select a customer before saving a ledger entry.'); return; }
    const payload = normalizeAdjustment(adjustment);
    if (!Number.isSafeInteger(payload.points) || payload.points <= 0) { setError('Points must be a positive whole number.'); return; }
    setSaving(true); setError(''); setNotice('');
    try { await loyaltyAPI.adjust(selected.user._id, payload, `admin-loyalty-${selected.user._id}-${Date.now()}`); setNotice('Loyalty ledger entry saved.'); setAdjustment(initialAdjustment); await load(pagination.page); }
    catch (requestError) { setError(errorMessage(requestError) || 'Unable to adjust loyalty account'); }
    finally { setSaving(false); }
  };

  const bulkAdjust = async event => {
    event.preventDefault();
    if (!selectedCount && !groupId) { setError('Select customers or choose a customer group first.'); return; }
    const payload = normalizeAdjustment(bulkAdjustment);
    if (!Number.isSafeInteger(payload.points) || payload.points <= 0) { setError('Points must be a positive whole number.'); return; }
    setBulkSaving(true); setError(''); setNotice('');
    try {
      const response = await loyaltyAPI.bulkAdjust({ ...payload, userIds: Array.from(selectedIds), segmentId: groupId || undefined }, `admin-loyalty-bulk-${Date.now()}`);
      const result = response.data || {};
      setNotice(`Bulk loyalty action complete: ${result.succeeded || 0} succeeded, ${result.failed || 0} failed.`); setSelectedIds(new Set()); setBulkAdjustment(initialAdjustment); await load(pagination.page);
    } catch (requestError) { setError(errorMessage(requestError) || 'Bulk loyalty adjustment failed'); }
    finally { setBulkSaving(false); }
  };

  const applySearch = event => { event.preventDefault(); setSearch(searchInput.trim()); setSelectedIds(new Set()); };
  const changeGroup = value => { setGroupId(value); setSelectedIds(new Set()); };

  return <>
    <SEO title="Loyalty & Rewards Settings" noindex />
    <div className="space-y-6 p-4 sm:p-6 lg:p-8" data-testid="admin-loyalty-page">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-600">Customer retention</p><h1 className="mt-1 text-2xl font-black text-slate-900">Loyalty & Rewards</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Configure the program, search customers, and assign or deduct rewards for individuals or customer groups.</p></div><button type="button" onClick={() => load(pagination.page)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm" data-testid="admin-loyalty-refresh"><RefreshCw size={15} /> Refresh</button></div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" data-testid="admin-loyalty-error">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" data-testid="admin-loyalty-notice">{notice}</div>}
      {loading ? <Loader size="lg" /> : <>
        <form onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="admin-loyalty-settings-form">
          <div className="mb-5 flex items-center gap-2"><Award size={19} className="text-amber-500" /><div><h2 className="font-bold text-slate-900">Program settings</h2><p className="text-xs text-slate-500">Changes apply to new checkout quotes immediately.</p></div></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 sm:col-span-2 lg:col-span-3"><input type="checkbox" checked={Boolean(form.enabled)} onChange={event => setForm({ ...form, enabled: event.target.checked })} data-testid="loyalty-enabled" /> Enable loyalty redemption and earning</label>
            <label className="text-xs font-semibold text-slate-600">Earn points per ₹1<input className="input mt-1" type="number" min="0" step="0.1" value={form.earnPointsPerCurrency} onChange={event => setForm({ ...form, earnPointsPerCurrency: event.target.value })} data-testid="loyalty-earn-rate" /></label>
            <label className="text-xs font-semibold text-slate-600">Points per ₹1 redemption<input className="input mt-1" type="number" min="1" step="1" value={form.redeemPointsPerCurrency} onChange={event => setForm({ ...form, redeemPointsPerCurrency: event.target.value })} data-testid="loyalty-redeem-rate" /></label>
            <label className="text-xs font-semibold text-slate-600">Minimum redeem points<input className="input mt-1" type="number" min="0" step="1" value={form.minimumRedeemPoints} onChange={event => setForm({ ...form, minimumRedeemPoints: event.target.value })} data-testid="loyalty-minimum" /></label>
            <label className="text-xs font-semibold text-slate-600">Max order redemption %<input className="input mt-1" type="number" min="0" max="100" step="1" value={form.maxRedeemPercent} onChange={event => setForm({ ...form, maxRedeemPercent: event.target.value })} data-testid="loyalty-max-percent" /></label>
            <label className="text-xs font-semibold text-slate-600">Points expiry (days)<input className="input mt-1" type="number" min="0" max="3650" step="1" value={form.expiryDays} onChange={event => setForm({ ...form, expiryDays: event.target.value })} data-testid="loyalty-expiry-days" /></label>
          </div>
          <button type="submit" disabled={saving} className="btn-primary mt-5 text-sm" data-testid="loyalty-settings-save">{saving ? 'Saving…' : 'Save loyalty settings'}</button>
        </form>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold text-slate-900">Customer reward accounts</h2><p className="mt-1 text-xs text-slate-500">Search by customer details, select visible accounts, or target a group.</p></div>
            <CustomerAudienceToolbar search={searchInput} onSearchChange={setSearchInput} onSearchSubmit={applySearch} groupId={groupId} onGroupChange={changeGroup} groups={groups} loadingGroups={loadingGroups} selectedCount={selectedCount} visibleCount={accounts.length} allVisibleSelected={allVisibleSelected} onToggleAll={toggleAll} onClearSelection={() => setSelectedIds(new Set())} testId="loyalty-audience" />
            <div className="divide-y divide-slate-100">{accounts.map(row => { const id = String(row.user._id); return <div key={id} className={`flex items-center gap-3 px-5 py-4 ${selected?.user?._id === row.user._id ? 'bg-amber-50' : 'hover:bg-slate-50'}`} data-testid={`admin-loyalty-row-${id}`}><input type="checkbox" checked={selectedIds.has(id)} onChange={() => toggleSelected(id)} aria-label={`Select ${row.user.name || row.user.email || 'customer'}`} data-testid={`admin-loyalty-select-${id}`} className="h-4 w-4 rounded border-slate-300 text-amber-600" /><button type="button" onClick={() => { setSelected(row); setAdjustment(initialAdjustment); }} className="flex min-w-0 flex-1 items-center gap-3 text-left"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Award size={17} /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-800">{row.user.name || row.user.email || row.user.phone}</span><span className="block truncate text-xs text-slate-500">{row.user.email || row.user.phone || 'No contact'}</span></span><span className="text-right"><span className="block text-sm font-black text-slate-900">{Number(row.account?.pointsBalance || 0).toLocaleString('en-IN')}</span><span className="block text-[10px] uppercase tracking-wide text-slate-400">points</span></span></button></div>; })}</div>
            {accounts.length === 0 && <p className="px-5 py-10 text-center text-sm text-slate-400">No tenant customers found.</p>}
            <div className="border-t border-slate-100 px-5 py-4"><Pagination currentPage={pagination.page || 1} totalPages={pagination.pages || 1} onPageChange={page => load(page)} /></div>
          </section>
          <div className="space-y-6">
            <section className="rounded-2xl border border-amber-100 bg-amber-50/50 p-5 shadow-sm" data-testid="admin-loyalty-bulk-adjustment-form"><div className="mb-4 flex items-center gap-2"><Award size={18} className="text-amber-500" /><div><h2 className="font-bold text-slate-900">Bulk reward adjustment</h2><p className="text-xs text-slate-500">{selectedCount ? `${selectedCount} selected customer${selectedCount === 1 ? '' : 's'}` : groupId ? 'Selected customer group' : 'Select customers or a group'}</p></div></div><form onSubmit={bulkAdjust} className="space-y-3"><AdjustmentFields form={bulkAdjustment} setForm={setBulkAdjustment} prefix="loyalty-bulk" /><button type="submit" disabled={bulkSaving || (!selectedCount && !groupId)} className="btn-primary w-full text-sm" data-testid="loyalty-bulk-adjust-submit">{bulkSaving ? 'Applying…' : 'Apply to selected audience'}</button></form></section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="admin-loyalty-adjustment-form"><div className="mb-4 flex items-center gap-2"><Award size={18} className="text-amber-500" /><div><h2 className="font-bold text-slate-900">Single customer adjustment</h2><p className="text-xs text-slate-500">{selected ? (selected.user.name || selected.user.email) : 'Select a customer first'}</p></div></div><form onSubmit={adjust} noValidate className="space-y-3"><AdjustmentFields form={adjustment} setForm={setAdjustment} prefix="loyalty" /><button type="submit" disabled={!selected || saving} className="btn-primary w-full text-sm" data-testid="loyalty-adjust-submit">{saving ? 'Saving…' : 'Save ledger entry'}</button></form></section>
          </div>
        </div>
      </>}
    </div>
  </>;
}
