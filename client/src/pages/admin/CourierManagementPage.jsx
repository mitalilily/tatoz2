import { useState, useEffect, useCallback } from 'react';
import {
 Boxes, ListOrdered, Filter, Activity, Zap, AlertTriangle,
 Check, X, Plus, Trash2, Edit3, RefreshCw, ArrowUp, ArrowDown,
 Play, Eye, ChevronRight, Settings as SettingsIcon,
} from 'lucide-react';
import { courierAPI } from '../../services/api';
import Modal from '../../components/common/Modal';
import Pagination from '../../components/common/Pagination';
import toast from 'react-hot-toast';

// ─── Constants ──────────────────────────────────────────────────────────────

const TABS = [
 { id: 'selection', label: 'Courier Selection', icon: Boxes },
 { id: 'priority', label: 'Courier Priority', icon: ListOrdered },
 { id: 'rules', label: 'Courier Rules', icon: Filter },
 { id: 'activity', label: 'Activity Logs', icon: Activity },
 { id: 'auto-assign', label: 'Auto Assignment', icon: Zap },
 { id: 'stressed', label: 'Hide Stressed', icon: AlertTriangle },
];

const OUTCOME_COLORS = {
 'assigned': 'bg-green-100 text-green-700',
 'no-candidate': 'bg-amber-100 text-amber-700',
 'shiprocket-error': 'bg-red-100 text-red-700',
 'locked': 'bg-gray-100 text-gray-600',
 'dry-run': 'bg-blue-100 text-blue-700',
};

const EXCLUDED_COLORS = {
 'disabled': 'bg-gray-100 text-gray-600',
 'stressed': 'bg-amber-100 text-amber-700',
 'rule-exclude': 'bg-purple-100 text-purple-700',
 'priority-loser': 'bg-blue-50 text-blue-600',
};

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

const EmptyRow = ({ cols, message = 'No data found' }) => (
 <tr><td colSpan={cols} className="text-center py-12 text-gray-400">{message}</td></tr>
);

const Toggle = ({ checked, onChange, disabled }) => (
 <button
 type="button"
 onClick={() => !disabled && onChange(!checked)}
 disabled={disabled}
 className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-indigo-600' : 'bg-gray-300'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
 >
 <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
 </button>
);

const Badge = ({ children, className = 'bg-gray-100 text-gray-700' }) => (
 <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>
 {children}
 </span>
);

// ─── Tab: Courier Selection ─────────────────────────────────────────────────

const SelectionTab = () => {
 const [couriers, setCouriers] = useState([]);
 const [loading, setLoading] = useState(true);
 const [refreshing, setRefreshing] = useState(false);

 const load = useCallback(async () => {
 try {
 setLoading(true);
 const res = await courierAPI.listCouriers();
 setCouriers(res.data.couriers || []);
 } catch (e) { toast.error(e.response?.data?.message || 'Failed to load couriers'); }
 finally { setLoading(false); }
 }, []);

 useEffect(() => { load(); }, [load]);

 const handleToggle = async (c) => {
 try {
 await courierAPI.toggleCourier(c._id, !c.enabled);
 setCouriers(prev => prev.map(x => x._id === c._id ? { ...x, enabled: !c.enabled } : x));
 toast.success(`${c.courierName} ${!c.enabled ? 'enabled' : 'disabled'}`);
 } catch (e) { toast.error('Failed to toggle'); }
 };

 const handleRefresh = async () => {
 try {
 setRefreshing(true);
 const res = await courierAPI.refreshCouriers();
 const { discovered = 0, enriched = 0, warnings = [] } = res.data || {};
 const parts = [];
 if (discovered) parts.push(`${discovered} total`);
 if (enriched) parts.push(`${enriched} enriched`);
 toast.success(`Discovered ${parts.join(', ') || '0 couriers'}`);
 warnings.forEach(w => toast(w, { icon: '⚠️', duration: 5000 }));
 await load();
 } catch (e) { toast.error(e.response?.data?.message || 'Refresh failed'); }
 finally { setRefreshing(false); }
 };

 return (
 <div>
 <div className="flex items-center justify-between mb-4">
 <div>
 <h3 className="text-lg font-semibold text-gray-900">Available Couriers</h3>
 <p className="text-sm text-gray-500">Enable the couriers you want auto-assignment to consider.</p>
 </div>
 <button
 onClick={handleRefresh}
 disabled={refreshing}
 className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
 >
 <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
 {refreshing ? 'Refreshing…' : 'Refresh from Shiprocket'}
 </button>
 </div>

 <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
 <table className="w-full">
 <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
 <tr>
 <th className="text-left py-3 px-4">Courier</th>
 <th className="text-left py-3 px-4">Company ID</th>
 <th className="text-left py-3 px-4">Rating</th>
 <th className="text-left py-3 px-4">Last seen</th>
 <th className="text-left py-3 px-4">Status</th>
 <th className="text-right py-3 px-4">Enabled</th>
 </tr>
 </thead>
 <tbody>
 {loading ? (
 <tr><td colSpan={6} className="py-8"><Skeleton className="h-20 mx-4" /></td></tr>
 ) : couriers.length === 0 ? (
 <EmptyRow cols={6} message="No couriers yet. Click 'Refresh from Shiprocket' to discover them." />
 ) : (
 couriers.map(c => (
 <tr key={c._id} className="border-t border-gray-100 hover:bg-gray-50">
 <td className="py-3 px-4 font-medium text-gray-900">{c.courierName}</td>
 <td className="py-3 px-4 text-gray-600">{c.courierCompanyId}</td>
 <td className="py-3 px-4 text-gray-600">{c.metadata?.rating ? Number(c.metadata.rating).toFixed(1) : '—'}</td>
 <td className="py-3 px-4 text-gray-500 text-sm">
 {c.lastSeenAt ? new Date(c.lastSeenAt).toLocaleDateString() : '—'}
 </td>
 <td className="py-3 px-4">
 {c.stressed && <Badge className="bg-amber-100 text-amber-700"><AlertTriangle size={12} /> Stressed</Badge>}
 </td>
 <td className="py-3 px-4 text-right">
 <Toggle checked={c.enabled} onChange={() => handleToggle(c)} />
 </td>
 </tr>
 ))
 )}
 </tbody>
 </table>
 </div>
 </div>
 );
};

