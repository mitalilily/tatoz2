import { useState, useEffect, useCallback } from 'react';
import { RefreshCcw, Search, Loader2, ChevronLeft, ChevronRight, X, Check, XCircle, Image as ImageIcon } from 'lucide-react';
import { refundAPI } from '../../services/api';
import { formatPrice } from '../../utils/formatPrice';
import { useSite } from '../../context/SiteContext';
import toast from 'react-hot-toast';

const TYPE_BADGES = {
 cancellation: { label: 'Cancellation', bg: 'bg-red-50', text: 'text-red-700' },
 return: { label: 'Return', bg: 'bg-amber-50', text: 'text-amber-700' },
 partial: { label: 'Partial', bg: 'bg-indigo-50', text: 'text-indigo-700' },
 goodwill: { label: 'Goodwill', bg: 'bg-green-50', text: 'text-green-700' },
};

const STATUS_BADGES = {
 pending: { label: 'Pending', bg: 'bg-amber-50', text: 'text-amber-700' },
 approved: { label: 'Approved', bg: 'bg-blue-50', text: 'text-blue-700' },
 processed: { label: 'Processed', bg: 'bg-green-50', text: 'text-green-700' },
 rejected: { label: 'Rejected', bg: 'bg-red-50', text: 'text-red-700' },
};

const timeAgo = (date) => {
 const s = Math.floor((Date.now() - new Date(date)) / 1000);
 if (s < 60) return 'Just now';
 if (s < 3600) return `${Math.floor(s / 60)}m ago`;
 if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
 return `${Math.floor(s / 86400)}d ago`;
};

