import { useCallback, useEffect, useRef, useState } from 'react';
import { LifeBuoy, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { supportAPI } from '../../services/api';
import Loader from '../../components/common/Loader';

export default function AdminSupportPage() {
 const [tickets, setTickets] = useState([]);
 const [selected, setSelected] = useState(null);
 const [reply, setReply] = useState('');
 const [status, setStatus] = useState('');
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);
 const loadRequest = useRef(0);
 const load = useCallback(async () => {
  const requestId = ++loadRequest.current;
  setLoading(true);
  try {
   const response = await supportAPI.adminList(status ? { status } : {});
   // A slow response from an older filter/refresh must not overwrite the
   // queue that the operator is currently looking at.
   if (requestId !== loadRequest.current) return;
   const nextTickets = response.data.tickets || [];
   setTickets(nextTickets);
   setSelected(current => current && nextTickets.some(ticket => String(ticket._id) === String(current._id)) ? current : null);
  } catch (error) {
   if (requestId === loadRequest.current) toast.error(error.message || 'Could not load support queue');
  } finally {
   if (requestId === loadRequest.current) setLoading(false);
  }
 }, [status]);
 useEffect(() => { load(); }, [load]);
 const open = async id => { try { const response = await supportAPI.adminGet(id); setSelected(response.data.ticket); } catch (error) { toast.error(error.message || 'Could not open ticket'); } };
 const update = async nextStatus => { if (!selected) return; setSaving(true); try { const response = await supportAPI.adminUpdate(selected._id, { status: nextStatus }); setSelected(response.data.ticket); await load(); } catch (error) { toast.error(error.message || 'Could not update ticket'); } finally { setSaving(false); } };
 const send = async event => { event.preventDefault(); if (!reply.trim() || !selected) return; setSaving(true); try { const response = await supportAPI.adminReply(selected._id, { message: reply }); setSelected(response.data.ticket); setReply(''); await load(); } catch (error) { toast.error(error.response?.data?.message || error.message || 'Could not reply'); } finally { setSaving(false); } };
 return <div className="space-y-6" data-testid="admin-support-page"><div className="flex items-start justify-between gap-4"><div><h1 className="flex items-center gap-2 text-2xl font-black text-slate-900"><LifeBuoy className="text-primary-600" /> Support Tickets</h1><p className="mt-1 text-sm text-slate-500">Order-linked customer service queue with tenant isolation, priorities and auditable replies.</p></div><div className="flex gap-2"><select className="input" value={status} onChange={e => setStatus(e.target.value)} data-testid="support-status-filter"><option value="">All Statuses</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="waiting_customer">Waiting customer</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select><button type="button" className="btn-secondary flex items-center gap-2" onClick={load} disabled={loading} data-testid="support-refresh"><RefreshCw size={15} /> Refresh</button></div></div><div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]"><section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><h2 className="border-b border-slate-100 p-5 font-black">Queue ({tickets.length})</h2>{loading ? <div className="p-5"><Loader /></div> : tickets.length ? <div className="divide-y divide-slate-100">{tickets.map(ticket => <button type="button" key={ticket._id} onClick={() => open(ticket._id)} className={`w-full p-4 text-left hover:bg-slate-50 ${selected?._id === ticket._id ? 'bg-primary-50' : ''}`}><div className="flex justify-between gap-2"><span className="font-bold">{ticket.ticketNumber}</span><span className="text-xs font-bold uppercase text-slate-500">{ticket.priority}</span></div><p className="mt-1 font-semibold text-slate-800">{ticket.subject}</p><p className="mt-1 text-xs text-slate-500">{ticket.user?.name || ticket.user?.email || 'Customer'} · {ticket.status.replace('_', ' ')}</p></button>)}</div> : <p className="p-5 text-sm text-slate-500">No tickets in this queue.</p>}</section><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="admin-support-ticket-detail">{selected ? <><div className="mb-4 flex items-start justify-between gap-3 border-b border-slate-100 pb-4"><div><p className="text-xs font-bold uppercase tracking-wide text-primary-600">{selected.ticketNumber}</p><h2 className="text-xl font-black">{selected.subject}</h2><p className="mt-1 text-xs text-slate-500">{selected.user?.name || selected.user?.email} {selected.order?.orderNumber ? `· Order ${selected.order.orderNumber}` : ''}</p></div><div className="flex flex-wrap justify-end gap-2"><button type="button" className="btn-secondary text-xs" onClick={() => update('in_progress')} disabled={saving}>Take ownership</button><button type="button" className="btn-primary text-xs" onClick={() => update('resolved')} disabled={saving}>Resolve</button></div></div><div className="max-h-[30rem] space-y-3 overflow-y-auto">{selected.messages?.map(message => <div key={message._id} className={`rounded-xl p-3 ${message.internal ? 'border border-amber-200 bg-amber-50' : message.authorRole === 'customer' ? 'bg-slate-50' : 'ml-8 bg-primary-50'}`}><p className="mb-1 flex items-center gap-1 text-[11px] font-black uppercase text-slate-400">{message.internal && <ShieldCheck size={12} />} {message.internal ? 'Internal note' : message.authorRole === 'customer' ? 'Customer' : 'Support team'}</p><p className="whitespace-pre-wrap text-sm text-slate-700">{message.body}</p></div>)}</div>{selected.status !== 'closed' && <form onSubmit={send} className="mt-4 flex gap-2 border-t border-slate-100 pt-4"><textarea className="input min-h-16 flex-1" placeholder="Reply to customer" value={reply} onChange={e => setReply(e.target.value)} required /><button className="btn-primary self-end" disabled={saving}><Send size={15} /></button></form>}</> : <div className="flex min-h-80 items-center justify-center text-slate-500">{tickets.length ? 'Select a ticket to inspect it.' : 'No tickets available to inspect.'}</div>}</section></div></div>;
}
