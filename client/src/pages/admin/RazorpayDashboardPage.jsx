import { useState, useEffect, useCallback } from 'react';
import {
 IndianRupee, BarChart3, CreditCard, RotateCcw, Landmark,
 Eye, RefreshCw, ChevronLeft, ChevronRight, Loader2,
 CheckCircle2, XCircle, AlertTriangle, Clock,
} from 'lucide-react';
import {
 BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
 ResponsiveContainer, Legend,
} from 'recharts';
import { partnerDashboardAPI, razorpayAPI } from '../../services/api';
import Modal from '../../components/common/Modal';
import Loader from '../../components/common/Loader';
import toast from 'react-hot-toast';

// ─── Constants ──────────────────────────────────────────────────────────────

const TABS = [
 { id: 'overview', label: 'Overview', icon: BarChart3 },
 { id: 'payments', label: 'Payments', icon: CreditCard },
 { id: 'refunds', label: 'Refunds', icon: RotateCcw },
 { id: 'settlements', label: 'Settlements', icon: Landmark },
];

const PAYMENT_STATUS_COLORS = {
 captured: 'bg-green-100 text-green-700',
 authorized: 'bg-blue-100 text-blue-700',
 failed: 'bg-red-100 text-red-700',
 refunded: 'bg-amber-100 text-amber-700',
};

const REFUND_STATUS_COLORS = {
 processed: 'bg-green-100 text-green-700',
 pending: 'bg-yellow-100 text-yellow-700',
 failed: 'bg-red-100 text-red-700',
};

const SETTLEMENT_STATUS_COLORS = {
 processed: 'bg-green-100 text-green-700',
 created: 'bg-blue-100 text-blue-700',
};

const formatCurrency = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;

const formatTimestamp = (ts) => ts ? new Date(ts * 1000).toLocaleString() : '—';

const PAGE_SIZE = 20;

// ─── Reusable Components ────────────────────────────────────────────────────

const Skeleton = ({ className = '' }) => (
 <div className={`animate-pulse bg-gray-200 rounded-lg ${className}`} />
);

