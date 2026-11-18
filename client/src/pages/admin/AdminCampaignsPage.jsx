import { useEffect, useState } from 'react';
import { Megaphone, Play, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { adminAPI } from '../../services/api';
import Loader from '../../components/common/Loader';
import toast from 'react-hot-toast';

const blank = { name: '', objective: 'promotional', channels: ['in_app'], title: '', subject: '', message: '', html: '', templateName: '', couponCode: '', audience: { type: 'all', segment: '', users: [] }, scheduledAt: '' };
const input = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100';
const CHANNEL_LABELS = { in_app: 'In-App', email: 'Email', sms: 'SMS', whatsapp: 'WhatsApp', push: 'Push' };
const OBJECTIVE_LABELS = { promotional: 'Promotional', product_launch: 'Product Launch', cart_recovery: 'Cart Recovery', win_back: 'Win Back', coupon: 'Coupon', referral: 'Referral' };
const objectIdPattern = /^[a-f\d]{24}$/i;
const requiredMark = <span className="text-red-600" aria-hidden="true">*</span>;

const validate = form => {
  const errors = {};
  const name = form.name.trim();
  const title = form.title.trim();
  const message = form.message.trim();
  if (!name) errors.name = 'Campaign name is required.';
  else if (name.length > 160) errors.name = 'Use 160 characters or fewer.';
  if (!title) errors.title = 'Notification title is required.';
  else if (title.length > 160) errors.title = 'Use 160 characters or fewer.';
  if (!message) errors.message = 'Message is required.';
  else if (message.length > 4000) errors.message = 'Use 4000 characters or fewer.';
  if (!form.channels.length) errors.channels = 'Select at least one channel.';
  if (form.audience.type === 'segment' && !form.audience.segment) errors.segment = 'Select a customer segment.';
  if (form.audience.type === 'customers') {
    if (!form.audience.users.length) errors.users = 'Add at least one customer ID.';
    else if (form.audience.users.some(id => !objectIdPattern.test(id))) errors.users = 'Use valid 24-character MongoDB ObjectIds, separated by commas.';
  }
  if (form.scheduledAt && Number.isNaN(new Date(form.scheduledAt).getTime())) errors.scheduledAt = 'Enter a valid schedule.';
  return errors;
};

const ErrorText = ({ children, testId }) => children ? <p className="mt-1 text-xs font-medium text-red-600" data-testid={testId}>{children}</p> : null;

export default function AdminCampaignsPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [segments, setSegments] = useState([]);
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState({});
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [campaignResponse, segmentResponse] = await Promise.all([adminAPI.listCampaigns(), adminAPI.getCustomerSegments()]);
      setCampaigns(campaignResponse.data?.campaigns || []);
      setSegments(segmentResponse.data?.segments || []);
    } catch (error) { toast.error(error.message || 'Failed to load campaigns'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const updateForm = (changes, clearError) => {
    setForm(current => ({ ...current, ...changes }));
    if (clearError) setErrors(current => ({ ...current, [clearError]: '' }));
  };
  const toggleChannel = channel => setForm(current => ({ ...current, channels: current.channels.includes(channel) ? current.channels.filter(item => item !== channel) : [...current.channels, channel] }));
  const save = async event => {
    event.preventDefault();
    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      toast.error('Fix the highlighted campaign fields');
      return;
    }
    setSaving(true);
    try {
      const response = await adminAPI.createCampaign({ ...form, name: form.name.trim(), title: form.title.trim(), message: form.message.trim() });
      setCampaigns(current => [response.data.campaign, ...current]);
      setForm(blank); setErrors({}); setOpen(false);
      toast.success(response.data.campaign.status === 'scheduled' ? 'Campaign scheduled' : 'Campaign saved as draft');
    } catch (error) { toast.error(error.message || 'Failed to save campaign'); }
    finally { setSaving(false); }
  };
  const execute = async campaign => {
    try { await adminAPI.executeCampaign(campaign._id, true); toast.success('Campaign execution queued'); load(); }
    catch (error) { toast.error(error.message || 'Campaign failed'); }
  };
  const remove = async campaign => {
    try { await adminAPI.deleteCampaign(campaign._id); setCampaigns(current => current.filter(item => item._id !== campaign._id)); toast.success('Campaign deleted'); }
    catch (error) { toast.error(error.message || 'Campaign cannot be deleted'); }
  };

  return <div className="space-y-4 pb-8" data-testid="admin-campaigns-page">
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Marketing automation</p><h1 className="mt-1 text-xl font-bold text-slate-900">Campaigns</h1><p className="mt-1 text-xs text-slate-500">Schedule consent-aware email, SMS, WhatsApp and in-app campaigns for customer segments.</p></div><div className="flex gap-2"><button type="button" onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600"><RefreshCw size={14} />Refresh</button><button type="button" onClick={() => { setOpen(true); setErrors({}); }} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white"><Plus size={14} />New campaign</button></div></div>
    {open && <form onSubmit={save} noValidate className="space-y-4 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4" data-testid="campaign-form">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs font-bold text-slate-600" htmlFor="campaign-name">Campaign name {requiredMark}<input id="campaign-name" data-testid="campaign-name" maxLength={160} className={`${input} mt-1`} value={form.name} onChange={e => updateForm({ name: e.target.value }, 'name')} aria-invalid={Boolean(errors.name)} /><ErrorText testId="campaign-name-error">{errors.name}</ErrorText></label>
        <label className="text-xs font-bold text-slate-600" htmlFor="campaign-objective">Objective<select id="campaign-objective" data-testid="campaign-objective" className={`${input} mt-1`} value={form.objective} onChange={e => updateForm({ objective: e.target.value })}>{Object.entries(OBJECTIVE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-xs font-bold text-slate-600" htmlFor="campaign-title">Notification title {requiredMark}<input id="campaign-title" data-testid="campaign-title" maxLength={160} className={`${input} mt-1`} value={form.title} onChange={e => updateForm({ title: e.target.value }, 'title')} aria-invalid={Boolean(errors.title)} /><ErrorText testId="campaign-title-error">{errors.title}</ErrorText></label>
        <label className="text-xs font-bold text-slate-600" htmlFor="campaign-subject">Email subject<input id="campaign-subject" data-testid="campaign-subject" maxLength={200} className={`${input} mt-1`} value={form.subject} onChange={e => updateForm({ subject: e.target.value })} /></label>
      </div>
      <label className="block text-xs font-bold text-slate-600" htmlFor="campaign-message">Message {requiredMark}<textarea id="campaign-message" data-testid="campaign-message" maxLength={4000} rows={4} className={`${input} mt-1`} value={form.message} onChange={e => updateForm({ message: e.target.value }, 'message')} aria-invalid={Boolean(errors.message)} /><ErrorText testId="campaign-message-error">{errors.message}</ErrorText></label>
      <div><p className="text-xs font-bold text-slate-600">Channels {requiredMark}</p><div className="mt-1 flex flex-wrap gap-2">{Object.entries(CHANNEL_LABELS).map(([channel, label]) => <button type="button" key={channel} data-testid={`campaign-channel-${channel}`} onClick={() => toggleChannel(channel)} aria-pressed={form.channels.includes(channel)} className={`rounded-xl border px-3 py-2 text-xs font-bold ${form.channels.includes(channel) ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-500'}`}>{label}</button>)}</div><ErrorText testId="campaign-channels-error">{errors.channels}</ErrorText></div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-xs font-bold text-slate-600" htmlFor="campaign-audience">Audience<select id="campaign-audience" data-testid="campaign-audience" className={`${input} mt-1`} value={form.audience.type} onChange={e => updateForm({ audience: { ...form.audience, type: e.target.value, segment: e.target.value === 'segment' ? form.audience.segment : '', users: e.target.value === 'customers' ? form.audience.users : [] } })}><option value="all">All customers</option><option value="segment">Customer segment</option><option value="customers">Specific customer IDs</option></select></label>
        {form.audience.type === 'segment' ? <label className="text-xs font-bold text-slate-600" htmlFor="campaign-segment">Segment {requiredMark}<select id="campaign-segment" data-testid="campaign-segment" className={`${input} mt-1`} value={form.audience.segment} onChange={e => setForm(current => ({ ...current, audience: { ...current.audience, segment: e.target.value } }))} aria-invalid={Boolean(errors.segment)}><option value="">Select segment</option>{segments.map(segment => <option key={segment._id} value={segment._id}>{segment.name}</option>)}</select><ErrorText testId="campaign-segment-error">{errors.segment}</ErrorText></label> : <div className="hidden md:block" aria-hidden="true" />}
        <label className="text-xs font-bold text-slate-600" htmlFor="campaign-schedule">Schedule (optional)<input id="campaign-schedule" data-testid="campaign-schedule" type="datetime-local" className={`${input} mt-1`} value={form.scheduledAt} onChange={e => updateForm({ scheduledAt: e.target.value }, 'scheduledAt')} aria-invalid={Boolean(errors.scheduledAt)} /><ErrorText testId="campaign-schedule-error">{errors.scheduledAt}</ErrorText></label>
      </div>
      {form.audience.type === 'customers' && <label className="block text-xs font-bold text-slate-600" htmlFor="campaign-customer-ids">Customer IDs {requiredMark}<input id="campaign-customer-ids" data-testid="campaign-customer-ids" maxLength={120000} className={`${input} mt-1`} placeholder="comma-separated 24-character MongoDB IDs" value={form.audience.users.join(', ')} onChange={e => setForm(current => ({ ...current, audience: { ...current.audience, users: e.target.value.split(',').map(item => item.trim()).filter(Boolean) } }))} aria-invalid={Boolean(errors.users)} /><span className="mt-1 block text-[11px] font-normal text-slate-500">Only customer IDs from this tenant can be targeted.</span><ErrorText testId="campaign-customer-ids-error">{errors.users}</ErrorText></label>}
      <div className="flex justify-end gap-2"><button type="button" onClick={() => { setOpen(false); setErrors({}); }} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600">Cancel</button><button type="submit" disabled={saving} className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save campaign'}</button></div>
    </form>}
    {loading ? <div className="flex justify-center py-16"><Loader size="lg" /></div> : <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><div className="min-w-[720px]"><div className="grid grid-cols-[minmax(0,1fr)_110px_150px_120px] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-400"><span>Campaign</span><span>Status</span><span>Audience / delivery</span><span>Actions</span></div>{campaigns.length ? campaigns.map(campaign => <div key={campaign._id} className="grid grid-cols-[minmax(0,1fr)_110px_150px_120px] items-center gap-3 border-b border-slate-100 px-4 py-3 text-xs"><div className="min-w-0"><p className="break-words font-bold text-slate-800">{campaign.name}</p><p className="mt-1 break-words text-slate-400">{campaign.title} · {(campaign.channels || []).map(channel => CHANNEL_LABELS[channel] || channel).join(', ')}</p></div><span className="w-fit rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold capitalize text-slate-600">{campaign.status}</span><span className="text-slate-500">{campaign.metrics?.audience || 0} audience · {campaign.metrics?.queued || 0} queued</span><div className="flex gap-1"><button type="button" title="Execute" onClick={() => execute(campaign)} className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50"><Play size={14} /></button><button type="button" title="Delete" onClick={() => remove(campaign)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"><Trash2 size={14} /></button></div></div>) : <div className="p-12 text-center text-sm text-slate-400"><Megaphone className="mx-auto mb-2 text-slate-300" />No campaigns created yet.</div>}</div></div>}
  </div>;
}
