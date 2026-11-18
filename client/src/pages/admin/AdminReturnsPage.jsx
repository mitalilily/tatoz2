import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, Loader2, PackageCheck, RefreshCw, Search, X } from 'lucide-react';
import { returnAPI } from '../../services/api';
import { formatPrice } from '../../utils/formatPrice';
import { useSite } from '../../context/SiteContext';
import toast from 'react-hot-toast';

const STATUS_OPTIONS = {
 requested: ['approved', 'rejected', 'cancelled'],
 approved: ['pickup_scheduled', 'cancelled'],
 pickup_scheduled: ['picked_up', 'cancelled'],
 picked_up: ['received'],
 received: ['inspection_pending'],
 inspection_pending: ['approved_for_refund', 'replacement_queued', 'rejected'],
 approved_for_refund: ['refunded', 'closed'],
 replacement_queued: ['replaced', 'closed'],
 refunded: ['closed'],
 replaced: ['closed'],
 closed: [],
 rejected: [],
 cancelled: [],
};

const STATUS_STYLE = {
 requested: 'bg-amber-50 text-amber-700',
 approved: 'bg-blue-50 text-blue-700',
 pickup_scheduled: 'bg-indigo-50 text-indigo-700',
 picked_up: 'bg-violet-50 text-violet-700',
 received: 'bg-cyan-50 text-cyan-700',
 inspection_pending: 'bg-orange-50 text-orange-700',
 approved_for_refund: 'bg-emerald-50 text-emerald-700',
 replacement_queued: 'bg-purple-50 text-purple-700',
 refunded: 'bg-green-50 text-green-700',
 replaced: 'bg-green-50 text-green-700',
 closed: 'bg-gray-100 text-gray-700',
 rejected: 'bg-red-50 text-red-700',
 cancelled: 'bg-gray-100 text-gray-500',
};

const label = value => String(value || '').replace(/_/g, ' ');

