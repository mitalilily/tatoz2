import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminVendorAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { Check, X, Ban, RefreshCw } from 'lucide-react';

const STATUS_BADGE = {
  pending: 'bg-yellow-100 text-yellow-700',
  active: 'bg-green-100 text-green-700',
  suspended: 'bg-red-100 text-red-700',
  rejected: 'bg-gray-100 text-gray-600',
};

export default function AdminVendorsPage() {
  const [vendors, setVendors] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [search, setSearch] = useState('');
  const [slaOnly, setSlaOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [selected, setSelected] = useState([]);

  const load = () => {
    setLoading(true);
    adminVendorAPI.getVendors({
      status: statusFilter || undefined,
      riskTier: riskFilter || undefined,
      search: search || undefined,
      slaBreach: slaOnly ? 'true' : undefined,
      page,
      limit: 20,
    })
      .then(r => { setVendors(r.data.data); setPagination(r.data.pagination); setSelected([]); })
      .catch(error => toast.error(error.message || 'Could not load seller applications'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [statusFilter, riskFilter, slaOnly, page]);

  const handle = async (id, action, body) => {
    try {
      await action(id, body);
      toast.success('Updated');
      load();
    } catch (e) { toast.error(e.message || 'Action failed'); }
  };

  const toggle = (id) => setSelected(current => current.includes(id) ? current.filter(v => v !== id) : [...current, id]);

  const bulk = async (action) => {
    if (!selected.length) return;
    try {
      const r = await adminVendorAPI.bulkVendorAction({ ids: selected, action });
      const failed = (r.data?.data || []).filter(item => !item.success);
      if (failed.length) toast.error(`${failed.length} of ${selected.length} failed`);
      else toast.success(`${selected.length} vendors ${action}d`);
      load();
    } catch (e) { toast.error(e.message || 'Bulk action failed'); }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Vendor Management</h1>
      <div className="mb-4 flex flex-wrap gap-2">
        <input data-testid="admin-vendor-search" className="px-3 py-2 border rounded-lg" placeholder="Search store, slug, email…" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { setPage(1); load(); } }} />
        <select className="px-3 py-2 border rounded-lg" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="rejected">Rejected</option>
        </select>
        <select className="px-3 py-2 border rounded-lg" value={riskFilter} onChange={e => { setRiskFilter(e.target.value); setPage(1); }}>
          <option value="">All risk tiers</option>
          <option value="standard">Standard</option>
          <option value="fasttrack">Fast-track</option>
          <option value="edd">Enhanced due diligence</option>
        </select>
        <label className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm text-gray-600">
          <input type="checkbox" checked={slaOnly} onChange={e => { setSlaOnly(e.target.checked); setPage(1); }} /> SLA breached
        </label>
      </div>
      {selected.length > 0 && (
        <div className="mb-4 flex items-center gap-2 text-sm">
          <span className="text-gray-500">{selected.length} selected</span>
          <button data-testid="bulk-approve" onClick={() => bulk('approve')} className="px-3 py-1.5 bg-green-600 text-white rounded-lg">Approve</button>
          <button data-testid="bulk-suspend" onClick={() => bulk('suspend')} className="px-3 py-1.5 bg-red-600 text-white rounded-lg">Suspend</button>
          <button data-testid="bulk-reactivate" onClick={() => bulk('reactivate')} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg">Reactivate</button>
        </div>
      )}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-left">
            <tr>
              <th className="px-4 py-3 w-8"><input type="checkbox" checked={vendors.length > 0 && selected.length === vendors.length} onChange={() => setSelected(selected.length === vendors.length ? [] : vendors.map(v => v._id))} /></th>
              <th className="px-4 py-3">Store</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Registered</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="p-8 text-center text-gray-400">Loading...</td></tr>
            : vendors.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-gray-400">No vendors</td></tr>
            : vendors.map(v => (
              <tr key={v._id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-3"><input data-testid="vendor-select" type="checkbox" checked={selected.includes(v._id)} onChange={() => toggle(v._id)} /></td>
                <td className="px-4 py-3">
                  <Link to={`/admin/vendors/${v._id}`} className="font-medium text-indigo-600 hover:underline">{v.storeName}</Link>
                  <p className="text-xs text-gray-400">/{v.slug}{v.onboarding?.riskTier && v.onboarding.riskTier !== 'standard' ? ` · ${v.onboarding.riskTier}` : ''}</p>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  <div>{v.owner?.name}</div>
                  <div className="text-xs text-gray-400">{v.owner?.email}</div>
                </td>
                <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs ${STATUS_BADGE[v.status]}`}>{v.status}</span></td>
                <td className="px-4 py-3 text-gray-500 text-xs">{new Date(v.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right space-x-1">
                  {v.status === 'pending' && (
                    <>
                      <button onClick={() => handle(v._id, adminVendorAPI.approveVendor)} className="text-green-600 p-1" title="Approve"><Check size={16} /></button>
                      <button onClick={() => { const reason = window.prompt('Rejection reason:'); if (reason) handle(v._id, adminVendorAPI.rejectVendor, reason); }} className="text-red-600 p-1" title="Reject"><X size={16} /></button>
                    </>
                  )}
                  {v.status === 'active' && <button onClick={() => handle(v._id, adminVendorAPI.suspendVendor)} className="text-red-600 p-1" title="Suspend"><Ban size={16} /></button>}
                  {v.status === 'suspended' && <button onClick={() => handle(v._id, adminVendorAPI.reactivateVendor)} className="text-green-600 p-1" title="Reactivate"><RefreshCw size={16} /></button>}
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
