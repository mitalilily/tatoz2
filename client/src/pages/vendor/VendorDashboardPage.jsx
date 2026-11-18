import { useEffect, useState } from 'react';
import { vendorAPI } from '../../services/api';
import { Package, ShoppingBag, Wallet, TrendingUp, AlertTriangle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function VendorDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [chartPeriod, setChartPeriod] = useState('7d');
  const [chartData, setChartData] = useState(null);

  useEffect(() => {
    vendorAPI.getDashboard().then(r => setData(r.data.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!chartPeriod) return;
    vendorAPI.getAnalytics({ period: chartPeriod }).then(r => setChartData(r.data.data)).catch(() => {});
  }, [chartPeriod]);

  const stockBadge = (stock, threshold) => {
    if (stock === 0) return <span className="text-red-600 font-medium">Out of stock</span>;
    if (threshold > 0 && stock <= threshold) return <span className="text-amber-600 font-medium">Low ({stock})</span>;
    return <span className="text-green-600 font-medium">In stock</span>;
  };

  if (loading) return <div className="text-center py-12 text-gray-400">Loading dashboard...</div>;
  if (!data) return <div className="text-center py-12 text-red-500">Failed to load dashboard</div>;

  const cards = [
    { label: 'Wallet Balance', value: `₹${(data.stats.walletBalance || 0).toLocaleString()}`, icon: Wallet, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Active Products', value: data.stats.activeProducts, icon: Package, color: 'text-blue-600', bg: 'bg-blue-50', link: '/vendor/products' },
    { label: 'Total Orders', value: data.stats.totalOrders, icon: ShoppingBag, color: 'text-indigo-600', bg: 'bg-indigo-50', link: '/vendor/orders' },
    { label: 'Revenue', value: `₹${(data.stats.revenue || 0).toLocaleString()}`, icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50' },
  ];

  const chartSeries = chartData?.salesData || [];
  const lowStockProducts = data.lowStockProducts || [];
  const recentOrders = data.recentOrders || [];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map(c => (
          <div key={c.label} className={`${c.bg} rounded-xl p-5`}>
            <div className="flex items-center justify-between mb-3">
              <span className={`${c.color} font-medium text-sm`}>{c.label}</span>
              <c.icon size={20} className={c.color} />
            </div>
            <div className="text-2xl font-bold">{c.value}</div>
            {c.link && <Link to={c.link} className="text-xs text-indigo-600 mt-1 block">View all →</Link>}
          </div>
        ))}
      </div>

      {/* Chart + Low stock */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Sales chart */}
        <div className="lg:col-span-2 bg-white rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">📈 Sales</h2>
            <div className="flex gap-1">
              {['7d', '30d', '90d'].map(p => (
                <button key={p} onClick={() => setChartPeriod(p)}
                  className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${chartPeriod === p ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          {chartSeries.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="_id" tick={{ fontSize: 11 }} tickFormatter={v => {
                  const d = new Date(v);
                  return `${d.getDate()}/${d.getMonth() + 1}`;
                }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${v}`} />
                <Tooltip formatter={(v) => [`₹${v.toLocaleString()}`, 'Revenue']} labelFormatter={l => new Date(l).toLocaleDateString()} />
                <Line type="monotone" dataKey="sales" stroke="#4f46e5" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <div className="h-[240px] flex items-center justify-center text-gray-400 text-sm">No sales data for this period</div>}
        </div>

        {/* Low stock alerts */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-500" /> Low Stock Alerts
          </h2>
          {lowStockProducts.length > 0 ? (
            <div className="space-y-3">
              {lowStockProducts.map(p => (
                <div key={p._id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <img src={p.thumbnail || p.images?.[0]?.url || 'https://via.placeholder.com/40'} alt="" className="w-10 h-10 rounded-lg object-cover bg-gray-100 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{p.title}</p>
                      <p className="text-xs text-gray-400">{stockBadge(p.stock, p.lowStockThreshold)}</p>
                    </div>
                  </div>
                  <button onClick={() => navigate('/vendor/inventory')} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium whitespace-nowrap ml-2">
                    Restock
                  </button>
                </div>
              ))}
              {lowStockProducts.length >= 5 && (
                <Link to="/vendor/inventory?status=low" className="text-xs text-indigo-600 mt-2 block">View all →</Link>
              )}
            </div>
          ) : <p className="text-sm text-gray-400">All products well-stocked ✓</p>}
        </div>
      </div>

      {/* Recent orders + Orders by Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Recent orders */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h2 className="font-semibold mb-4">📋 Recent Orders</h2>
          {recentOrders.length > 0 ? (
            <div className="space-y-3">
              {recentOrders.slice(0, 5).map(o => {
                const sub = o.subOrders?.find?.(s => s.vendor) || o.subOrders?.[0] || {};
                return (
                  <div key={o._id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                    <div>
                      <p className="font-medium text-gray-900">#{o.orderNumber}</p>
                      <p className="text-xs text-gray-400">{new Date(o.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">₹{(sub.total || o.total || 0).toLocaleString()}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        sub.status === 'delivered' ? 'bg-green-100 text-green-700' :
                        sub.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>{sub.status?.replace(/_/g, ' ') || '—'}</span>
                    </div>
                  </div>
                );
              })}
              <Link to="/vendor/orders" className="text-xs text-indigo-600 mt-2 block">View all →</Link>
            </div>
          ) : <p className="text-sm text-gray-400">No orders yet</p>}
        </div>

        {/* Orders by status (existing) */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h2 className="font-semibold mb-4">Orders by Status</h2>
          {Object.entries(data.ordersByStatus || {}).length > 0 ? Object.entries(data.ordersByStatus).map(([status, s]) => (
            <div key={status} className="flex justify-between py-2 border-b last:border-0 text-sm">
              <span className="capitalize">{status.replace(/_/g, ' ')}</span>
              <span className="font-medium">{s.count} orders · ₹{(s.revenue || 0).toLocaleString()}</span>
            </div>
          )) : <p className="text-sm text-gray-400">No orders yet</p>}
        </div>
      </div>

      {/* Recent ledger (existing) */}
      <div className="bg-white rounded-xl p-5 shadow-sm">
        <h2 className="font-semibold mb-4">Recent Ledger</h2>
        {data.recentLedger?.length > 0 ? data.recentLedger.slice(0, 5).map(e => (
          <div key={e._id} className="flex justify-between py-2 border-b last:border-0 text-sm">
            <div>
              <span className="text-xs text-gray-400">{new Date(e.createdAt).toLocaleDateString()}</span>
              <p className="text-gray-700">{e.type.replace(/_/g, ' ')}</p>
            </div>
            <span className={e.amount >= 0 ? 'text-green-600' : 'text-red-600'}>
              {e.amount >= 0 ? '+' : ''}₹{e.amount.toLocaleString()}
            </span>
          </div>
        )) : <p className="text-sm text-gray-400">No ledger entries yet</p>}
      </div>
    </div>
  );
}