// ─── Tab: Courier Priority ──────────────────────────────────────────────────

const PriorityTab = () => {
 const [couriers, setCouriers] = useState([]);
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);

 const load = useCallback(async () => {
 try {
 setLoading(true);
 const res = await courierAPI.listCouriers();
 setCouriers((res.data.couriers || []).filter(c => c.enabled));
 } catch (e) { toast.error('Failed to load couriers'); }
 finally { setLoading(false); }
 }, []);

 useEffect(() => { load(); }, [load]);

 const move = (idx, dir) => {
 const next = [...couriers];
 const target = idx + dir;
 if (target < 0 || target >= next.length) return;
 [next[idx], next[target]] = [next[target], next[idx]];
 setCouriers(next);
 };

 const save = async () => {
 try {
 setSaving(true);
 const order = couriers.map((c, i) => ({ id: c._id, priority: (i + 1) * 10 }));
 await courierAPI.reorderCouriers(order);
 toast.success('Priority saved');
 await load();
 } catch (e) { toast.error('Failed to save priority'); }
 finally { setSaving(false); }
 };

 return (
 <div>
 <div className="flex items-center justify-between mb-4">
 <div>
 <h3 className="text-lg font-semibold text-gray-900">Courier Priority</h3>
 <p className="text-sm text-gray-500">Top to bottom — first row is the default winner when no rule applies.</p>
 </div>
 <button
 onClick={save}
 disabled={saving || loading}
 className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
 >
 <Check size={16} /> {saving ? 'Saving…' : 'Save order'}
 </button>
 </div>

 <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
 {loading ? <div className="p-6"><Skeleton className="h-24" /></div>
 : couriers.length === 0 ? (
 <div className="p-12 text-center text-gray-400">
 No enabled couriers. Enable some in the Selection tab first.
 </div>
 ) : (
 <ul>
 {couriers.map((c, i) => (
 <li key={c._id} className="flex items-center gap-4 px-4 py-3 border-t border-gray-100 first:border-t-0 hover:bg-gray-50">
 <span className="w-8 text-center font-semibold text-gray-500">{i + 1}</span>
 <span className="flex-1 font-medium text-gray-900">{c.courierName}</span>
 <span className="text-sm text-gray-400">ID {c.courierCompanyId}</span>
 <div className="flex gap-1">
 <button
 onClick={() => move(i, -1)}
 disabled={i === 0}
 className="p-1.5 rounded border border-gray-200 hover:bg-white disabled:opacity-30"
 >
 <ArrowUp size={14} />
 </button>
 <button
 onClick={() => move(i, 1)}
 disabled={i === couriers.length - 1}
 className="p-1.5 rounded border border-gray-200 hover:bg-white disabled:opacity-30"
 >
 <ArrowDown size={14} />
 </button>
 </div>
 </li>
 ))}
 </ul>
 )}
 </div>
 </div>
 );
};

// ─── Tab: Courier Rules ─────────────────────────────────────────────────────

