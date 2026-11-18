import { useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  CalendarDays,
  Globe2,
  Link2,
  Loader2,
  Monitor,
  MousePointer,
  Package,
  RefreshCw,
  Search,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Tablet,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import { trackingAPI } from '../../services/api';
import Loader from '../../components/common/Loader';
import toast from 'react-hot-toast';

const EVENT_COLORS = {
  page_view: '#6366f1', product_click: '#8b5cf6', search: '#06b6d4', add_to_cart: '#10b981', remove_from_cart: '#f59e0b', wishlist_toggle: '#ec4899', checkout_start: '#f97316', order_placed: '#22c55e', button_click: '#64748b', nav_click: '#a855f7', category_click: '#14b8a6', filter_change: '#78716c', sort_change: '#78716c', login: '#3b82f6', register: '#2563eb', logout: '#94a3b8', other: '#cbd5e1',
};
const DEVICE_ICONS = { desktop: Monitor, mobile: Smartphone, tablet: Tablet };
const PIE_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#f97316', '#22c55e'];
const DATE_PRESETS = [{ days: 1, label: 'Today' }, { days: 7, label: '7 days' }, { days: 30, label: '30 days' }, { days: 90, label: '90 days' }];

function toInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDateRange(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days + 1);
  return { startDate: toInputDate(start), endDate: toInputDate(end) };
}

function formatEventType(type) {
  return String(type || 'unknown').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatReferrer(value) {
  if (!value) return 'Direct / unknown';
  try { return new URL(value).hostname.replace(/^www\./, ''); } catch { return value; }
}

function markdownToHtml(markdown) {
  const escapeHtml = value => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
  const inline = value => escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\x60(.+?)\x60/g, '<code>$1</code>');
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  let listType = null;
  const closeList = () => {
    if (listType) html.push('</' + listType + '>');
    listType = null;
  };

  lines.forEach(rawLine => {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      return;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      closeList();
      const tag = heading[1].length === 1 ? 'h2' : heading[1].length === 2 ? 'h3' : 'h4';
      html.push('<' + tag + '>' + inline(heading[2]) + '</' + tag + '>');
      return;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      if (listType !== 'ul') {
        closeList();
        html.push('<ul>');
        listType = 'ul';
      }
      html.push('<li>' + inline(bullet[1]) + '</li>');
      return;
    }
    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    if (numbered) {
      if (listType !== 'ol') {
        closeList();
        html.push('<ol>');
        listType = 'ol';
      }
      html.push('<li>' + inline(numbered[1]) + '</li>');
      return;
    }
    closeList();
    html.push('<p>' + inline(line) + '</p>');
  });
  closeList();
  return DOMPurify.sanitize(html.join(''), { USE_PROFILES: { html: true } });
}

