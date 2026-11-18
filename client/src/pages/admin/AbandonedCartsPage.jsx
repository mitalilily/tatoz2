import { useState, useEffect } from 'react';
import { ShoppingCart, User, Clock, DollarSign, Package, Search, X, CheckCircle, AlertTriangle } from 'lucide-react';
import { cartSyncAPI } from '../../services/api';
import Loader from '../../components/common/Loader';
import Pagination from '../../components/common/Pagination';
import toast from 'react-hot-toast';

const CS = '₹';

const AbandonedCartsPage = () => {
 const [data, setData] = useState(null);
 const [loading, setLoading] = useState(true);
 const [expandedCart, setExpandedCart] = useState(null);
 const [filters, setFilters] = useState({
 page: 1, sort: 'newest', recovered: '', search: '',
 minValue: '', maxValue: '', hoursAgo: '',
 });

 useEffect(() => { fetchData(); }, [filters]);

 const fetchData = async () => {
 setLoading(true);
 try {
 const params = {};
 Object.entries(filters).forEach(([k, v]) => { if (v !== '') params[k] = v; });
 const res = await cartSyncAPI.getAbandoned(params);
 setData(res.data);
 } catch {
 toast.error('Failed to load abandoned carts');
 } finally {
 setLoading(false);
 }
 };

 const updateFilter = (key, value) => setFilters(f => ({ ...f, [key]: value, page: 1 }));

 const stats = data?.stats || {};
 const recoveryStats = data?.recoveryStats || {};
 const carts = data?.carts || [];
 const recoveryRate = recoveryStats.total > 0
 ? ((recoveryStats.recovered / recoveryStats.total) * 100).toFixed(1)
 : 0;

 const timeSince = (date) => {
 const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
 if (mins < 60) return `${mins}m ago`;
 const hrs = Math.floor(mins / 60);
 if (hrs < 24) return `${hrs}h ago`;
 const days = Math.floor(hrs / 24);
 return `${days}d ago`;
 };

 return (
 <div className="space-y-6">
 {/* Header */}
 <div>
 <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
 <ShoppingCart className="text-primary-600" size={26} />Abandoned Carts
 </h1>
 <p className="text-gray-500 text-sm mt-1">Users who left products in their cart without completing checkout</p>
 </div>

 {/* Stat Cards */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
 <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
 <div className="w-10 h-10 rounded-xl bg-red-500 flex items-center justify-center mb-3">
 <AlertTriangle size={20} className="text-white" />
 </div>
 <p className="text-2xl font-black text-gray-900">{stats.totalCarts || 0}</p>
 <p className="text-sm text-gray-500 mt-0.5">Abandoned Carts</p>
 </div>
 <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
 <div className="w-10 h-10 rounded-xl bg-purple-500 flex items-center justify-center mb-3">
 <DollarSign size={20} className="text-white" />
 </div>
 <p className="text-2xl font-black text-gray-900">{CS}{(stats.totalValue || 0).toLocaleString('en-IN')}</p>
 <p className="text-sm text-gray-500 mt-0.5">Total Value at Risk</p>
 </div>
 <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
 <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center mb-3">
 <Package size={20} className="text-white" />
 </div>
 <p className="text-2xl font-black text-gray-900">{CS}{(stats.avgValue || 0).toFixed(0)}</p>
 <p className="text-sm text-gray-500 mt-0.5">Avg Cart Value</p>
 </div>
 <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
 <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center mb-3">
 <CheckCircle size={20} className="text-white" />
 </div>
 <p className="text-2xl font-black text-gray-900">{recoveryRate}%</p>
 <p className="text-sm text-gray-500 mt-0.5">Recovery Rate</p>
 <p className="text-xs text-green-600 mt-0.5">{recoveryStats.recovered || 0} recovered</p>
 </div>
 </div>

 {/* Filters */}
 <div className="flex flex-wrap gap-3 items-center">
 <div className="relative flex-1 max-w-xs">
 <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
 <input type="text" value={filters.search}
 onChange={e => updateFilter('search', e.target.value)}
 className="input py-2 pl-9 text-sm w-full" placeholder="Search by name or email..." />
 </div>
 <select value={filters.sort} onChange={e => updateFilter('sort', e.target.value)}
 className="input py-2 text-sm w-40 bg-white">
 <option value="newest">Newest First</option>
 <option value="oldest">Oldest First</option>
 <option value="highest_value">Highest Value</option>
 <option value="most_items">Most Items</option>
 </select>
 <select value={filters.recovered} onChange={e => updateFilter('recovered', e.target.value)}
 className="input py-2 text-sm w-36 bg-white">
 <option value="">Abandoned</option>
 <option value="true">Recovered</option>
 <option value="all">All</option>
 </select>
 <select value={filters.hoursAgo} onChange={e => updateFilter('hoursAgo', e.target.value)}
 className="input py-2 text-sm w-44 bg-white">
 <option value="">Any Time</option>
 <option value="1">Abandoned 1h+ ago</option>
 <option value="6">Abandoned 6h+ ago</option>
 <option value="24">Abandoned 24h+ ago</option>
 <option value="72">Abandoned 3d+ ago</option>
 <option value="168">Abandoned 7d+ ago</option>
 </select>
 <input type="number" value={filters.minValue} onChange={e => updateFilter('minValue', e.target.value)}
 className="input py-2 text-sm w-28" placeholder={"Min " + CS} />
 <input type="number" value={filters.maxValue} onChange={e => updateFilter('maxValue', e.target.value)}
 className="input py-2 text-sm w-28" placeholder={"Max " + CS} />
 {(filters.search || filters.recovered || filters.hoursAgo || filters.minValue || filters.maxValue) && (
 <button onClick={() => setFilters({ page: 1, sort: 'newest', recovered: '', search: '', minValue: '', maxValue: '', hoursAgo: '' })}
 className="flex items-center gap-1 text-sm text-red-500 hover:text-red-600">
 <X size={14} />Clear
 </button>
 )}
 </div>

 {/* Carts List */}
 {loading && !data ? (
 <div className="flex justify-center py-16"><Loader size="md" /></div>
 ) : carts.length === 0 ? (
 <div className="text-center py-16">
 <ShoppingCart size={48} className="mx-auto text-gray-200 mb-4" />
 <p className="text-gray-400 font-medium">No abandoned carts found</p>
 <p className="text-sm text-gray-400 mt-1">Carts will appear here when users add products without completing checkout</p>
 </div>
 ) : (
 <div className="space-y-3">
 {carts.map(cart => {
 const isExpanded = expandedCart === cart._id;
 return (
 <div key={cart._id} className={`bg-white rounded-2xl shadow-sm border-2 overflow-hidden transition-all ${cart.recovered ? 'border-green-100' : 'border-gray-100'}`}>
 {/* Cart Header */}
 <button onClick={() => setExpandedCart(isExpanded ? null : cart._id)}
 className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors">
 {/* User info */}
 <div className="flex items-center gap-3 flex-1 min-w-0">
 {cart.user?.avatar ? (
 <img src={cart.user.avatar} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
 ) : (
 <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-purple-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
 {cart.user?.name?.charAt(0).toUpperCase() || '?'}
 </div>
 )}
 <div className="min-w-0">
 <p className="font-semibold text-gray-900 truncate">
 {cart.user?.name || 'Guest User'}
 </p>
 <p className="text-xs text-gray-400 truncate">
 {cart.user?.email || `Session: ${cart.sessionId?.slice(0, 16)}...`}
 {cart.user?.phone && ` · ${cart.user.phone}`}
 </p>
 </div>
 </div>

 {/* Cart summary */}
 <div className="hidden md:flex items-center gap-6 flex-shrink-0">
 <div className="text-center">
 <p className="text-lg font-bold text-gray-900">{cart.itemCount}</p>
 <p className="text-[10px] text-gray-400 uppercase tracking-wider">Items</p>
 </div>
 <div className="text-center">
 <p className="text-lg font-bold text-gray-900">{CS}{cart.subtotal?.toLocaleString('en-IN')}</p>
 <p className="text-[10px] text-gray-400 uppercase tracking-wider">Value</p>
 </div>
 <div className="text-center">
 <p className="text-sm font-medium text-gray-600 flex items-center gap-1">
 <Clock size={12} />{timeSince(cart.lastActivity)}
 </p>
 <p className="text-[10px] text-gray-400 uppercase tracking-wider">Last Active</p>
 </div>
 </div>

 {/* Status */}
 <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${
 cart.recovered ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
 }`}>
 {cart.recovered ? 'Recovered' : 'Abandoned'}
 </span>
 </button>

 {/* Expanded: cart items */}
 {isExpanded && (
 <div className="border-t border-gray-100 px-5 py-4">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
 {/* Meta info */}
 <div className="space-y-2 text-sm">
 <div className="flex justify-between">
 <span className="text-gray-500">Device</span>
 <span className="font-medium text-gray-700 capitalize">{cart.device || 'Unknown'}</span>
 </div>
 <div className="flex justify-between">
 <span className="text-gray-500">Cart Created</span>
 <span className="font-medium text-gray-700">{new Date(cart.createdAt).toLocaleString('en-IN')}</span>
 </div>
 <div className="flex justify-between">
 <span className="text-gray-500">Last Activity</span>
 <span className="font-medium text-gray-700">{new Date(cart.lastActivity).toLocaleString('en-IN')}</span>
 </div>
 {cart.couponCode && (
 <div className="flex justify-between">
 <span className="text-gray-500">Coupon</span>
 <span className="font-mono font-medium text-primary-600">{cart.couponCode}</span>
 </div>
 )}
 {cart.referralCode && (
 <div className="flex justify-between">
 <span className="text-gray-500">Referral</span>
 <span className="font-mono font-medium text-purple-600">{cart.referralCode}</span>
 </div>
 )}
 {cart.recovered && cart.recoveredAt && (
 <div className="flex justify-between">
 <span className="text-gray-500">Recovered At</span>
 <span className="font-medium text-green-600">{new Date(cart.recoveredAt).toLocaleString('en-IN')}</span>
 </div>
 )}
 </div>
 </div>

 {/* Items */}
 <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Cart Items ({cart.itemCount})</p>
 <div className="space-y-2">
 {cart.items.map((item, idx) => {
 const product = item.product && typeof item.product === 'object' ? item.product : null;
 const thumb = product?.thumbnail || product?.images?.[0]?.url || item.thumbnail;
 const title = product?.title || item.title || 'Unknown Product';
 const price = item.price || product?.price || 0;
 const stock = product?.stock;
 return (
 <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
 <div className="w-12 h-12 rounded-lg bg-gray-200 overflow-hidden flex-shrink-0">
 {thumb ? (
 <img src={thumb} alt={title} className="w-full h-full object-cover" />
 ) : (
 <div className="w-full h-full flex items-center justify-center text-gray-400">
 <Package size={16} />
 </div>
 )}
 </div>
 <div className="flex-1 min-w-0">
 <p className="text-sm font-medium text-gray-900 truncate">{title}</p>
 <div className="flex items-center gap-2 mt-0.5">
 <span className="text-xs text-gray-500">Qty: {item.quantity}</span>
 <span className="text-xs text-gray-400">·</span>
 <span className="text-xs font-semibold text-gray-700">{CS}{price} each</span>
 {item.variant && (
 <>
 <span className="text-xs text-gray-400">·</span>
 <span className="text-xs text-purple-600">
 {typeof item.variant === 'object' ? Object.values(item.variant).join(', ') : item.variant}
 </span>
 </>
 )}
 </div>
 </div>
 <div className="text-right flex-shrink-0">
 <p className="text-sm font-bold text-gray-900">{CS}{(price * item.quantity).toLocaleString('en-IN')}</p>
 {stock !== undefined && stock !== null && (
 <p className={`text-[10px] mt-0.5 ${stock > 0 ? 'text-green-600' : 'text-red-500 font-semibold'}`}>
 {stock > 0 ? `${stock} in stock` : 'Out of stock'}
 </p>
 )}
 </div>
 </div>
 );
 })}
 </div>

 {/* Cart total */}
 <div className="flex justify-end mt-3 pt-3 border-t border-gray-100">
 <div className="text-right">
 <p className="text-sm text-gray-500">Cart Total</p>
 <p className="text-xl font-black text-gray-900">{CS}{cart.subtotal?.toLocaleString('en-IN')}</p>
 </div>
 </div>
 </div>
 )}
 </div>
 );
 })}
 </div>
 )}

 {/* Pagination */}
 {data?.pagination && data.pagination.pages > 1 && (
 <Pagination currentPage={filters.page} totalPages={data.pagination.pages}
 onPageChange={p => setFilters(f => ({ ...f, page: p }))} />
 )}
 </div>
 );
};

export default AbandonedCartsPage;
