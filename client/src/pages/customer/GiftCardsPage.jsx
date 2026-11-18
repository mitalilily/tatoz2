import { useEffect, useState } from 'react';
import { Gift, RefreshCw } from 'lucide-react';
import { giftCardAPI } from '../../services/api';
import { formatPrice } from '../../utils/formatPrice';
import { useSite } from '../../context/SiteContext';
import Loader from '../../components/common/Loader';
import SEO from '../../components/common/SEO';
import AccountHeader from '../../components/customer/AccountHeader';

export default function GiftCardsPage() {
  const { settings } = useSite();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = () => {
    setLoading(true); setError('');
    giftCardAPI.getHistory({ page: 1, limit: 50 }).then(response => setTransactions(response.data.transactions || [])).catch(requestError => setError(requestError.response?.data?.message || 'Unable to load gift card history')).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);
  return <>
    <SEO title="Gift Cards" noindex />
    <div className="page-container account-wrap-narrow py-6 sm:py-8" data-testid="gift-cards-page">
      <AccountHeader
        kicker="Customer wallet"
        title="Gift card activity"
        sub="Apply a code during checkout and review its server-recorded usage here."
        icon={<Gift size={20} />}
        accent="fuchsia"
        actions={(
          <button type="button" onClick={load} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 sm:w-auto"><RefreshCw size={15} /> Refresh</button>
        )}
      />
      {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {loading ? <div className="flex justify-center py-16"><Loader size="lg" /></div> : <div className="mt-6 space-y-3">{transactions.map(transaction => <div key={transaction._id} className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fuchsia-50 text-fuchsia-600"><Gift size={18} /></span><div className="min-w-0 flex-1"><p className="break-anywhere font-semibold text-slate-900">Card ending {transaction.giftCard?.codeLast4 || '••••'}</p><p className="text-xs text-slate-500">{transaction.direction} · {transaction.source}</p></div><strong className={`shrink-0 ${transaction.direction === 'reversal' || transaction.direction === 'issue' ? 'text-emerald-600' : 'text-slate-900'}`}>{transaction.direction === 'redeem' ? '-' : '+'}{formatPrice(transaction.amount, settings)}</strong></div>)}{transactions.length === 0 && <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-fuchsia-50"><Gift size={28} className="text-fuchsia-500" /></span><p className="mt-4 font-bold text-slate-900">No gift card activity yet</p><p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">Apply a code during checkout and its usage will appear here.</p></div>}</div>}
    </div>
  </>;
}
