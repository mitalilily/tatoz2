import { useCallback, useEffect, useState } from 'react';
import { FileCheck2, FileDown, RefreshCw, Search, ShieldCheck, Ban } from 'lucide-react';
import { invoiceAPI } from '../../services/api';
import { useSite } from '../../context/SiteContext';
import { formatPrice } from '../../utils/formatPrice';
import Loader from '../../components/common/Loader';
import Pagination from '../../components/common/Pagination';
import SEO from '../../components/common/SEO';
import toast from 'react-hot-toast';

export default function AdminInvoicesPage() {
  const { settings } = useSite();
  const [invoices, setInvoices] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await invoiceAPI.getAdmin({ page, limit: 20, search: search.trim() || undefined, status: status || undefined });
      setInvoices(response.data.invoices || []);
      setPagination(response.data.pagination || { page, pages: 1, total: 0 });
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || 'Unable to load invoices');
    } finally { setLoading(false); }
  }, [page, search, status]);

  useEffect(() => { load(); }, [load]);

  const download = async invoice => {
    setBusyId(invoice._id);
    try {
      const response = await invoiceAPI.getAdminById(invoice._id);
      const { generateInvoice } = await import('../../utils/generateInvoice');
      generateInvoice(response.data.invoice, settings);
    } catch (requestError) { toast.error(requestError.response?.data?.message || requestError.message || 'Could not prepare invoice'); }
    finally { setBusyId(null); }
  };

  const voidInvoice = async invoice => {
    if (invoice.status === 'void') return;
    setBusyId(invoice._id);
    try {
      await invoiceAPI.voidAdmin(invoice._id, 'Voided by tenant administrator');
      toast.success('Invoice voided');
      await load();
    } catch (requestError) { toast.error(requestError.response?.data?.message || requestError.message || 'Could not void invoice'); }
    finally { setBusyId(null); }
  };

  return <>
    <SEO title="Invoices" noindex />
    <main data-testid="admin-invoices-page" className="space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Finance & compliance</p><h1 className="mt-1 text-2xl font-black text-slate-900">Invoices</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Every document is generated from the tenant order and GST snapshot. Browser totals cannot change the invoice.</p></div>
        <button type="button" onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm" data-testid="admin-invoices-refresh"><RefreshCw size={15} /> Refresh</button>
      </header>
      <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_180px]">
        <label className="relative block"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input data-testid="invoice-search" value={search} onChange={event => { setPage(1); setSearch(event.target.value); }} placeholder="Search invoice, order or customer" className="input pl-9 w-full" /></label>
        <select data-testid="invoice-status" value={status} onChange={event => { setPage(1); setStatus(event.target.value); }} className="input bg-white"><option value="">All statuses</option><option value="issued">Issued</option><option value="void">Void</option></select>
      </section>
      {error && <div data-testid="admin-invoices-error" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold text-slate-900">Issued documents</h2><p className="mt-1 text-xs text-slate-500">{Number(pagination.total || 0)} tenant-scoped invoice records</p></div>
        {loading ? <div className="flex justify-center py-12"><Loader /></div> : invoices.length === 0 ? <p className="px-5 py-12 text-center text-sm text-slate-400">No invoices found for this tenant.</p> : <div className="divide-y divide-slate-100">
          {invoices.map(invoice => <div key={invoice._id} data-testid={'admin-invoice-row-' + invoice._id} className="flex flex-wrap items-center gap-4 px-5 py-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><FileCheck2 size={18} /></span>
            <div className="min-w-[180px] flex-1"><p className="font-mono text-sm font-bold text-slate-800">{invoice.invoiceNumber}</p><p className="text-xs text-slate-500">Order {invoice.orderNumber} · {invoice.buyer?.name || 'Customer'}</p></div>
            <div className="text-right"><p className="text-sm font-black text-slate-900">{formatPrice(invoice.total || 0, settings)}</p><p className="text-xs text-slate-500">{invoice.documentType?.replace(/_/g, ' ')}</p></div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${invoice.status === 'void' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{invoice.status}</span>
            <div className="flex items-center gap-1"><button type="button" data-testid={'invoice-download-' + invoice._id} onClick={() => download(invoice)} disabled={busyId === invoice._id} className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50 disabled:opacity-50" title="Download invoice"><FileDown size={16} /></button><button type="button" data-testid={'invoice-void-' + invoice._id} onClick={() => voidInvoice(invoice)} disabled={invoice.status === 'void' || busyId === invoice._id} className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-40" title="Void invoice"><Ban size={16} /></button></div>
          </div>)}
        </div>}
      </section>
      <div className="flex items-center justify-between"><span className="inline-flex items-center gap-2 text-xs text-slate-500"><ShieldCheck size={14} className="text-emerald-600" />Tax and customer data are read from the immutable order snapshot.</span><Pagination currentPage={page} totalPages={pagination.pages || 1} onPageChange={setPage} /></div>
    </main>
  </>;
}
