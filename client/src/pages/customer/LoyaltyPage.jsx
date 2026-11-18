import { useCallback, useEffect, useState } from 'react';
import { Award, ArrowDownLeft, ArrowUpRight, RefreshCw } from 'lucide-react';
import { loyaltyAPI } from '../../services/api';
import { useSite } from '../../context/SiteContext';
import { formatPrice } from '../../utils/formatPrice';
import Loader from '../../components/common/Loader';
import EmptyState from '../../components/common/EmptyState';
import Pagination from '../../components/common/Pagination';
import AccountHeader from '../../components/customer/AccountHeader';
import SEO from '../../components/common/SEO';

const sourceLabel = source => String(source || 'loyalty').replace(/_/g, ' ');

export default function LoyaltyPage() {
  const { settings } = useSite();
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await loyaltyAPI.get({ page, limit: 15 });
      setData(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load your rewards account');
    } finally { setLoading(false); }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const account = data?.account || { pointsBalance: 0, lifetimeEarned: 0, lifetimeRedeemed: 0, tier: 'bronze' };
  const program = data?.program || {};
  const transactions = data?.transactions || [];
  const tier = (program.tiers || []).find(item => item.id === account.tier);

  return (
    <>
      <SEO title="Loyalty & Rewards" noindex />
      <div className="page-container account-wrap py-6 sm:py-8" data-testid="customer-loyalty-page">
        <AccountHeader
          kicker="Customer rewards"
          title="Loyalty & rewards"
          sub="Earn points on eligible purchases and redeem them for discounts."
          icon={<Award size={20} />}
          accent="amber"
          actions={(
            <button type="button" onClick={load} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 sm:w-auto" data-testid="loyalty-refresh">
              <RefreshCw size={15} /> Refresh
            </button>
          )}
        />

        {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" data-testid="loyalty-error">{error}</div>}
        {loading && !data ? <div className="flex justify-center py-16"><Loader size="lg" /></div> : (
          <>
            {!program.enabled && <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" data-testid="loyalty-disabled">This store's loyalty program is currently paused.</div>}
            <div className="grid gap-3 sm:grid-cols-4" data-testid="loyalty-balances">
              <div className="rounded-2xl bg-slate-900 p-4 sm:p-5 text-white">
                <Award size={19} className="mb-5 text-amber-300" />
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Available points</p>
                <p className="mt-1 text-2xl font-black" data-testid="loyalty-balance">{account.pointsBalance.toLocaleString('en-IN')}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"><p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Current tier</p><p className="mt-2 text-xl font-black capitalize text-amber-600" data-testid="loyalty-tier">{tier?.label || account.tier}</p><p className="mt-1 text-xs text-gray-500">{tier ? `${tier.earnMultiplier}x earn multiplier` : 'Rewards tier'}</p></div>
              <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"><p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Lifetime earned</p><p className="mt-2 text-xl font-black text-gray-900" data-testid="loyalty-earned">{account.lifetimeEarned.toLocaleString('en-IN')}</p><p className="mt-1 text-xs text-gray-500">Points earned in this store</p></div>
              <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"><p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Redeemed</p><p className="mt-2 text-xl font-black text-gray-900" data-testid="loyalty-redeemed">{account.lifetimeRedeemed.toLocaleString('en-IN')}</p><p className="mt-1 text-xs text-gray-500">{program.redeemPointsPerCurrency || 1} points = {formatPrice(1, settings)}</p></div>
            </div>

            <section className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white" data-testid="loyalty-ledger">
              <div className="border-b border-gray-100 px-4 py-4 sm:px-5"><h2 className="font-bold text-gray-900">Rewards activity</h2><p className="mt-1 break-anywhere text-xs text-gray-500">Purchases, redemptions, reversals, and expiries appear here.</p></div>
              {transactions.length === 0 ? <EmptyState icon={Award} title="No rewards activity yet" description="Earn points through eligible purchases and store campaigns." /> : (
                <div className="divide-y divide-gray-100">
                  {transactions.map(transaction => {
                    const credit = transaction.direction === 'earn' || transaction.direction === 'reversal';
                    return <div key={transaction._id} className="flex min-w-0 items-center gap-3 px-4 py-4 sm:px-5" data-testid={`loyalty-transaction-${transaction._id}`}>
                      <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${credit ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{credit ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}</div>
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold capitalize text-gray-800">{sourceLabel(transaction.source)}</p><p className="text-xs text-gray-500">{transaction.direction} · {new Date(transaction.createdAt).toLocaleString('en-IN')}</p>{transaction.note && <p className="truncate text-xs text-gray-400">{transaction.note}</p>}</div>
                      <p className={`shrink-0 text-sm font-black ${credit ? 'text-emerald-600' : 'text-rose-600'}`}>{credit ? '+' : '-'}{transaction.points.toLocaleString('en-IN')} pts</p>
                    </div>;
                  })}
                </div>
              )}
            </section>
            {data?.pagination?.pages > 1 && <div className="mt-5"><Pagination currentPage={page} totalPages={data.pagination.pages} onPageChange={setPage} /></div>}
          </>
        )}
      </div>
    </>
  );
}
