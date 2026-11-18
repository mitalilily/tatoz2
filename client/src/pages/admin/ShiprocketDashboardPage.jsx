import { useState, useEffect, useCallback } from 'react';
import {
 Truck, Package, MapPin, BarChart3, RefreshCw, Search,
 Download, Clock, CheckCircle2, XCircle, AlertTriangle,
 IndianRupee, Eye, RotateCcw, Navigation, FileText,
 Printer, Calculator, Send, ChevronRight, X, ArrowUpDown,
 Loader2, Box, Tag,
} from 'lucide-react';
import {
 PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
 CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { partnerDashboardAPI, shiprocketAPI } from '../../services/api';
import Modal from '../../components/common/Modal';
import Pagination from '../../components/common/Pagination';
import Loader from '../../components/common/Loader';
import toast from 'react-hot-toast';

// ─── Constants ──────────────────────────────────────────────────────────────

const TABS = [
 { id: 'overview', label: 'Overview', icon: BarChart3 },
 { id: 'orders', label: 'Orders', icon: Package },
 { id: 'shipments', label: 'Shipments', icon: Truck },
 { id: 'cod', label: 'COD', icon: IndianRupee },
 { id: 'ndr', label: 'Returns / NDR', icon: RotateCcw },
 { id: 'tracking', label: 'Tracking', icon: Navigation },
 { id: 'pickup', label: 'Pickup Locations', icon: MapPin },
 { id: 'rates', label: 'Rate Calculator', icon: Calculator },
];

const SR_STATUS_OPTIONS = [
 '', 'NEW', 'PICKUP SCHEDULED', 'PICKED UP', 'IN TRANSIT',
 'OUT FOR DELIVERY', 'DELIVERED', 'CANCELLED', 'RTO INITIATED', 'RTO DELIVERED', 'NDR',
];

const SR_STATUS_COLORS = {
 'NEW': 'bg-blue-100 text-blue-700',
 'PICKUP SCHEDULED': 'bg-yellow-100 text-yellow-700',
 'PICKED UP': 'bg-purple-100 text-purple-700',
 'IN TRANSIT': 'bg-indigo-100 text-indigo-700',
 'OUT FOR DELIVERY': 'bg-orange-100 text-orange-700',
 'DELIVERED': 'bg-green-100 text-green-700',
 'CANCELLED': 'bg-red-100 text-red-700',
 'CANCELED': 'bg-red-100 text-red-700',
 'RTO INITIATED': 'bg-red-100 text-red-700',
 'RTO DELIVERED': 'bg-gray-100 text-gray-700',
 'NDR': 'bg-amber-100 text-amber-700',
 'LOST': 'bg-red-100 text-red-700',
 'DAMAGED': 'bg-red-100 text-red-700',
 'RETURN CREATED': 'bg-orange-100 text-orange-700',
 'UNKNOWN': 'bg-gray-100 text-gray-600',
};

const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b', '#06b6d4'];

const formatCurrency = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;

// ─── Reusable Components ────────────────────────────────────────────────────

const Skeleton = ({ className = '' }) => (
 <div className={`animate-pulse bg-gray-200 rounded-lg ${className}`} />
);

const StatCard = ({ icon: Icon, label, value, sub, color = 'bg-indigo-500', loading }) => {
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

const StatusBadge = ({ status }) => {
 const s = (status || '').toUpperCase();
 const cls = SR_STATUS_COLORS[s] || 'bg-gray-100 text-gray-600';
 return (
 <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>
 <span className={`w-1.5 h-1.5 rounded-full ${cls.includes('green') ? 'bg-green-500' : cls.includes('red') ? 'bg-red-500' : cls.includes('blue') ? 'bg-blue-500' : cls.includes('yellow') ? 'bg-yellow-500' : cls.includes('indigo') ? 'bg-indigo-500' : cls.includes('purple') ? 'bg-purple-500' : cls.includes('orange') ? 'bg-orange-500' : cls.includes('amber') ? 'bg-amber-500' : 'bg-gray-400'}`} />
 {status || 'Unknown'}
 </span>
 );
};

const EmptyRow = ({ cols, message = 'No data found' }) => (
 <tr><td colSpan={cols} className="text-center py-12 text-gray-400">{message}</td></tr>
);

// ─── Overview Tab ───────────────────────────────────────────────────────────

const OverviewTab = () => {
 const [stats, setStats] = useState(null);
 const [loading, setLoading] = useState(true);
 const [syncing, setSyncing] = useState(false);

 const fetchStats = useCallback(async () => {
 try {
 setLoading(true);
 const res = await shiprocketAPI.getStats();
 setStats(res.data.stats);
 } catch (err) { toast.error(err.message || 'Failed to load stats'); }
 finally { setLoading(false); }
 }, []);

 useEffect(() => { fetchStats(); }, [fetchStats]);

 const handleSync = async () => {
 setSyncing(true);
 try {
 const res = await shiprocketAPI.bulkSync();
 toast.success(res.data.message || 'Sync complete');
 fetchStats();
 } catch (err) { toast.error(err.message || 'Sync failed'); }
 finally { setSyncing(false); }
 };

 const pieData = (stats?.statusDistribution || []).map(s => ({
 name: s._id || 'Unknown', value: s.count,
 }));

 const paymentData = [
 { name: 'COD', orders: stats?.codOrders || 0, amount: stats?.codAmount || 0 },
 { name: 'Prepaid', orders: stats?.prepaidOrders || 0, amount: stats?.prepaidAmount || 0 },
 ];

 return (
 <div className="space-y-6">
 <div className="flex items-center justify-between">
 <h2 className="text-lg font-semibold text-gray-900">Overview</h2>
 <button onClick={handleSync} disabled={syncing}
 className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
 <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
 {syncing ? 'Syncing...' : 'Sync All Orders'}
 </button>
 </div>

 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
 <StatCard icon={Package} label="Total Orders" value={stats?.total || 0} color="bg-indigo-500" loading={loading} />
 <StatCard icon={Truck} label="Shipped" value={stats?.shipped || 0} color="bg-purple-500" loading={loading} />
 <StatCard icon={Send} label="In Transit" value={stats?.inTransit || 0} color="bg-blue-500" loading={loading} />
 <StatCard icon={CheckCircle2} label="Delivered" value={stats?.delivered || 0} color="bg-emerald-500" loading={loading} />
 <StatCard icon={RotateCcw} label="RTO" value={stats?.rto || 0} color="bg-red-500" loading={loading} />
 <StatCard icon={Clock} label="Pending" value={stats?.pending || 0} color="bg-amber-500" loading={loading} />
 </div>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
 {/* Status Distribution Pie */}
 <div className="bg-white rounded-xl border border-gray-200 p-5">
 <h3 className="text-sm font-semibold text-gray-700 mb-4">Status Distribution</h3>
 {loading ? <Skeleton className="h-64" /> : pieData.length > 0 ? (
 <ResponsiveContainer width="100%" height={280}>
 <PieChart>
 <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
 {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
 </Pie>
 <Tooltip />
 </PieChart>
 </ResponsiveContainer>
 ) : <p className="text-center text-gray-400 py-16">No shipment data yet</p>}
 </div>

 {/* COD vs Prepaid */}
 <div className="bg-white rounded-xl border border-gray-200 p-5">
 <h3 className="text-sm font-semibold text-gray-700 mb-4">COD vs Prepaid</h3>
 {loading ? <Skeleton className="h-64" /> : (
 <ResponsiveContainer width="100%" height={280}>
 <BarChart data={paymentData}>
 <CartesianGrid strokeDasharray="3 3" vertical={false} />
 <XAxis dataKey="name" tick={{ fontSize: 12 }} />
 <YAxis tick={{ fontSize: 12 }} />
 <Tooltip formatter={(v, n) => n === 'amount' ? formatCurrency(v) : v} />
 <Legend />
 <Bar dataKey="orders" fill="#6366f1" radius={[6, 6, 0, 0]} name="Orders" />
 <Bar dataKey="amount" fill="#10b981" radius={[6, 6, 0, 0]} name="Amount (₹)" />
 </BarChart>
 </ResponsiveContainer>
 )}
 </div>
 </div>

 {/* Recent Orders */}
 {stats?.recentOrders?.length > 0 && (
 <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
 <div className="px-5 py-4 border-b border-gray-100">
 <h3 className="text-sm font-semibold text-gray-700">Recent ShipRocket Orders</h3>
 </div>
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead><tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
 <th className="px-5 py-3">Order #</th><th className="px-5 py-3">AWB</th><th className="px-5 py-3">Courier</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Amount</th>
 </tr></thead>
 <tbody className="divide-y divide-gray-100">
 {stats.recentOrders.map(o => (
 <tr key={o._id} className="hover:bg-gray-50">
 <td className="px-5 py-3 font-medium">{o.orderNumber}</td>
 <td className="px-5 py-3 font-mono text-xs">{o.awbCode || '—'}</td>
 <td className="px-5 py-3">{o.courierName || '—'}</td>
 <td className="px-5 py-3"><StatusBadge status={o.shiprocketStatus} /></td>
 <td className="px-5 py-3 text-right font-medium">{formatCurrency(o.total)}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 )}
 </div>
 );
};

// ─── Orders Tab ─────────────────────────────────────────────────────────────

const OrdersTab = () => {
 const [orders, setOrders] = useState([]);
 const [page, setPage] = useState(1);
 const [totalPages, setTotalPages] = useState(1);
 const [loading, setLoading] = useState(true);
 const [filters, setFilters] = useState({ search: '', status: '', paymentType: '' });
 const [shipModal, setShipModal] = useState(null);
 const [shipForm, setShipForm] = useState({ weight: 0.5, length: 10, breadth: 10, height: 10 });
 const [shipping, setShipping] = useState(false);
 const [syncingId, setSyncingId] = useState(null);
 const [detailModal, setDetailModal] = useState(null);

 const fetchOrders = useCallback(async () => {
 try {
 setLoading(true);
 const res = await shiprocketAPI.getOrders({ page, limit: 20, ...filters });
 setOrders(res.data.orders);
 setTotalPages(res.data.pagination?.pages || 1);
 } catch (err) { toast.error(err.message || 'Failed to load orders'); }
 finally { setLoading(false); }
 }, [page, filters]);

 useEffect(() => { fetchOrders(); }, [fetchOrders]);

 const handleSync = async (orderId) => {
 setSyncingId(orderId);
 try {
 await shiprocketAPI.syncOrder(orderId);
 toast.success('Order synced');
 fetchOrders();
 } catch (err) { toast.error(err.message); }
 finally { setSyncingId(null); }
 };

 const handleShip = async () => {
 if (!shipModal) return;
 setShipping(true);
 try {
 await shiprocketAPI.createShipment({ orderId: shipModal._id, ...shipForm });
 toast.success('Shipment created on ShipRocket');
 setShipModal(null);
 fetchOrders();
 } catch (err) { toast.error(err.message || 'Failed to create shipment'); }
 finally { setShipping(false); }
 };

 const handleCancel = async (orderId) => {
 if (!window.confirm('Cancel this order on ShipRocket?')) return;
 try {
 await shiprocketAPI.cancelOrder(orderId);
 toast.success('Order cancelled');
 fetchOrders();
 } catch (err) { toast.error(err.message); }
 };

 return (
 <div className="space-y-4">
 {/* Filters */}
 <div className="flex flex-wrap items-center gap-3">
 <div className="relative flex-1 min-w-[200px]">
 <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
 <input value={filters.search} onChange={e => { setFilters(f => ({ ...f, search: e.target.value })); setPage(1); }}
 placeholder="Search order#, AWB, customer..." className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
 </div>
 <select value={filters.status} onChange={e => { setFilters(f => ({ ...f, status: e.target.value })); setPage(1); }}
 className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
 <option value="">All Statuses</option>
 {SR_STATUS_OPTIONS.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
 </select>
 <select value={filters.paymentType} onChange={e => { setFilters(f => ({ ...f, paymentType: e.target.value })); setPage(1); }}
 className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
 <option value="">All Payments</option>
 <option value="cod">COD</option>
 <option value="prepaid">Prepaid</option>
 </select>
 </div>

 {/* Table */}
 <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead><tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
 <th className="px-4 py-3">Order #</th>
 <th className="px-4 py-3">Customer</th>
 <th className="px-4 py-3">AWB</th>
 <th className="px-4 py-3">Courier</th>
 <th className="px-4 py-3">Status</th>
 <th className="px-4 py-3">Payment</th>
 <th className="px-4 py-3 text-right">Amount</th>
 <th className="px-4 py-3 text-right">Actions</th>
 </tr></thead>
 <tbody className="divide-y divide-gray-100">
 {loading ? (
 Array.from({ length: 5 }).map((_, i) => (
 <tr key={i}><td colSpan={8} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td></tr>
 ))
 ) : orders.length === 0 ? <EmptyRow cols={8} message="No ShipRocket orders found" /> : (
 orders.map(o => (
 <tr key={o._id} className="hover:bg-gray-50">
 <td className="px-4 py-3 font-medium">{o.orderNumber}</td>
 <td className="px-4 py-3 text-gray-600">{o.shippingAddress?.fullName || '—'}</td>
 <td className="px-4 py-3 font-mono text-xs">{o.awbCode || '—'}</td>
 <td className="px-4 py-3">{o.courierName || '—'}</td>
 <td className="px-4 py-3"><StatusBadge status={o.shiprocketStatus} /></td>
 <td className="px-4 py-3">
 <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${o.paymentMethod === 'cod' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
 {o.paymentMethod === 'cod' ? 'COD' : 'Prepaid'}
 </span>
 </td>
 <td className="px-4 py-3 text-right font-medium">{formatCurrency(o.total)}</td>
 <td className="px-4 py-3 text-right">
 <div className="flex items-center justify-end gap-1">
 <button onClick={() => setDetailModal(o)} title="View" className="p-1.5 hover:bg-gray-100 rounded-lg"><Eye size={15} className="text-gray-500" /></button>
 <button onClick={() => handleSync(o._id)} disabled={syncingId === o._id} title="Sync" className="p-1.5 hover:bg-gray-100 rounded-lg">
 <RefreshCw size={15} className={`text-gray-500 ${syncingId === o._id ? 'animate-spin' : ''}`} />
 </button>
 {!o.shiprocketOrderId && (
 <button onClick={() => setShipModal(o)} title="Ship" className="p-1.5 hover:bg-indigo-50 rounded-lg"><Truck size={15} className="text-indigo-600" /></button>
 )}
 {o.shiprocketOrderId && o.shiprocketStatus !== 'DELIVERED' && o.shiprocketStatus !== 'CANCELLED' && (
 <button onClick={() => handleCancel(o._id)} title="Cancel" className="p-1.5 hover:bg-red-50 rounded-lg"><XCircle size={15} className="text-red-500" /></button>
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

 <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />

 {/* Ship Modal */}
 <Modal isOpen={!!shipModal} onClose={() => setShipModal(null)} title={`Ship Order ${shipModal?.orderNumber || ''}`} size="md">
 <div className="space-y-4">
 <div className="grid grid-cols-2 gap-3">
 <div>
 <label className="block text-xs font-medium text-gray-600 mb-1">Weight (kg)</label>
 <input type="number" step="0.1" value={shipForm.weight} onChange={e => setShipForm(f => ({ ...f, weight: Number(e.target.value) }))}
 className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
 </div>
 <div>
 <label className="block text-xs font-medium text-gray-600 mb-1">Length (cm)</label>
 <input type="number" value={shipForm.length} onChange={e => setShipForm(f => ({ ...f, length: Number(e.target.value) }))}
 className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
 </div>
 <div>
 <label className="block text-xs font-medium text-gray-600 mb-1">Breadth (cm)</label>
 <input type="number" value={shipForm.breadth} onChange={e => setShipForm(f => ({ ...f, breadth: Number(e.target.value) }))}
 className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
 </div>
 <div>
 <label className="block text-xs font-medium text-gray-600 mb-1">Height (cm)</label>
 <input type="number" value={shipForm.height} onChange={e => setShipForm(f => ({ ...f, height: Number(e.target.value) }))}
 className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
 </div>
 </div>
 <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600">
 <p><strong>Customer:</strong> {shipModal?.shippingAddress?.fullName}</p>
 <p><strong>Address:</strong> {shipModal?.shippingAddress?.street}, {shipModal?.shippingAddress?.city} - {shipModal?.shippingAddress?.pincode}</p>
 <p><strong>Amount:</strong> {formatCurrency(shipModal?.total)} ({shipModal?.paymentMethod === 'cod' ? 'COD' : 'Prepaid'})</p>
 </div>
 <div className="flex justify-end gap-2">
 <button onClick={() => setShipModal(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
 <button onClick={handleShip} disabled={shipping}
 className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
 {shipping ? <Loader2 size={16} className="animate-spin" /> : <Truck size={16} />}
 {shipping ? 'Creating...' : 'Create Shipment'}
 </button>
 </div>
 </div>
 </Modal>

 {/* Detail Modal */}
 <Modal isOpen={!!detailModal} onClose={() => setDetailModal(null)} title={`Order ${detailModal?.orderNumber || ''}`} size="lg">
 {detailModal && (
 <div className="space-y-4 text-sm">
 <div className="grid grid-cols-2 gap-4">
 <div className="bg-gray-50 rounded-lg p-3">
 <p className="text-xs text-gray-400 mb-1">ShipRocket Order ID</p>
 <p className="font-medium">{detailModal.shiprocketOrderId || '—'}</p>
 </div>
 <div className="bg-gray-50 rounded-lg p-3">
 <p className="text-xs text-gray-400 mb-1">Shipment ID</p>
 <p className="font-medium">{detailModal.shiprocketShipmentId || '—'}</p>
 </div>
 <div className="bg-gray-50 rounded-lg p-3">
 <p className="text-xs text-gray-400 mb-1">AWB Code</p>
 <p className="font-mono font-medium">{detailModal.awbCode || '—'}</p>
 </div>
 <div className="bg-gray-50 rounded-lg p-3">
 <p className="text-xs text-gray-400 mb-1">Courier</p>
 <p className="font-medium">{detailModal.courierName || '—'}</p>
 </div>
 </div>
 <div className="flex items-center gap-3">
 <StatusBadge status={detailModal.shiprocketStatus} />
 <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${detailModal.paymentMethod === 'cod' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
 {detailModal.paymentMethod === 'cod' ? 'COD' : 'Prepaid'}
 </span>
 {detailModal.labelGenerated && <span className="text-xs text-indigo-600">Label Generated</span>}
 {detailModal.manifestGenerated && <span className="text-xs text-indigo-600">Manifest Ready</span>}
 {detailModal.pickupScheduled && <span className="text-xs text-indigo-600">Pickup Scheduled</span>}
 </div>
 <div className="bg-gray-50 rounded-lg p-3">
 <p className="text-xs text-gray-400 mb-1">Shipping Address</p>
 <p>{detailModal.shippingAddress?.fullName}</p>
 <p className="text-gray-600">{detailModal.shippingAddress?.street}, {detailModal.shippingAddress?.city}, {detailModal.shippingAddress?.state} - {detailModal.shippingAddress?.pincode}</p>
 <p className="text-gray-600">{detailModal.shippingAddress?.phone}</p>
 </div>
 <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
 <span className="text-gray-500">Total Amount</span>
 <span className="text-lg font-bold">{formatCurrency(detailModal.total)}</span>
 </div>
 {detailModal.shiprocketLastSync && (
 <p className="text-xs text-gray-400">Last synced: {new Date(detailModal.shiprocketLastSync).toLocaleString()}</p>
 )}
 </div>
 )}
 </Modal>
 </div>
 );
};

// ─── Shipments Tab ──────────────────────────────────────────────────────────

// Normalize Shiprocket status strings (handles typos like CANCELED vs CANCELLED)
const SR_STATUS_NORMALIZE = {
  'CANCELED': 'CANCELLED',
  'PICKUP GENERATED': 'PICKUP SCHEDULED',
  'PICKUP QUEUED': 'PICKUP SCHEDULED',
  'SHIPPED': 'IN TRANSIT',
  'INTRANSIT': 'IN TRANSIT',
  'OFD': 'OUT FOR DELIVERY',
  'UNDELIVERED': 'NDR',
  'RTO IN TRANSIT': 'RTO INITIATED',
  'RTO-OFD': 'RTO INITIATED',
  'LOST': 'CANCELLED',
  'DAMAGED': 'CANCELLED',
};
const normalizeStatus = (s) => {
  if (!s) return 'UNKNOWN';
  const upper = String(s).toUpperCase().trim();
  return SR_STATUS_NORMALIZE[upper] || upper;
};

const SHIPMENT_STATUSES = [
 { key: 'ALL', label: 'All', color: 'bg-gray-100 text-gray-700 border-gray-200' },
 { key: 'NEW', label: 'New', color: 'bg-blue-50 text-blue-700 border-blue-200' },
 { key: 'PICKUP SCHEDULED', label: 'Pickup Scheduled', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
 { key: 'PICKED UP', label: 'Picked Up', color: 'bg-purple-50 text-purple-700 border-purple-200' },
 { key: 'IN TRANSIT', label: 'In Transit', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
 { key: 'OUT FOR DELIVERY', label: 'Out for Delivery', color: 'bg-orange-50 text-orange-700 border-orange-200' },
 { key: 'DELIVERED', label: 'Delivered', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
 { key: 'CANCELLED', label: 'Cancelled', color: 'bg-red-50 text-red-700 border-red-200' },
 { key: 'RTO', label: 'RTO', color: 'bg-rose-50 text-rose-700 border-rose-200' },
];

const ShipmentsTab = () => {
 const [shipments, setShipments] = useState([]);
 const [loading, setLoading] = useState(true);
 const [actionLoading, setActionLoading] = useState(null);
 const [statusFilter, setStatusFilter] = useState('ALL');
 const [searchQuery, setSearchQuery] = useState('');
 const [courierFilter, setCourierFilter] = useState('ALL');

 const fetchShipments = useCallback(async () => {
 try {
 setLoading(true);
 const res = await shiprocketAPI.getShipments({ per_page: 100 });
 setShipments(res.data.data || []);
 } catch (err) { toast.error(err.message || 'Failed to load shipments'); }
 finally { setLoading(false); }
 }, []);

 useEffect(() => { fetchShipments(); }, [fetchShipments]);

 // Unique couriers for filter
 const couriers = [...new Set(shipments.map(s => s.courier_name).filter(Boolean))];

 // Normalize shipments with readable status
 const normalized = shipments.map(s => ({ ...s, _status: normalizeStatus(s.status) }));

 // Filter shipments
 const filtered = normalized.filter(s => {
 if (statusFilter !== 'ALL') {
   if (statusFilter === 'RTO') { if (!s._status.startsWith('RTO')) return false; }
   else if (s._status !== statusFilter) return false;
 }
 if (courierFilter !== 'ALL' && s.courier_name !== courierFilter) return false;
 if (searchQuery) {
   const q = searchQuery.toLowerCase();
   if (!(String(s.id).includes(q) || String(s.order_id).includes(q) || (s.awb_code || '').toLowerCase().includes(q) || (s.courier_name || '').toLowerCase().includes(q))) return false;
 }
 return true;
 });

 // Status counts
 const statusCounts = normalized.reduce((acc, s) => {
 acc[s._status] = (acc[s._status] || 0) + 1;
 acc.ALL = (acc.ALL || 0) + 1;
 if (s._status.startsWith('RTO')) acc.RTO = (acc.RTO || 0) + 1;
 return acc;
 }, {});

 const handleAction = async (action, ids) => {
 setActionLoading(`${action}-${ids}`);
 try {
 if (action === 'label') {
 const res = await shiprocketAPI.generateLabel({ shipmentIds: [Number(ids)] });
 const url = res.data.label_url;
 if (url) window.open(url, '_blank');
 toast.success(url ? 'Label generated — opening PDF' : 'Label generated');
 } else if (action === 'manifest') {
 const res = await shiprocketAPI.generateManifest({ shipmentIds: [Number(ids)] });
 const url = res.data.manifest_url;
 if (url) window.open(url, '_blank');
 toast.success(url ? 'Manifest generated — opening PDF' : 'Manifest generated');
 } else if (action === 'pickup') {
 await shiprocketAPI.requestPickup({ shipmentId: Number(ids) });
 toast.success('Pickup requested');
 }
 fetchShipments();
 } catch (err) { toast.error(err.message || 'Action failed'); }
 finally { setActionLoading(null); }
 };

 if (loading) return <div className="flex justify-center py-16"><Loader size="md" /></div>;

 return (
 <div className="space-y-4">
 {/* Header */}
 <div className="flex items-center justify-between">
 <h2 className="text-lg font-semibold text-gray-900">Shipments <span className="text-sm font-normal text-gray-400">({filtered.length})</span></h2>
 <button onClick={fetchShipments} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">
 <RefreshCw size={14} /> Refresh
 </button>
 </div>

 {/* Status Filter Pills */}
 <div className="flex flex-wrap gap-2">
 {SHIPMENT_STATUSES.map(st => {
   const count = statusCounts[st.key] || 0;
   const active = statusFilter === st.key;
   return (
   <button key={st.key} onClick={() => setStatusFilter(st.key)}
     className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${active ? st.color + ' ring-2 ring-offset-1 ring-current shadow-sm' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
     {st.label} {count > 0 && <span className={`ml-1 ${active ? 'opacity-80' : 'text-gray-400'}`}>({count})</span>}
   </button>
   );
 })}
 </div>

 {/* Search + Courier Filter */}
 <div className="flex gap-3">
 <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
   className="input flex-1 py-2 text-sm" placeholder="Search by shipment ID, order ID, AWB, or courier..." />
 {couriers.length > 0 && (
   <select value={courierFilter} onChange={e => setCourierFilter(e.target.value)}
     className="input py-2 text-sm w-48">
     <option value="ALL">All Couriers</option>
     {couriers.map(c => <option key={c} value={c}>{c}</option>)}
   </select>
 )}
 </div>

 {/* Table */}
 <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead><tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
 <th className="px-4 py-3">Shipment ID</th>
 <th className="px-4 py-3">Order ID</th>
 <th className="px-4 py-3">AWB</th>
 <th className="px-4 py-3">Courier</th>
 <th className="px-4 py-3">Status</th>
 <th className="px-4 py-3 text-right">Actions</th>
 </tr></thead>
 <tbody className="divide-y divide-gray-100">
 {filtered.length === 0 ? <EmptyRow cols={6} message={searchQuery || statusFilter !== 'ALL' ? 'No shipments match filters' : 'No shipments found'} /> : filtered.map(s => (
 <tr key={s.id} className="hover:bg-gray-50 transition-colors">
 <td className="px-4 py-3 font-medium text-gray-900">{s.id}</td>
 <td className="px-4 py-3 text-gray-600">{s.order_id}</td>
 <td className="px-4 py-3 font-mono text-xs text-gray-600">{s.awb_code || <span className="text-gray-300">—</span>}</td>
 <td className="px-4 py-3 text-gray-600">{s.courier_name || <span className="text-gray-300">—</span>}</td>
 <td className="px-4 py-3"><StatusBadge status={s._status} /></td>
 <td className="px-4 py-3 text-right">
 <div className="flex items-center justify-end gap-1">
 <button onClick={() => handleAction('label', s.id)} disabled={!!actionLoading}
   title="Generate Label" className="p-1.5 hover:bg-indigo-50 rounded-lg transition-colors group">
   <Tag size={15} className="text-gray-400 group-hover:text-indigo-600" />
 </button>
 <button onClick={() => handleAction('manifest', s.id)} disabled={!!actionLoading}
   title="Generate Manifest" className="p-1.5 hover:bg-purple-50 rounded-lg transition-colors group">
   <FileText size={15} className="text-gray-400 group-hover:text-purple-600" />
 </button>
 <button onClick={() => handleAction('pickup', s.id)} disabled={!!actionLoading}
   title="Request Pickup" className="p-1.5 hover:bg-emerald-50 rounded-lg transition-colors group">
   <Box size={15} className="text-gray-400 group-hover:text-emerald-600" />
 </button>
 </div>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 </div>
 );
};

// ─── COD Tab ────────────────────────────────────────────────────────────────

const CODTab = () => {
 const [orders, setOrders] = useState([]);
 const [stats, setStats] = useState({});
 const [page, setPage] = useState(1);
 const [totalPages, setTotalPages] = useState(1);
 const [loading, setLoading] = useState(true);

 const fetchCOD = useCallback(async () => {
 try {
 setLoading(true);
 const res = await shiprocketAPI.getCODOrders({ page, limit: 20 });
 setOrders(res.data.orders);
 setStats(res.data.stats);
 setTotalPages(res.data.pagination?.pages || 1);
 } catch (err) { toast.error(err.message); }
 finally { setLoading(false); }
 }, [page]);

 useEffect(() => { fetchCOD(); }, [fetchCOD]);

 return (
 <div className="space-y-6">
 <h2 className="text-lg font-semibold text-gray-900">Cash on Delivery</h2>

 <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
 <StatCard icon={IndianRupee} label="Total COD Orders" value={stats.totalOrders || 0} sub={formatCurrency(stats.totalAmount)} color="bg-amber-500" loading={loading} />
 <StatCard icon={CheckCircle2} label="Delivered" value={stats.delivered || 0} sub={formatCurrency(stats.deliveredAmount)} color="bg-emerald-500" loading={loading} />
 <StatCard icon={Clock} label="Pending" value={stats.pending || 0} sub={formatCurrency(stats.pendingAmount)} color="bg-blue-500" loading={loading} />
 <StatCard icon={IndianRupee} label="Remittance Due" value={formatCurrency(stats.deliveredAmount)} color="bg-purple-500" loading={loading} />
 </div>

 <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead><tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
 <th className="px-4 py-3">Order #</th>
 <th className="px-4 py-3">Customer</th>
 <th className="px-4 py-3">AWB</th>
 <th className="px-4 py-3">Courier</th>
 <th className="px-4 py-3">Delivery Status</th>
 <th className="px-4 py-3">Payment Status</th>
 <th className="px-4 py-3 text-right">Amount</th>
 </tr></thead>
 <tbody className="divide-y divide-gray-100">
 {loading ? Array.from({ length: 3 }).map((_, i) => (
 <tr key={i}><td colSpan={7} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td></tr>
 )) : orders.length === 0 ? <EmptyRow cols={7} message="No COD orders found" /> : orders.map(o => (
 <tr key={o._id} className="hover:bg-gray-50">
 <td className="px-4 py-3 font-medium">{o.orderNumber}</td>
 <td className="px-4 py-3 text-gray-600">{o.shippingAddress?.fullName || '—'}</td>
 <td className="px-4 py-3 font-mono text-xs">{o.awbCode || '—'}</td>
 <td className="px-4 py-3">{o.courierName || '—'}</td>
 <td className="px-4 py-3"><StatusBadge status={o.shiprocketStatus} /></td>
 <td className="px-4 py-3">
 <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${o.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
 {o.paymentStatus}
 </span>
 </td>
 <td className="px-4 py-3 text-right font-medium">{formatCurrency(o.total)}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>

 <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
 </div>
 );
};

// ─── NDR / Returns Tab ──────────────────────────────────────────────────────

const NDRTab = () => {
 const [orders, setOrders] = useState([]);
 const [page, setPage] = useState(1);
 const [totalPages, setTotalPages] = useState(1);
 const [loading, setLoading] = useState(true);
 const [returnModal, setReturnModal] = useState(false);
 const [returnForm, setReturnForm] = useState({
 order_id: '', order_date: '', channel_id: '', pickup_customer_name: '',
 pickup_address: '', pickup_city: '', pickup_state: '', pickup_pincode: '',
 pickup_phone: '',
 });
 const [submitting, setSubmitting] = useState(false);

 const fetchNDR = useCallback(async () => {
 try {
 setLoading(true);
 const res = await shiprocketAPI.getNDR({ page, limit: 20 });
 setOrders(res.data.orders);
 setTotalPages(res.data.pagination?.pages || 1);
 } catch (err) { toast.error(err.message); }
 finally { setLoading(false); }
 }, [page]);

 useEffect(() => { fetchNDR(); }, [fetchNDR]);

 const handleReturn = async () => {
 setSubmitting(true);
 try {
 await shiprocketAPI.createReturn(returnForm);
 toast.success('Return order created');
 setReturnModal(false);
 setReturnForm({ order_id: '', order_date: '', channel_id: '', pickup_customer_name: '', pickup_address: '', pickup_city: '', pickup_state: '', pickup_pincode: '', pickup_phone: '' });
 fetchNDR();
 } catch (err) { toast.error(err.message); }
 finally { setSubmitting(false); }
 };

 return (
 <div className="space-y-4">
 <div className="flex items-center justify-between">
 <h2 className="text-lg font-semibold text-gray-900">Returns / NDR</h2>
 <button onClick={() => setReturnModal(true)}
 className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
 <RotateCcw size={16} /> Create Return
 </button>
 </div>

 <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead><tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
 <th className="px-4 py-3">Order #</th>
 <th className="px-4 py-3">Customer</th>
 <th className="px-4 py-3">AWB</th>
 <th className="px-4 py-3">Courier</th>
 <th className="px-4 py-3">Status</th>
 <th className="px-4 py-3 text-right">Amount</th>
 </tr></thead>
 <tbody className="divide-y divide-gray-100">
 {loading ? Array.from({ length: 3 }).map((_, i) => (
 <tr key={i}><td colSpan={6} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td></tr>
 )) : orders.length === 0 ? <EmptyRow cols={6} message="No NDR/return orders" /> : orders.map(o => (
 <tr key={o._id} className="hover:bg-gray-50">
 <td className="px-4 py-3 font-medium">{o.orderNumber}</td>
 <td className="px-4 py-3 text-gray-600">{o.shippingAddress?.fullName || '—'}</td>
 <td className="px-4 py-3 font-mono text-xs">{o.awbCode || '—'}</td>
 <td className="px-4 py-3">{o.courierName || '—'}</td>
 <td className="px-4 py-3"><StatusBadge status={o.shiprocketStatus} /></td>
 <td className="px-4 py-3 text-right font-medium">{formatCurrency(o.total)}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>

 <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />

 {/* Create Return Modal */}
 <Modal isOpen={returnModal} onClose={() => setReturnModal(false)} title="Create Return Order" size="lg">
 <div className="space-y-3">
 <div className="grid grid-cols-2 gap-3">
 {[
 { key: 'order_id', label: 'ShipRocket Order ID', type: 'text' },
 { key: 'order_date', label: 'Order Date', type: 'date' },
 { key: 'pickup_customer_name', label: 'Customer Name', type: 'text' },
 { key: 'pickup_phone', label: 'Phone', type: 'text' },
 { key: 'pickup_address', label: 'Address', type: 'text' },
 { key: 'pickup_city', label: 'City', type: 'text' },
 { key: 'pickup_state', label: 'State', type: 'text' },
 { key: 'pickup_pincode', label: 'Pincode', type: 'text' },
 ].map(f => (
 <div key={f.key}>
 <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
 <input type={f.type} value={returnForm[f.key]} onChange={e => setReturnForm(prev => ({ ...prev, [f.key]: e.target.value }))}
 className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
 </div>
 ))}
 </div>
 <div className="flex justify-end gap-2 pt-2">
 <button onClick={() => setReturnModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
 <button onClick={handleReturn} disabled={submitting}
 className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
 {submitting ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
 {submitting ? 'Creating...' : 'Create Return'}
 </button>
 </div>
 </div>
 </Modal>
 </div>
 );
};

// ─── Tracking Tab ───────────────────────────────────────────────────────────

const TrackingTab = () => {
 const [awb, setAwb] = useState('');
 const [tracking, setTracking] = useState(null);
 const [loading, setLoading] = useState(false);

 const handleTrack = async (e) => {
 e.preventDefault();
 if (!awb.trim()) return;
 setLoading(true);
 setTracking(null);
 try {
 const res = await shiprocketAPI.trackAWB(awb.trim());
 setTracking(res.data.tracking);
 } catch (err) { toast.error(err.message || 'Tracking failed'); }
 finally { setLoading(false); }
 };

 return (
 <div className="space-y-6">
 <h2 className="text-lg font-semibold text-gray-900">Track Shipment</h2>

 <form onSubmit={handleTrack} className="flex items-center gap-3 max-w-lg">
 <div className="relative flex-1">
 <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
 <input value={awb} onChange={e => setAwb(e.target.value)} placeholder="Enter AWB code..."
 className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
 </div>
 <button type="submit" disabled={loading}
 className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
 {loading ? <Loader2 size={16} className="animate-spin" /> : <Navigation size={16} />}
 Track
 </button>
 </form>

 {tracking && (
 <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
 {/* Current Status */}
 <div className="flex items-center gap-3 mb-6">
 <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
 <Truck size={20} className="text-indigo-600" />
 </div>
 <div>
 <p className="font-semibold text-gray-900">{tracking.status || tracking.awb}</p>
 {tracking.location && <p className="text-sm text-gray-500">{tracking.location}</p>}
 </div>
 </div>

 {/* Timeline */}
 {tracking.history && tracking.history.length > 0 && (
 <div className="relative pl-8">
 <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-gray-200" />
 {tracking.history.map((h, i) => (
 <div key={i} className="relative pb-6 last:pb-0">
 <div className={`absolute left-[-20px] w-3 h-3 rounded-full border-2 ${i === 0 ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-300'}`} />
 <div>
 <p className="text-sm font-medium text-gray-900">{h.activity || h['sr-status-label'] || h.status}</p>
 <p className="text-xs text-gray-500">{h.location || ''}</p>
 <p className="text-xs text-gray-400 mt-0.5">{h.date ? new Date(h.date).toLocaleString() : ''}</p>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 )}
 </div>
 );
};

// ─── Pickup Locations Tab ───────────────────────────────────────────────────

const PickupTab = () => {
 const [locations, setLocations] = useState([]);
 const [loading, setLoading] = useState(true);
 const [addModal, setAddModal] = useState(false);
 const [form, setForm] = useState({
 pickup_location: '', name: '', email: '', phone: '',
 address: '', address_2: '', city: '', state: '', pin_code: '', country: 'India',
 });
 const [submitting, setSubmitting] = useState(false);

 const fetchLocations = useCallback(async () => {
 try {
 setLoading(true);
 const res = await shiprocketAPI.getPickupLocations();
 const data = res.data.data?.shipping_address || res.data.shipping_address || [];
 setLocations(Array.isArray(data) ? data : []);
 } catch (err) { toast.error(err.message || 'Failed to load pickup locations'); }
 finally { setLoading(false); }
 }, []);

 useEffect(() => { fetchLocations(); }, [fetchLocations]);

 const handleAdd = async () => {
 setSubmitting(true);
 try {
 await shiprocketAPI.addPickupLocation(form);
 toast.success('Pickup location added');
 setAddModal(false);
 setForm({ pickup_location: '', name: '', email: '', phone: '', address: '', address_2: '', city: '', state: '', pin_code: '', country: 'India' });
 fetchLocations();
 } catch (err) { toast.error(err.message); }
 finally { setSubmitting(false); }
 };

 if (loading) return <div className="flex justify-center py-16"><Loader size="md" /></div>;

 return (
 <div className="space-y-4">
 <div className="flex items-center justify-between">
 <h2 className="text-lg font-semibold text-gray-900">Pickup Locations</h2>
 <button onClick={() => setAddModal(true)}
 className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700">
 <MapPin size={16} /> Add Location
 </button>
 </div>

 <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead><tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
 <th className="px-4 py-3">Name</th>
 <th className="px-4 py-3">Address</th>
 <th className="px-4 py-3">City</th>
 <th className="px-4 py-3">State</th>
 <th className="px-4 py-3">Pincode</th>
 <th className="px-4 py-3">Phone</th>
 </tr></thead>
 <tbody className="divide-y divide-gray-100">
 {locations.length === 0 ? <EmptyRow cols={6} message="No pickup locations configured" /> : locations.map((l, i) => (
 <tr key={l.id || i} className="hover:bg-gray-50">
 <td className="px-4 py-3 font-medium">{l.pickup_location || l.name}</td>
 <td className="px-4 py-3 text-gray-600">{l.address || '—'}</td>
 <td className="px-4 py-3">{l.city}</td>
 <td className="px-4 py-3">{l.state}</td>
 <td className="px-4 py-3">{l.pin_code}</td>
 <td className="px-4 py-3">{l.phone}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>

 {/* Add Location Modal */}
 <Modal isOpen={addModal} onClose={() => setAddModal(false)} title="Add Pickup Location" size="lg">
 <div className="space-y-3">
 <div className="grid grid-cols-2 gap-3">
 {[
 { key: 'pickup_location', label: 'Location Name (tag)', placeholder: 'Warehouse A' },
 { key: 'name', label: 'Contact Name', placeholder: 'John Doe' },
 { key: 'email', label: 'Email', placeholder: 'john@example.com' },
 { key: 'phone', label: 'Phone', placeholder: '9876543210' },
 { key: 'address', label: 'Address Line 1', placeholder: 'Street address' },
 { key: 'address_2', label: 'Address Line 2', placeholder: 'Optional' },
 { key: 'city', label: 'City', placeholder: 'Mumbai' },
 { key: 'state', label: 'State', placeholder: 'Maharashtra' },
 { key: 'pin_code', label: 'Pincode', placeholder: '400001' },
 { key: 'country', label: 'Country', placeholder: 'India' },
 ].map(f => (
 <div key={f.key}>
 <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
 <input value={form[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} placeholder={f.placeholder}
 className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
 </div>
 ))}
 </div>
 <div className="flex justify-end gap-2 pt-2">
 <button onClick={() => setAddModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
 <button onClick={handleAdd} disabled={submitting}
 className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
 {submitting ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />}
 {submitting ? 'Adding...' : 'Add Location'}
 </button>
 </div>
 </div>
 </Modal>
 </div>
 );
};

// ─── Rate Calculator Tab ────────────────────────────────────────────────────

const RatesTab = () => {
 const [form, setForm] = useState({
 pickupPincode: '', deliveryPincode: '', weight: 0.5, cod: false, declaredValue: 500,
 });
 const [rates, setRates] = useState(null);
 const [loading, setLoading] = useState(false);

 const handleCalc = async (e) => {
 e.preventDefault();
 if (!form.deliveryPincode || !form.weight) { toast.error('Delivery pincode and weight are required'); return; }
 setLoading(true);
 setRates(null);
 try {
 const res = await shiprocketAPI.getRates(form);
 setRates(res.data.rates || []);
 } catch (err) { toast.error(err.message || 'Failed to get rates'); }
 finally { setLoading(false); }
 };

 return (
 <div className="space-y-6">
 <h2 className="text-lg font-semibold text-gray-900">Rate Calculator</h2>

 <form onSubmit={handleCalc} className="bg-white rounded-xl border border-gray-200 p-5 max-w-2xl">
 <div className="grid grid-cols-2 gap-4 mb-4">
 <div>
 <label className="block text-xs font-medium text-gray-600 mb-1">Pickup Pincode</label>
 <input value={form.pickupPincode} onChange={e => setForm(f => ({ ...f, pickupPincode: e.target.value }))} placeholder="110001"
 className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
 </div>
 <div>
 <label className="block text-xs font-medium text-gray-600 mb-1">Delivery Pincode *</label>
 <input value={form.deliveryPincode} onChange={e => setForm(f => ({ ...f, deliveryPincode: e.target.value }))} placeholder="400001" required
 className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
 </div>
 <div>
 <label className="block text-xs font-medium text-gray-600 mb-1">Weight (kg) *</label>
 <input type="number" step="0.1" value={form.weight} onChange={e => setForm(f => ({ ...f, weight: Number(e.target.value) }))} required
 className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
 </div>
 <div>
 <label className="block text-xs font-medium text-gray-600 mb-1">Declared Value (₹)</label>
 <input type="number" value={form.declaredValue} onChange={e => setForm(f => ({ ...f, declaredValue: Number(e.target.value) }))}
 className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
 </div>
 </div>
 <div className="flex items-center gap-4 mb-4">
 <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
 <input type="checkbox" checked={form.cod} onChange={e => setForm(f => ({ ...f, cod: e.target.checked }))}
 className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
 Cash on Delivery
 </label>
 </div>
 <button type="submit" disabled={loading}
 className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
 {loading ? <Loader2 size={16} className="animate-spin" /> : <Calculator size={16} />}
 Calculate Rates
 </button>
 </form>

 {rates && (
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl">
 {rates.length === 0 ? (
 <div className="col-span-full text-center py-8 text-gray-400">No couriers available for this route</div>
 ) : rates.map((r, i) => (
 <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
 <div className="flex items-center justify-between mb-3">
 <h4 className="font-semibold text-gray-900">{r.name}</h4>
 {r.rating && (
 <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
 {Number(r.rating).toFixed(1)} ★
 </span>
 )}
 </div>
 <div className="space-y-1.5 text-sm">
 <div className="flex justify-between">
 <span className="text-gray-500">Estimated Days</span>
 <span className="font-medium">{r.estimatedDays || '—'} days</span>
 </div>
 <div className="flex justify-between">
 <span className="text-gray-500">Freight</span>
 <span className="font-medium text-indigo-600">{formatCurrency(r.freight)}</span>
 </div>
 {form.cod && (
 <div className="flex justify-between">
 <span className="text-gray-500">COD Charges</span>
 <span className="font-medium">{formatCurrency(r.cod)}</span>
 </div>
 )}
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 );
};

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function ShiprocketDashboardPage() {
 const [tab, setTab] = useState('overview');
 const [readiness, setReadiness] = useState(null);
 const [readinessError, setReadinessError] = useState('');

 useEffect(() => {
  let mounted = true;
  partnerDashboardAPI.shippingSummary('shiprocket')
   .then(response => { if (mounted) setReadiness(response.data); })
   .catch(error => { if (mounted) setReadinessError(error?.response?.data?.message || error.message || 'Unable to check ShipRocket configuration'); });
  return () => { mounted = false; };
 }, []);

 const renderTab = () => {
 switch (tab) {
 case 'overview': return <OverviewTab />;
 case 'orders': return <OrdersTab />;
 case 'shipments': return <ShipmentsTab />;
 case 'cod': return <CODTab />;
 case 'ndr': return <NDRTab />;
 case 'tracking': return <TrackingTab />;
 case 'pickup': return <PickupTab />;
 case 'rates': return <RatesTab />;
 default: return <OverviewTab />;
 }
 };

 return (
 <div className="space-y-5">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
 <Truck size={22} className="text-white" />
 </div>
 <div>
 <h1 className="text-2xl font-bold text-gray-900">ShipRocket</h1>
 <p className="text-sm text-gray-500">Manage shipments, tracking, and logistics</p>
 </div>
 </div>

 {readinessError ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" data-testid="shiprocket-readiness-error">{readinessError}</div>
  : readiness?.provider?.configured === false ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900" data-testid="shiprocket-readiness-banner"><p className="font-bold">ShipRocket is not configured for this store.</p><p className="mt-1">Add and test the ShipRocket credentials before using shipment sync, labels, tracking, or rate calculation.</p><a href="/admin/modules?module=shiprocket" className="mt-3 inline-flex rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-white" data-testid="shiprocket-configure-link">Configure ShipRocket</a></div>
  : readiness === null ? <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500" data-testid="shiprocket-readiness-loading">Checking ShipRocket configuration…</div> : null}

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
