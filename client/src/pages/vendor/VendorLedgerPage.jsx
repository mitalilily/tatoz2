import { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, ReceiptText } from 'lucide-react';
import { vendorAPI } from '../../services/api';
import Loader from '../../components/common/Loader';

const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const TYPES = ['', 'sale_credit', 'commission_debit', 'refund_debit', 'payout_debit', 'adjustment_credit', 'adjustment_debit'];

export default function VendorLedgerPage() {
  const [data, setData] = useState(null);
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    vendorAPI.getLedger({ type: type || undefined, page, limit: 30 })
      .then((r) => { setData(r.data?.data || null); setPagination(r.data?.pagination || {}); })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [type, page]);

  return <div className="mx-auto max-w-6xl space-y-6" data-testid="vendor-ledger-page">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-widest text-emerald-600">Money trail</p><h1 className="mt-1 text-2xl font-bold text-gray-900">Ledger</h1><p className="mt-1 text-sm text-gray-500">Every earning, commission and payout on this store — newest first.</p></div>
      <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
        <option value="">All entry types</option>
        {TYPES.slice(1).map((t) => <option key={t} value={t}>{t.replaceAll('_', ' ')}</option>)}
      </select>
    </header>

    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-2xl bg-emerald-50 p-5"><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Wallet balance</p><p className="mt-2 text-2xl font-bold text-gray-900">{money(data?.walletBalance)}</p></div>
      <div className="rounded-2xl bg-amber-50 p-5"><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Locked in payouts</p><p className="mt-2 text-2xl font-bold text-gray-900">{money(data?.pendingPayout)}</p></div>
    </div>

    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-gray-100 p-5"><ReceiptText size={18} className="text-indigo-600" /><h2 className="font-bold text-gray-900">Entries</h2></div>
      {loading
        ? <div className="flex justify-center py-12"><Loader /></div>
        : <div className="divide-y divide-gray-100">
          {(data?.entries || []).map((entry) => {
            const credit = ['sale_credit', 'adjustment_credit'].includes(entry.type);
            return <div key={entry._id} className="flex items-center justify-between gap-4 px-5 py-4 text-sm">
              <div className="flex min-w-0 items-center gap-3"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${credit ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{credit ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}</span><div className="min-w-0"><p className="font-medium capitalize text-gray-800">{String(entry.type || '').replaceAll('_', ' ')}</p><p className="truncate text-xs text-gray-400">{entry.note || new Date(entry.createdAt).toLocaleString()}</p></div></div>
              <div className="text-right"><p className={`font-semibold ${credit ? 'text-emerald-600' : 'text-rose-600'}`}>{credit ? '+' : ''}{money(entry.amount)}</p><p className="text-xs text-gray-400">Balance {money(entry.balanceAfter)}</p></div>
            </div>;
          })}
          {!data?.entries?.length && <p className="p-10 text-center text-sm text-gray-400">No ledger entries yet.</p>}
        </div>}
    </section>

    {pagination.pages > 1 && <div className="flex justify-center gap-2"><button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="rounded border px-3 py-1 disabled:opacity-50">Prev</button><span className="px-3 py-1 text-sm">Page {page} of {pagination.pages}</span><button disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)} className="rounded border px-3 py-1 disabled:opacity-50">Next</button></div>}
  </div>;
}
