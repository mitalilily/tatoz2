import { useEffect, useMemo, useState } from 'react';
import { BadgePercent, RefreshCw, Save, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import Loader from '../../components/common/Loader';
import { adminAPI } from '../../services/api';

const RATE_OPTIONS = [0, 5, 12, 18, 28];

export default function AdminProductTaxPage() {
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState({ page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(new Set());

  const load = async (page = pagination.page) => {
    setLoading(true);
    try {
      const response = await adminAPI.getProductTaxes({ page, limit: 50, search });
      setRows((response.data?.products || []).map(item => ({ ...item, draftRate: item.gstRate ?? '', draftHsn: item.hsnCode || '' })));
      setPagination(response.data?.pagination || { page, pages: 1 });
      setDirty(new Set());
    } catch (error) {
      toast.error(error.message || 'Could not load product taxes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(1); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = query.trim();
      if (next !== search) setSearch(next);
    }, 350);
    return () => clearTimeout(timer);
  }, [query, search]);

  const updateRow = (id, field, value) => {
    setRows(current => current.map(row => row._id === id ? { ...row, [field]: value } : row));
    setDirty(current => new Set(current).add(id));
  };

  const dirtyRows = useMemo(() => rows.filter(row => dirty.has(row._id)), [rows, dirty]);

  const save = async () => {
    if (!dirtyRows.length) return toast.success('No tax changes to save');
    setSaving(true);
    try {
      await adminAPI.bulkUpdateProductTaxes({ items: dirtyRows.map(row => ({ id: row._id, gstRate: row.draftRate === 'custom' ? row.customRate : row.draftRate, hsnCode: row.draftHsn })) });
      toast.success(`${dirtyRows.length} product tax row${dirtyRows.length > 1 ? 's' : ''} updated`);
      await load(pagination.page);
    } catch (error) {
      toast.error(error.message || 'Could not save product taxes');
    } finally {
      setSaving(false);
    }
  };

  return <main data-testid="product-tax-page" className="min-h-full bg-slate-50 p-4 sm:p-6 lg:p-8">
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Catalog compliance</p><h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-900"><BadgePercent className="text-indigo-600" />Product Tax</h1><p className="mt-1 text-sm text-slate-500">Update HSN and the individual GST rate used by server-side checkout and invoices.</p></div>
        <div className="flex gap-2"><button data-testid="product-tax-refresh" type="button" onClick={() => load(pagination.page)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600"><RefreshCw size={15} />Refresh</button><button data-testid="product-tax-save" type="button" onClick={save} disabled={saving || !dirtyRows.length} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Save size={15} />{saving ? 'Saving…' : `Save${dirtyRows.length ? ` (${dirtyRows.length})` : ''}`}</button></div>
      </header>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4"><div className="relative min-w-[240px] flex-1"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input data-testid="product-tax-search" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') setSearch(query.trim()); }} placeholder="Search product, SKU, or HSN…" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-10 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" />{query && <button type="button" aria-label="Clear product tax search" onClick={() => { setQuery(''); setSearch(''); }} className="absolute right-2 top-2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={15} /></button>}</div><button type="button" onClick={() => setSearch(query.trim())} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700">Search</button><span className="text-xs text-slate-500">Standard GST rates: {RATE_OPTIONS.join('% · ')}% or custom</span></div>
        {loading ? <div className="flex min-h-[300px] items-center justify-center"><Loader /></div> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Vendor</th><th className="px-4 py-3">SKU</th><th className="px-4 py-3">HSN code</th><th className="px-4 py-3">GST rate</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map(row => <tr key={row._id} data-testid={`product-tax-row-${row._id}`} className={dirty.has(row._id) ? 'bg-amber-50/60' : 'hover:bg-slate-50/70'}><td className="px-4 py-3"><p className="font-semibold text-slate-800">{row.title}</p><p className="mt-0.5 text-xs text-slate-400">{row.category?.name || 'Uncategorised'}</p></td><td className="px-4 py-3 text-xs text-slate-600">{row.vendor?.storeName || 'Platform'}</td><td className="px-4 py-3 font-mono text-xs text-slate-500">{row.sku || '—'}</td><td className="px-4 py-3"><input aria-label={`HSN for ${row.title}`} data-testid={`product-tax-hsn-${row._id}`} value={row.draftHsn} onChange={event => updateRow(row._id, 'draftHsn', event.target.value.replace(/\D/g, '').slice(0, 8))} maxLength={8} inputMode="numeric" pattern="[0-9]{4,8}" title="HSN must contain 4 to 8 digits" className="w-36 rounded-lg border border-slate-200 px-2.5 py-2 font-mono text-xs outline-none focus:border-indigo-500" /></td><td className="px-4 py-3"><div className="flex items-center gap-2"><select aria-label={`GST rate for ${row.title}`} value={row.draftRate} onChange={event => updateRow(row._id, 'draftRate', event.target.value)} className="w-28 rounded-lg border border-slate-200 px-2.5 py-2 text-xs outline-none focus:border-indigo-500">{row.draftRate !== '' && row.draftRate !== 'custom' && !RATE_OPTIONS.includes(Number(row.draftRate)) && <option value={row.draftRate}>{row.draftRate}%</option>}<option value="">Store default</option>{RATE_OPTIONS.map(rate => <option key={rate} value={rate}>{rate}%</option>)}<option value="custom">Custom below</option></select>{row.draftRate === 'custom' && <input type="number" min="0" max="100" step="0.01" value={row.customRate || ''} onChange={event => updateRow(row._id, 'customRate', event.target.value)} className="w-24 rounded-lg border border-slate-200 px-2.5 py-2 text-xs" />}</div></td><td className="px-4 py-3 text-xs">{dirty.has(row._id) ? <span className="font-bold text-amber-700">Unsaved</span> : <span className="text-emerald-600">Saved</span>}</td></tr>)}{!rows.length && <tr><td colSpan="6" className="p-12 text-center text-sm text-slate-500">No products found.</td></tr>}</tbody></table></div>}
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500"><span>{pagination.total || 0} products</span><div className="flex gap-2"><button type="button" disabled={(pagination.page || 1) <= 1} onClick={() => load(pagination.page - 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Previous</button><span className="px-2 py-1.5">Page {pagination.page || 1} / {pagination.pages || 1}</span><button type="button" disabled={(pagination.page || 1) >= (pagination.pages || 1)} onClick={() => load(pagination.page + 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Next</button></div></div>
      </section>
    </div>
  </main>;
}
