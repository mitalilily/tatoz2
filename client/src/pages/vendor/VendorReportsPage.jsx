import { useEffect, useState } from 'react';
import { BarChart3, Download, FileBarChart, TrendingUp } from 'lucide-react';
import { vendorAPI } from '../../services/api';
import Loader from '../../components/common/Loader';

const money = value => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function VendorReportsPage() {
  const [period, setPeriod] = useState('30d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { setLoading(true); vendorAPI.getReports({ period }).then(response => setData(response.data?.data || null)).catch(() => {}).finally(() => setLoading(false)); }, [period]);
  if (loading) return <div className="flex justify-center py-16"><Loader /></div>;
  if (!data) return <div className="py-12 text-center text-red-500">Reports could not be loaded.</div>;
  const summary = data.summary || {};
  const downloadCsv = () => {
    const rows = [
      ['Section', 'Metric', 'Value'],
      ...Object.entries(summary).map(([key, value]) => ['summary', key, value]),
      ['Section', 'Status', 'Orders', 'Sales', 'Earnings'],
      ...(data.byStatus || []).map(row => ['status', row._id, row.orders, row.sales, row.earnings]),
      ['Section', 'Date', 'Orders', 'Sales', 'Commission', 'Earnings'],
      ...(data.daily || []).map(row => ['daily', row._id, row.orders, row.sales, row.commission, row.earnings]),
      ['Section', 'Product', 'Sold', 'Sales'],
      ...(data.topProducts || []).map(row => ['product', row._id?.title || 'Product deleted', row.sold, row.sales]),
    ];
    const csv = rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `seller-report-${period}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return <div className="mx-auto max-w-6xl space-y-6" data-testid="vendor-reports-page">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Seller insights</p><h1 className="mt-2 text-2xl font-bold text-gray-900">Reports</h1><p className="mt-1 text-sm text-gray-500">Tenant-scoped sales, commission and earnings report.</p></div><div className="flex items-end gap-3"><label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Period<select data-testid="vendor-report-period" value={period} onChange={event => setPeriod(event.target.value)} className="mt-1 block rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm normal-case text-gray-700"><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option></select></label><button type="button" data-testid="vendor-report-download" onClick={downloadCsv} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white"><Download size={15} />Download CSV</button></div></header>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{[["Products", summary.products], ["Orders", summary.orders], ["Sales", money(summary.sales)], ["Commission", money(summary.commission)], ["Earnings", money(summary.earnings)]].map(([label, value]) => <div key={label} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p><p className="mt-2 text-2xl font-bold text-gray-900">{value}</p></div>)}</div>
    <section className="rounded-2xl border border-gray-100 bg-white shadow-sm"><div className="flex items-center gap-2 border-b border-gray-100 p-5"><TrendingUp size={18} className="text-indigo-600" /><h2 className="font-bold text-gray-900">Daily performance</h2></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">Orders</th><th className="px-5 py-3">Sales</th><th className="px-5 py-3">Commission</th><th className="px-5 py-3">Earnings</th></tr></thead><tbody>{(data.daily || []).map(row => <tr key={row._id} className="border-t border-gray-100"><td className="px-5 py-3">{row._id}</td><td className="px-5 py-3">{row.orders}</td><td className="px-5 py-3">{money(row.sales)}</td><td className="px-5 py-3">{money(row.commission)}</td><td className="px-5 py-3 font-semibold">{money(row.earnings)}</td></tr>)}{!data.daily?.length && <tr><td colSpan="5" className="p-10 text-center text-sm text-gray-400">No sales for this period.</td></tr>}</tbody></table></div></section>
    <div className="grid gap-5 lg:grid-cols-2"><section className="rounded-2xl border border-gray-100 bg-white shadow-sm"><div className="flex items-center gap-2 border-b border-gray-100 p-5"><BarChart3 size={18} className="text-indigo-600" /><h2 className="font-bold text-gray-900">Order status</h2></div><div className="divide-y divide-gray-100">{(data.byStatus || []).map(row => <div key={row._id} className="flex items-center justify-between px-5 py-3 text-sm"><span className="capitalize">{String(row._id).replaceAll('_', ' ')}</span><span className="font-semibold">{row.orders} · {money(row.sales)}</span></div>)}{!data.byStatus?.length && <p className="p-8 text-center text-sm text-gray-400">No order status data.</p>}</div></section><section className="rounded-2xl border border-gray-100 bg-white shadow-sm"><div className="flex items-center gap-2 border-b border-gray-100 p-5"><FileBarChart size={18} className="text-indigo-600" /><h2 className="font-bold text-gray-900">Top products</h2></div><div className="divide-y divide-gray-100">{(data.topProducts || []).map(row => <div key={row._id?._id || row._id} className="flex items-center justify-between px-5 py-3 text-sm"><span className="truncate pr-4">{row._id?.title || 'Product deleted'}</span><span className="shrink-0 font-semibold">{row.sold} sold · {money(row.sales)}</span></div>)}{!data.topProducts?.length && <p className="p-8 text-center text-sm text-gray-400">No product sales data.</p>}</div></section></div>
    <div className="flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-xs leading-5 text-indigo-800"><FileBarChart size={15} />Report values are generated from your tenant-scoped order data; CSV export contains the same server-calculated figures.</div>
  </div>;
}
