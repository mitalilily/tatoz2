import { useEffect, useState } from 'react';
import { vendorAPI } from '../../services/api';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function VendorAnalyticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('7d');

  useEffect(() => {
    setLoading(true);
    vendorAPI.getAnalytics({ period })
      .then(r => setData(r.data.data))
      .finally(() => setLoading(false));
  }, [period]);

  if (loading) return <div className="text-center py-12 text-gray-400">Loading...</div>;
  if (!data) return <div className="text-center py-12 text-red-500">No data</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <select className="px-3 py-2 border rounded-lg" value={period} onChange={e => setPeriod(e.target.value)}>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="font-semibold mb-4">Daily Sales</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data.salesData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="_id" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="sales" stroke="#6366f1" strokeWidth={2} />
            <Line type="monotone" dataKey="earnings" stroke="#10b981" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="font-semibold mb-4">Top Products</h2>
        <table className="w-full text-sm">
          <thead className="text-gray-600 text-left">
            <tr><th className="py-2">Product</th><th className="py-2">Sold</th><th className="py-2">Revenue</th></tr>
          </thead>
          <tbody>
            {data.topProducts.map(p => (
              <tr key={p._id?._id || p._id} className="border-t">
                <td className="py-3">{p._id?.title || 'Product deleted'}</td>
                <td className="py-3">{p.totalSold}</td>
                <td className="py-3">₹{p.revenue.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
