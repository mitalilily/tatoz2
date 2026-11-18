import { useCallback, useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, RefreshCw, WalletCards } from 'lucide-react';
import { walletAPI } from '../../services/api';
import { useSite } from '../../context/SiteContext';
import { formatPrice } from '../../utils/formatPrice';
import Loader from '../../components/common/Loader';
import EmptyState from '../../components/common/EmptyState';
import AccountHeader from '../../components/customer/AccountHeader';
import Pagination from '../../components/common/Pagination';
import SEO from '../../components/common/SEO';

const sourceLabel = source => String(source || 'wallet').replace(/_/g, ' ');

export default function WalletPage() {
  const { settings } = useSite();
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await walletAPI.get({ page, limit: 15 });
      setData(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load your wallet');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const wallet = data?.wallet || { cashBalance: 0, promotionalBalance: 0, totalBalance: 0 };
  const transactions = data?.transactions || [];

  return (
    <>
      <SEO title="Wallet & Store Credit" noindex />
      <div className="page-container account-wrap-narrow py-6 sm:py-8" data-testid="customer-wallet-page">
        <AccountHeader
          kicker="Customer wallet"
          title="Wallet & store credit"
          sub="Refunds, credits and every ledger change in one place."
          icon={<WalletCards size={20} />}
          accent="emerald"
          actions={(
            <button type="button" onClick={load} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 sm:w-auto" data-testid="wallet-refresh">
              <RefreshCw size={15} /> Refresh
            </button>
          )}
        />

        {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" data-testid="wallet-error">{error}</div>}
        {loading && !data ? <div className="flex justify-center py-16"><Loader size="lg" /></div> : (
          <>
            <div className="grid gap-3 sm:grid-cols-3" data-testid="wallet-balances">
              <div className="rounded-2xl bg-slate-900 p-4 sm:p-5 text-white">
                <WalletCards size={19} className="mb-5 text-indigo-200" />
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Total balance</p>
                <p className="mt-1 text-2xl font-black" data-testid="wallet-total">{formatPrice(wallet.totalBalance, settings)}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Cash balance</p>
                <p className="mt-2 text-xl font-black text-gray-900" data-testid="wallet-cash">{formatPrice(wallet.cashBalance, settings)}</p>
                <p className="mt-1 text-xs text-gray-500">Refunds and customer-paid credit</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Promotional balance</p>
                <p className="mt-2 text-xl font-black text-emerald-600" data-testid="wallet-promotional">{formatPrice(wallet.promotionalBalance, settings)}</p>
                <p className="mt-1 text-xs text-gray-500">Promotions may have an expiry date</p>
              </div>
            </div>

            <section className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white" data-testid="wallet-ledger">
              <div className="border-b border-gray-100 px-4 py-4 sm:px-5">
                <h2 className="font-bold text-gray-900">Wallet transaction history</h2>
                <p className="mt-1 text-xs text-gray-500">Credits and debits are authoritative server ledger entries.</p>
              </div>
              {transactions.length === 0 ? <EmptyState icon={WalletCards} title="No wallet activity yet" description="Store credits and promotional balances will appear here." /> : (
                <div className="divide-y divide-gray-100">
                  {transactions.map(transaction => {
                    const credit = transaction.direction === 'credit';
                    return (
                      <div key={transaction._id} className="flex min-w-0 items-center gap-3 px-4 py-4 sm:px-5" data-testid={`wallet-transaction-${transaction._id}`}>
                        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${credit ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                          {credit ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold capitalize text-gray-800">{sourceLabel(transaction.source)}</p>
                          <p className="text-xs text-gray-500">{transaction.bucket === 'promotional' ? 'Promotional' : 'Cash'} · {new Date(transaction.createdAt).toLocaleString('en-IN')}</p>
                          {transaction.note && <p className="truncate text-xs text-gray-400">{transaction.note}</p>}
                        </div>
                        <p className={`shrink-0 text-sm font-black ${credit ? 'text-emerald-600' : 'text-rose-600'}`}>{credit ? '+' : '-'}{formatPrice(transaction.amount, settings)}</p>
                      </div>
                    );
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