const RulesTab = () => {
 const [rules, setRules] = useState([]);
 const [couriers, setCouriers] = useState([]);
 const [loading, setLoading] = useState(true);
 const [editing, setEditing] = useState(null);
 const [showForm, setShowForm] = useState(false);

 const blank = () => ({
 name: '', enabled: true, priority: 100,
 conditions: { weightMin: '', weightMax: '' },
 action: { type: 'prefer', courierCompanyId: '' },
 });

 const load = useCallback(async () => {
 try {
 setLoading(true);
 const [rulesRes, couriersRes] = await Promise.all([
 courierAPI.listRules(),
 courierAPI.listCouriers(),
 ]);
 setRules(rulesRes.data.rules || []);
 setCouriers((couriersRes.data.couriers || []).filter(c => c.enabled));
 } catch (e) { toast.error('Failed to load rules'); }
 finally { setLoading(false); }
 }, []);

 useEffect(() => { load(); }, [load]);

 const openNew = () => { setEditing(blank()); setShowForm(true); };
 const openEdit = (r) => {
 setEditing({
 _id: r._id,
 name: r.name,
 enabled: r.enabled,
 priority: r.priority,
 conditions: {
 weightMin: r.conditions?.weightMin ?? '',
 weightMax: r.conditions?.weightMax ?? '',
 },
 action: {
 type: r.action?.type || 'prefer',
 courierCompanyId: r.action?.courierCompanyId || '',
 courierName: r.action?.courierName || '',
 },
 });
 setShowForm(true);
 };

 const save = async () => {
 try {
 const chosen = couriers.find(c => c.courierCompanyId === Number(editing.action.courierCompanyId));
 const payload = {
 name: editing.name,
 enabled: editing.enabled,
 priority: Number(editing.priority) || 100,
 conditions: {
 weightMin: editing.conditions.weightMin === '' ? null : Number(editing.conditions.weightMin),
 weightMax: editing.conditions.weightMax === '' ? null : Number(editing.conditions.weightMax),
 },
 action: {
 type: editing.action.type,
 courierCompanyId: Number(editing.action.courierCompanyId),
 courierName: chosen?.courierName || editing.action.courierName,
 },
 };
 if (!payload.name || !payload.action.courierCompanyId) {
 toast.error('Name and courier are required');
 return;
 }
 if (editing._id) {
 await courierAPI.updateRule(editing._id, payload);
 toast.success('Rule updated');
 } else {
 await courierAPI.createRule(payload);
 toast.success('Rule created');
 }
 setShowForm(false);
 setEditing(null);
 load();
 } catch (e) { toast.error(e.response?.data?.message || 'Save failed'); }
 };

 const remove = async (r) => {
 if (!confirm(`Delete rule "${r.name}"?`)) return;
 try {
 await courierAPI.deleteRule(r._id);
 toast.success('Rule deleted');
 load();
 } catch (e) { toast.error('Delete failed'); }
 };

 return (
 <div>
 <div className="flex items-center justify-between mb-4">
 <div>
 <h3 className="text-lg font-semibold text-gray-900">Courier Rules</h3>
 <p className="text-sm text-gray-500">Weight-based rules evaluated in priority order. Prefer rules win over default priority sorting.</p>
 </div>
 <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
 <Plus size={16} /> New rule
 </button>
 </div>

 <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
 <table className="w-full">
 <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
 <tr>
 <th className="text-left py-3 px-4">#</th>
 <th className="text-left py-3 px-4">Name</th>
 <th className="text-left py-3 px-4">Weight range (kg)</th>
 <th className="text-left py-3 px-4">Action</th>
 <th className="text-left py-3 px-4">Courier</th>
 <th className="text-left py-3 px-4">Enabled</th>
 <th className="text-right py-3 px-4">Actions</th>
 </tr>
 </thead>
 <tbody>
 {loading ? <tr><td colSpan={7} className="py-8"><Skeleton className="h-20 mx-4" /></td></tr>
 : rules.length === 0 ? <EmptyRow cols={7} message="No rules yet. Click 'New rule' to create one." />
 : rules.map(r => (
 <tr key={r._id} className="border-t border-gray-100">
 <td className="py-3 px-4 text-gray-500">{r.priority}</td>
 <td className="py-3 px-4 font-medium text-gray-900">{r.name}</td>
 <td className="py-3 px-4 text-gray-600">
 {r.conditions?.weightMin ?? '0'} — {r.conditions?.weightMax ?? '∞'}
 </td>
 <td className="py-3 px-4">
 <Badge className={r.action?.type === 'prefer' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
 {r.action?.type}
 </Badge>
 </td>
 <td className="py-3 px-4 text-gray-900">{r.action?.courierName || r.action?.courierCompanyId}</td>
 <td className="py-3 px-4">
 {r.enabled ? <Check size={16} className="text-green-600" /> : <X size={16} className="text-gray-400" />}
 </td>
 <td className="py-3 px-4 text-right">
 <button onClick={() => openEdit(r)} className="p-1.5 text-gray-500 hover:text-indigo-600">
 <Edit3 size={14} />
 </button>
 <button onClick={() => remove(r)} className="p-1.5 text-gray-500 hover:text-red-600">
 <Trash2 size={14} />
 </button>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>

 <Modal
 isOpen={showForm}
 onClose={() => { setShowForm(false); setEditing(null); }}
 title={editing?._id ? 'Edit rule' : 'New rule'}
 size="lg"
 >
 {editing && (
 <div className="space-y-4">
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
 <input
 type="text"
 value={editing.name}
 onChange={(e) => setEditing({ ...editing, name: e.target.value })}
 className="w-full px-3 py-2 border border-gray-300 rounded-lg"
 placeholder="e.g. Small COD → XpressBees"
 />
 </div>
 <div className="grid grid-cols-2 gap-4">
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
 <input
 type="number"
 value={editing.priority}
 onChange={(e) => setEditing({ ...editing, priority: e.target.value })}
 className="w-full px-3 py-2 border border-gray-300 rounded-lg"
 />
 </div>
 <div className="flex items-end gap-2">
 <Toggle
 checked={editing.enabled}
 onChange={(v) => setEditing({ ...editing, enabled: v })}
 />
 <span className="text-sm">Enabled</span>
 </div>
 </div>
 <div className="grid grid-cols-2 gap-4">
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">Weight min (kg)</label>
 <input
 type="number"
 step="0.1"
 value={editing.conditions.weightMin}
 onChange={(e) => setEditing({ ...editing, conditions: { ...editing.conditions, weightMin: e.target.value } })}
 className="w-full px-3 py-2 border border-gray-300 rounded-lg"
 placeholder="any"
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">Weight max (kg)</label>
 <input
 type="number"
 step="0.1"
 value={editing.conditions.weightMax}
 onChange={(e) => setEditing({ ...editing, conditions: { ...editing.conditions, weightMax: e.target.value } })}
 className="w-full px-3 py-2 border border-gray-300 rounded-lg"
 placeholder="any"
 />
 </div>
 </div>
 <div className="grid grid-cols-2 gap-4">
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
 <select
 value={editing.action.type}
 onChange={(e) => setEditing({ ...editing, action: { ...editing.action, type: e.target.value } })}
 className="w-full px-3 py-2 border border-gray-300 rounded-lg"
 >
 <option value="prefer">Prefer this courier</option>
 <option value="exclude">Exclude this courier</option>
 </select>
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">Courier</label>
 <select
 value={editing.action.courierCompanyId}
 onChange={(e) => setEditing({ ...editing, action: { ...editing.action, courierCompanyId: e.target.value } })}
 className="w-full px-3 py-2 border border-gray-300 rounded-lg"
 >
 <option value="">Select a courier</option>
 {couriers.map(c => (
 <option key={c._id} value={c.courierCompanyId}>
 {c.courierName} ({c.courierCompanyId})
 </option>
 ))}
 </select>
 </div>
 </div>
 <div className="flex justify-end gap-2 pt-2">
 <button
 onClick={() => { setShowForm(false); setEditing(null); }}
 className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
 >
 Cancel
 </button>
 <button
 onClick={save}
 className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
 >
 Save rule
 </button>
 </div>
 </div>
 )}
 </Modal>
 </div>
 );
};

// ─── Tab: Activity Logs ─────────────────────────────────────────────────────

const ActivityTab = () => {
 const [logs, setLogs] = useState([]);
 const [pagination, setPagination] = useState({ page: 1, pages: 1 });
 const [loading, setLoading] = useState(true);
 const [page, setPage] = useState(1);
 const [filters, setFilters] = useState({ outcome: '', triggeredBy: '' });
 const [detail, setDetail] = useState(null);

 const load = useCallback(async () => {
 try {
 setLoading(true);
 const res = await courierAPI.listActivity({ page, limit: 20, ...filters });
 setLogs(res.data.logs || []);
 setPagination(res.data.pagination || { page: 1, pages: 1 });
 } catch (e) { toast.error('Failed to load activity'); }
 finally { setLoading(false); }
 }, [page, filters]);

 useEffect(() => { load(); }, [load]);

 return (
 <div>
 <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
 <div>
 <h3 className="text-lg font-semibold text-gray-900">Activity Logs</h3>
 <p className="text-sm text-gray-500">Every auto-assignment decision and its outcome (kept for 90 days).</p>
 </div>
 <div className="flex gap-2">
 <select
 value={filters.outcome}
 onChange={(e) => { setFilters({ ...filters, outcome: e.target.value }); setPage(1); }}
 className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
 >
 <option value="">All outcomes</option>
 <option value="assigned">Assigned</option>
 <option value="no-candidate">No candidate</option>
 <option value="shiprocket-error">Shiprocket error</option>
 <option value="locked">Locked</option>
 <option value="dry-run">Dry run</option>
 </select>
 <select
 value={filters.triggeredBy}
 onChange={(e) => { setFilters({ ...filters, triggeredBy: e.target.value }); setPage(1); }}
 className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
 >
 <option value="">All triggers</option>
 <option value="auto-order-create">Auto (on order create)</option>
 <option value="bulk-run">Bulk run</option>
 <option value="manual">Manual</option>
 <option value="dry-run">Dry run</option>
 </select>
 </div>
 </div>

 <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
 <table className="w-full">
 <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
 <tr>
 <th className="text-left py-3 px-4">Time</th>
 <th className="text-left py-3 px-4">Order #</th>
 <th className="text-left py-3 px-4">Chosen courier</th>
 <th className="text-left py-3 px-4">Trigger</th>
 <th className="text-left py-3 px-4">Outcome</th>
 <th className="text-right py-3 px-4">Details</th>
 </tr>
 </thead>
 <tbody>
 {loading ? <tr><td colSpan={6} className="py-8"><Skeleton className="h-20 mx-4" /></td></tr>
 : logs.length === 0 ? <EmptyRow cols={6} message="No activity yet." />
 : logs.map(l => (
 <tr key={l._id} className="border-t border-gray-100 hover:bg-gray-50">
 <td className="py-3 px-4 text-sm text-gray-500">{new Date(l.createdAt).toLocaleString()}</td>
 <td className="py-3 px-4 font-mono text-xs">{l.orderNumber || '—'}</td>
 <td className="py-3 px-4 text-gray-900">{l.chosenCourierName || '—'}</td>
 <td className="py-3 px-4 text-xs text-gray-500">{l.triggeredBy}</td>
 <td className="py-3 px-4">
 <Badge className={OUTCOME_COLORS[l.outcome] || 'bg-gray-100 text-gray-600'}>
 {l.outcome}
 </Badge>
 </td>
 <td className="py-3 px-4 text-right">
 <button
 onClick={() => setDetail(l)}
 className="p-1.5 text-gray-500 hover:text-indigo-600"
 >
 <Eye size={14} />
 </button>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>

 {pagination.pages > 1 && (
 <div className="mt-4">
 <Pagination
 currentPage={pagination.page}
 totalPages={pagination.pages}
 onPageChange={setPage}
 />
 </div>
 )}

 <Modal
 isOpen={!!detail}
 onClose={() => setDetail(null)}
 title="Decision path"
 size="xl"
 >
 {detail && (
 <div className="space-y-3">
 <div className="grid grid-cols-2 gap-4 text-sm">
 <div><span className="text-gray-500">Order #:</span> {detail.orderNumber}</div>
 <div><span className="text-gray-500">Outcome:</span> {detail.outcome}</div>
 <div><span className="text-gray-500">Chosen:</span> {detail.chosenCourierName || '—'}</div>
 <div><span className="text-gray-500">Rules matched:</span> {detail.matchedRuleIds?.length || 0}</div>
 </div>
 {detail.errorMessage && (
 <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
 {detail.errorMessage}
 </div>
 )}
 <div>
 <h4 className="font-medium text-gray-900 mb-2">Candidates considered</h4>
 <div className="space-y-1">
 {(detail.decisionPath || []).map((d, i) => (
 <div key={i} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded">
 <div className="flex items-center gap-3">
 <span className="w-6 text-center text-gray-400 text-sm">{d.rank || '—'}</span>
 <span className="font-medium text-gray-900">{d.courierName}</span>
 <span className="text-xs text-gray-500">ID {d.courierCompanyId}</span>
 </div>
 {d.excludedReason ? (
 <Badge className={EXCLUDED_COLORS[d.excludedReason] || 'bg-gray-100 text-gray-600'}>
 {d.excludedReason}
 </Badge>
 ) : (
 <Badge className="bg-green-100 text-green-700">chosen</Badge>
 )}
 </div>
 ))}
 </div>
 </div>
 </div>
 )}
 </Modal>
 </div>
 );
};

// ─── Tab: Auto Assignment ───────────────────────────────────────────────────

const AutoAssignTab = () => {
 const [config, setConfig] = useState({ enabled: false, onOrderCreate: false });
 const [lastRun, setLastRun] = useState(null);
 const [loading, setLoading] = useState(true);
 const [running, setRunning] = useState(false);
 const [dryRun, setDryRun] = useState(true);
 const [showResult, setShowResult] = useState(false);
 const [result, setResult] = useState(null);

 const load = useCallback(async () => {
 try {
 setLoading(true);
 const res = await courierAPI.getAutoAssignSettings();
 setConfig(res.data.config);
 setLastRun(res.data.lastRun);
 } catch (e) { toast.error('Failed to load settings'); }
 finally { setLoading(false); }
 }, []);

 useEffect(() => { load(); }, [load]);

 const updateConfig = async (patch) => {
 const next = { ...config, ...patch };
 setConfig(next);
 try {
 await courierAPI.updateAutoAssignSettings(patch);
 toast.success('Settings saved');
 } catch (e) {
 toast.error('Save failed');
 load();
 }
 };

 const run = async () => {
 try {
 setRunning(true);
 const res = await courierAPI.runAutoAssignNow({ dryRun });
 setResult(res.data.summary);
 setShowResult(true);
 await load();
 toast.success(dryRun ? 'Dry run complete' : 'Auto-assign complete');
 } catch (e) {
 toast.error(e.response?.data?.message || 'Run failed');
 } finally { setRunning(false); }
 };

 return (
 <div>
 <h3 className="text-lg font-semibold text-gray-900 mb-4">Auto Assignment</h3>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
 <div className="bg-white rounded-xl border border-gray-200 p-5">
 <div className="flex items-center justify-between mb-1">
 <h4 className="font-medium text-gray-900">Master switch</h4>
 <Toggle checked={config.enabled} onChange={(v) => updateConfig({ enabled: v })} disabled={loading} />
 </div>
 <p className="text-sm text-gray-500">When off, no auto-assignment runs — neither on order create nor the bulk button.</p>
 </div>
 <div className="bg-white rounded-xl border border-gray-200 p-5">
 <div className="flex items-center justify-between mb-1">
 <h4 className="font-medium text-gray-900">Assign on order create</h4>
 <Toggle checked={config.onOrderCreate} onChange={(v) => updateConfig({ onOrderCreate: v })} disabled={loading || !config.enabled} />
 </div>
 <p className="text-sm text-gray-500">Automatically pick a courier the moment a shipment is created for an order.</p>
 </div>
 </div>

 <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
 <h4 className="font-medium text-gray-900 mb-2">Bulk run</h4>
 <p className="text-sm text-gray-500 mb-4">Process pending orders (have a shipment but no AWB) and assign couriers in one pass.</p>
 <div className="flex items-center gap-3 flex-wrap">
 <label className="flex items-center gap-2 text-sm">
 <input
 type="checkbox"
 checked={dryRun}
 onChange={(e) => setDryRun(e.target.checked)}
 />
 Dry run (preview only, no API calls)
 </label>
 <button
 onClick={run}
 disabled={running}
 className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
 >
 <Play size={16} /> {running ? 'Running…' : 'Run now'}
 </button>
 </div>
 </div>

 {lastRun && (
 <div className="bg-white rounded-xl border border-gray-200 p-5">
 <h4 className="font-medium text-gray-900 mb-3">Last run</h4>
 <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
 <div><div className="text-gray-500">Started</div><div>{lastRun.startedAt ? new Date(lastRun.startedAt).toLocaleString() : '—'}</div></div>
 <div><div className="text-gray-500">Processed</div><div className="font-semibold">{lastRun.processed || 0}</div></div>
 <div><div className="text-gray-500">Assigned</div><div className="font-semibold text-green-600">{lastRun.assigned || 0}</div></div>
 <div><div className="text-gray-500">No candidate</div><div className="font-semibold text-amber-600">{lastRun.noCandidate || 0}</div></div>
 <div><div className="text-gray-500">Failed</div><div className="font-semibold text-red-600">{lastRun.failed || 0}</div></div>
 </div>
 {lastRun.dryRun && <div className="mt-2"><Badge className="bg-blue-100 text-blue-700">Dry run</Badge></div>}
 </div>
 )}

 <Modal isOpen={showResult} onClose={() => setShowResult(false)} title="Run summary" size="xl">
 {result && (
 <div className="space-y-3">
 <div className="grid grid-cols-4 gap-3 text-sm">
 <div className="p-3 bg-gray-50 rounded"><div className="text-gray-500">Processed</div><div className="text-xl font-bold">{result.processed}</div></div>
 <div className="p-3 bg-green-50 rounded"><div className="text-gray-500">Assigned</div><div className="text-xl font-bold text-green-700">{result.assigned}</div></div>
 <div className="p-3 bg-amber-50 rounded"><div className="text-gray-500">No candidate</div><div className="text-xl font-bold text-amber-700">{result.noCandidate}</div></div>
 <div className="p-3 bg-red-50 rounded"><div className="text-gray-500">Failed</div><div className="text-xl font-bold text-red-700">{result.failed}</div></div>
 </div>
 <div>
 <h4 className="font-medium text-gray-900 mb-2">Details</h4>
 <div className="max-h-64 overflow-auto border border-gray-200 rounded">
 {(result.details || []).map((d, i) => (
 <div key={i} className="flex items-center justify-between px-3 py-2 border-t border-gray-100 first:border-t-0 text-sm">
 <span className="font-mono text-xs">{d.orderNumber}</span>
 <div className="flex items-center gap-2">
 <span className="text-gray-600">{d.chosen || '—'}</span>
 <Badge className={OUTCOME_COLORS[d.outcome] || 'bg-gray-100 text-gray-600'}>{d.outcome}</Badge>
 </div>
 </div>
 ))}
 </div>
 </div>
 </div>
 )}
 </Modal>
 </div>
 );
};

// ─── Tab: Hide Stressed Couriers ────────────────────────────────────────────

const StressedTab = () => {
 const [rows, setRows] = useState([]);
 const [thresholds, setThresholds] = useState(null);
 const [loading, setLoading] = useState(true);
 const [showThresholds, setShowThresholds] = useState(false);
 const [totals, setTotals] = useState({ totalStressed: 0, totalAutoFlagged: 0 });
 const [lastRecomputedAt, setLastRecomputedAt] = useState(null);
 const [recomputing, setRecomputing] = useState(false);

 const load = useCallback(async () => {
 try {
 setLoading(true);
 const res = await courierAPI.getStressedCouriers();
 setRows(res.data.rows || []);
 setThresholds(res.data.thresholds);
 setTotals({ totalStressed: res.data.totalStressed, totalAutoFlagged: res.data.totalAutoFlagged });
 setLastRecomputedAt(res.data.lastRecomputedAt);
 } catch (e) { toast.error('Failed to load stressed couriers'); }
 finally { setLoading(false); }
 }, []);

 useEffect(() => { load(); }, [load]);

 const recompute = async () => {
 try {
 setRecomputing(true);
 await courierAPI.recomputeMetrics(thresholds?.rollingDays || 7);
 toast.success('Metrics recomputed');
 await load();
 } catch (e) { toast.error('Recompute failed'); }
 finally { setRecomputing(false); }
 };

 const toggleManual = async (row) => {
 try {
 await courierAPI.toggleManualStress(row._id, {
 manuallyStressed: !row.manuallyStressed,
 // If admin is manually marking stressed, reset the "cleared" override
 manualStressCleared: false,
 });
 toast.success('Updated');
 load();
 } catch (e) { toast.error('Failed to update'); }
 };

 const clearAutoFlag = async (row) => {
 try {
 await courierAPI.toggleManualStress(row._id, { manualStressCleared: true });
 toast.success('Auto-flag cleared');
 load();
 } catch (e) { toast.error('Failed to clear'); }
 };

 const saveThresholds = async () => {
 try {
 await courierAPI.updateStressThresholds(thresholds);
 toast.success('Thresholds saved');
 setShowThresholds(false);
 load();
 } catch (e) { toast.error('Save failed'); }
 };

 return (
 <div>
 <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
 <div>
 <h3 className="text-lg font-semibold text-gray-900">Hide Stressed Couriers</h3>
 <p className="text-sm text-gray-500">
 Auto-detected from rolling-window metrics. Last recalculated {lastRecomputedAt ? new Date(lastRecomputedAt).toLocaleString() : 'never'}.
 </p>
 </div>
 <div className="flex gap-2">
 <button
 onClick={() => setShowThresholds(true)}
 className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
 >
 <SettingsIcon size={14} /> Thresholds
 </button>
 <button
 onClick={recompute}
 disabled={recomputing}
 className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm disabled:opacity-50"
 >
 <RefreshCw size={14} className={recomputing ? 'animate-spin' : ''} /> Recalculate now
 </button>
 </div>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
 <StatCard icon={AlertTriangle} label="Currently stressed" value={totals.totalStressed} color="bg-amber-500" loading={loading} />
 <StatCard icon={Activity} label="Auto-flagged" value={totals.totalAutoFlagged} color="bg-orange-500" loading={loading} />
 <StatCard icon={Boxes} label="Total couriers tracked" value={rows.length} color="bg-indigo-500" loading={loading} />
 </div>

 <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
 <table className="w-full">
 <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
 <tr>
 <th className="text-left py-3 px-4">Courier</th>
 <th className="text-right py-3 px-4">Shipments</th>
 <th className="text-right py-3 px-4">NDR %</th>
 <th className="text-right py-3 px-4">RTO %</th>
 <th className="text-right py-3 px-4">Pickup fail %</th>
 <th className="text-center py-3 px-4">Auto-flag</th>
 <th className="text-center py-3 px-4">Manual</th>
 <th className="text-center py-3 px-4">Effective</th>
 </tr>
 </thead>
 <tbody>
 {loading ? <tr><td colSpan={8} className="py-8"><Skeleton className="h-20 mx-4" /></td></tr>
 : rows.length === 0 ? <EmptyRow cols={8} message="No couriers to evaluate yet." />
 : rows.map(r => (
 <tr key={r._id} className="border-t border-gray-100">
 <td className="py-3 px-4 font-medium text-gray-900">{r.courierName}</td>
 <td className="py-3 px-4 text-right text-gray-600">{r.shipments}</td>
 <td className="py-3 px-4 text-right text-gray-600">{r.ndrPct.toFixed(1)}%</td>
 <td className="py-3 px-4 text-right text-gray-600">{r.rtoPct.toFixed(1)}%</td>
 <td className="py-3 px-4 text-right text-gray-600">{r.pickupFailPct.toFixed(1)}%</td>
 <td className="py-3 px-4 text-center">
 {r.autoFlagged ? (
 r.manualStressCleared
 ? <Badge className="bg-gray-100 text-gray-500">cleared</Badge>
 : <Badge className="bg-orange-100 text-orange-700">flagged</Badge>
 ) : <span className="text-gray-300">—</span>}
 </td>
 <td className="py-3 px-4 text-center">
 <Toggle checked={r.manuallyStressed} onChange={() => toggleManual(r)} />
 </td>
 <td className="py-3 px-4 text-center">
 {r.effectiveStressed ? (
 <Badge className="bg-red-100 text-red-700"><AlertTriangle size={12} /> Hidden</Badge>
 ) : (
 <Badge className="bg-green-100 text-green-700"><Check size={12} /> Active</Badge>
 )}
 {r.autoFlagged && !r.manualStressCleared && !r.manuallyStressed && (
 <button
 onClick={() => clearAutoFlag(r)}
 className="ml-2 text-xs text-indigo-600 hover:underline"
 >
 clear
 </button>
 )}
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>

 <Modal isOpen={showThresholds} onClose={() => setShowThresholds(false)} title="Stress thresholds" size="md">
 {thresholds && (
 <div className="space-y-4">
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">NDR % threshold</label>
 <input
 type="number"
 step="0.1"
 value={thresholds.ndrPct}
 onChange={(e) => setThresholds({ ...thresholds, ndrPct: Number(e.target.value) })}
 className="w-full px-3 py-2 border border-gray-300 rounded-lg"
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">RTO % threshold</label>
 <input
 type="number"
 step="0.1"
 value={thresholds.rtoPct}
 onChange={(e) => setThresholds({ ...thresholds, rtoPct: Number(e.target.value) })}
 className="w-full px-3 py-2 border border-gray-300 rounded-lg"
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">Pickup fail % threshold</label>
 <input
 type="number"
 step="0.1"
 value={thresholds.pickupFailPct}
 onChange={(e) => setThresholds({ ...thresholds, pickupFailPct: Number(e.target.value) })}
 className="w-full px-3 py-2 border border-gray-300 rounded-lg"
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">Minimum shipments (to evaluate)</label>
 <input
 type="number"
 value={thresholds.minShipments}
 onChange={(e) => setThresholds({ ...thresholds, minShipments: Number(e.target.value) })}
 className="w-full px-3 py-2 border border-gray-300 rounded-lg"
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">Rolling window (days)</label>
 <input
 type="number"
 value={thresholds.rollingDays}
 onChange={(e) => setThresholds({ ...thresholds, rollingDays: Number(e.target.value) })}
 className="w-full px-3 py-2 border border-gray-300 rounded-lg"
 />
 </div>
 <div className="flex justify-end gap-2 pt-2">
 <button
 onClick={() => setShowThresholds(false)}
 className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
 >
 Cancel
 </button>
 <button
 onClick={saveThresholds}
 className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
 >
 Save
 </button>
 </div>
 </div>
 )}
 </Modal>
 </div>
 );
};

// ─── Page shell ─────────────────────────────────────────────────────────────

const CourierManagementPage = () => {
 const [tab, setTab] = useState('selection');

 const renderTab = () => {
 switch (tab) {
 case 'selection': return <SelectionTab />;
 case 'priority': return <PriorityTab />;
 case 'rules': return <RulesTab />;
 case 'activity': return <ActivityTab />;
 case 'auto-assign': return <AutoAssignTab />;
 case 'stressed': return <StressedTab />;
 default: return null;
 }
 };

 return (
 <div className="p-6 max-w-7xl mx-auto">
 <div className="flex items-center gap-3 mb-6">
 <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center">
 <Boxes size={24} className="text-white" />
 </div>
 <div>
 <h1 className="text-2xl font-bold text-gray-900">Courier Management</h1>
 <p className="text-sm text-gray-500">Control which Shiprocket couriers handle your orders, in what priority, and under which rules.</p>
 </div>
 </div>

 <div className="bg-gray-100 p-1.5 rounded-xl inline-flex flex-wrap gap-1 mb-6">
 {TABS.map(t => {
 const Icon = t.icon;
 const active = tab === t.id;
 return (
 <button
 key={t.id}
 onClick={() => setTab(t.id)}
 className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
 active ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
 }`}
 >
 <Icon size={16} /> {t.label}
 </button>
 );
 })}
 </div>

 <div>{renderTab()}</div>
 </div>
 );
};

export default CourierManagementPage;
