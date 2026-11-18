import { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, WalletCards } from 'lucide-react';
import { vendorAPI } from '../../services/api';
import Loader from '../../components/common/Loader';

const money = value => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function VendorWalletPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { vendorAPI.getWallet({ limit: 50 }).then(response => setData(response.data?.data || null)).catch(() => {}).finally(() => setLoading(false)); }, []);
  if (loading) return <div className="flex justify-center py-16"><Loader /></div>;
  if (!data) return <div className="py-12 text-center text-red-500">Wallet could not be loaded.</div>;
  return <div className="mx-auto max-w-6xl space-y-6" data-testid="vendor-wallet-page">
    <header><p className="text-xs font-bold uppercase tracking-widest text-emerald-600">Seller finance</p><h1 className="mt-2 text-2xl font-bold text-gray-900">Wallet</h1><p className="mt-1 text-sm text-gray-500">Your available seller balance and immutable ledger history.</p></header>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[["Available balance", data.walletBalance, 'bg-emerald-50'], ["Pending payout", data.pendingPayout, 'bg-amber-50'], ["Total earnings", data.totalEarnings, 'bg-indigo-50'], ["Total withdrawn", data.totalWithdrawn, 'bg-purple-50']].map(([label, value, color]) => <div key={label} className={`${color} rounded-2xl p-5`}><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p><p className="mt-2 text-2xl font-bold text-gray-900">{money(value)}</p></div>)}</div>
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"><div className="flex items-center gap-2 border-b border-gray-100 p-5"><WalletCards size={18} className="text-indigo-600" /><h2 className="font-bold text-gray-900">Wallet ledger</h2></div><div className="divide-y divide-gray-100">{(data.ledger || []).map(entry => { const credit = Number(entry.amount || 0) >= 0; return <div key={entry._id} className="flex items-center justify-between gap-4 px-5 py-4 text-sm"><div className="flex min-w-0 items-center gap-3"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${credit ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{credit ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}</span><div className="min-w-0"><p className="font-medium capitalize text-gray-800">{String(entry.type || '').replaceAll('_', ' ')}</p><p className="truncate text-xs text-gray-400">{entry.note || new Date(entry.createdAt).toLocaleString()}</p></div></div><div className="text-right"><p className={`font-semibold ${credit ? 'text-emerald-600' : 'text-rose-600'}`}>{credit ? '+' : ''}{money(entry.amount)}</p><p className="text-xs text-gray-400">Balance {money(entry.balanceAfter)}</p></div></div>; })}{!data.ledger?.length && <p className="p-10 text-center text-sm text-gray-400">No wallet entries yet.</p>}</div></section>
  </div>;
}
