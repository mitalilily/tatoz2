import { useEffect, useState } from 'react';
import { adminVendorAPI, categoryAPI, productAPI } from '../../services/api';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-700',
  processing: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-600',
};

const input = 'px-3 py-2 border rounded-lg text-sm';

function PayoutsTab() {
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});

  const load = () => {
    setLoading(true);
    adminVendorAPI.getPayouts({ status: statusFilter, page, limit: 20 })
      .then(r => { setPayouts(r.data.data); setPagination(r.data.pagination); })
      .finally(() => setLoading(false));
  };

  useEffect(load, [statusFilter, page]);

  const handle = async (id, action, payload) => {
    try { await action(id, payload); toast.success('Updated'); load(); }
    catch (e) { toast.error(e.response?.data?.message || e.message || 'Action failed'); }
  };

  const completePayout = (id) => {
    const utr = window.prompt('Enter UTR number (required as bank proof):');
    if (!utr) return;
    handle(id, adminVendorAPI.completePayout, { utrNumber: utr });
  };

  return (
    <div>
      <div className="mb-4">
        <select data-testid="payout-status-filter" className={input} value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
      </div>
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-3">Vendor</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Bank</th>
              <th className="px-4 py-3">Requested</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="p-8 text-center text-gray-400">Loading...</td></tr>
            : payouts.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-gray-400">No payouts</td></tr>
            : payouts.map(p => (
              <tr key={p._id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-3">{p.vendor?.storeName || '—'}</td>
                <td className="px-4 py-3 font-medium">₹{(p.netAmount || 0).toLocaleString()}</td>
                <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs ${STATUS_COLORS[p.status]}`}>{p.status}</span></td>
                <td className="px-4 py-3 text-xs text-gray-500">{p.bankSnapshot?.accountNumber ? `****${p.bankSnapshot.accountNumber.slice(-4)}` : '—'}<br />{p.bankSnapshot?.ifscCode || ''}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{new Date(p.requestedAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right space-x-1">
                  {p.status === 'pending' && <button onClick={() => handle(p._id, adminVendorAPI.processPayout)} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">Process</button>}
                  {p.status === 'processing' && (
                    <>
                      <button onClick={() => completePayout(p._id)} className="px-2 py-1 bg-green-600 text-white rounded text-xs">Complete</button>
                      <button onClick={() => { const reason = window.prompt('Failure reason:'); if (reason) handle(p._id, adminVendorAPI.failPayout, reason); }} className="px-2 py-1 bg-red-600 text-white rounded text-xs ml-1">Fail</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pagination.pages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 border rounded disabled:opacity-50">Prev</button>
          <span className="px-3 py-1">Page {page} of {pagination.pages}</span>
          <button disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 border rounded disabled:opacity-50">Next</button>
        </div>
      )}
    </div>
  );
}

function SettlementsTab() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ periodStart: '', periodEnd: '' });

  const load = () => {
    setLoading(true);
    adminVendorAPI.getSettlements({ limit: 20 })
      .then(r => setRuns(r.data?.data || []))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const run = async () => {
    if (!form.periodStart || !form.periodEnd) { toast.error('Pick a period first'); return; }
    try {
      await adminVendorAPI.runSettlement(form);
      toast.success('Settlement run completed');
      load();
    } catch (e) { toast.error(e.response?.data?.message || e.message || 'Settlement failed'); }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm p-5">
        <h2 className="font-semibold">Close a settlement period</h2>
        <p className="text-xs text-gray-500 mt-1">Creates one payout per active vendor with unpaid delivered earnings. Reruns for the same period only top up missing vendors.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input data-testid="settlement-start" type="date" className={input} value={form.periodStart} onChange={e => setForm({ ...form, periodStart: e.target.value })} />
          <input data-testid="settlement-end" type="date" className={input} value={form.periodEnd} onChange={e => setForm({ ...form, periodEnd: e.target.value })} />
          <button data-testid="settlement-run" onClick={run} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold">Run settlement</button>
        </div>
      </div>
      {loading ? <p className="text-center text-gray-400 text-sm py-8">Loading…</p>
      : runs.length === 0 ? <p className="text-center text-gray-400 text-sm py-8">No settlement runs yet.</p>
      : runs.map(run => (
        <div key={run._id} className="bg-white rounded-xl shadow-sm p-5">
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <strong>{new Date(run.periodStart).toLocaleDateString()} → {new Date(run.periodEnd).toLocaleDateString()}</strong>
            <span className="text-gray-500">{run.totals?.vendorsSettled || 0} settled · {run.totals?.vendorsSkipped || 0} skipped · ₹{(run.totals?.netAmount || 0).toLocaleString()} net</span>
          </div>
          <div className="mt-3 divide-y text-sm">
            {(run.lines || []).slice(0, 10).map((line, i) => <div key={i} className="flex justify-between py-1.5"><span>{line.vendor?.storeName || line.vendor}</span><span className="text-gray-500">{line.payout ? `₹${Number(line.netAmount || 0).toLocaleString()}` : (line.skippedReason || 'Skipped')}</span></div>)}
            {(run.lines || []).length > 10 && <p className="pt-2 text-xs text-gray-400">+ {(run.lines || []).length - 10} more lines</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

function CommissionRulesTab() {
  const [rules, setRules] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [form, setForm] = useState({ name: '', percent: '', flatFee: '0', priority: '100', product: '', category: '', vendor: '' });

  const load = () => adminVendorAPI.getCommissionRules().then(r => setRules(r.data?.data || [])).catch(() => {});
  useEffect(() => {
    load();
    Promise.all([categoryAPI.adminGetAll(), productAPI.adminGetAll({ limit: 1000 }), adminVendorAPI.getVendors({ limit: 1000 })])
      .then(([categoryResponse, productResponse, vendorResponse]) => {
        setCategories(categoryResponse.data?.data || categoryResponse.data?.categories || []);
        setProducts(productResponse.data?.products || productResponse.data?.data || []);
        setVendors(vendorResponse.data?.data || []);
      }).catch(() => {});
  }, []);

  const create = async () => {
    try {
      await adminVendorAPI.createCommissionRule({ ...form, product: form.product || null, category: form.category || null, vendor: form.vendor || null, percent: Number(form.percent), flatFee: Number(form.flatFee), priority: Number(form.priority) });
      toast.success('Rule created');
      setForm({ name: '', percent: '', flatFee: '0', priority: '100', product: '', category: '', vendor: '' });
      load();
    } catch (e) { toast.error(e.response?.data?.message || e.message || 'Create failed'); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this rule? Orders fall back to the vendor override or platform default.')) return;
    try { await adminVendorAPI.deleteCommissionRule(id); toast.success('Deleted'); load(); }
    catch (e) { toast.error(e.message || 'Delete failed'); }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm p-5">
        <h2 className="font-semibold">New commission rule</h2>
        <p className="text-xs text-gray-500 mt-1">Product rules take precedence, followed by category/vendor scope, priority, seller override, category rate and platform default.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <input data-testid="rule-name" className={input} placeholder="Rule name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <input data-testid="rule-percent" className={input} type="number" min="0" max="100" placeholder="% rate" value={form.percent} onChange={e => setForm({ ...form, percent: e.target.value })} />
          <input data-testid="rule-flat" className={input} type="number" min="0" placeholder="Flat fee ₹" value={form.flatFee} onChange={e => setForm({ ...form, flatFee: e.target.value })} />
          <input data-testid="rule-priority" className={input} type="number" min="0" max="1000" placeholder="Priority" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} />
          <select className={input} value={form.product} onChange={e => setForm({ ...form, product: e.target.value })}><option value="">All products</option>{products.map(product => <option key={product._id} value={product._id}>{product.title}</option>)}</select>
          <select className={input} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}><option value="">All categories</option>{categories.map(category => <option key={category._id} value={category._id}>{category.name}</option>)}</select>
          <select className={input} value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })}><option value="">All sellers</option>{vendors.map(vendor => <option key={vendor._id} value={vendor._id}>{vendor.storeName}</option>)}</select>
          <button data-testid="rule-add" onClick={create} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold">Add rule</button>
        </div>
      </div>
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left"><tr><th className="px-4 py-3">Rule</th><th className="px-4 py-3">Scope</th><th className="px-4 py-3">Rate</th><th className="px-4 py-3">Priority</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
          <tbody>
            {rules.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-gray-400">No rules — the platform default applies.</td></tr>
            : rules.map(rule => <tr key={rule._id} className="border-t"><td className="px-4 py-3 font-medium">{rule.name}</td><td className="px-4 py-3 text-xs text-gray-500">{rule.product?.title || 'All products'} · {rule.category?.name || 'All categories'} · {rule.vendor?.storeName || 'All sellers'}</td><td className="px-4 py-3">{rule.percent}%{Number(rule.flatFee) > 0 ? ` + ₹${rule.flatFee}` : ''}</td><td className="px-4 py-3">{rule.priority}</td><td className="px-4 py-3 text-right"><button onClick={() => remove(rule._id)} className="text-red-600 text-xs font-semibold">Delete</button></td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdminPayoutsPage() {
  const [tab, setTab] = useState('payouts');
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Payouts & Settlements</h1>
      <div className="mb-6 flex gap-2">
        {[['payouts', 'Payouts'], ['settlements', 'Settlements'], ['commissions', 'Commission rules']].map(([key, label]) => (
          <button key={key} data-testid={`tab-${key}`} onClick={() => setTab(key)} className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === key ? 'bg-slate-900 text-white' : 'bg-white border text-gray-600'}`}>{label}</button>
        ))}
      </div>
      {tab === 'payouts' && <PayoutsTab />}
      {tab === 'settlements' && <SettlementsTab />}
      {tab === 'commissions' && <CommissionRulesTab />}
    </div>
  );
}
