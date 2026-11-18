import { useEffect, useState } from 'react';
import { Bell, Heart, RefreshCw, Tag, TrendingDown } from 'lucide-react';
import { adminAPI } from '../../services/api';
import SEO from '../../components/common/SEO';
import Loader from '../../components/common/Loader';
import { formatPrice } from '../../utils/formatPrice';
import { useSite } from '../../context/SiteContext';

const metricCards = [
  { key: 'wishlistItems', label: 'Wishlist saves', icon: Heart, tone: 'text-rose-600 bg-rose-50' },
  { key: 'wishlistCustomers', label: 'Wishlist customers', icon: Tag, tone: 'text-indigo-600 bg-indigo-50' },
  { key: 'backInStockSubscribers', label: 'Back-in-stock alerts', icon: Bell, tone: 'text-amber-600 bg-amber-50' },
  { key: 'priceDropSubscribers', label: 'Price-drop alerts', icon: TrendingDown, tone: 'text-emerald-600 bg-emerald-50' },
];

export default function AdminProductIntentPage() {
  const { settings } = useSite();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    adminAPI.getProductIntents()
      .then(response => setData(response.data))
      .catch(err => setError(err.response?.data?.message || 'Unable to load product intent analytics'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <>
      <SEO title="Product Intent" noindex />
      <div className="p-4 sm:p-6 lg:p-8 space-y-6" data-testid="product-intent-page">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Customer intent</p>
            <h1 className="mt-1 text-2xl font-black text-slate-900">Wishlist & product alerts</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">See which of your products shoppers saved, and which products have active back-in-stock or price-drop demand.</p>
          </div>
          <button type="button" onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50" data-testid="product-intent-refresh">
            <RefreshCw size={15} /> Refresh
          </button>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {loading && !data ? <Loader size="lg" /> : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {metricCards.map(({ key, label, icon: Icon, tone }) => (
                <div key={key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid={`product-intent-metric-${key}`}>
                  <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}><Icon size={17} /></div>
                  <p className="text-2xl font-black text-slate-900">{data?.summary?.[key] || 0}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                </div>
              ))}
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="font-bold text-slate-900">Top product demand</h2>
                <p className="mt-1 text-xs text-slate-500">Counts are scoped to this store and reflect active alert subscriptions.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                    <tr><th className="px-5 py-3">Product</th><th className="px-5 py-3">Price</th><th className="px-5 py-3">Wishlist</th><th className="px-5 py-3">Back in stock</th><th className="px-5 py-3">Price drop</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(data?.products || []).map(row => (
                      <tr key={row.product._id} data-testid={`product-intent-row-${row.product._id}`}>
                        <td className="px-5 py-3 font-semibold text-slate-800">{row.product.title}</td>
                        <td className="px-5 py-3 text-slate-600">{formatPrice(row.product.price, settings)}</td>
                        <td className="px-5 py-3 font-bold text-rose-600">{row.wishlistCount}</td>
                        <td className="px-5 py-3 font-bold text-amber-600">{row.backInStockSubscribers}</td>
                        <td className="px-5 py-3 font-bold text-emerald-600">{row.priceDropSubscribers}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data?.products?.length === 0 && <p className="px-5 py-10 text-center text-sm text-slate-400">No product intent signals recorded yet.</p>}
            </div>
          </>
        )}
      </div>
    </>
  );
}
