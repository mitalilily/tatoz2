import { useEffect, useState } from 'react';
import { UserPlus, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { vendorAPI } from '../../services/api';
import Loader from '../../components/common/Loader';

const input = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-500';

export default function VendorTeamPage() {
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ email: '', role: 'staff' });

  const load = () => {
    setLoading(true);
    vendorAPI.getTeam()
      .then((r) => setTeam(r.data?.data || null))
      .catch(() => setTeam(null))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const invite = async () => {
    try {
      await vendorAPI.inviteTeamMember(form);
      toast.success('Invitation sent');
      setForm({ email: '', role: 'staff' });
      load();
    } catch (e) { toast.error(e.response?.data?.message || e.message || 'Invite failed'); }
  };

  const update = async (id, patch) => {
    try { await vendorAPI.updateTeamMember(id, patch); toast.success('Updated'); load(); }
    catch (e) { toast.error(e.response?.data?.message || e.message || 'Update failed'); }
  };

  const remove = async (id) => {
    if (!window.confirm('Remove this team member?')) return;
    try { await vendorAPI.removeTeamMember(id); toast.success('Removed'); load(); }
    catch (e) { toast.error(e.response?.data?.message || e.message || 'Remove failed'); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader /></div>;
  if (!team) return <div className="py-12 text-center text-red-500">Team could not be loaded.</div>;

  return <div className="mx-auto max-w-5xl space-y-6" data-testid="vendor-team-page">
    <header><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Staff access</p><h1 className="mt-1 text-2xl font-bold text-gray-900">Team</h1><p className="mt-1 text-sm text-gray-500">Invite managers and staff to help run the store. You act as {team.actingAs}.</p></header>

    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2"><UserPlus size={18} className="text-indigo-600" /><h2 className="font-bold text-gray-900">Invite by email</h2></div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_160px_auto]">
        <input data-testid="team-invite-email" className={input} type="email" placeholder="teammate@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <select data-testid="team-invite-role" className={input} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="staff">Staff</option><option value="manager">Manager</option></select>
        <button data-testid="team-invite-send" onClick={invite} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white">Send invite</button>
      </div>
      <p className="mt-2 text-xs text-gray-400">They need an account first. Invites stay pending until accepted from the seller portal.</p>
    </section>

    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-gray-100 p-5"><Users size={18} className="text-indigo-600" /><h2 className="font-bold text-gray-900">Members</h2></div>
      <div className="divide-y divide-gray-100">
        {(team.members || []).map((m) => <div key={m._id} data-testid="team-member-row" className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm">
          <div><p className="font-medium text-gray-800">{m.user?.name || m.user?.email}</p><p className="text-xs text-gray-400">{m.user?.email}</p></div>
          <div className="flex items-center gap-2">
            <select className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" value={m.role} onChange={(e) => update(m._id, { role: e.target.value })}><option value="staff">Staff</option><option value="manager">Manager</option></select>
            <select className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs" value={m.status} onChange={(e) => update(m._id, { status: e.target.value })}><option value="invited">Invited</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
            <button onClick={() => remove(m._id)} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50">Remove</button>
          </div>
        </div>)}
        {!team.members?.length && <p className="p-10 text-center text-sm text-gray-400">No team members yet — just you.</p>}
      </div>
    </section>
  </div>;
}
