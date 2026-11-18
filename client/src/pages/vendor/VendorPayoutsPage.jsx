import { useEffect, useState } from 'react';
import { vendorAPI } from '../../services/api';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-700',
  processing: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

export default function VendorPayoutsPage() {
  const [wallet, setWallet] = useState(null);
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [showRequest, setShowRequest] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([vendorAPI.getWallet(), vendorAPI.getPayouts({ limit: 20 })])
      .then(([w, p]) => { setWallet(w.data.data); setPayouts(p.data.data); })
      .catch(() => toast.error('Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const requestPayout = async () => {
    if (!amount || Number(amount) <= 0) return;
    setSubmitting(true);
    try {
      await vendorAPI.requestPayout({ amount: Number(amount) });
      toast.success('Payout requested');
      setAmount('');
      setShowRequest(false);
      load();
    } catch (e) {
      toast.error(e.message || 'Request failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="text-center py-12 text-gray-400">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Wallet & Payouts</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-green-50 p-4 rounded-xl">
          <div className="text-sm text-gray-500">Available Balance</div>
          <div className="text-2xl font-bold">₹{(wallet?.walletBalance || 0).toLocaleString()}</div>
        </div>
        <div className="bg-yellow-50 p-4 rounded-xl">
          <div className="text-sm text-gray-500">Pending Payout</div>
          <div className="text-2xl font-bold">₹{(wallet?.pendingPayout || 0).toLocaleString()}</div>
        </div>
        <div className="bg-blue-50 p-4 rounded-xl">
          <div className="text-sm text-gray-500">Total Earnings</div>
          <div className="text-2xl font-bold">₹{(wallet?.totalEarnings || 0).toLocaleString()}</div>
        </div>
        <div className="bg-purple-50 p-4 rounded-xl">
          <div className="text-sm text-gray-500">Total Withdrawn</div>
          <div className="text-2xl font-bold">₹{(wallet?.totalWithdrawn || 0).toLocaleString()}</div>
        </div>
      </div>

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Payout History</h2>
        <button data-testid="payout-request-open" onClick={() => setShowRequest(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg">Request Payout</button>
      </div>

      {showRequest && (
        <div className="bg-white p-4 rounded-xl shadow-sm mb-4 flex gap-2">
          <input data-testid="payout-amount" type="number" min="1" placeholder="Amount in ₹" className="flex-1 px-3 py-2 border rounded-lg" value={amount} onChange={e => setAmount(e.target.value)} />
          <button data-testid="payout-submit" onClick={requestPayout} disabled={submitting} className="px-4 py-2 bg-indigo-600 text-white rounded-lg disabled:opacity-50">{submitting ? 'Requesting...' : 'Submit'}</button>
          <button onClick={() => setShowRequest(false)} className="px-4 py-2 border rounded-lg">Cancel</button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">UTR / Ref</th>
            </tr>
          </thead>
          <tbody>
            {payouts.length === 0 ? <tr><td colSpan={4} className="p-8 text-center text-gray-400">No payout requests</td></tr>
            : payouts.map(p => (
              <tr key={p._id} className="border-t">
                <td className="px-4 py-3 text-gray-600">{new Date(p.requestedAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 font-medium">₹{p.netAmount.toLocaleString()}</td>
                <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs ${STATUS_COLORS[p.status]}`}>{p.status}</span></td>
                <td className="px-4 py-3 text-gray-500">{p.utrNumber || p.transactionRef || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
