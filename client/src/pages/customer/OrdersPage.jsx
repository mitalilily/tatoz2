import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Package, ChevronRight, RefreshCcw } from 'lucide-react';
import { useDispatch } from 'react-redux';
import { orderAPI } from '../../services/api';
import { requestReorder } from '../../store/slices/cartSlice';
import { useSite } from '../../context/SiteContext';
import { formatPrice } from '../../utils/formatPrice';
import Loader from '../../components/common/Loader';
import EmptyState from '../../components/common/EmptyState';
import AccountHeader from '../../components/customer/AccountHeader';
import Pagination from '../../components/common/Pagination';
import SEO from '../../components/common/SEO';

const STATUS_COLORS = {
 pending: 'bg-amber-100 text-amber-700',
 confirmed: 'bg-blue-100 text-blue-700',
 processing: 'bg-cyan-100 text-cyan-700',
 packed: 'bg-yellow-100 text-yellow-700',
 ready_to_ship: 'bg-indigo-100 text-indigo-700',
 shipped: 'bg-purple-100 text-purple-700',
 out_for_delivery: 'bg-orange-100 text-orange-700',
 failed_delivery: 'bg-rose-100 text-rose-700',
 rto: 'bg-red-100 text-red-700',
 partially_fulfilled: 'bg-violet-100 text-violet-700',
 delivered: 'bg-green-100 text-green-700',
 return_requested: 'bg-amber-100 text-amber-700',
 refund_requested: 'bg-orange-100 text-orange-700',
 cancelled: 'bg-red-100 text-red-700',
 returned: 'bg-gray-100 text-gray-700',
 partially_refunded: 'bg-fuchsia-100 text-fuchsia-700',
 refunded: 'bg-slate-100 text-slate-700',
};
const STATUS_LABELS = { pending: 'New', confirmed: 'Confirmed', processing: 'Processing', packed: 'Packed', ready_to_ship: 'Ready to Ship', shipped: 'Shipped', out_for_delivery: 'Out for Delivery', failed_delivery: 'Failed Delivery', rto: 'RTO', partially_fulfilled: 'Partially Fulfilled', delivered: 'Delivered', return_requested: 'Return Requested', refund_requested: 'Refund Requested', cancelled: 'Cancelled', returned: 'Returned', partially_refunded: 'Partially Refunded', refunded: 'Refunded' };

const OrdersPage = () => {
 const { settings } = useSite();
 const dispatch = useDispatch();
 const navigate = useNavigate();
 const [orders, setOrders] = useState([]);
 const [loading, setLoading] = useState(true);
 const [reorderingId, setReorderingId] = useState('');
 const [pagination, setPagination] = useState(null);
 const [page, setPage] = useState(1);

 useEffect(() => {
 const fetch = async () => {
 setLoading(true);
 try {
 const res = await orderAPI.getMyOrders({ page, limit: 10 });
 setOrders(res.data.orders);
 setPagination(res.data.pagination);
 } catch {} finally { setLoading(false); }
 };
 fetch();
 }, [page]);

 const handleReorder = async order => {
  if (!order?._id || reorderingId) return;
  setReorderingId(order._id);
  try {
   const result = await dispatch(requestReorder({ orderId: order._id, orderNumber: order.orderNumber }));
   if (result?.success) navigate('/cart');
  } finally { setReorderingId(''); }
 };

 return (
 <>
 <SEO title="My Orders" noindex={true} />
 <div className="page-container account-wrap py-6 sm:py-8">
 <AccountHeader kicker="Purchase history" title="My Orders" sub={orders.length ? `${orders.length} order${orders.length === 1 ? '' : 's'} placed` : 'Your orders will appear here.'} icon={<Package size={20} />} accent="indigo" />

 {loading ? (
 <div className="flex justify-center py-16"><Loader size="lg" /></div>
 ) : orders.length === 0 ? (
 <EmptyState icon={Package} title="No orders yet" description="Start shopping to see your orders here"
 actionLabel="Start Shopping" onAction={() => window.location.href = '/'} />
 ) : (
 <div className="space-y-4">
 {orders.map(order => (
 <div key={order._id} className="card p-4 sm:p-5">
 <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
 <div className="min-w-0">
 <p className="font-bold text-gray-900">#{order.orderNumber}</p>
 <p className="text-sm text-gray-500">{new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
 </div>
 <div className="ml-auto text-left sm:text-right">
 <span className={`badge text-xs px-2.5 py-1 font-semibold capitalize ${STATUS_COLORS[order.orderStatus] || 'bg-gray-100 text-gray-700'}`}>
 {STATUS_LABELS[order.orderStatus] || order.orderStatus.replace(/_/g, ' ')}
 </span>
 <p className="font-bold text-gray-900 mt-1">{formatPrice(order.total, settings)}</p>
 </div>
 </div>

 {/* Items preview */}
 <div className="flex items-center gap-2 mb-3">
 {order.items?.slice(0, 3).map((item, i) => (
 <img key={i} src={item.image || 'https://via.placeholder.com/40'} alt={item.title}
 className="w-10 h-10 object-cover rounded-lg border border-gray-200" />
 ))}
 {order.items?.length > 3 && (
 <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-500">
 +{order.items.length - 3}
 </div>
 )}
 <p className="text-sm text-gray-500 ml-1">{order.items?.length} item{(order.items?.length || 0) === 1 ? '' : 's'}</p>
 </div>

 <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
 <Link to={`/orders/${order._id}`}
 className="flex w-full min-w-0 flex-1 items-center justify-between text-sm text-primary-600 hover:text-primary-700 font-medium sm:w-auto">
 <span>Track Order</span>
 <ChevronRight size={16} />
 </Link>
 <button
  type="button"
  data-testid={`customer-reorder-${order._id}`}
  onClick={() => handleReorder(order)}
  disabled={Boolean(reorderingId)}
  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary-200 px-3 py-2 text-xs font-bold text-primary-700 hover:bg-primary-50 disabled:cursor-wait disabled:opacity-50 sm:w-auto"
 >
  <RefreshCcw size={13} className={reorderingId === order._id ? 'animate-spin' : ''} />
  {reorderingId === order._id ? 'Preparing…' : 'Reorder'}
 </button>
 </div>
 </div>
 ))}

 <Pagination currentPage={page} totalPages={pagination?.pages || 1} onPageChange={setPage} />
 </div>
 )}
 </div>
 </>
 );
};

export default OrdersPage;
