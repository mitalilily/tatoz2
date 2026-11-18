import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowUpRight, CreditCard, ExternalLink, RefreshCcw, ShieldCheck, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import Loader from '../../components/common/Loader';
import { partnerDashboardAPI } from '../../services/api';

const META = {
 razorpay: { name: 'Razorpay', description: 'UPI, cards, wallets and net banking for India.', docs: 'https://razorpay.com/docs/api/' },
 cashfree: { name: 'Cashfree', description: 'India payments with hosted checkout, refunds and webhooks.', docs: 'https://www.cashfree.com/docs/api-reference/payments/latest/overview' },
 stripe: { name: 'Stripe', description: 'International payments with PaymentIntents and SCA support.', docs: 'https://docs.stripe.com/payments/payment-intents' },
};

const money = value => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const sourceLabel = source => source === 'tenant_payment_ledger' ? 'Tenant payment ledger' : source?.endsWith('_live_api') ? 'Live provider API' : 'Provider data source';

export default function PaymentPartnerDashboardPage() {
 const { provider } = useParams();
 const navigate = useNavigate();
 const meta = META[provider] || { name: provider, description: 'Payment partner dashboard.', docs: '#' };
 const [summary, setSummary] = useState(null);
 const [transactions, setTransactions] = useState([]);
 const [filters, setFilters] = useState({ eventType: '', status: '' });
 const [loading, setLoading] = useState(true);

 const load = async () => {
  setLoading(true);
  try {
   const [summaryResponse, transactionsResponse] = await Promise.all([
    partnerDashboardAPI.paymentSummary(provider),
    partnerDashboardAPI.paymentTransactions(provider, { limit: 30, ...filters }),
   ]);
   setSummary(summaryResponse.data);
   setTransactions(transactionsResponse.data?.transactions || []);
  } catch (error) { toast.error(error?.response?.data?.message || error.message || 'Unable to load payment dashboard'); }
  finally { setLoading(false); }
 };

 useEffect(() => { load(); }, [provider, filters.eventType, filters.status]);

 if (loading && !summary) return <div className="flex justify-center py-20"><Loader size="lg" /></div>;
 const stats = summary?.stats || {};
 const statusEntries = Object.entries(stats.attempts || {});

 const ledgerStats = stats.ledger || {};
 const eventStats = ledgerStats.events || {};
 return <div className="space-y-6" data-testid="payment-ledger-page">
  <div className="flex flex-wrap items-start justify-between gap-4">
   <div>
    <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-600">Payment partner</p>
    <h1 className="mt-1 flex items-center gap-3 text-2xl font-bold text-gray-900"><CreditCard className="text-primary-600" size={28} />{meta.name}</h1>
    <p className="mt-1 text-sm text-gray-500">{meta.description}</p>
   </div>
   <div className="flex gap-2">
    <button onClick={load} className="btn-secondary flex items-center gap-2"><RefreshCcw size={15} />Refresh</button>
    <button onClick={() => navigate(`/admin/modules?module=${encodeURIComponent(provider)}`)} className="btn-primary flex items-center gap-2"><ShieldCheck size={15} />Configure module</button>
   </div>
  </div>

  <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
   <span className={`rounded-full px-3 py-1 text-xs font-bold ${summary?.provider?.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{summary?.provider?.active ? 'Active at checkout' : 'Not active at checkout'}</span>
   <span className={`rounded-full px-3 py-1 text-xs font-bold ${summary?.provider?.configured ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{summary?.provider?.configured ? 'Credentials connected' : 'Credentials required'}</span>
   <span data-testid="payment-dashboard-source" className={`rounded-full px-3 py-1 text-xs font-bold ${summary?.stats?.live ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{summary?.stats?.live ? `Live ${meta.name} API` : sourceLabel(summary?.stats?.source || summary?.provider?.dashboardSource)}</span>
   <a href={meta.docs} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 text-sm font-semibold text-primary-600">Official API docs <ExternalLink size={14} /></a>
  </div>
  {summary?.stats?.dashboardNote ? <p className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-800">{summary.stats.dashboardNote}</p> : null}

  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
   <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase text-gray-500">Paid revenue</p><p className="mt-2 text-2xl font-bold text-gray-900">{money(stats.paidAmount)}</p></div>
   <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase text-gray-500">Paid orders</p><p className="mt-2 text-2xl font-bold text-gray-900">{stats.paidOrders || 0}</p></div>
   <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase text-gray-500">Captured ledger</p><p className="mt-2 text-2xl font-bold text-emerald-700">{money(ledgerStats.capturedAmount)}</p><p className="mt-1 text-xs text-gray-500">{eventStats.provider_captured?.count || 0} capture events</p></div>
   <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase text-gray-500">Refunded ledger</p><p className="mt-2 text-2xl font-bold text-amber-700">{money(ledgerStats.refundedAmount)}</p><p className="mt-1 text-xs text-gray-500">{eventStats.refunded?.count || 0} refund events</p></div>
   <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase text-gray-500">Failed events</p><p className="mt-2 text-2xl font-bold text-rose-700">{money(ledgerStats.failedAmount)}</p><p className="mt-1 text-xs text-gray-500">{eventStats.provider_failed?.count || 0} provider failures</p></div>
   <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase text-gray-500">Attempt statuses</p><div className="mt-2 flex flex-wrap gap-2">{statusEntries.length ? statusEntries.map(([status, count]) => <span key={status} className="rounded-lg bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">{status}: {count}</span>) : <span className="text-sm text-gray-400">No attempts yet</span>}</div></div>
  </div>

  <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
   <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-5"><div><h2 className="font-bold text-gray-900">{summary?.stats?.live ? 'Live provider transactions' : 'Payment transaction ledger'}</h2><p className="mt-1 text-xs text-gray-500">{summary?.stats?.live ? 'Read directly from the authenticated provider account.' : 'Append-only provider events, replay-safe and tenant-scoped.'}</p></div><div className="flex flex-wrap gap-2"><select aria-label="Ledger event filter" data-testid="payment-ledger-event-filter" value={filters.eventType} onChange={event => setFilters(current => ({ ...current, eventType: event.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-xs"><option value="">All events</option><option value="attempt_created">Attempt created</option><option value="provider_order_created">Provider order created</option><option value="provider_captured">Captured</option><option value="provider_failed">Provider failed</option><option value="refund_requested">Refund requested</option><option value="refunded">Refunded</option><option value="refund_failed">Refund failed</option></select><select aria-label="Ledger status filter" data-testid="payment-ledger-status-filter" value={filters.status} onChange={event => setFilters(current => ({ ...current, status: event.target.value }))} className="rounded-lg border border-gray-200 px-3 py-2 text-xs"><option value="">All statuses</option><option value="pending">Pending</option><option value="succeeded">Succeeded</option><option value="failed">Failed</option><option value="reversed">Reversed</option></select><Wallet className="m-2 text-gray-400" size={19} /></div></div>
   <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-5 py-3">Order</th><th className="px-5 py-3">Event</th><th className="px-5 py-3">Source</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">External ID</th><th className="px-5 py-3">Occurred</th></tr></thead><tbody>{transactions.length ? transactions.map(item => <tr key={item._id} data-testid={`payment-ledger-row-${item._id}`} className="border-t border-gray-100"><td className="px-5 py-3 font-semibold text-gray-800">{item.order?.orderNumber || '—'}</td><td className="px-5 py-3 text-xs font-semibold text-gray-700">{String(item.eventType || 'attempt').replace(/_/g, ' ')}</td><td className="px-5 py-3 text-xs text-gray-500">{item.source || '—'}</td><td className="px-5 py-3">{money(item.amount)}</td><td className="px-5 py-3"><span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold">{item.status}</span></td><td className="max-w-[220px] truncate px-5 py-3 text-xs text-gray-500">{item.externalPaymentId || item.externalOrderId || '—'}</td><td className="px-5 py-3 text-xs text-gray-500">{(item.occurredAt || item.createdAt) ? new Date(item.occurredAt || item.createdAt).toLocaleString() : '—'}</td></tr>) : <tr><td colSpan="7" className="px-5 py-12 text-center text-gray-400">{summary?.stats?.live ? 'No transactions returned by the provider.' : 'No ledger events recorded yet.'}</td></tr>}</tbody></table></div>
  </div>
  <p className="flex items-center gap-1 text-xs text-gray-500"><ArrowUpRight size={13} /> Credentials are encrypted and managed from the module configuration panel.</p>
 </div>;
}