function Panel({ children, className = '' }) {
  return <section className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)] ${className}`}>{children}</section>;
}

function PanelHeader({ icon: Icon, title, subtitle, action }) {
  return <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2"><div className="flex min-w-0 items-center gap-2">{Icon && <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-slate-900 text-white"><Icon size={14} /></div>}<div className="min-w-0"><h2 className="truncate text-[13px] font-bold text-slate-900">{title}</h2>{subtitle && <p className="truncate text-[11px] text-slate-400">{subtitle}</p>}</div></div>{action}</div>;
}

function StatCell({ icon: Icon, label, value, caption }) {
  return <div className="flex items-center gap-2.5 bg-white px-3 py-2.5"><span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700"><Icon size={15} /></span><span className="min-w-0"><span className="block truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">{label}</span><span className="block truncate text-lg font-extrabold tabular-nums tracking-tight text-slate-900">{value}</span><span className="block truncate text-[10px] text-slate-400">{caption}</span></span></div>;
}

function EmptyState({ message }) {
  return <div className="flex min-h-20 items-center justify-center text-center text-xs text-slate-400">{message}</div>;
}

function ProgressBar({ value, color = 'bg-slate-800' }) {
  return <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} /></div>;
}

const SUMMARY_PHASES = ['Reading events in this period…', 'Spotting patterns and outliers…', 'Comparing funnel steps…', 'Writing readable insights…'];

function SummaryGenerating() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setPhase((current) => (current + 1) % SUMMARY_PHASES.length), 2400);
    return () => clearInterval(timer);
  }, []);
  return (
    <div role="status" aria-live="polite" className="px-4 py-5">
      <div className="flex items-center gap-3">
        <span className="relative flex h-9 w-9 flex-shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-lg bg-slate-300 opacity-40" />
          <span className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white"><Sparkles size={16} className="animate-pulse" /></span>
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-800">Generating readable insights…</p>
          <p key={phase} className="animate-fade-in truncate text-[11px] font-medium text-slate-500">{SUMMARY_PHASES[phase]}</p>
        </div>
        <span className="ml-auto flex flex-shrink-0 items-center gap-1" aria-hidden="true">
          {[0, 1, 2].map((dot) => <span key={dot} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${dot * 180}ms` }} />)}
        </span>
      </div>
      <div className="mt-4 h-1 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        <div className="h-full w-1/2 animate-shimmer rounded-full bg-gradient-to-r from-transparent via-slate-500 to-transparent bg-[length:200%_100%]" />
      </div>
      <div className="mt-4 space-y-2" aria-hidden="true">
        {['100%', '94%', '98%', '72%', '96%', '58%'].map((width, index) => (
          <div key={index} className="h-3 animate-shimmer rounded-md bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100 bg-[length:200%_100%]" style={{ width, animationDelay: `${index * 130}ms` }} />
        ))}
      </div>
    </div>
  );
}

function TrendBars({ rows }) {
  if (!rows?.length) return <EmptyState message="No events for this period" />;
  const max = Math.max(...rows.map((row) => Number(row.count || 0)), 1);
  return <div className="flex h-[168px] flex-col justify-end"><div className="flex min-h-0 flex-1 items-end gap-[3px] overflow-hidden border-b border-slate-200 px-1">{rows.map((row) => { const peak = Number(row.count || 0) === max && max > 0; return <div key={row._id} className="group flex h-full flex-1 items-end" title={`${row._id}: ${Number(row.count || 0).toLocaleString()} events`}><div className={`w-full rounded-t-sm ${peak ? 'bg-emerald-500' : 'bg-slate-800 group-hover:bg-slate-600'}`} style={{ height: `${Math.max(3, (Number(row.count || 0) / max) * 100)}%` }} /></div>; })}</div><div className="mt-1.5 flex justify-between gap-2 text-[10px] tabular-nums text-slate-400"><span>{rows[0]?._id}</span><span>{rows[Math.floor(rows.length / 2)]?._id}</span><span>{rows[rows.length - 1]?._id}</span></div></div>;
}

function HourlyBars({ rows }) {
  const max = Math.max(...rows.map((row) => Number(row.count || 0)), 1);
  return <div className="px-1"><div className="flex h-[84px] items-end gap-[3px] border-b border-slate-200">{rows.map((row) => <div key={row.hour} className="group flex h-full flex-1 items-end" title={`${row.hour}: ${row.count.toLocaleString()} events`}><div className="w-full rounded-t-sm bg-slate-300 group-hover:bg-slate-500" style={{ height: `${row.count ? Math.max(4, (row.count / max) * 100) : 2}%` }} /></div>)}</div><div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-slate-400"><span>00:00</span><span>12:00</span><span>23:00</span></div></div>;
}

