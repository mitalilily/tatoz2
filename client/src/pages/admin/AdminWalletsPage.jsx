import { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, RefreshCw, WalletCards } from 'lucide-react';
import { walletAPI } from '../../services/api';
import { formatPrice } from '../../utils/formatPrice';
import { useSite } from '../../context/SiteContext';
import Loader from '../../components/common/Loader';
import Pagination from '../../components/common/Pagination';
import SEO from '../../components/common/SEO';
import CustomerAudienceToolbar, { useCustomerGroups } from '../../components/admin/CustomerAudienceToolbar';

const initialForm = { direction: 'credit', amount: '', bucket: 'cash', source: 'manual', expiresAt: '', note: '' };
const errorMessage = error => error?.response?.data?.message || error?.message || 'Request failed';

const normalizeAdjustment = form => ({
  ...form,
  amount: Number(form.amount),
  expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
});

const AdjustmentFields = ({ form, setForm, prefix }) => (
  <>
    <div className="grid grid-cols-2 gap-2">
      <label className="text-xs font-semibold text-slate-600">Direction<select className="input mt-1" value={form.direction} onChange={event => setForm({ ...form, direction: event.target.value })} data-testid={`${prefix}-direction`}><option value="credit">Credit</option><option value="debit">Debit</option></select></label>
      <label className="text-xs font-semibold text-slate-600">Amount<input className="input mt-1" type="number" min="0.01" step="0.01" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} required data-testid={`${prefix}-amount`} /></label>
    </div>
    <label className="block text-xs font-semibold text-slate-600">Balance bucket<select className="input mt-1" value={form.bucket} onChange={event => setForm({ ...form, bucket: event.target.value })} data-testid={`${prefix}-bucket`}><option value="cash">Cash / refund</option><option value="promotional">Promotional</option></select></label>
    <label className="block text-xs font-semibold text-slate-600">Source<select className="input mt-1" value={form.source} onChange={event => setForm({ ...form, source: event.target.value })} data-testid={`${prefix}-source`}><option value="manual">Manual adjustment</option><option value="refund">Refund to wallet</option><option value="cashback">Cashback</option><option value="promotional">Promotion</option><option value="loyalty">Loyalty</option></select></label>
    {form.direction === 'credit' && form.bucket === 'promotional' && <label className="block text-xs font-semibold text-slate-600">Expiry (optional)<input className="input mt-1" type="datetime-local" value={form.expiresAt} onChange={event => setForm({ ...form, expiresAt: event.target.value })} data-testid={`${prefix}-expiry`} /></label>}
    <label className="block text-xs font-semibold text-slate-600">Note<textarea className="input mt-1 min-h-20" maxLength={500} value={form.note} onChange={event => setForm({ ...form, note: event.target.value })} placeholder="Reason for this ledger entry" data-testid={`${prefix}-note`} /></label>
  </>
);

