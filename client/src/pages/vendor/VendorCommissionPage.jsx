import { useEffect, useState } from 'react';
import { BadgePercent, IndianRupee, ReceiptText, TrendingUp, Truck } from 'lucide-react';
import { vendorAPI } from '../../services/api';
import Loader from '../../components/common/Loader';

const money = value => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function VendorCommissionPage() {
  const [data, setData] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([vendorAPI.getCommission(), vendorAPI.getInvoices({ limit: 100 })])
      .then(([commission, invoiceResponse]) => {
        setData(commission.data?.data || null);
        setInvoices(invoiceResponse.data?.invoices || []);
      }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const download = async invoice => {
    const { generateInvoice } = await import('../../utils/generateInvoice');
    generateInvoice(invoice, {});
  };

  if (loading) return <div className="flex justify-center py-16"><Loader /></div>;
  if (!data) return <div className="py-12 text-center text-red-500">Commission data could not be loaded.</div>;
  const totals = data.totals || {};
  const rateLabel = data.overrideRate !== null && data.overrideRate !== undefined
    ? `${data.overrideRate}% seller override`
    : `Product/category policy with ${data.defaultRate}% default fallback`;

  return <div className="mx-auto max-w-6xl space-y-6" data-testid="vendor-commission-page">
    <header><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Seller finance</p><h1 className="mt-2 text-2xl font-bold text-gray-900">Commission & invoices</h1><p className="mt-1 text-sm text-gray-500">See the exact product/category rate applied to your sales, commission deductions and courier invoices.</p></header>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[['Orders', totals.orders, ReceiptText, 'bg-blue-50 text-blue-600'], ['Sales', money(totals.sales), TrendingUp, 'bg-indigo-50 text-indigo-600'], ['Commission', money(totals.commission), BadgePercent, 'bg-amber-50 text-amber-600'], ['Your earnings', money(totals.earnings), IndianRupee, 'bg-emerald-50 text-emerald-600']].map(([label, value, Icon, color]) => <div key={label} className="rounded-2xl border border-gray-100 bg-white p-5"><div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${color}`}><Icon size={18} /></div><p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p><p className="mt-1 text-2xl font-bold text-gray-900">{value}</p></div>)}
    </div>
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-gray-900">Applied policy</h2><p className="mt-1 text-sm text-gray-500">{rateLabel}</p></div><span className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">Server-calculated</span></div><p className="mt-4 text-sm leading-6 text-gray-600">Specific product rules win over category and seller rules. Historical orders retain the rate snapshot used at checkout. Shipping and tax are not commissionable.</p></section>
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"><div className="border-b border-gray-100 p-5"><h2 className="font-bold text-gray-900">Product commission rates</h2><p className="mt-1 text-xs text-gray-500">The effective rate for each product in your catalog.</p></div><div className="divide-y divide-gray-100">{(data.productRates || []).map(product => <div key={product._id} className="flex items-center justify-between gap-3 px-5 py-4 text-sm"><div><p className="font-medium text-gray-800">{product.title}</p><p className="text-xs text-gray-400">{product.category?.name || 'No category'} · {product.source}{product.ruleName ? ` · ${product.ruleName}` : ''}</p></div><span className="shrink-0 rounded-full bg-gray-100 px-3 py-1 font-semibold text-gray-700">{product.commissionRate}%{product.flatFee ? ` + ${money(product.flatFee)}` : ''}</span></div>)}{!data.productRates?.length && <p className="p-8 text-center text-sm text-gray-400">Product rates will appear after you add a product.</p>}</div></section>
      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"><div className="border-b border-gray-100 p-5"><h2 className="font-bold text-gray-900">Category commission rates</h2><p className="mt-1 text-xs text-gray-500">Rates for categories currently used by your catalog.</p></div><div className="divide-y divide-gray-100">{(data.categoryRates || []).map(category => <div key={category._id} className="flex items-center justify-between px-5 py-4 text-sm"><span className="font-medium text-gray-800">{category.name}</span><span className="rounded-full bg-gray-100 px-3 py-1 font-semibold text-gray-700">{category.commissionRate ?? data.defaultRate}%</span></div>)}{!data.categoryRates?.length && <p className="p-8 text-center text-sm text-gray-400">Category rates will appear after you add a product.</p>}</div></section>
    </div>
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"><div className="border-b border-gray-100 p-5"><div className="flex items-center gap-2"><Truck size={18} className="text-indigo-600" /><h2 className="font-bold text-gray-900">Commission & courier invoices</h2></div><p className="mt-1 text-xs text-gray-500">An invoice is generated for every applicable sale deduction and courier charge.</p></div><div className="divide-y divide-gray-100">{invoices.map(invoice => <div key={invoice._id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm"><div><p className="font-medium text-gray-800">{invoice.documentType === 'commission_invoice' ? 'Platform commission' : 'Courier charges'}</p><p className="text-xs text-gray-400">{invoice.invoiceNumber} · {new Date(invoice.issueDate || invoice.createdAt).toLocaleDateString('en-IN')}</p></div><div className="flex items-center gap-3"><span className="font-semibold text-gray-700">{money(invoice.total)}</span><button onClick={() => download(invoice)} className="rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-600">Download</button></div></div>)}{!invoices.length && <p className="p-8 text-center text-sm text-gray-400">Invoices will appear automatically after your next sale.</p>}</div></section>
  </div>;
}