const RefundDashboardPage = () => {
 const { settings } = useSite();
 const [tab, setTab] = useState('pending');
 const [refunds, setRefunds] = useState([]);
 const [pagination, setPagination] = useState(null);
 const [loading, setLoading] = useState(true);
 const [stats, setStats] = useState(null);
 const [filters, setFilters] = useState({ type: '', search: '', page: 1 });
 const [selectedRefund, setSelectedRefund] = useState(null);
 const [detailLoading, setDetailLoading] = useState(false);
 const [approvedAmount, setApprovedAmount] = useState('');
 const [adminNote, setAdminNote] = useState('');
 const [processing, setProcessing] = useState(false);

 const fetchRefunds = useCallback(async () => {
 setLoading(true);
 try {
 const params = { ...filters, limit: 20 };
 if (tab !== 'all') params.status = tab === 'approved' ? 'processed' : tab;
 if (tab === 'approved') params.status = 'approved,processed';
 const res = await refundAPI.getAll(params);
 setRefunds(res.data.refunds);
 setPagination(res.data.pagination);
 } catch {} finally { setLoading(false); }
 }, [filters, tab]);

 const fetchStats = useCallback(async () => {
 try {
 const res = await refundAPI.getStats();
 setStats(res.data.stats);
 } catch {}
 }, []);

 useEffect(() => { fetchRefunds(); }, [fetchRefunds]);
 useEffect(() => { fetchStats(); }, [fetchStats]);

 const handleViewDetail = async (id) => {
 setDetailLoading(true);
 try {
 const res = await refundAPI.getOne(id);
 setSelectedRefund(res.data.refund);
 setApprovedAmount(String(res.data.refund.amount));
 setAdminNote(res.data.refund.adminNote || '');
 } catch { toast.error('Failed to load refund'); }
 finally { setDetailLoading(false); }
 };

 const handleApprove = async () => {
 if (!selectedRefund) return;
 const amount = Number(approvedAmount);
 const orderTotal = Number(selectedRefund.order?.total || selectedRefund.amount || 0);
 if (!Number.isFinite(amount) || amount <= 0 || amount > orderTotal) {
  toast.error(`Refund amount must be greater than 0 and no more than ${formatPrice(orderTotal, settings)}`);
  return;
 }
 setProcessing(true);
 try {
 const response = await refundAPI.approve(selectedRefund._id, { approvedAmount: amount, adminNote });
 toast.success(response.data?.refund?.status === 'processed' ? 'Refund approved and processed' : 'Refund approved; provider processing is pending');
 setSelectedRefund(null);
 fetchRefunds();
 fetchStats();
 } catch (err) { toast.error(err.response?.data?.message || 'Failed to approve'); }
 finally { setProcessing(false); }
 };

 const handleReject = async () => {
 if (!selectedRefund) return;
 setProcessing(true);
 try {
 await refundAPI.reject(selectedRefund._id, { adminNote });
 toast.success('Refund rejected');
 setSelectedRefund(null);
 fetchRefunds();
 fetchStats();
 } catch (err) { toast.error(err.response?.data?.message || 'Failed to reject'); }
 finally { setProcessing(false); }
 };

 const updateFilter = (key, value) => {
 setFilters(f => ({ ...f, [key]: value, ...(key !== 'page' && { page: 1 }) }));
 };

 return (
 <div className="space-y-6 animate-fade-in">
 <div>
 <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
 <RefreshCcw size={24} className="text-primary-600" /> Refund Dashboard
 </h1>
 <p className="text-sm text-gray-500 mt-1">Review and process customer refund requests</p>
 </div>

 {/* Stats */}
 {stats && (
 <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
 <div className="card p-5">
 <p className="text-xs text-gray-500 mb-1">Pending Refunds</p>
 <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
 </div>
 <div className="card p-5">
 <p className="text-xs text-gray-500 mb-1">Approved Today</p>
 <p className="text-2xl font-bold text-green-600">{stats.approvedToday}</p>
 </div>
 <div className="card p-5">
 <p className="text-xs text-gray-500 mb-1">Total Refunded (Month)</p>
 <p className="text-2xl font-bold text-indigo-600">{formatPrice(stats.monthlyTotal, settings)}</p>
 </div>
 <div className="card p-5">
 <p className="text-xs text-gray-500 mb-1">Rejected</p>
 <p className="text-2xl font-bold text-red-600">{stats.rejected}</p>
 </div>
 </div>
 )}

 {/* Tabs */}
 <div className="flex gap-0 border-b-2 border-gray-100">
 {['pending', 'approved', 'rejected', 'all'].map(t => (
 <button key={t} onClick={() => setTab(t)} className={`px-5 py-2.5 text-sm font-medium capitalize transition-colors flex items-center gap-1.5 ${tab === t ? 'text-indigo-600 border-b-2 border-indigo-600 -mb-[2px]' : 'text-gray-500 hover:text-gray-700'}`}>
 {t}
 {t === 'pending' && stats?.pending > 0 && (
 <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{stats.pending}</span>
 )}
 </button>
 ))}
 </div>

 {/* Filters */}
 <div className="flex flex-wrap items-center gap-2">
 <select value={filters.type} onChange={e => updateFilter('type', e.target.value)} className="input py-2 text-sm w-40 bg-white">
 <option value="">All Types</option>
 <option value="cancellation">Cancellation</option>
 <option value="return">Return</option>
 <option value="partial">Partial</option>
 <option value="goodwill">Goodwill</option>
 </select>
 <div className="relative ml-auto">
 <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
 <input type="text" value={filters.search} onChange={e => updateFilter('search', e.target.value)} placeholder="Search order #..." className="input py-2 pl-8 text-sm w-48 bg-white" />
 </div>
 </div>

 {/* Table */}
 {loading ? (
 <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
 ) : refunds.length === 0 ? (
 <div className="text-center py-16 text-gray-400">
 <RefreshCcw size={40} className="mx-auto mb-3 opacity-30" />
 <p className="text-sm">No refund requests found</p>
 </div>
 ) : (
 <>
 <div className="card overflow-hidden">
 <table className="w-full text-sm">
 <thead>
 <tr className="bg-gray-50">
 <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Order</th>
 <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Customer</th>
 <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Type</th>
 <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Amount</th>
 <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Reason</th>
 <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
 <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Requested</th>
 <th className="px-4 py-3"></th>
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-100">
 {refunds.map(r => {
 const typeBadge = TYPE_BADGES[r.type] || TYPE_BADGES.cancellation;
 const statusBadge = STATUS_BADGES[r.status] || STATUS_BADGES.pending;
 return (
 <tr key={r._id} className="hover:bg-gray-50 transition-colors">
 <td className="px-4 py-3 font-medium text-gray-900">#{r.order?.orderNumber}</td>
 <td className="px-4 py-3">
 <div className="text-gray-900">{r.user?.name}</div>
 <div className="text-xs text-gray-400">{r.user?.email}</div>
 </td>
 <td className="px-4 py-3">
 <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${typeBadge.bg} ${typeBadge.text}`}>{typeBadge.label}</span>
 </td>
 <td className="px-4 py-3 font-semibold text-gray-900">{formatPrice(r.amount, settings)}</td>
 <td className="px-4 py-3 text-xs text-gray-500 max-w-[150px] truncate">{r.reason}</td>
 <td className="px-4 py-3">
 <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge.bg} ${statusBadge.text}`}>{statusBadge.label}</span>
 </td>
 <td className="px-4 py-3 text-xs text-gray-400">{timeAgo(r.createdAt)}</td>
 <td className="px-4 py-3">
 <div className="flex gap-2">
 <button onClick={() => handleViewDetail(r._id)} className="text-indigo-600 hover:text-indigo-700 font-medium text-xs">View</button>
 {r.status === 'pending' && (
 <>
 <button onClick={() => { handleViewDetail(r._id); }} className="text-green-600 hover:text-green-700 font-medium text-xs">Approve</button>
 <button onClick={() => { handleViewDetail(r._id); }} className="text-red-600 hover:text-red-700 font-medium text-xs">Reject</button>
 </>
 )}
 </div>
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>

 {pagination && pagination.pages > 1 && (
 <div className="flex items-center justify-center gap-2">
 <button onClick={() => updateFilter('page', filters.page - 1)} disabled={filters.page <= 1} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-40">
 <ChevronLeft size={16} />
 </button>
 <span className="text-sm text-gray-500">Page {filters.page} of {pagination.pages}</span>
 <button onClick={() => updateFilter('page', filters.page + 1)} disabled={filters.page >= pagination.pages} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-40">
 <ChevronRight size={16} />
 </button>
 </div>
 )}
 </>
 )}

 {/* Detail / Approve Modal */}
 {(selectedRefund || detailLoading) && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => !detailLoading && !processing && setSelectedRefund(null)}>
 <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()} data-testid="refund-detail-modal">
 {detailLoading ? (
 <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
 ) : selectedRefund && (
 <div className="min-h-0 flex-1 overflow-y-auto pr-1">
 {/* Header */}
 <div className="flex items-center justify-between mb-4">
 <div>
 <h3 className="font-bold text-gray-900">Refund Request</h3>
 <p className="text-xs text-gray-400">Order #{selectedRefund.order?.orderNumber} · {selectedRefund.user?.name}</p>
 </div>
 <div className="flex items-center gap-2">
 {(() => { const s = STATUS_BADGES[selectedRefund.status]; return <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>{s.label}</span>; })()}
 <button onClick={() => setSelectedRefund(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
 </div>
 </div>

 {/* Order Info */}
 <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-2 text-sm">
 <div className="flex justify-between"><span className="text-gray-500">Order Total</span><span className="font-semibold">{formatPrice(selectedRefund.order?.total, settings)}</span></div>
 <div className="flex justify-between"><span className="text-gray-500">Payment</span><span className="capitalize">{selectedRefund.order?.paymentMethod}</span></div>
 <div className="flex justify-between"><span className="text-gray-500">Refund Type</span>
 {(() => { const t = TYPE_BADGES[selectedRefund.type]; return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.bg} ${t.text}`}>{t.label}</span>; })()}
 </div>
 <div className="flex justify-between"><span className="text-gray-500">Requested Amount</span><span className="font-semibold">{formatPrice(selectedRefund.amount, settings)}</span></div>
 </div>

 {/* Reason */}
 <div className="mb-4">
 <p className="text-xs font-semibold text-gray-700 mb-1">Customer Reason</p>
 <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{selectedRefund.reason}</div>
 {selectedRefund.description && (
 <div className="text-xs text-gray-500 mt-2 bg-gray-50 rounded-lg p-3">{selectedRefund.description}</div>
 )}
 </div>

 {/* Images */}
 {selectedRefund.images?.length > 0 && (
 <div className="mb-4">
 <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1"><ImageIcon size={12} /> Attached Photos</p>
 <div className="flex gap-2">
 {selectedRefund.images.map((img, i) => (
 <a key={i} href={img.url} target="_blank" rel="noopener noreferrer" className="w-20 h-20 rounded-lg overflow-hidden border border-gray-200 block">
 <img src={img.url} alt="" className="w-full h-full object-cover" />
 </a>
 ))}
 </div>
 </div>
 )}

 {/* Actions for pending */}
 {selectedRefund.status === 'pending' && (
 <>
 <div className="mb-4">
 <p className="text-xs font-semibold text-gray-700 mb-1">Refund Amount</p>
 <div className="flex items-center gap-2">
 <span className="text-gray-500">{settings?.currencySymbol || '₹'}</span>
 <input type="number" min="0.01" max={selectedRefund.order?.total || selectedRefund.amount} step="0.01" value={approvedAmount} onChange={e => setApprovedAmount(e.target.value)} data-testid="refund-approved-amount" className="input py-2 text-sm w-32 font-semibold" />
 <span className="text-xs text-gray-400">of {formatPrice(selectedRefund.order?.total, settings)}</span>
 </div>
 </div>

 <div className="mb-5">
 <p className="text-xs font-semibold text-gray-700 mb-1">Admin Note (optional)</p>
 <textarea value={adminNote} onChange={e => setAdminNote(e.target.value)} rows={2} className="input py-2 text-sm w-full resize-none" placeholder="Internal note..." />
 </div>

 <div className="flex gap-3">
 <button onClick={() => setSelectedRefund(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
 <button onClick={handleReject} disabled={processing} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1">
 {processing ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />} Reject
 </button>
 <button onClick={handleApprove} disabled={processing} className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1">
 {processing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Approve
 </button>
 </div>

 {selectedRefund.order?.paymentMethod === 'razorpay' && (
 <p className="text-center text-[10px] text-gray-400 mt-2">Razorpay refund will be processed immediately on approval</p>
 )}
 </>
 )}

 {/* Already resolved info */}
 {selectedRefund.status !== 'pending' && (
 <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1">
 {selectedRefund.approvedAmount && <div className="flex justify-between"><span className="text-gray-500">Approved Amount</span><span className="font-semibold">{formatPrice(selectedRefund.approvedAmount, settings)}</span></div>}
 {selectedRefund.razorpayRefundId && <div className="flex justify-between"><span className="text-gray-500">Razorpay Refund ID</span><span className="font-mono text-xs text-indigo-600">{selectedRefund.razorpayRefundId}</span></div>}
 {selectedRefund.adminNote && <div><span className="text-gray-500">Admin Note:</span> <span className="text-gray-700">{selectedRefund.adminNote}</span></div>}
 {selectedRefund.reviewedAt && <div className="text-xs text-gray-400">Reviewed {new Date(selectedRefund.reviewedAt).toLocaleString()}</div>}
 </div>
 )}
 </div>
 )}
 </div>
 </div>
 )}
 </div>
 );
};

export default RefundDashboardPage;