const ClickTrackingPage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState({ ...getDateRange(30), eventType: '' });
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summary, setSummary] = useState('');

  const fetchData = async (silent = false) => {
    if (filters.startDate > filters.endDate) {
      toast.error('Start date must be before end date');
      return;
    }
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const response = await trackingAPI.getAnalytics(filters);
      setData(response.data);
    } catch (error) {
      toast.error(error.message || 'Failed to load tracking data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, [filters.startDate, filters.endDate, filters.eventType]);

  const handleSummary = async () => {
    setSummaryLoading(true);
    setSummary('');
    try {
      const response = await trackingAPI.getSummary({ startDate: filters.startDate, endDate: filters.endDate, eventType: filters.eventType || undefined });
      setSummary(response.data.summary || 'No AI summary was returned.');
      if (response.data.remainingCredits !== undefined) window.dispatchEvent(new CustomEvent('ai-credits-updated', { detail: { aiCredits: response.data.remainingCredits } }));
    } catch (error) {
      toast.error(error.message || 'Failed to generate summary');
    } finally {
      setSummaryLoading(false);
    }
  };

  const stats = data?.stats || {};
  const eventTypeBreakdown = data?.eventTypeBreakdown || [];
  const deviceBreakdown = data?.deviceBreakdown || [];
  const dailyTrend = data?.dailyTrend || [];
  const hourlyBreakdown = data?.hourlyBreakdown || [];
  const topProducts = data?.topProducts || [];
  const topSearches = data?.topSearches || [];
  const pageBreakdown = data?.pageBreakdown || [];
  const referrerBreakdown = data?.referrerBreakdown || [];
  const funnelSteps = data?.funnel?.steps || [];
  const totalDeviceEvents = deviceBreakdown.reduce((sum, item) => sum + Number(item.count || 0), 0);
  const maxEventCount = Number(eventTypeBreakdown[0]?.count || 1);
  const maxFunnelCount = Number(funnelSteps[0]?.count || 1);
  const topEvent = eventTypeBreakdown[0];
  const hourlyData = Array.from({ length: 24 }, (_, hour) => ({ hour: `${String(hour).padStart(2, '0')}:00`, count: Number(hourlyBreakdown.find((item) => item._id === hour)?.count || 0) }));
  const activePresetDays = DATE_PRESETS.find((preset) => { const range = getDateRange(preset.days); return range.startDate === filters.startDate && range.endDate === filters.endDate; })?.days;
  const isDefaultRange = (() => { const range = getDateRange(30); return filters.eventType === '' && filters.startDate === range.startDate && filters.endDate === range.endDate; })();
  if (loading && !data) return <div className="flex justify-center py-16"><Loader size="md" /></div>;

  return (
    <div className="space-y-3 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><h1 className="text-lg font-extrabold tracking-tight text-slate-900">Click tracking <span className="ml-1 align-middle text-[11px] font-medium text-slate-400">discovery → cart → checkout</span></h1></div><div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500"><span className="relative flex h-1.5 w-1.5"><span className="absolute h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /></span>{refreshing ? 'Refreshing…' : 'Live'}</span><button type="button" onClick={handleSummary} disabled={summaryLoading} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:cursor-wait disabled:opacity-70" aria-busy={summaryLoading}>{summaryLoading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}{summaryLoading ? 'Generating…' : 'AI summary'}</button><button type="button" onClick={() => fetchData(true)} disabled={refreshing} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-900 disabled:opacity-60"><RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} /> Refresh</button></div></div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.05)]"><CalendarDays size={14} className="ml-0.5 flex-shrink-0 text-slate-400" /><div className="flex items-center rounded-lg bg-slate-100 p-0.5">{DATE_PRESETS.map((preset) => <button type="button" key={preset.days} onClick={() => setFilters((current) => ({ ...current, ...getDateRange(preset.days) }))} className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors ${activePresetDays === preset.days ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>{preset.label}</button>)}</div><input type="date" value={filters.startDate} max={filters.endDate} onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))} className="h-8 rounded-lg border border-slate-200 bg-white px-1.5 text-[11px] tabular-nums text-slate-600 outline-none focus:border-slate-400" /><span className="text-[11px] text-slate-400">to</span><input type="date" value={filters.endDate} min={filters.startDate} onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))} className="h-8 rounded-lg border border-slate-200 bg-white px-1.5 text-[11px] tabular-nums text-slate-600 outline-none focus:border-slate-400" /><select value={filters.eventType} onChange={(event) => setFilters((current) => ({ ...current, eventType: event.target.value }))} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600 outline-none focus:border-slate-400"><option value="">All events</option>{Object.keys(EVENT_COLORS).map((eventType) => <option key={eventType} value={eventType}>{formatEventType(eventType)}</option>)}</select>{!isDefaultRange && <button type="button" onClick={() => setFilters({ ...getDateRange(30), eventType: '' })} className="text-[11px] font-semibold text-slate-400 hover:text-rose-600">Reset</button>}<span className="ml-auto hidden text-[11px] tabular-nums text-slate-400 lg:inline">{filters.startDate} → {filters.endDate} · {filters.eventType ? formatEventType(filters.eventType) : 'All events'}</span></div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.05)] sm:grid-cols-3 lg:grid-cols-6"><StatCell icon={MousePointer} label="Events" value={Number(stats.totalEvents || 0).toLocaleString()} caption="Tracked actions" /><StatCell icon={Activity} label="Sessions" value={Number(stats.uniqueSessions || 0).toLocaleString()} caption="Unique sessions" /><StatCell icon={Users} label="Users" value={Number(stats.uniqueUsers || 0).toLocaleString()} caption="Identified visitors" /><StatCell icon={TrendingUp} label="Conversion" value={`${Number(stats.conversionRate || 0).toFixed(2)}%`} caption="Views to orders" /><StatCell icon={Link2} label="Engagement" value={`${Number(stats.engagementRate || 0).toFixed(1)}%`} caption="Non-page-view" /><StatCell icon={Zap} label="Top event" value={topEvent ? Number(topEvent.count).toLocaleString() : '—'} caption={topEvent ? formatEventType(topEvent._id) : 'No events yet'} /></div>

      {(summary || summaryLoading) && <Panel><div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2"><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-900 text-white"><Sparkles size={14} /></span><h2 className="text-[13px] font-bold text-slate-900">AI analytics summary</h2></div><span className="text-[10px] font-medium text-slate-400">Based on selected filters</span></div>{summaryLoading ? <SummaryGenerating /> : <div className="summary-prose animate-fade-in px-3 py-3 text-[13px] text-slate-700" dangerouslySetInnerHTML={{ __html: markdownToHtml(summary) }} />}</Panel>}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.8fr)]"><Panel><PanelHeader icon={Activity} title="Traffic trend" subtitle={`${dailyTrend.length} active days in selected period`} /><div className="p-3"><TrendBars rows={dailyTrend} /></div></Panel><Panel><PanelHeader icon={ShoppingCart} title="Conversion funnel" subtitle="From discovery to order" action={<span className="text-[11px] font-bold text-rose-600">{Number(stats.conversionRate || 0).toFixed(2)}%</span>} /><div className="space-y-2.5 p-3">{funnelSteps.length ? funnelSteps.map((step, index) => { const share = maxFunnelCount ? (Number(step.count || 0) / maxFunnelCount) * 100 : 0; return <div key={step.key}><div className="mb-1 flex items-center justify-between gap-2 text-xs"><span className="flex items-center gap-2 font-medium text-slate-600"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: EVENT_COLORS[step.key] || PIE_COLORS[index] }} />{step.label}</span><strong className="tabular-nums text-slate-900">{Number(step.count || 0).toLocaleString()}</strong></div><ProgressBar value={share} color={index === funnelSteps.length - 1 ? 'bg-emerald-500' : 'bg-slate-800'} /></div>; }) : <EmptyState message="Funnel data will appear here" />}</div></Panel></div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]"><Panel><PanelHeader icon={BarChart3} title="Event mix" subtitle="What visitors are doing" /><div className="space-y-2 p-3">{eventTypeBreakdown.length ? eventTypeBreakdown.slice(0, 10).map((event, index) => <div key={event._id} className="flex items-center gap-2.5"><span className="w-6 flex-shrink-0 text-[10px] font-black tabular-nums text-slate-300">{String(index + 1).padStart(2, '0')}</span><span className="w-28 truncate text-[11px] font-semibold text-slate-600">{formatEventType(event._id)}</span><div className="min-w-0 flex-1"><ProgressBar value={(Number(event.count || 0) / maxEventCount) * 100} color={index === 0 ? 'bg-emerald-500' : 'bg-slate-800'} /></div><span className="w-12 text-right text-xs font-black tabular-nums text-slate-900">{Number(event.count || 0).toLocaleString()}</span></div>) : <EmptyState message="No event mix data" />}</div></Panel><Panel><PanelHeader icon={Activity} title="Devices & hourly activity" subtitle="Usage pattern in the selected period" /><div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 xl:grid-cols-1"><div className="space-y-2.5">{deviceBreakdown.length ? deviceBreakdown.map((device, index) => { const Icon = DEVICE_ICONS[device._id] || Monitor; const percent = totalDeviceEvents ? (Number(device.count || 0) / totalDeviceEvents) * 100 : 0; return <div key={device._id} className="flex items-center gap-2"><Icon size={15} className="flex-shrink-0 text-slate-400" /><div className="min-w-0 flex-1"><div className="mb-1 flex justify-between text-[11px]"><span className="font-semibold capitalize text-slate-600">{device._id || 'Unknown'}</span><span className="tabular-nums text-slate-400">{percent.toFixed(1)}%</span></div><ProgressBar value={percent} color="bg-slate-800" /></div></div>; }) : <EmptyState message="No device data" />}</div><HourlyBars rows={hourlyData} /></div></Panel></div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"><Panel><PanelHeader icon={Link2} title="Top pages" subtitle="Most viewed routes" /><div className="divide-y divide-slate-100 px-3">{pageBreakdown.length ? pageBreakdown.slice(0, 8).map((item, index) => <div key={`${item._id}-${index}`} className="flex items-center gap-2 py-[7px] text-xs"><span className="w-6 flex-shrink-0 text-[10px] font-black tabular-nums text-slate-300">{String(index + 1).padStart(2, '0')}</span><span className="min-w-0 flex-1 truncate text-slate-600">{item._id || '/'}</span><span className="flex-shrink-0 font-black tabular-nums text-slate-900">{Number(item.count || 0).toLocaleString()}</span></div>) : <EmptyState message="No page data" />}</div></Panel><Panel><PanelHeader icon={Package} title="Top products" subtitle="Product click targets" /><div className="divide-y divide-slate-100 px-3">{topProducts.length ? topProducts.slice(0, 8).map((item, index) => <div key={`${item._id}-${index}`} className="flex items-center gap-2 py-[7px] text-xs"><span className="w-6 flex-shrink-0 text-[10px] font-black tabular-nums text-slate-300">{String(index + 1).padStart(2, '0')}</span><span className="min-w-0 flex-1 truncate text-slate-600">{item._id || 'Unknown product'}</span><span className="flex-shrink-0 font-black tabular-nums text-slate-900">{Number(item.count || 0).toLocaleString()}</span></div>) : <EmptyState message="No product clicks" />}</div></Panel><Panel><PanelHeader icon={Search} title="Top searches" subtitle="What visitors look for" /><div className="divide-y divide-slate-100 px-3">{topSearches.length ? topSearches.slice(0, 8).map((item, index) => <div key={`${item._id}-${index}`} className="flex items-center gap-2 py-[7px] text-xs"><span className="w-6 flex-shrink-0 text-[10px] font-black tabular-nums text-slate-300">{String(index + 1).padStart(2, '0')}</span><span className="min-w-0 flex-1 truncate text-slate-600">“{item._id || 'Empty search'}”</span><span className="flex-shrink-0 font-black tabular-nums text-slate-900">{Number(item.count || 0).toLocaleString()}</span></div>) : <EmptyState message="No searches" />}</div></Panel><Panel><PanelHeader icon={Globe2} title="Traffic sources" subtitle="Referrers sending visitors" /><div className="divide-y divide-slate-100 px-3">{referrerBreakdown.length ? referrerBreakdown.slice(0, 8).map((item, index) => <div key={`${item._id}-${index}`} className="flex items-center gap-2 py-[7px] text-xs"><span className="w-6 flex-shrink-0 text-[10px] font-black tabular-nums text-slate-300">{String(index + 1).padStart(2, '0')}</span><span className="min-w-0 flex-1 truncate text-slate-600">{formatReferrer(item._id)}</span><span className="flex-shrink-0 font-black tabular-nums text-slate-900">{Number(item.count || 0).toLocaleString()}</span></div>) : <EmptyState message="No referrer data" />}</div></Panel></div>

    </div>
  );
};

export default ClickTrackingPage;
