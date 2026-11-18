import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, RefreshCw, ShieldCheck, UserPlus, Users, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminAPI } from '../../services/api';
import Loader from '../../components/common/Loader';

const emptyForm = { name: '', email: '', password: '', role: 'operations', permissions: [] };

const prettyRole = role => {
  const value = String(role || '').replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
  return value === 'Superadmin' ? 'Super Admin' : value;
};

export default function AdminStaffPage() {
  const [staff, setStaff] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [roleDefaults, setRoleDefaults] = useState({});
  const [form, setForm] = useState(emptyForm);
  const [passwordForm, setPasswordForm] = useState({ id: '', value: '' });
  const [accessForm, setAccessForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getStaff();
      setStaff(response.data?.staff || []);
      setCatalog(response.data?.permissionCatalog || []);
      setRoleDefaults(response.data?.roleDefaults || {});
    } catch (error) {
      toast.error(error.message || 'Failed to load staff access');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const defaultPermissions = useMemo(() => roleDefaults[form.role] || [], [form.role, roleDefaults]);

  const togglePermission = permission => {
    setForm(current => ({
      ...current,
      permissions: current.permissions.includes(permission)
        ? current.permissions.filter(item => item !== permission)
        : [...current.permissions, permission],
    }));
  };

  const create = async event => {
    event.preventDefault();
    setSaving(true);
    try {
      await adminAPI.createStaff({ ...form, permissions: form.permissions.length ? form.permissions : defaultPermissions });
      toast.success('Staff access created');
      setForm(emptyForm);
      await load();
    } catch (error) {
      toast.error(error.message || 'Could not create staff access');
    } finally {
      setSaving(false);
    }
  };

  const update = async (id, data) => {
    try {
      await adminAPI.updateStaff(id, data);
      toast.success('Staff access updated');
      await load();
    } catch (error) {
      toast.error(error.message || 'Could not update staff access');
    }
  };

  const openAccessEditor = member => setAccessForm({ id: member._id, role: member.role, permissions: member.permissions || [] });
  const saveAccess = async event => {
    event.preventDefault();
    if (!accessForm) return;
    await update(accessForm.id, { role: accessForm.role, permissions: accessForm.permissions });
    setAccessForm(null);
  };

  const resetPassword = async event => {
    event.preventDefault();
    if (!passwordForm.id || passwordForm.value.length < 10) return toast.error('Use at least 10 characters');
    try {
      await adminAPI.resetStaffPassword(passwordForm.id, { password: passwordForm.value });
      toast.success('Staff password reset');
      setPasswordForm({ id: '', value: '' });
    } catch (error) {
      toast.error(error.message || 'Could not reset password');
    }
  };

  return <div className="space-y-6" data-testid="admin-staff-page">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900"><Users className="text-indigo-600" /> Staff & permissions</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">Store staff accounts with server-enforced roles, explicit permissions, password reset, and safe suspend/reactivate controls.</p>
      </div>
      <button className="btn-secondary flex items-center gap-2" onClick={load} disabled={loading} aria-label="Refresh staff directory" title="Refresh staff directory" data-testid="staff-refresh"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh</button>
    </div>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="staff-create-form">
      <div className="mb-4 flex items-center gap-2"><UserPlus size={18} className="text-indigo-600" /><div><h2 className="font-black text-slate-900">Create staff access</h2><p className="text-xs text-slate-500">Passwords are hashed server-side and are never shown again.</p></div></div>
      <form onSubmit={create} className="grid gap-3 md:grid-cols-2">
        <label className="text-xs font-bold text-slate-600" htmlFor="staff-name">Full name <span aria-hidden="true">*</span><input id="staff-name" data-testid="staff-name" className="input mt-1" placeholder="e.g. Priya Sharma" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required /></label>
        <label className="text-xs font-bold text-slate-600" htmlFor="staff-email">Work email <span aria-hidden="true">*</span><input id="staff-email" data-testid="staff-email" className="input mt-1" type="email" placeholder="name@store.example" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} required /></label>
        <label className="text-xs font-bold text-slate-600" htmlFor="staff-password">Temporary password <span aria-hidden="true">*</span><input id="staff-password" data-testid="staff-password" className="input mt-1" type="password" minLength="10" placeholder="At least 10 characters" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} required /></label>
        <label className="text-xs font-bold text-slate-600" htmlFor="staff-role">Access role <span aria-hidden="true">*</span><select id="staff-role" data-testid="staff-role" className="input mt-1" value={form.role} onChange={event => setForm({ ...form, role: event.target.value, permissions: [] })} required>
          {Object.keys(roleDefaults).filter(role => role !== 'owner').map(role => <option key={role} value={role}>{prettyRole(role)}</option>)}
        </select></label>
        <div className="md:col-span-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Optional permission override</p><button type="button" className="text-xs font-semibold text-indigo-600" onClick={() => setForm({ ...form, permissions: [] })}>Use role defaults</button></div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{catalog.map(permission => <label key={permission.id} className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={form.permissions.includes(permission.id)} onChange={() => togglePermission(permission.id)} className="h-4 w-4 accent-indigo-600" />{permission.label}</label>)}</div>
        </div>
        <button data-testid="staff-create" className="btn-primary flex items-center justify-center gap-2 md:col-span-2" disabled={saving}>{saving ? <Loader size="sm" /> : <ShieldCheck size={16} />} Create staff access</button>
      </form>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5"><h2 className="font-black text-slate-900">Tenant staff directory <span className="text-sm font-medium text-slate-400">({staff.length})</span></h2></div>
      {loading ? <Loader size="lg" /> : <div className="divide-y divide-slate-100">{staff.length ? staff.map(member => <div key={member._id} data-testid={`staff-row-${member._id}`} className="flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="font-bold text-slate-900">{member.user?.name || 'Unnamed staff'}</p><p className="text-sm text-slate-500">{member.user?.email}</p><div className="mt-2 flex flex-wrap gap-2 text-[11px]"><span className="rounded-full bg-indigo-50 px-2 py-1 font-bold text-indigo-700">{prettyRole(member.role)}</span><span className={`rounded-full px-2 py-1 font-bold ${member.status === 'active' ? 'bg-emerald-50 text-emerald-700' : member.isRoot ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'}`}>{member.isRoot ? 'System access' : prettyRole(member.status)}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">{(member.effectivePermissions || []).includes('*') ? 'All permissions' : `${(member.effectivePermissions || []).length} permissions`}</span></div></div>{member.isRoot ? <span className="text-xs font-semibold text-slate-400">Managed by platform</span> : <div className="flex flex-wrap items-center gap-2"><button data-testid={`staff-edit-${member._id}`} className="btn-secondary text-xs" onClick={() => openAccessEditor(member)}>Edit access</button><button data-testid={`staff-toggle-${member._id}`} className="btn-secondary text-xs" onClick={() => update(member._id, { status: member.status === 'active' ? 'suspended' : 'active' })}>{member.status === 'active' ? 'Suspend' : 'Reactivate'}</button><button data-testid={`staff-password-${member._id}`} className="btn-secondary flex items-center gap-1 text-xs" onClick={() => setPasswordForm({ id: member._id, value: '' })}><KeyRound size={13} /> Reset password</button></div>}</div>) : <div className="p-10 text-center text-sm text-slate-500">No staff accounts yet.</div>}</div>}
    </section>

    {accessForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 shadow-2xl" onSubmit={saveAccess} data-testid="staff-access-modal"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-black text-slate-900">Edit staff access</h2><p className="text-xs text-slate-500">Permissions take effect on the next request and are enforced by the server.</p></div><button type="button" aria-label="Close access modal" onClick={() => setAccessForm(null)}><X size={18} /></button></div><label className="text-xs font-bold text-slate-600">Access role<select className="input mt-1 w-full" value={accessForm.role} onChange={event => setAccessForm({ ...accessForm, role: event.target.value, permissions: [] })}>{Object.keys(roleDefaults).filter(role => role !== 'owner').map(role => <option key={role} value={role}>{prettyRole(role)}</option>)}</select></label><div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Explicit permissions</p><button type="button" className="text-xs font-semibold text-indigo-600" onClick={() => setAccessForm({ ...accessForm, permissions: [] })}>Use role defaults</button></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{catalog.map(permission => <label key={permission.id} className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={accessForm.permissions.includes(permission.id)} onChange={() => setAccessForm(current => ({ ...current, permissions: current.permissions.includes(permission.id) ? current.permissions.filter(item => item !== permission.id) : [...current.permissions, permission.id] }))} className="h-4 w-4 accent-indigo-600" />{permission.label}</label>)}</div></div><div className="mt-4 flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setAccessForm(null)}>Cancel</button><button className="btn-primary">Save access</button></div></form></div>}
    {passwordForm.id && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onSubmit={resetPassword} data-testid="staff-password-modal"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-black text-slate-900">Reset staff password</h2><p className="text-xs text-slate-500">The new password is stored only as a server-side hash.</p></div><button type="button" aria-label="Close modal" onClick={() => setPasswordForm({ id: '', value: '' })}><X size={18} /></button></div><input data-testid="staff-password-reset" className="input w-full" type="password" minLength="10" placeholder="New password (10+ characters)" value={passwordForm.value} onChange={event => setPasswordForm({ ...passwordForm, value: event.target.value })} required /><button data-testid="staff-password-save" className="btn-primary mt-4 w-full">Save new password</button></form></div>}
  </div>;
}