export default function AdminWalletsPage() {
  const { settings } = useSite();
  const { groups, loadingGroups } = useCustomerGroups();
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [form, setForm] = useState(initialForm);
  const [bulkForm, setBulkForm] = useState(initialForm);
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
    setLoading(true);
    setError('');
    try {
      const response = await walletAPI.getAdmin({ page, limit: 10, search, segmentId: groupId || undefined });
      setRows(response.data.wallets || []);
      setPagination(response.data.pagination || { page, pages: 1 });
    } catch (requestError) {
      setError(errorMessage(requestError) || 'Unable to load customer wallets');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(1); }, [search, groupId]);

  const visibleIds = useMemo(() => rows.map(row => String(row.user?._id)), [rows]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
  const selectedCount = selectedIds.size;

  const toggleSelected = id => setSelectedIds(current => {
    const next = new Set(current);
    if (next.has(String(id))) next.delete(String(id)); else next.add(String(id));
    return next;
  });
  const toggleAll = () => setSelectedIds(current => {
    const next = new Set(current);
    if (allVisibleSelected) visibleIds.forEach(id => next.delete(id));
    else visibleIds.forEach(id => next.add(id));
    return next;
  });

  const choose = row => {
    setSelected(row);
    setForm(initialForm);
    setNotice('');
  };

  const adjust = async event => {
    event.preventDefault();
    if (!selected) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await walletAPI.adjust(selected.user._id, normalizeAdjustment(form), `admin-wallet-${selected.user._id}-${Date.now()}`);
      setNotice('Wallet ledger entry saved.');
      setForm(initialForm);
      await load(pagination.page);
    } catch (requestError) { setError(errorMessage(requestError) || 'Wallet adjustment failed'); }
    finally { setSaving(false); }
  };

  const bulkAdjust = async event => {
    event.preventDefault();
    if (!selectedCount && !groupId) { setError('Select customers or choose a customer group first.'); return; }
    setBulkSaving(true); setError(''); setNotice('');
    try {
      const response = await walletAPI.bulkAdjust({ ...normalizeAdjustment(bulkForm), userIds: Array.from(selectedIds), segmentId: groupId || undefined }, `admin-wallet-bulk-${Date.now()}`);
      const result = response.data || {};
      setNotice(`Bulk wallet action complete: ${result.succeeded || 0} succeeded, ${result.failed || 0} failed.`);
      setSelectedIds(new Set());
      setBulkForm(initialForm);
      await load(pagination.page);
    } catch (requestError) { setError(errorMessage(requestError) || 'Bulk wallet adjustment failed'); }
    finally { setBulkSaving(false); }
  };

  const applySearch = event => { event.preventDefault(); setSearch(searchInput.trim()); setSelectedIds(new Set()); };
  const changeGroup = value => { setGroupId(value); setSelectedIds(new Set()); };

  return (
    <>
      <SEO title="Customer Wallets" noindex />
      <div className="space-y-6 p-4 sm:p-6 lg:p-8" data-testid="admin-wallets-page">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Customer finance</p><h1 className="mt-1 text-2xl font-black text-slate-900">Wallet & store credit</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Search customers, target dynamic groups, and apply auditable credits or debits in bulk.</p></div>
          <button type="button" onClick={() => load(pagination.page)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm" data-testid="admin-wallets-refresh"><RefreshCw size={15} /> Refresh</button>
        </div>
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" data-testid="admin-wallets-error">{error}</div>}
        {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" data-testid="admin-wallets-notice">{notice}</div>}
        {loading ? <Loader size="lg" /> : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold text-slate-900">Customer wallet accounts</h2><p className="mt-1 text-xs text-slate-500">Search by name, email or phone. Select visible customers or use a customer group for bulk credit.</p></div>
              <CustomerAudienceToolbar search={searchInput} onSearchChange={setSearchInput} onSearchSubmit={applySearch} groupId={groupId} onGroupChange={changeGroup} groups={groups} loadingGroups={loadingGroups} selectedCount={selectedCount} visibleCount={rows.length} allVisibleSelected={allVisibleSelected} onToggleAll={toggleAll} onClearSelection={() => setSelectedIds(new Set())} testId="wallet-audience" />
              <div className="divide-y divide-slate-100">
                {rows.map(row => {
                  const wallet = row.wallet || {};
                  const id = String(row.user._id);
                  const active = selected?.user?._id === row.user?._id;
                  return <div key={id} className={`flex w-full items-center gap-3 px-5 py-4 transition-colors ${active ? 'bg-indigo-50' : 'hover:bg-slate-50'}`} data-testid={`admin-wallet-row-${id}`}>
                    <input type="checkbox" checked={selectedIds.has(id)} onChange={() => toggleSelected(id)} aria-label={`Select ${row.user.name || row.user.email || 'customer'}`} data-testid={`admin-wallet-select-${id}`} className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
                    <button type="button" onClick={() => choose(row)} className="flex min-w-0 flex-1 items-center gap-3 text-left"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><WalletCards size={17} /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-800">{row.user.name || row.user.email || row.user.phone}</span><span className="block truncate text-xs text-slate-500">{row.user.email || row.user.phone || 'No contact'}</span></span><span className="text-right"><span className="block text-sm font-black text-slate-900">{formatPrice(wallet.totalBalance || 0, settings)}</span><span className="block text-[10px] uppercase tracking-wide text-slate-400">total</span></span></button>
                  </div>;
                })}
              </div>
              {rows.length === 0 && <p className="px-5 py-10 text-center text-sm text-slate-400">No tenant customers found.</p>}
              <div className="border-t border-slate-100 px-5 py-4"><Pagination currentPage={pagination.page || 1} totalPages={pagination.pages || 1} onPageChange={page => load(page)} /></div>
            </section>
            <div className="space-y-6">
              <section className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-5 shadow-sm" data-testid="wallet-bulk-adjustment-form">
                <div className="mb-4 flex items-center gap-2"><WalletCards size={18} className="text-indigo-600" /><div><h2 className="font-bold text-slate-900">Bulk wallet adjustment</h2><p className="text-xs text-slate-500">{selectedCount ? `${selectedCount} selected customer${selectedCount === 1 ? '' : 's'}` : groupId ? 'Selected customer group' : 'Select customers or a group'}</p></div></div>
                <form onSubmit={bulkAdjust} className="space-y-3"><AdjustmentFields form={bulkForm} setForm={setBulkForm} prefix="wallet-bulk" /><button type="submit" disabled={bulkSaving || (!selectedCount && !groupId)} className="btn-primary w-full text-sm" data-testid="wallet-bulk-adjust-submit">{bulkSaving ? 'Applying…' : 'Apply to selected audience'}</button></form>
              </section>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="wallet-adjustment-form">
                <div className="mb-4 flex items-center gap-2"><WalletCards size={18} className="text-indigo-600" /><div><h2 className="font-bold text-slate-900">Single customer adjustment</h2><p className="text-xs text-slate-500">{selected ? (selected.user.name || selected.user.email) : 'Select a customer first'}</p></div></div>
                <form onSubmit={adjust} className="space-y-3"><AdjustmentFields form={form} setForm={setForm} prefix="wallet" /><button type="submit" disabled={!selected || saving} className="btn-primary w-full text-sm" data-testid="wallet-adjust-submit">{saving ? 'Saving…' : 'Save ledger entry'}</button></form>
                <div className="mt-4 space-y-1 rounded-xl bg-slate-50 p-3 text-xs text-slate-500"><p className="flex items-start gap-1.5"><ArrowDownLeft size={13} className="mt-0.5 shrink-0 text-emerald-600" /><span>Credits increase the customer balance.</span></p><p className="flex items-start gap-1.5"><ArrowUpRight size={13} className="mt-0.5 shrink-0 text-rose-600" /><span>Debits fail closed when the balance is insufficient.</span></p></div>
              </section>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
