import { useCallback, useEffect, useState } from 'react';
import { Ban, FileDown, Mail, MessageCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { invoiceAPI, invoiceNoteAPI } from '../../services/api';
import { useSite } from '../../context/SiteContext';
import { formatPrice } from '../../utils/formatPrice';
import Loader from '../../components/common/Loader';
import SEO from '../../components/common/SEO';
import toast from 'react-hot-toast';

const idempotencyKey = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export default function AdminInvoiceNotesPage() {
  const { settings } = useSite();
  const [invoices, setInvoices] = useState([]);
  const [notes, setNotes] = useState([]);
  const [form, setForm] = useState({ invoiceId: '', type: 'credit', amount: '', reason: '', sourceType: 'manual' });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [invoiceResponse, noteResponse] = await Promise.all([
        invoiceAPI.getAdmin({ page: 1, limit: 100, status: 'issued' }),
        invoiceNoteAPI.getAdmin({ page: 1, limit: 100 }),
      ]);
      const invoiceRows = invoiceResponse.data.invoices || [];
      setInvoices(invoiceRows);
      setNotes(noteResponse.data.notes || []);
      setForm(previous => ({ ...previous, invoiceId: previous.invoiceId || invoiceRows[0]?._id || '' }));
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || 'Unable to load invoice notes');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createNote = async event => {
    event.preventDefault();
    if (!form.invoiceId || !form.amount || !form.reason.trim()) return toast.error('Invoice, amount and reason are required');
    setBusyId('create');
    try {
      await invoiceNoteAPI.create(form.invoiceId, { type: form.type, amount: Number(form.amount), reason: form.reason, sourceType: form.sourceType }, idempotencyKey('invoice-note'));
      toast.success(`${form.type === 'credit' ? 'Credit' : 'Debit'} note issued`);
      setForm(previous => ({ ...previous, amount: '', reason: '' }));
      await load();
    } catch (requestError) { toast.error(requestError.response?.data?.message || requestError.message || 'Could not issue note'); }
    finally { setBusyId(''); }
  };

  const voidNote = async note => {
    if (note.status === 'void') return;
    setBusyId(note._id);
    try { await invoiceNoteAPI.void(note._id, 'Voided by tenant administrator'); toast.success('Note voided'); await load(); }
    catch (requestError) { toast.error(requestError.response?.data?.message || requestError.message || 'Could not void note'); }
    finally { setBusyId(''); }
  };

  const deliver = async (note, channel) => {
    setBusyId(`${note._id}-${channel}`);
    try {
      await invoiceNoteAPI.deliver({ noteId: note._id, channel, idempotencyKey: idempotencyKey(`note-${channel}`) });
      toast.success(`${channel === 'email' ? 'Email' : 'WhatsApp'} delivery queued`);
      await load();
    } catch (requestError) { toast.error(requestError.response?.data?.message || requestError.message || 'Could not queue delivery'); }
    finally { setBusyId(''); }
  };

  const download = async note => {
    setBusyId(`download-${note._id}`);
    try {
      const response = await invoiceNoteAPI.getAdminById(note._id);
      const { generateInvoice } = await import('../../utils/generateInvoice');
      generateInvoice({ ...response.data.note, invoiceNumber: response.data.note.noteNumber, documentType: `${response.data.note.type}_note`, items: (response.data.note.items || []).map(item => ({ ...item, price: item.total, grossAmount: item.total })) }, settings);
    } catch (requestError) { toast.error(requestError.response?.data?.message || requestError.message || 'Could not prepare note'); }
    finally { setBusyId(''); }
  };

  return <>
    <SEO title="Credit & Debit Notes" noindex />
    <main data-testid="admin-invoice-notes-page" className="space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Finance & compliance</p><h1 className="mt-1 text-2xl font-black text-slate-900">Credit & Debit Notes</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Notes are immutable snapshots linked to the original tenant invoice and can be voided only as an explicit audit state.</p></div>
        <button type="button" onClick={load} data-testid="admin-invoice-notes-refresh" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm"><RefreshCw size={15} /> Refresh</button>
      </header>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-slate-900">Issue a note</h2>
        <form onSubmit={createNote} className="mt-4 grid gap-3 md:grid-cols-5" data-testid="invoice-note-form">
          <select data-testid="invoice-note-invoice" value={form.invoiceId} onChange={event => setForm({ ...form, invoiceId: event.target.value })} className="input bg-white"><option value="">Select invoice</option>{invoices.map(invoice => <option key={invoice._id} value={invoice._id}>{invoice.invoiceNumber} · {formatPrice(invoice.total, settings)}</option>)}</select>
          <select data-testid="invoice-note-type" value={form.type} onChange={event => setForm({ ...form, type: event.target.value })} className="input bg-white"><option value="credit">Credit note</option><option value="debit">Debit note</option></select>
          <input data-testid="invoice-note-amount" type="number" min="0.01" step="0.01" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} placeholder="Amount" className="input" />
          <input data-testid="invoice-note-reason" value={form.reason} onChange={event => setForm({ ...form, reason: event.target.value })} placeholder="Reason" className="input" />
          <button type="submit" data-testid="invoice-note-create" disabled={busyId === 'create'} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Issue note</button>
        </form>
      </section>
      {error && <div data-testid="admin-invoice-notes-error" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold text-slate-900">Issued notes</h2><p className="mt-1 text-xs text-slate-500">{notes.length} tenant-scoped adjustment documents</p></div>
        {loading ? <div className="flex justify-center py-12"><Loader /></div> : notes.length === 0 ? <p className="px-5 py-12 text-center text-sm text-slate-400">No credit or debit notes issued yet.</p> : <div className="divide-y divide-slate-100">
          {notes.map(note => <div key={note._id} data-testid={`admin-invoice-note-row-${note._id}`} className="flex flex-wrap items-center gap-4 px-5 py-4">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${note.type === 'credit' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{note.type === 'credit' ? 'CN' : 'DN'}</div>
            <div className="min-w-[180px] flex-1"><p className="font-mono text-sm font-bold text-slate-800">{note.noteNumber}</p><p className="text-xs text-slate-500">Invoice {note.originalInvoiceNumber} · {note.reason}</p></div>
            <div className="text-right"><p className="text-sm font-black text-slate-900">{formatPrice(note.total || 0, settings)}</p><p className="text-xs capitalize text-slate-500">{note.type} note</p></div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${note.status === 'void' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{note.status}</span>
            <div className="flex items-center gap-1"><button type="button" data-testid={`invoice-note-download-${note._id}`} onClick={() => download(note)} disabled={busyId === `download-${note._id}`} className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50" title="Download note"><FileDown size={16} /></button><button type="button" data-testid={`invoice-note-email-${note._id}`} onClick={() => deliver(note, 'email')} disabled={busyId === `${note._id}-email`} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" title="Queue email"><Mail size={16} /></button><button type="button" data-testid={`invoice-note-whatsapp-${note._id}`} onClick={() => deliver(note, 'whatsapp')} disabled={busyId === `${note._id}-whatsapp`} className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50" title="Queue WhatsApp"><MessageCircle size={16} /></button><button type="button" data-testid={`invoice-note-void-${note._id}`} onClick={() => voidNote(note)} disabled={note.status === 'void' || busyId === note._id} className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-40" title="Void note"><Ban size={16} /></button></div>
          </div>)}
        </div>}
      </section>
      <p className="inline-flex items-center gap-2 text-xs text-slate-500"><ShieldCheck size={14} className="text-emerald-600" />Original invoices remain unchanged; every note is linked, bounded and auditable.</p>
    </main>
  </>;
}