const AdminReturnsPage = () => {
 const { settings } = useSite();
 const [returns, setReturns] = useState([]);
 const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
 const [filters, setFilters] = useState({ page: 1, status: '', type: '', search: '' });
 const [loading, setLoading] = useState(true);
 const [selected, setSelected] = useState(null);
 const [detailLoading, setDetailLoading] = useState(false);
 const [nextStatus, setNextStatus] = useState('');
 const [note, setNote] = useState('');
 const [approvedAmount, setApprovedAmount] = useState('');
 const [saving, setSaving] = useState(false);

 const fetchReturns = useCallback(async () => {
  setLoading(true);
  try {
   const res = await returnAPI.getAll({ ...filters, limit: 20 });
   setReturns(res.data.returns || []);
   setPagination(res.data.pagination || { page: 1, pages: 1, total: 0 });
  } catch (error) {
   toast.error(error.response?.data?.message || 'Failed to load return requests');
  } finally { setLoading(false); }
 }, [filters]);

 useEffect(() => { fetchReturns(); }, [fetchReturns]);

 const openDetail = async id => {
  setDetailLoading(true);
  try {
   const res = await returnAPI.getOne(id);
   const request = res.data.returnRequest;
   setSelected(request);
   setNextStatus(STATUS_OPTIONS[request.status]?.[0] || '');
   setApprovedAmount(request.approvedAmount == null ? String(request.requestedAmount || '') : String(request.approvedAmount));
   setNote(request.adminNote || '');
  } catch (error) { toast.error(error.response?.data?.message || 'Failed to load return request'); }
  finally { setDetailLoading(false); }
 };

 const updateStatus = async () => {
  if (!selected || !nextStatus) return;
  setSaving(true);
  try {
   const res = await returnAPI.updateStatus(selected._id, {
    status: nextStatus,
    note,
    ...(approvedAmount !== '' ? { approvedAmount: Number(approvedAmount) } : {}),
   });
   setSelected(res.data.returnRequest);
   setNextStatus(STATUS_OPTIONS[res.data.returnRequest.status]?.[0] || '');
   toast.success(`RMA moved to ${label(nextStatus)}`);
   fetchReturns();
  } catch (error) { toast.error(error.response?.data?.message || 'Status update failed'); }
  finally { setSaving(false); }
 };

 const setFilter = (key, value) => setFilters(current => ({ ...current, [key]: value, ...(key !== 'page' ? { page: 1 } : {}) }));
 const pageText = useMemo(() => `Page ${pagination.page || filters.page} of ${pagination.pages || 1}`, [pagination, filters.page]);

 return (
  <div className="space-y-6 animate-fade-in">
   <div className="flex items-center justify-between gap-3">
    <div>
     <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><PackageCheck size={24} className="text-primary-600" /> Returns / RMA</h1>
     <p className="text-sm text-gray-500 mt-1">Control return, inspection, refund, and replacement states.</p>
    </div>
    <button onClick={fetchReturns} className="btn-secondary text-sm py-2.5 flex items-center gap-2"><RefreshCw size={14} /> Refresh</button>
   </div>

   <div className="flex flex-wrap items-center gap-2">
    <select value={filters.status} onChange={event => setFilter('status', event.target.value)} className="input py-2 text-sm bg-white">
     <option value="">All statuses</option>
     {Object.keys(STATUS_OPTIONS).map(status => <option key={status} value={status}>{label(status)}</option>)}
    </select>
    <select value={filters.type} onChange={event => setFilter('type', event.target.value)} className="input py-2 text-sm bg-white">
     <option value="">All types</option><option value="return">Return</option><option value="replacement">Replacement</option><option value="exchange">Exchange</option>
    </select>
    <div className="relative ml-auto">
     <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
     <input value={filters.search} onChange={event => setFilter('search', event.target.value)} placeholder="Search RMA or order" className="input py-2 pl-8 text-sm w-52 bg-white" />
    </div>
   </div>

   {loading ? <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-400" /></div> : returns.length === 0 ? (
    <div className="card text-center py-16 text-gray-400"><PackageCheck size={40} className="mx-auto mb-3 opacity-30" /><p className="text-sm">No return requests found</p></div>
   ) : <>
    <div className="card overflow-hidden">
     <table className="w-full text-sm">
      <thead><tr className="bg-gray-50">
       {['RMA', 'Order', 'Customer', 'Type', 'Amount', 'Status', 'Requested', ''].map((heading, index) => <th key={`${heading}-${index}`} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{heading}</th>)}
      </tr></thead>
      <tbody className="divide-y divide-gray-100">
       {returns.map(request => <tr key={request._id} className="hover:bg-gray-50">
        <td className="px-4 py-3 font-semibold text-gray-900">{request.requestNumber}</td>
        <td className="px-4 py-3 text-gray-700">#{request.order?.orderNumber || '—'}</td>
        <td className="px-4 py-3"><div className="text-gray-900">{request.user?.name || '—'}</div><div className="text-xs text-gray-400">{request.user?.email || request.user?.phone || ''}</div></td>
        <td className="px-4 py-3 capitalize">{request.type}</td>
        <td className="px-4 py-3 font-semibold">{formatPrice(request.requestedAmount, settings)}</td>
        <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLE[request.status] || STATUS_STYLE.closed}`}>{label(request.status)}</span></td>
        <td className="px-4 py-3 text-xs text-gray-400">{new Date(request.createdAt).toLocaleDateString('en-IN')}</td>
        <td className="px-4 py-3"><button onClick={() => openDetail(request._id)} className="text-indigo-600 hover:text-indigo-700 font-medium text-xs flex items-center gap-1"><Eye size={13} /> View</button></td>
       </tr>)}
      </tbody>
     </table>
    </div>
    <div className="flex items-center justify-center gap-3">
     <button onClick={() => setFilter('page', Math.max(1, (pagination.page || filters.page) - 1))} disabled={(pagination.page || filters.page) <= 1} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-40"><ChevronLeft size={16} /></button>
     <span className="text-sm text-gray-500">{pageText}</span>
     <button onClick={() => setFilter('page', (pagination.page || filters.page) + 1)} disabled={(pagination.page || filters.page) >= (pagination.pages || 1)} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-40"><ChevronRight size={16} /></button>
    </div>
   </>}

   {(selected || detailLoading) && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => !saving && setSelected(null)}>
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[88vh] overflow-y-auto p-6" onClick={event => event.stopPropagation()}>
     {detailLoading ? <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-gray-400" /></div> : selected && <>
      <div className="flex items-start justify-between mb-5"><div><h2 className="font-bold text-gray-900">{selected.requestNumber}</h2><p className="text-xs text-gray-400">Order #{selected.order?.orderNumber} · {selected.user?.name}</p></div><button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-700"><X size={20} /></button></div>
      <div className="grid grid-cols-2 gap-3 text-sm mb-5"><div className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-500">Current state</p><p className="font-semibold capitalize">{label(selected.status)}</p></div><div className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-500">Requested amount</p><p className="font-semibold">{formatPrice(selected.requestedAmount, settings)}</p></div></div>
      <div className="bg-gray-50 rounded-xl p-4 mb-5"><p className="text-xs font-semibold text-gray-700 mb-1">Reason</p><p className="text-sm text-gray-700">{selected.reason}</p>{selected.description && <p className="text-xs text-gray-500 mt-2">{selected.description}</p>}</div>
      {STATUS_OPTIONS[selected.status]?.length > 0 && <div className="space-y-4"><div><label className="text-sm font-medium text-gray-700 mb-1 block">Move to</label><select value={nextStatus} onChange={event => setNextStatus(event.target.value)} className="input bg-white capitalize">{STATUS_OPTIONS[selected.status].map(status => <option key={status} value={status}>{label(status)}</option>)}</select></div><div><label className="text-sm font-medium text-gray-700 mb-1 block">Approved amount</label><input type="number" min="0" max={selected.requestedAmount} value={approvedAmount} onChange={event => setApprovedAmount(event.target.value)} className="input" /></div><div><label className="text-sm font-medium text-gray-700 mb-1 block">Internal note</label><textarea value={note} onChange={event => setNote(event.target.value)} rows={2} className="input resize-none" /></div><button onClick={updateStatus} disabled={saving || !nextStatus} className="btn-primary w-full flex items-center justify-center gap-2">{saving ? <Loader2 size={15} className="animate-spin" /> : 'Save RMA state'}</button></div>}
      <div className="mt-5 text-xs text-gray-500"><p className="font-semibold text-gray-700 mb-2">Items</p>{(selected.items || []).map(item => <div key={item.orderItemId} className="flex justify-between py-1"><span>{item.title || 'Product'} × {item.quantity}</span><span>{formatPrice(item.amount, settings)}</span></div>)}</div>
     </>}
    </div>
   </div>}
  </div>
 );
};

export default AdminReturnsPage;