const StatCard = ({ icon: Icon, label, value, sub, color = 'bg-blue-500', loading }) => {
 if (loading) return (
 <div className="bg-white rounded-xl p-5 border border-gray-200">
 <Skeleton className="h-10 w-10 rounded-xl mb-3" />
 <Skeleton className="h-7 w-20 mb-1" />
 <Skeleton className="h-4 w-28" />
 </div>
 );
 return (
 <div className="bg-white rounded-xl p-5 border border-gray-200 hover:shadow-md transition-shadow">
 <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center mb-3`}>
 <Icon size={20} className="text-white" />
 </div>
 <p className="text-2xl font-bold text-gray-900">{value}</p>
 <p className="text-sm text-gray-500 mt-0.5">{label}</p>
 {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
 </div>
 );
};

const StatusBadge = ({ status, colorMap }) => {
 const s = (status || '').toLowerCase();
 const cls = colorMap[s] || 'bg-gray-100 text-gray-600';
 return (
 <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>
 <span className={`w-1.5 h-1.5 rounded-full ${cls.includes('green') ? 'bg-green-500' : cls.includes('red') ? 'bg-red-500' : cls.includes('blue') ? 'bg-blue-500' : cls.includes('yellow') ? 'bg-yellow-500' : cls.includes('amber') ? 'bg-amber-500' : 'bg-gray-400'}`} />
 {status || 'Unknown'}
 </span>
 );
};

const EmptyRow = ({ cols, message = 'No data found' }) => (
 <tr><td colSpan={cols} className="text-center py-12 text-gray-400">{message}</td></tr>
);

const PrevNextPagination = ({ skip, count, total, onPrev, onNext }) => {
 const from = total === 0 ? 0 : skip + 1;
 const to = Math.min(skip + count, total);
 return (
 <div className="flex items-center justify-between">
 <p className="text-sm text-gray-500">
 {total > 0 ? `Showing ${from}–${to} of ${total}` : 'No results'}
 </p>
 <div className="flex items-center gap-2">
 <button onClick={onPrev} disabled={skip === 0}
 className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed">
 <ChevronLeft size={16} /> Prev
 </button>
 <button onClick={onNext} disabled={skip + count >= total}
 className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed">
 Next <ChevronRight size={16} />
 </button>
 </div>
 </div>
 );
};

// ─── Overview Tab ───────────────────────────────────────────────────────────

const OverviewTab = () => {
 const [stats, setStats] = useState(null);
 const [loading, setLoading] = useState(true);

 const fetchStats = useCallback(async () => {
 try {
 setLoading(true);
 const res = await razorpayAPI.getStats();
 setStats(res.data.stats);
 } catch (err) { toast.error(err.message || 'Failed to load stats'); }
 finally { setLoading(false); }
 }, []);

 useEffect(() => { fetchStats(); }, [fetchStats]);

 return (
 <div className="space-y-6">
 <div className="flex items-center justify-between">
 <h2 className="text-lg font-semibold text-gray-900">Overview</h2>
 <div className="flex items-center gap-2">
 {stats?.source === 'razorpay_live_api' && <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">Live Razorpay API</span>}
 <button onClick={fetchStats} disabled={loading}
 className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
 <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
 Refresh
 </button>
 </div>
 </div>

 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
 <StatCard icon={IndianRupee} label="Total Revenue" value={formatCurrency(stats?.totalRevenue)} color="bg-blue-500" loading={loading} />
 <StatCard icon={CreditCard} label="Total Payments" value={stats?.totalPayments || 0} color="bg-indigo-500" loading={loading} />
 <StatCard icon={CheckCircle2} label="Captured" value={stats?.captured || 0} color="bg-emerald-500" loading={loading} />
 <StatCard icon={XCircle} label="Failed" value={stats?.failed || 0} color="bg-red-500" loading={loading} />
 <StatCard icon={RotateCcw} label="Refunded" value={stats?.refunded || 0} color="bg-amber-500" loading={loading} />
 </div>

 {/* Daily Revenue Chart */}
 <div className="bg-white rounded-xl border border-gray-200 p-5">
 <h3 className="text-sm font-semibold text-gray-700 mb-4">Daily Revenue</h3>
 {loading ? <Skeleton className="h-64" /> : (stats?.dailyData?.length > 0 ? (
 <ResponsiveContainer width="100%" height={320}>
 <BarChart data={stats.dailyData}>
 <CartesianGrid strokeDasharray="3 3" vertical={false} />
 <XAxis dataKey="date" tick={{ fontSize: 12 }} />
 <YAxis yAxisId="amount" tick={{ fontSize: 12 }} />
 <YAxis yAxisId="count" orientation="right" tick={{ fontSize: 12 }} />
 <Tooltip formatter={(v, n) => n === 'amount' ? formatCurrency(v) : v} />
 <Legend />
 <Bar yAxisId="amount" dataKey="amount" fill="#2563eb" radius={[6, 6, 0, 0]} name="Amount" />
 <Bar yAxisId="count" dataKey="count" fill="#10b981" radius={[6, 6, 0, 0]} name="Count" />
 </BarChart>
 </ResponsiveContainer>
 ) : <p className="text-center text-gray-400 py-16">No daily data available</p>)}
 </div>
 </div>
 );
};

// ─── Payments Tab ───────────────────────────────────────────────────────────

const PaymentsTab = () => {
 const [payments, setPayments] = useState([]);
 const [total, setTotal] = useState(0);
 const [skip, setSkip] = useState(0);
 const [loading, setLoading] = useState(true);
 const [detailModal, setDetailModal] = useState(null);
 const [captureModal, setCaptureModal] = useState(null);
 const [captureForm, setCaptureForm] = useState({ amount: '', currency: 'INR' });
 const [capturing, setCapturing] = useState(false);
 const [refundModal, setRefundModal] = useState(null);
 const [refundAmount, setRefundAmount] = useState('');
 const [refundNotes, setRefundNotes] = useState('');
 const [refunding, setRefunding] = useState(false);

 const fetchPayments = useCallback(async () => {
 try {
 setLoading(true);
 const res = await razorpayAPI.getPayments({ count: PAGE_SIZE, skip });
 setPayments(res.data.items || []);
 setTotal(res.data.count || 0);
 } catch (err) { toast.error(err.message || 'Failed to load payments'); }
 finally { setLoading(false); }
 }, [skip]);

 useEffect(() => { fetchPayments(); }, [fetchPayments]);

 const handleCapture = async () => {
 if (!captureModal) return;
 setCapturing(true);
 try {
 await razorpayAPI.capturePayment(captureModal.id, {
 amount: Math.round(Number(captureForm.amount) * 100),
 currency: captureForm.currency,
 });
 toast.success('Payment captured successfully');
 setCaptureModal(null);
 fetchPayments();
 } catch (err) { toast.error(err.message || 'Capture failed'); }
 finally { setCapturing(false); }
 };

 const handleRefund = async () => {
 if (!refundModal) return;
 setRefunding(true);
 try {
 await razorpayAPI.createRefund({
 paymentId: refundModal.id,
 amount: Math.round(Number(refundAmount) * 100),
 notes: refundNotes ? { reason: refundNotes } : undefined,
 });
 toast.success('Refund initiated successfully');
 setRefundModal(null);
 setRefundAmount('');
 setRefundNotes('');
 fetchPayments();
 } catch (err) { toast.error(err.message || 'Refund failed'); }
 finally { setRefunding(false); }
 };

 const openCapture = (payment) => {
 setCaptureForm({ amount: (payment.amount / 100).toString(), currency: payment.currency || 'INR' });
 setCaptureModal(payment);
 };

 const openRefund = (payment) => {
 setRefundAmount((payment.amount / 100).toString());
 setRefundNotes('');
 setRefundModal(payment);
 };

 return (
 <div className="space-y-4">
 <div className="flex items-center justify-between">
 <h2 className="text-lg font-semibold text-gray-900">Payments</h2>
 <button onClick={fetchPayments} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">
 <RefreshCw size={14} /> Refresh
 </button>
 </div>

 <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead><tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
 <th className="px-4 py-3">Payment ID</th>
 <th className="px-4 py-3 text-right">Amount</th>
 <th className="px-4 py-3">Method</th>
 <th className="px-4 py-3">Status</th>
 <th className="px-4 py-3">Email</th>
 <th className="px-4 py-3">Date</th>
 <th className="px-4 py-3 text-right">Actions</th>
 </tr></thead>
 <tbody className="divide-y divide-gray-100">
 {loading ? (
 Array.from({ length: 5 }).map((_, i) => (
 <tr key={i}><td colSpan={7} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td></tr>
 ))
 ) : payments.length === 0 ? <EmptyRow cols={7} message="No payments found" /> : (
 payments.map(p => (
 <tr key={p.id} className="hover:bg-gray-50">
 <td className="px-4 py-3 font-mono text-xs" title={p.id}>{p.id?.slice(0, 18)}...</td>
 <td className="px-4 py-3 text-right font-medium">{formatCurrency(p.amount / 100)}</td>
 <td className="px-4 py-3 capitalize">{p.method || '—'}</td>
 <td className="px-4 py-3"><StatusBadge status={p.status} colorMap={PAYMENT_STATUS_COLORS} /></td>
 <td className="px-4 py-3 text-gray-600">{p.email || '—'}</td>
 <td className="px-4 py-3 text-gray-500 text-xs">{formatTimestamp(p.created_at)}</td>
 <td className="px-4 py-3 text-right">
 <div className="flex items-center justify-end gap-1">
 <button onClick={() => setDetailModal(p)} title="View Details" className="p-1.5 hover:bg-gray-100 rounded-lg">
 <Eye size={15} className="text-gray-500" />
 </button>
 {p.status === 'authorized' && (
 <button onClick={() => openCapture(p)} title="Capture Payment"
 className="p-1.5 hover:bg-green-50 rounded-lg">
 <CheckCircle2 size={15} className="text-green-600" />
 </button>
 )}
 {(p.status === 'captured' || p.status === 'authorized') && (
 <button onClick={() => openRefund(p)} title="Refund Payment"
 className="p-1.5 hover:bg-amber-50 rounded-lg">
 <RotateCcw size={15} className="text-amber-600" />
 </button>
 )}
 </div>
 </td>
 </tr>
 ))
 )}
 </tbody>
 </table>
 </div>
 </div>

 <PrevNextPagination
 skip={skip} count={PAGE_SIZE} total={total}
 onPrev={() => setSkip(s => Math.max(0, s - PAGE_SIZE))}
 onNext={() => setSkip(s => s + PAGE_SIZE)}
 />

 {/* Payment Detail Modal */}
 <Modal isOpen={!!detailModal} onClose={() => setDetailModal(null)} title={`Payment ${detailModal?.id || ''}`} size="lg">
 {detailModal && (
 <div className="space-y-4 text-sm">
 <div className="grid grid-cols-2 gap-4">
 <div className="bg-gray-50 rounded-lg p-3">
 <p className="text-xs text-gray-400 mb-1">Payment ID</p>
 <p className="font-mono font-medium text-xs break-all">{detailModal.id}</p>
 </div>
 <div className="bg-gray-50 rounded-lg p-3">
 <p className="text-xs text-gray-400 mb-1">Order ID</p>
 <p className="font-mono font-medium text-xs">{detailModal.order_id || '—'}</p>
 </div>
 <div className="bg-gray-50 rounded-lg p-3">
 <p className="text-xs text-gray-400 mb-1">Amount</p>
 <p className="font-medium text-lg">{formatCurrency(detailModal.amount / 100)}</p>
 </div>
 <div className="bg-gray-50 rounded-lg p-3">
 <p className="text-xs text-gray-400 mb-1">Currency</p>
 <p className="font-medium">{detailModal.currency || 'INR'}</p>
 </div>
 <div className="bg-gray-50 rounded-lg p-3">
 <p className="text-xs text-gray-400 mb-1">Method</p>
 <p className="font-medium capitalize">{detailModal.method || '—'}</p>
 </div>
 <div className="bg-gray-50 rounded-lg p-3">
 <p className="text-xs text-gray-400 mb-1">Status</p>
 <StatusBadge status={detailModal.status} colorMap={PAYMENT_STATUS_COLORS} />
 </div>
 <div className="bg-gray-50 rounded-lg p-3">
 <p className="text-xs text-gray-400 mb-1">Email</p>
 <p className="font-medium">{detailModal.email || '—'}</p>
 </div>
 <div className="bg-gray-50 rounded-lg p-3">
 <p className="text-xs text-gray-400 mb-1">Contact</p>
 <p className="font-medium">{detailModal.contact || '—'}</p>
 </div>
 </div>
 <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
 <span className="text-gray-500">Created At</span>
 <span className="font-medium">{formatTimestamp(detailModal.created_at)}</span>
 </div>
 </div>
 )}
 </Modal>

 {/* Capture Payment Modal */}
 <Modal isOpen={!!captureModal} onClose={() => setCaptureModal(null)} title={`Capture Payment`} size="md">
 <div className="space-y-4">
 <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600">
 <p><strong>Payment ID:</strong> {captureModal?.id}</p>
 <p><strong>Original Amount:</strong> {formatCurrency((captureModal?.amount || 0) / 100)}</p>
 </div>
 <div>
 <label className="block text-xs font-medium text-gray-600 mb-1">Amount to Capture (in rupees)</label>
 <input type="number" step="0.01" value={captureForm.amount}
 onChange={e => setCaptureForm(f => ({ ...f, amount: e.target.value }))}
 className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
 </div>
 <div>
 <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
 <input type="text" value={captureForm.currency}
 onChange={e => setCaptureForm(f => ({ ...f, currency: e.target.value }))}
 className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
 </div>
 <div className="flex justify-end gap-2">
 <button onClick={() => setCaptureModal(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
 <button onClick={handleCapture} disabled={capturing}
 className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
 {capturing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
 {capturing ? 'Capturing...' : 'Capture Payment'}
 </button>
 </div>
 </div>
 </Modal>

 {/* Refund Payment Modal */}
 <Modal isOpen={!!refundModal} onClose={() => setRefundModal(null)} title="Refund Payment" size="md">
 <div className="space-y-4">
 <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600">
 <p><strong>Payment ID:</strong> {refundModal?.id}</p>
 <p><strong>Payment Amount:</strong> {formatCurrency((refundModal?.amount || 0) / 100)}</p>
 </div>
 <div>
 <label className="block text-xs font-medium text-gray-600 mb-1">Refund Amount (in rupees)</label>
 <input type="number" step="0.01" value={refundAmount}
 onChange={e => setRefundAmount(e.target.value)}
 className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
 </div>
 <div>
 <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
 <input type="text" value={refundNotes} onChange={e => setRefundNotes(e.target.value)}
 placeholder="Reason for refund"
 className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
 </div>
 <div className="flex justify-end gap-2">
 <button onClick={() => setRefundModal(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
 <button onClick={handleRefund} disabled={refunding}
 className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
 {refunding ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
 {refunding ? 'Processing...' : 'Initiate Refund'}
 </button>
 </div>
 </div>
 </Modal>
 </div>
 );
};

// ─── Refunds Tab ────────────────────────────────────────────────────────────

const RefundsTab = () => {
 const [refunds, setRefunds] = useState([]);
 const [total, setTotal] = useState(0);
 const [skip, setSkip] = useState(0);
 const [loading, setLoading] = useState(true);
 const [createModal, setCreateModal] = useState(false);
 const [createForm, setCreateForm] = useState({ paymentId: '', amount: '', notes: '' });
 const [submitting, setSubmitting] = useState(false);

 const fetchRefunds = useCallback(async () => {
 try {
 setLoading(true);
 const res = await razorpayAPI.getRefunds({ count: PAGE_SIZE, skip });
 setRefunds(res.data.items || []);
 setTotal(res.data.count || 0);
 } catch (err) { toast.error(err.message || 'Failed to load refunds'); }
 finally { setLoading(false); }
 }, [skip]);

 useEffect(() => { fetchRefunds(); }, [fetchRefunds]);

 const handleCreate = async () => {
 if (!createForm.paymentId) { toast.error('Payment ID is required'); return; }
 if (!createForm.amount) { toast.error('Amount is required'); return; }
 setSubmitting(true);
 try {
 await razorpayAPI.createRefund({
 paymentId: createForm.paymentId,
 amount: Math.round(Number(createForm.amount) * 100),
 notes: createForm.notes ? { reason: createForm.notes } : undefined,
 });
 toast.success('Refund created successfully');
 setCreateModal(false);
 setCreateForm({ paymentId: '', amount: '', notes: '' });
 fetchRefunds();
 } catch (err) { toast.error(err.message || 'Failed to create refund'); }
 finally { setSubmitting(false); }
 };

 return (
 <div className="space-y-4">
 <div className="flex items-center justify-between">
 <h2 className="text-lg font-semibold text-gray-900">Refunds</h2>
 <button onClick={() => setCreateModal(true)}
 className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
 <RotateCcw size={16} /> Create Refund
 </button>
 </div>

 <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead><tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
 <th className="px-4 py-3">Refund ID</th>
 <th className="px-4 py-3">Payment ID</th>
 <th className="px-4 py-3 text-right">Amount</th>
 <th className="px-4 py-3">Status</th>
 <th className="px-4 py-3">Speed</th>
 <th className="px-4 py-3">Date</th>
 </tr></thead>
 <tbody className="divide-y divide-gray-100">
 {loading ? (
 Array.from({ length: 5 }).map((_, i) => (
 <tr key={i}><td colSpan={6} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td></tr>
 ))
 ) : refunds.length === 0 ? <EmptyRow cols={6} message="No refunds found" /> : (
 refunds.map(r => (
 <tr key={r.id} className="hover:bg-gray-50">
 <td className="px-4 py-3 font-mono text-xs" title={r.id}>{r.id?.slice(0, 18)}...</td>
 <td className="px-4 py-3 font-mono text-xs" title={r.payment_id}>{r.payment_id?.slice(0, 18)}...</td>
 <td className="px-4 py-3 text-right font-medium">{formatCurrency(r.amount / 100)}</td>
 <td className="px-4 py-3"><StatusBadge status={r.status} colorMap={REFUND_STATUS_COLORS} /></td>
 <td className="px-4 py-3 text-gray-600 capitalize">{r.speed_processed || r.speed_requested || '—'}</td>
 <td className="px-4 py-3 text-gray-500 text-xs">{formatTimestamp(r.created_at)}</td>
 </tr>
 ))
 )}
 </tbody>
 </table>
 </div>
 </div>

 <PrevNextPagination
 skip={skip} count={PAGE_SIZE} total={total}
 onPrev={() => setSkip(s => Math.max(0, s - PAGE_SIZE))}
 onNext={() => setSkip(s => s + PAGE_SIZE)}
 />

 {/* Create Refund Modal */}
 <Modal isOpen={createModal} onClose={() => setCreateModal(false)} title="Create Refund" size="md">
 <div className="space-y-4">
 <div>
 <label className="block text-xs font-medium text-gray-600 mb-1">Payment ID *</label>
 <input type="text" value={createForm.paymentId}
 onChange={e => setCreateForm(f => ({ ...f, paymentId: e.target.value }))}
 placeholder="pay_xxxxxxxxxxxxxxx"
 className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
 </div>
 <div>
 <label className="block text-xs font-medium text-gray-600 mb-1">Amount (in rupees) *</label>
 <input type="number" step="0.01" value={createForm.amount}
 onChange={e => setCreateForm(f => ({ ...f, amount: e.target.value }))}
 placeholder="100.00"
 className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
 </div>
 <div>
 <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
 <input type="text" value={createForm.notes}
 onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))}
 placeholder="Reason for refund"
 className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
 </div>
 <div className="flex justify-end gap-2 pt-2">
 <button onClick={() => setCreateModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
 <button onClick={handleCreate} disabled={submitting}
 className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
 {submitting ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
 {submitting ? 'Creating...' : 'Create Refund'}
 </button>
 </div>
 </div>
 </Modal>
 </div>
 );
};

// ─── Settlements Tab ────────────────────────────────────────────────────────

const SettlementsTab = () => {
 const [settlements, setSettlements] = useState([]);
 const [total, setTotal] = useState(0);
 const [skip, setSkip] = useState(0);
 const [loading, setLoading] = useState(true);
 const [reconciliationRequired, setReconciliationRequired] = useState(false);
 const [detailModal, setDetailModal] = useState(null);
 const [detailData, setDetailData] = useState(null);
 const [detailLoading, setDetailLoading] = useState(false);

 const fetchSettlements = useCallback(async () => {
 try {
 setLoading(true);
 const res = await razorpayAPI.getSettlements({ count: PAGE_SIZE, skip });
 setSettlements(res.data.items || []);
 setTotal(res.data.count || 0);
 setReconciliationRequired(Boolean(res.data.reconciliationRequired));
 } catch (err) { toast.error(err.message || 'Failed to load settlements'); }
 finally { setLoading(false); }
 }, [skip]);

 useEffect(() => { fetchSettlements(); }, [fetchSettlements]);

 const handleViewDetail = async (settlement) => {
 setDetailModal(settlement);
 setDetailData(null);
 setDetailLoading(true);
 try {
 const res = await razorpayAPI.getSettlement(settlement.id);
 setDetailData(res.data);
 } catch (err) { toast.error(err.message || 'Failed to load settlement details'); }
 finally { setDetailLoading(false); }
 };

 return (
 <div className="space-y-4">
 <div className="flex items-center justify-between">
 <h2 className="text-lg font-semibold text-gray-900">Settlements</h2>
 <button onClick={fetchSettlements} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">
 <RefreshCw size={14} /> Refresh
 </button>
 </div>

 {reconciliationRequired && !loading && (
 <div data-testid="razorpay-settlement-reconciliation-state" className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
 Settlement batches are stored only after provider reconciliation. Captured payments remain separate until a matched provider settlement is imported for this tenant.
 </div>
 )}

 <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead><tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
 <th className="px-4 py-3">Settlement ID</th>
 <th className="px-4 py-3 text-right">Amount</th>
 <th className="px-4 py-3">Status</th>
 <th className="px-4 py-3">UTR</th>
 <th className="px-4 py-3">Date</th>
 <th className="px-4 py-3 text-right">Actions</th>
 </tr></thead>
 <tbody className="divide-y divide-gray-100">
 {loading ? (
 Array.from({ length: 5 }).map((_, i) => (
 <tr key={i}><td colSpan={6} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td></tr>
 ))
 ) : settlements.length === 0 ? <EmptyRow cols={6} message={reconciliationRequired ? 'No reconciled settlement batches yet' : 'No settlements found'} /> : (
 settlements.map(s => (
 <tr key={s.id} className="hover:bg-gray-50">
 <td className="px-4 py-3 font-mono text-xs" title={s.id}>{s.id?.slice(0, 18)}...</td>
 <td className="px-4 py-3 text-right font-medium">{formatCurrency(s.amount / 100)}</td>
 <td className="px-4 py-3"><StatusBadge status={s.status} colorMap={SETTLEMENT_STATUS_COLORS} /></td>
 <td className="px-4 py-3 font-mono text-xs">{s.utr || '—'}</td>
 <td className="px-4 py-3 text-gray-500 text-xs">{formatTimestamp(s.created_at)}</td>
 <td className="px-4 py-3 text-right">
 <button onClick={() => handleViewDetail(s)} title="View Details" className="p-1.5 hover:bg-gray-100 rounded-lg">
 <Eye size={15} className="text-gray-500" />
 </button>
 </td>
 </tr>
 ))
 )}
 </tbody>
 </table>
 </div>
 </div>

 <PrevNextPagination
 skip={skip} count={PAGE_SIZE} total={total}
 onPrev={() => setSkip(s => Math.max(0, s - PAGE_SIZE))}
 onNext={() => setSkip(s => s + PAGE_SIZE)}
 />

 {/* Settlement Detail Modal */}
 <Modal isOpen={!!detailModal} onClose={() => setDetailModal(null)} title={`Settlement ${detailModal?.id || ''}`} size="lg">
 {detailLoading ? (
 <div className="flex justify-center py-8"><Loader size="md" /></div>
 ) : detailData ? (
 <div className="space-y-4 text-sm">
 <div className="grid grid-cols-2 gap-4">
 <div className="bg-gray-50 rounded-lg p-3">
 <p className="text-xs text-gray-400 mb-1">Settlement ID</p>
 <p className="font-mono font-medium text-xs break-all">{detailData.id}</p>
 </div>
 <div className="bg-gray-50 rounded-lg p-3">
 <p className="text-xs text-gray-400 mb-1">Amount</p>
 <p className="font-medium text-lg">{formatCurrency((detailData.amount || 0) / 100)}</p>
 </div>
 <div className="bg-gray-50 rounded-lg p-3">
 <p className="text-xs text-gray-400 mb-1">Status</p>
 <StatusBadge status={detailData.status} colorMap={SETTLEMENT_STATUS_COLORS} />
 </div>
 <div className="bg-gray-50 rounded-lg p-3">
 <p className="text-xs text-gray-400 mb-1">UTR</p>
 <p className="font-mono font-medium">{detailData.utr || '—'}</p>
 </div>
 </div>
 <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
 <span className="text-gray-500">Created At</span>
 <span className="font-medium">{formatTimestamp(detailData.created_at)}</span>
 </div>
 </div>
 ) : detailModal ? (
 <div className="space-y-4 text-sm">
 <div className="grid grid-cols-2 gap-4">
 <div className="bg-gray-50 rounded-lg p-3">
 <p className="text-xs text-gray-400 mb-1">Settlement ID</p>
 <p className="font-mono font-medium text-xs break-all">{detailModal.id}</p>
 </div>
 <div className="bg-gray-50 rounded-lg p-3">
 <p className="text-xs text-gray-400 mb-1">Amount</p>
 <p className="font-medium text-lg">{formatCurrency((detailModal.amount || 0) / 100)}</p>
 </div>
 <div className="bg-gray-50 rounded-lg p-3">
 <p className="text-xs text-gray-400 mb-1">Status</p>
 <StatusBadge status={detailModal.status} colorMap={SETTLEMENT_STATUS_COLORS} />
 </div>
 <div className="bg-gray-50 rounded-lg p-3">
 <p className="text-xs text-gray-400 mb-1">UTR</p>
 <p className="font-mono font-medium">{detailModal.utr || '—'}</p>
 </div>
 </div>
 <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
 <span className="text-gray-500">Created At</span>
 <span className="font-medium">{formatTimestamp(detailModal.created_at)}</span>
 </div>
 </div>
 ) : null}
 </Modal>
 </div>
 );
};

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function RazorpayDashboardPage() {
 const [tab, setTab] = useState('overview');
 const [readiness, setReadiness] = useState(null);
 const [readinessError, setReadinessError] = useState('');

 useEffect(() => {
  let mounted = true;
  partnerDashboardAPI.paymentSummary('razorpay')
   .then(response => { if (mounted) setReadiness(response.data); })
   .catch(error => { if (mounted) setReadinessError(error?.response?.data?.message || error.message || 'Unable to check Razorpay configuration'); });
  return () => { mounted = false; };
 }, []);

 const renderTab = () => {
 switch (tab) {
 case 'overview': return <OverviewTab />;
 case 'payments': return <PaymentsTab />;
 case 'refunds': return <RefundsTab />;
 case 'settlements': return <SettlementsTab />;
 default: return <OverviewTab />;
 }
 };

 return (
 <div className="space-y-5">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
 <IndianRupee size={22} className="text-white" />
 </div>
 <div>
 <h1 className="text-2xl font-bold text-gray-900">Razorpay</h1>
 <p className="text-sm text-gray-500">Payments, refunds, and settlements</p>
 </div>
 </div>

 {readinessError ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" data-testid="razorpay-readiness-error">{readinessError}</div>
  : readiness?.provider?.configured === false ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900" data-testid="razorpay-readiness-banner"><p className="font-bold">Razorpay is not configured for this store.</p><p className="mt-1">Add and test the Razorpay credentials before loading payment, refund, or settlement operations.</p><a href="/admin/modules?module=razorpay" className="mt-3 inline-flex rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-white" data-testid="razorpay-configure-link">Configure Razorpay</a></div>
  : readiness === null ? <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500" data-testid="razorpay-readiness-loading">Checking Razorpay configuration…</div> : null}

 {/* Tab Navigation */}
 <div className="overflow-x-auto pb-1">
 <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl w-fit">
 {TABS.map(({ id, label, icon: Icon }) => (
 <button key={id} onClick={() => setTab(id)}
 className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
 tab === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
 }`}>
 <Icon size={16} />{label}
 </button>
 ))}
 </div>
 </div>

 {/* Active Tab Content */}
 {readiness?.provider?.configured === true ? renderTab() : null}
 </div>
 );
}
