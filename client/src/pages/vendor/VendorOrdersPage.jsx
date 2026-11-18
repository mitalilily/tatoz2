import { useEffect, useState } from 'react';
import { vendorAPI } from '../../services/api';
import toast from 'react-hot-toast';

const NEXT_STATUS = {
  confirmed: 'packed', packed: 'shipped', shipped: 'out_for_delivery',
  out_for_delivery: 'delivered',
};

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-blue-100 text-blue-700',
  packed: 'bg-indigo-100 text-indigo-700',
  shipped: 'bg-purple-100 text-purple-700',
  out_for_delivery: 'bg-orange-100 text-orange-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function VendorOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  const load = () => {
    setLoading(true);
    vendorAPI.getOrders({ status: statusFilter, page: 1, limit: 50 })
      .then(r => setOrders(r.data.data))
      .catch(() => toast.error('Failed to load orders'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [statusFilter]);

  const advanceStatus = async (subOrderNumber) => {
    const order = orders.find(o => o.subOrder?.orderNumber === subOrderNumber);
    const next = NEXT_STATUS[order?.subOrder?.status];
    if (!next) return;
    try {
      await vendorAPI.updateOrderStatus(subOrderNumber, { status: next });
      toast.success(`Order moved to ${next}`);
      load();
    } catch (e) { toast.error(e.message || 'Update failed'); }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">My Orders</h1>
      <div className="mb-4">
        <select className="px-3 py-2 border rounded-lg" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All</option>
          <option value="confirmed">Confirmed</option>
          <option value="packed">Packed</option>
          <option value="shipped">Shipped</option>
          <option value="out_for_delivery">Out for Delivery</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-3">Sub-Order #</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="p-8 text-center text-gray-400">Loading...</td></tr>
            : orders.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-gray-400">No orders yet</td></tr>
            : orders.map(o => (
              <tr key={o._id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{o.subOrder?.orderNumber}</td>
                <td className="px-4 py-3">{o.user?.name || 'N/A'}</td>
                <td className="px-4 py-3">{o.subOrder?.items?.length} item(s)</td>
                <td className="px-4 py-3">₹{(o.subOrder?.total || 0).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs ${STATUS_COLORS[o.subOrder?.status]}`}>
                    {o.subOrder?.status?.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {NEXT_STATUS[o.subOrder?.status] && (
                    <button onClick={() => advanceStatus(o.subOrder.orderNumber)} className="px-3 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700">
                      Mark {NEXT_STATUS[o.subOrder?.status].replace(/_/g, ' ')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
