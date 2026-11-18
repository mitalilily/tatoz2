import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Users, Search, Eye, Lock, Unlock, Tag, ShoppingBag, RotateCcw, Wallet, Clock3, Download, Upload } from 'lucide-react';
import { adminAPI } from '../../services/api';
import Modal from '../../components/common/Modal';
import Pagination from '../../components/common/Pagination';
import Loader from '../../components/common/Loader';
import CustomerSegmentsPanel from '../../components/admin/CustomerSegmentsPanel';
import toast from 'react-hot-toast';

const SEGMENT_BADGES = {
 new: { label: 'New', bg: 'bg-blue-50', text: 'text-blue-700' },
 active: { label: 'Active', bg: 'bg-green-50', text: 'text-green-700' },
 vip: { label: 'VIP', bg: 'bg-purple-50', text: 'text-purple-700' },
 at_risk: { label: 'At Risk', bg: 'bg-amber-50', text: 'text-amber-700' },
 dormant: { label: 'Dormant', bg: 'bg-gray-100', text: 'text-gray-600' },
};

const AdminCustomersPage = () => {
 const [searchParams] = useSearchParams();
 const [users, setUsers] = useState([]);
 const [pagination, setPagination] = useState(null);
 const [loading, setLoading] = useState(true);
 const [page, setPage] = useState(1);
 const [search, setSearch] = useState('');
 const [segmentFilter, setSegmentFilter] = useState(() => searchParams.get('segment') || '');
 const [audienceFilter, setAudienceFilter] = useState(() => searchParams.get('customerSegment') || '');
 const [selectedUser, setSelectedUser] = useState(null);
 const [updating, setUpdating] = useState(null);
 const [segments, setSegments] = useState({});
 const [tagInput, setTagInput] = useState('');
 const [customer360, setCustomer360] = useState(null);
 const [profileLoading, setProfileLoading] = useState(false);
 const [importing, setImporting] = useState(false);

 const openCustomer = async (user) => {
 setSelectedUser(user);
 setCustomer360(null);
 setProfileLoading(true);
 try {
 const res = await adminAPI.getCustomer360(user._id);
 setCustomer360(res.data);
 if (res.data.customer) setSelectedUser(current => ({ ...current, ...res.data.customer }));
 } catch (err) {
 toast.error(err.response?.data?.message || 'Could not load customer timeline');
 } finally { setProfileLoading(false); }
 };

 const closeCustomer = () => {
 setSelectedUser(null);
 setCustomer360(null);
 setTagInput('');
 };

 const money = value => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
 const date = value => value ? new Date(value).toLocaleDateString('en-IN') : '—';
 const dateTime = value => value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

 const fetchUsers = async () => {
 setLoading(true);
 try {
 const params = { page, limit: 10, role: 'customer', search };
 if (segmentFilter) params.segment = segmentFilter;
 if (audienceFilter) params.customerSegment = audienceFilter;
 const res = await adminAPI.getUsers(params);
 setUsers(res.data.users);
 setPagination(res.data.pagination);
 } catch {} finally { setLoading(false); }
 };

 useEffect(() => { fetchUsers(); }, [page, search, segmentFilter, audienceFilter]);

 useEffect(() => {
 adminAPI.getSegmentCounts?.().then(r => setSegments(r.data.segments || {})).catch(() => {});
 }, []);

 const toggleStatus = async (user) => {
 setUpdating(user._id);
 try {
 await adminAPI.updateUser(user._id, { isActive: !user.isActive });
 toast.success(user.isActive ? 'User blocked' : 'User unblocked');
 fetchUsers();
 } catch (err) { toast.error(err.message); }
 finally { setUpdating(null); }
 };

 const handleAddTag = async (userId, currentTags) => {
 if (!tagInput.trim()) return;
 const newTags = [...new Set([...(currentTags || []), tagInput.trim()])];
 try {
 await adminAPI.updateUser(userId, { tags: newTags });
 toast.success('Tag added');
 setTagInput('');
 fetchUsers();
 if (selectedUser?._id === userId) setSelectedUser(prev => ({ ...prev, tags: newTags }));
 } catch { toast.error('Failed to add tag'); }
 };

 const handleRemoveTag = async (userId, currentTags, tagToRemove) => {
 const newTags = (currentTags || []).filter(t => t !== tagToRemove);
 try {
 await adminAPI.updateUser(userId, { tags: newTags });
 fetchUsers();
 if (selectedUser?._id === userId) setSelectedUser(prev => ({ ...prev, tags: newTags }));
 } catch { toast.error('Failed to remove tag'); }
 };

 const totalCustomers = Object.values(segments).reduce((s, v) => s + v, 0);

 const saveBlob = (response, fallbackName) => {
  const url = URL.createObjectURL(response.data);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fallbackName;
  anchor.click();
  URL.revokeObjectURL(url);
 };
 const exportCustomers = async () => {
  try { saveBlob(await adminAPI.exportCustomers(), 'customers.csv'); toast.success('Customer export downloaded'); }
  catch (error) { toast.error(error.response?.data?.message || 'Customer export failed'); }
 };
 const importCustomers = async event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  setImporting(true);
  try {
   const data = new FormData(); data.append('file', file);
   const response = await adminAPI.importCustomers(data);
   const result = response.data || {};
   toast.success(`Imported ${Number(result.created || 0) + Number(result.updated || 0)} customers${result.errors?.length ? `; ${result.errors.length} rows skipped` : ''}`);
   fetchUsers();
  } catch (error) { toast.error(error.response?.data?.message || 'Customer import failed'); }
  finally { setImporting(false); }
 };

 return (
 <div className="space-y-5">
 <div className="flex flex-wrap items-start justify-between gap-3">
 <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 sm:text-2xl"><Users className="text-primary-600" size={26} />Customers</h1>
 <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
 <button type="button" onClick={exportCustomers} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600"><Download size={14} />Export</button>
 <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 ${importing ? 'opacity-60' : ''}`}><Upload size={14} />{importing ? 'Importing…' : 'Import CSV'}<input type="file" accept=".csv,text/csv" className="hidden" disabled={importing} onChange={importCustomers} /></label>
 <select value={segmentFilter} onChange={e => { setSegmentFilter(e.target.value); setPage(1); }} className="input w-full bg-white py-2 text-sm sm:w-36">
 <option value="">All Segments</option>
 {Object.entries(SEGMENT_BADGES).map(([k, v]) => (
 <option key={k} value={k}>{v.label} ({segments[k] || 0})</option>
 ))}
 </select>
 <div className="relative">
 <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
 <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
 className="input w-full py-2 pl-8 text-sm sm:w-52" placeholder="Search name, email..." />
 </div>
 </div>
 </div>

 <CustomerSegmentsPanel onFilter={segmentId => { setAudienceFilter(segmentId); setPage(1); }} />

 {audienceFilter && (
 <div className="flex items-center justify-between rounded-xl bg-primary-50 border border-primary-100 px-3 py-2 text-xs text-primary-800">
 <span>Customer table is filtered by a dynamic audience.</span>
 <button onClick={() => { setAudienceFilter(''); setPage(1); }} className="font-semibold hover:underline">Clear audience filter</button>
 </div>
 )}

 {/* Segment Stats */}
 {totalCustomers > 0 && (
 <div className="grid grid-cols-5 gap-3">
 {Object.entries(SEGMENT_BADGES).map(([key, badge]) => (
 <button key={key} onClick={() => { setSegmentFilter(segmentFilter === key ? '' : key); setPage(1); }}
 className={`card p-4 text-left transition-all ${segmentFilter === key ? 'ring-2 ring-primary-500' : ''}`}>
 <p className="text-xs text-gray-500">{badge.label}</p>
 <p className={`text-xl font-bold ${badge.text}`}>{segments[key] || 0}</p>
 </button>
 ))}
 </div>
 )}

 <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
 {loading ? <div className="flex justify-center py-10"><Loader /></div> : (
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead className="bg-gray-50 border-b border-gray-100">
 <tr>
 {['Customer', 'Email', 'Segment', 'Tags', 'Orders', 'Spent', 'Status', 'Actions'].map(h => (
 <th key={h} className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase ${['Orders', 'Spent'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
 ))}
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-50">
 {users.length === 0 ? (
 <tr><td colSpan={8} className="text-center py-10 text-gray-400">No customers found</td></tr>
 ) : users.map(user => {
 const seg = SEGMENT_BADGES[user.segment] || SEGMENT_BADGES.new;
 return (
 <tr key={user._id} className="hover:bg-gray-50">
 <td className="px-4 py-3">
 <div className="flex items-center gap-3">
 <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold">
 {user.name?.charAt(0)}
 </div>
 <span className="font-medium text-gray-800">{user.name}</span>
 </div>
 </td>
 <td className="px-4 py-3 text-gray-600 text-xs">{user.email}</td>
 <td className="px-4 py-3">
 <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${seg.bg} ${seg.text}`}>{seg.label}</span>
 </td>
 <td className="px-4 py-3">
 <div className="flex max-h-10 max-w-[180px] flex-wrap gap-1 overflow-hidden" title={(user.tags || []).join(', ')}>
 {(user.tags || []).map(t => (
 <span key={t} className="bg-gray-100 text-gray-600 text-[10px] px-1.5 py-0.5 rounded-full">{t}</span>
 ))}
 </div>
 </td>
 <td className="px-4 py-3 text-right text-gray-600 text-xs tabular-nums">{user.orderCount || 0}</td>
 <td className="px-4 py-3 text-right text-gray-600 text-xs font-medium tabular-nums">{user.totalSpent ? `₹${Number(user.totalSpent).toLocaleString('en-IN')}` : '—'}</td>
 <td className="px-4 py-3">
 <span className={`badge text-xs ${user.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
 {user.isActive ? 'Active' : 'Blocked'}
 </span>
 </td>
 <td className="px-4 py-3">
 <div className="flex gap-1">
<button onClick={() => openCustomer(user)} data-testid={`customer-360-${user._id}`} title="Open Customer 360" className="p-1.5 hover:bg-primary-50 text-primary-600 rounded-lg"><Eye size={14} /></button>
 <button type="button" onClick={() => toggleStatus(user)} disabled={updating === user._id} title={user.isActive ? 'Block customer' : 'Unblock customer'} aria-label={user.isActive ? `Block ${user.name || 'customer'}` : `Unblock ${user.name || 'customer'}`}
 className={`p-1.5 rounded-lg transition-colors ${user.isActive ? 'hover:bg-red-50 text-red-500' : 'hover:bg-green-50 text-green-600'}`}>
 {updating === user._id ? <Loader size="sm" /> : user.isActive ? <Lock size={14} /> : <Unlock size={14} />}
 </button>
 </div>
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 )}
 </div>
 <Pagination currentPage={page} totalPages={pagination?.pages || 1} onPageChange={setPage} />

 <Modal isOpen={!!selectedUser} onClose={closeCustomer} title="Customer 360" size="xl">
 {selectedUser && (
 <div className="space-y-5" data-testid="customer-360-panel">
 <div className="flex items-center gap-4">
 <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center text-white text-2xl font-black">
 {selectedUser.name?.charAt(0)}
 </div>
 <div>
 <h3 className="font-bold text-gray-900 text-lg">{selectedUser.name}</h3>
 <p className="text-gray-500 text-sm">{selectedUser.email || selectedUser.phone || 'No contact details'}</p>
 {(() => { const s = SEGMENT_BADGES[selectedUser.segment] || SEGMENT_BADGES.new; return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${s.bg} ${s.text}`}>{s.label}</span>; })()}
 </div>
 </div>
 {profileLoading ? <div className="flex justify-center py-10"><Loader /></div> : customer360 && (
 <>
 <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
 {[
 { label: 'Orders', value: customer360.summary.totalOrders },
 { label: 'Paid Value', value: money(customer360.summary.paidOrderValue) },
 { label: 'Average Order', value: money(customer360.summary.averageOrderValue) },
 { label: 'Pending Orders', value: customer360.summary.pendingOrders },
 { label: 'Active Returns', value: customer360.summary.activeReturns },
 { label: 'Refunded', value: money(customer360.summary.refundedAmount) },
 { label: 'Joined', value: date(selectedUser.createdAt) },
 { label: 'Last Order', value: date(customer360.summary.lastOrderAt) },
 ].map(({ label, value }) => (
 <div key={label} className="bg-gray-50 rounded-xl p-3">
 <p className="text-xs text-gray-500">{label}</p>
 <p className="font-medium text-gray-800 mt-0.5">{value}</p>
 </div>
 ))}
 </div>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
 <div className="rounded-2xl border border-gray-100 overflow-hidden">
 <div className="px-4 py-3 bg-gray-50 flex items-center justify-between"><h4 className="font-semibold text-gray-800 text-sm flex items-center gap-1.5"><ShoppingBag size={15} /> Recent Orders</h4><span className="text-xs text-gray-400">{customer360.orders.length}</span></div>
 <div className="divide-y divide-gray-100 max-h-56 overflow-y-auto">
 {customer360.orders.length === 0 ? <p className="p-4 text-xs text-gray-400">No orders in this tenant.</p> : customer360.orders.slice(0, 8).map(order => (
 <div key={order._id} className="px-4 py-3 flex items-center justify-between gap-3 text-xs">
 <div><p className="font-semibold text-gray-800">{order.orderNumber}</p><p className="text-gray-400">{date(order.createdAt)} · {order.paymentStatus}</p></div>
 <div className="text-right"><p className="font-semibold text-gray-800">{money(order.total)}</p><span className="text-gray-500">{order.orderStatus}</span></div>
 </div>
 ))}
 </div>
 </div>
 <div className="rounded-2xl border border-gray-100 overflow-hidden">
 <div className="px-4 py-3 bg-gray-50 flex items-center justify-between"><h4 className="font-semibold text-gray-800 text-sm flex items-center gap-1.5"><RotateCcw size={15} /> Returns & Refunds</h4><Wallet size={15} className="text-gray-400" /></div>
 <div className="divide-y divide-gray-100 max-h-56 overflow-y-auto">
 {customer360.returns.length === 0 && customer360.refunds.length === 0 ? <p className="p-4 text-xs text-gray-400">No return or refund records.</p> : <>
 {customer360.returns.slice(0, 5).map(request => <div key={request._id} className="px-4 py-3 flex items-center justify-between gap-3 text-xs"><div><p className="font-semibold text-gray-800">{request.requestNumber}</p><p className="text-gray-400">{request.type} · {money(request.requestedAmount)}</p></div><span className="text-gray-600">{request.status}</span></div>)}
 {customer360.refunds.slice(0, 5).map(refund => <div key={refund._id} className="px-4 py-3 flex items-center justify-between gap-3 text-xs"><div><p className="font-semibold text-gray-800">Refund · {refund.order?.orderNumber || 'Order'}</p><p className="text-gray-400">{money(refund.approvedAmount ?? refund.amount)}</p></div><span className="text-gray-600">{refund.status}</span></div>)}
 </>}
 </div>
 </div>
 </div>

 <div className="rounded-2xl border border-gray-100 overflow-hidden">
 <div className="px-4 py-3 bg-gray-50"><h4 className="font-semibold text-gray-800 text-sm">Dynamic audience memberships</h4></div>
 <div className="p-4 flex flex-wrap gap-2">
 {(customer360.audienceSegments || []).length === 0
 ? <p className="text-xs text-gray-400">No applied dynamic segments.</p>
 : customer360.audienceSegments.map(segment => <span key={segment._id} className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 text-primary-700 px-2.5 py-1 text-xs">{segment.name}</span>)}
 </div>
 </div>

 <div className="rounded-2xl border border-gray-100 overflow-hidden">
 <div className="px-4 py-3 bg-gray-50"><h4 className="font-semibold text-gray-800 text-sm flex items-center gap-1.5"><Clock3 size={15} /> Unified Order / Return / Refund Timeline</h4></div>
 <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
 {customer360.timeline.length === 0 ? <p className="p-4 text-xs text-gray-400">No timeline events yet.</p> : customer360.timeline.slice(0, 20).map((event, index) => (
 <div key={`${event.at}-${event.event}-${index}`} className="px-4 py-3 flex items-start gap-3 text-xs"><span className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${event.type === 'refund' ? 'bg-amber-500' : event.type === 'return' ? 'bg-purple-500' : 'bg-primary-500'}`} /><div className="min-w-0"><p className="font-medium text-gray-800">{event.label}</p><p className="text-gray-400 mt-0.5">{dateTime(event.at)}{event.note ? ` · ${event.note}` : ''}</p></div></div>
 ))}
 </div>
 </div>
 </>
 )}

 {!profileLoading && !customer360 && <p className="text-sm text-gray-500 bg-gray-50 rounded-xl p-4">Customer activity could not be loaded for this tenant.</p>}

 {/* Tags Management */}
 <div>
 <h4 className="font-semibold text-gray-800 text-sm mb-2 flex items-center gap-1.5"><Tag size={14} /> Tags</h4>
 <div className="flex flex-wrap gap-1.5 mb-2">
 {(selectedUser.tags || []).map(t => (
 <span key={t} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs px-2.5 py-1 rounded-full">
 {t}
 <button onClick={() => handleRemoveTag(selectedUser._id, selectedUser.tags, t)} className="text-indigo-400 hover:text-red-500">×</button>
 </span>
 ))}
 {(!selectedUser.tags || selectedUser.tags.length === 0) && <span className="text-xs text-gray-400">No tags</span>}
 </div>
 <div className="flex gap-2">
 <input value={tagInput} onChange={e => setTagInput(e.target.value)}
 onKeyDown={e => e.key === 'Enter' && handleAddTag(selectedUser._id, selectedUser.tags)}
 className="input py-1.5 text-xs flex-1" placeholder="Add tag (e.g., VIP, wholesale)" />
 <button onClick={() => handleAddTag(selectedUser._id, selectedUser.tags)} className="btn-primary px-3 py-1.5 text-xs">Add</button>
 </div>
 </div>

 {selectedUser.addresses?.length > 0 && (
 <div>
 <h4 className="font-semibold text-gray-800 text-sm mb-2">Saved Addresses ({selectedUser.addresses.length})</h4>
 {selectedUser.addresses.map((addr, i) => (
 <div key={i} className="text-xs text-gray-600 bg-gray-50 rounded-xl p-3 mb-2">
 <span className="font-semibold">{addr.label}:</span> {addr.street}, {addr.city}, {addr.state}
 </div>
 ))}
 </div>
 )}
 </div>
 )}
 </Modal>
 </div>
 );
};

export default AdminCustomersPage;
