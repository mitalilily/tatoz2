import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  BookOpen,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Database,
  ExternalLink,
  Eye,
  Gift,
  Layers3,
  LifeBuoy,
  Package,
  RefreshCw,
  Info,
  Server,
  ShoppingBag,
  Store,
  TrendingUp,
  Truck,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { adminAPI } from '../../services/api';
import { useSite } from '../../context/SiteContext';
import { formatPrice } from '../../utils/formatPrice';

const OPERATIONS = [
  { group: 'Commerce', id: 'sales', title: 'Sales & Orders', description: 'Revenue, order flow, products, categories and recent orders.', icon: ShoppingBag, tone: 'indigo' },
  { group: 'Commerce', id: 'profit', title: 'Profit & Margin', description: 'COGS, gross profit, margin, refunds and cost coverage.', icon: TrendingUp, tone: 'emerald' },
  { group: 'Commerce', id: 'payments', title: 'Payments', description: 'Payment methods, success rate, failures and captured value.', icon: CreditCard, tone: 'emerald' },
  { group: 'Commerce', id: 'refunds', title: 'Refunds & Returns', description: 'Refund requests, cancellations, returns and approval amounts.', icon: CircleDollarSign, tone: 'rose' },
  { group: 'Commerce', id: 'shipping', title: 'Shipping & Delivery', description: 'Shipments, courier allocation, AWB and carrier statuses.', icon: Truck, tone: 'blue' },
  { group: 'Customers', id: 'customers', title: 'Customers', description: 'Registrations, activity, segments, verification and spend.', icon: Users, tone: 'violet' },
  { group: 'Customers', id: 'storefront', title: 'Storefront Behavior', description: 'Events, sessions, funnel, devices, pages and searches.', icon: Eye, tone: 'amber' },
  { group: 'Catalog', id: 'catalog', title: 'Catalog & Products', description: 'Product health, merchandising, categories, views and sales.', icon: Package, tone: 'indigo' },
  { group: 'Catalog', id: 'inventory', title: 'Inventory', description: 'Stock value, low stock, out of stock and stock movements.', icon: Layers3, tone: 'emerald' },
  { group: 'Growth', id: 'marketing', title: 'Marketing & Referrals', description: 'Referral activity, coupons, newsletter and campaign performance.', icon: Gift, tone: 'pink' },
  { group: 'Growth', id: 'content', title: 'Content & Reviews', description: 'Pages, blogs, taxonomy and review moderation health.', icon: BookOpen, tone: 'orange' },
  { group: 'Operations', id: 'vendors', title: 'Vendors & Payouts', description: 'Vendor lifecycle, verification, earnings and payouts.', icon: Store, tone: 'blue' },
  { group: 'Operations', id: 'support-ai', title: 'Support & AI', description: 'Conversations, escalations, AI usage, credits and failures.', icon: LifeBuoy, tone: 'violet' },
  { group: 'Operations', id: 'integrations', title: 'Provider Operations & Marketplace', description: 'Provider health, marketplace connections, listings and sync jobs.', icon: Server, tone: 'slate' },
];

const GROUPS = ['Commerce', 'Customers', 'Catalog', 'Growth', 'Operations'];
const EMPTY_DETAIL = { metrics: [], sections: [], range: {}, note: '' };

function toInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getPresetRange(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days + 1);
  return { startDate: toInputDate(start), endDate: toInputDate(end) };
}

function formatValue(value, format, settings) {
  if (value === null || value === undefined || value === '') return '—';
  if (format === 'date') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  if (format === 'currency') return formatPrice(numeric, settings);
  if (format === 'percent') return `${numeric.toLocaleString('en-IN', { maximumFractionDigits: 1 })}%`;
  return numeric.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function toneClasses(tone) {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    rose: 'bg-rose-50 text-rose-600',
    blue: 'bg-blue-50 text-blue-600',
    violet: 'bg-violet-50 text-violet-600',
    amber: 'bg-amber-50 text-amber-600',
    pink: 'bg-pink-50 text-pink-600',
    orange: 'bg-orange-50 text-orange-600',
    slate: 'bg-slate-100 text-slate-600',
  };
  return tones[tone] || tones.indigo;
}

function OperationButton({ operation, onOpen }) {
  const Icon = operation.icon;
  return (
    <button type="button" onClick={() => onOpen(operation)} data-testid={`analytics-operation-${operation.id}`} className="group flex min-h-[118px] flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-indigo-300 hover:bg-indigo-50/30 focus:outline-none focus:ring-2 focus:ring-indigo-100">
      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${toneClasses(operation.tone)}`}><Icon size={17} /></span>
        <ChevronRight size={16} className="mt-1 text-slate-300 group-hover:text-indigo-500" />
      </div>
      <div className="mt-3 min-w-0">
        <p className="truncate text-sm font-bold text-slate-900">{operation.title}</p>
        <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">{operation.description}</p>
      </div>
    </button>
  );
}

function Metric({ item, settings }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">{item.name}</p>
      <p className="mt-1 truncate text-xl font-black tracking-tight text-slate-900">{formatValue(item.value, item.format, settings)}</p>
      {item.caption && <p className="mt-1 truncate text-[10px] text-slate-500">{item.caption}</p>}
    </div>
  );
}

function DetailSection({ section, settings }) {
  if (!section?.rows?.length) {
    return <section className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="text-sm font-bold text-slate-900">{section?.title || 'Details'}</h3><p className="mt-4 text-xs text-slate-400">No data for this period.</p></section>;
  }

  if (section.type === 'table') {
    return (
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3"><h3 className="text-sm font-bold text-slate-900">{section.title}</h3></div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400"><tr>{section.columns.map(column => <th key={column.key} className="whitespace-nowrap px-4 py-2.5 font-semibold">{column.label}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {section.rows.map((row, index) => <tr key={`${section.title}-${index}`} className="text-slate-600"><td className="hidden" />{section.columns.map(column => <td key={column.key} className="max-w-[180px] truncate whitespace-nowrap px-4 py-3">{formatValue(row[column.key], column.format, settings)}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  const max = Math.max(...section.rows.map(row => Number(row.value) || 0), 1);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-bold text-slate-900">{section.title}</h3><span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{section.valueLabel || (section.type === 'trend' ? 'Value' : 'Count')}</span></div>
      <div className="mt-4 space-y-3">
        {section.rows.map((row, index) => {
          const value = Number(row.value) || 0;
          const width = Math.max(2, Math.min(100, (value / max) * 100));
          return <div key={`${section.title}-${row.label}-${index}`}><div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="min-w-0 truncate font-medium text-slate-600">{row.label}</span><span className="flex-shrink-0 font-bold text-slate-900">{formatValue(value, section.format, settings)}{row.secondary !== undefined && row.secondary !== null && <span className="ml-2 font-normal text-slate-400">· {formatValue(row.secondary, section.format === 'currency' ? 'number' : section.format, settings)}</span>}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${index % 3 === 1 ? 'bg-violet-500' : index % 3 === 2 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${width}%` }} /></div></div>;
        })}
      </div>
    </section>
  );
}

function AnalyticsDrawer({ operation, detail, loading, error, settings, range, onClose, onRetry }) {
  const Icon = operation.icon;
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/30" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[720px] flex-col overflow-hidden border-l border-slate-200 bg-slate-50 shadow-2xl" role="dialog" aria-modal="true" aria-label={`${operation.title} analytics`}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex min-w-0 items-start gap-3"><span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${toneClasses(operation.tone)}`}><Icon size={18} /></span><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Detailed analytics</p><h2 className="mt-0.5 truncate text-lg font-black tracking-tight text-slate-900">{operation.title}</h2><p className="mt-1 text-xs text-slate-500">{range.startDate} to {range.endDate}</p></div></div>
          <button type="button" onClick={onClose} aria-label="Close analytics panel" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {loading ? <div className="flex min-h-[280px] items-center justify-center text-sm text-slate-500"><RefreshCw size={16} className="mr-2 animate-spin text-indigo-500" />Loading selected analytics…</div> : error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><p className="font-semibold">Could not load this analytics module.</p><p className="mt-1 text-xs">{error}</p><button type="button" onClick={onRetry} className="mt-3 rounded-lg bg-red-700 px-3 py-2 text-xs font-bold text-white">Retry</button></div> : <><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{detail.metrics.map(item => <Metric key={item.name} item={item} settings={settings} />)}</div><div className="mt-4 space-y-4">{detail.sections.map((section, index) => <DetailSection key={`${section.title}-${index}`} section={section} settings={settings} />)}</div>{detail.note && <div className="mt-4 flex gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-3 text-xs leading-5 text-indigo-800"><Database size={15} className="mt-0.5 flex-shrink-0" /><span>{detail.note}</span></div>}</>}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3 text-[11px] text-slate-400"><span className="inline-flex items-center gap-1.5"><Clock3 size={13} /> Loaded only for this selected panel</span><button type="button" onClick={onRetry} disabled={loading} aria-label="Refresh selected analytics" title="Refresh selected analytics" className="inline-flex items-center gap-1.5 font-bold text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"><RefreshCw size={13} /> Refresh</button></div>
      </aside>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const { settings } = useSite();
  const [range, setRange] = useState(getPresetRange(30));
  const [selectedOperation, setSelectedOperation] = useState(null);
  const [detail, setDetail] = useState(EMPTY_DETAIL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!selectedOperation) return undefined;
    const requestId = ++requestRef.current;
    setLoading(true);
    setError('');
    adminAPI.getOperationAnalytics(selectedOperation.id, range).then(response => {
      if (requestId !== requestRef.current) return;
      setDetail({ ...EMPTY_DETAIL, ...(response.data || {}) });
    }).catch(err => {
      if (requestId !== requestRef.current) return;
      setError(err.message || 'Failed to load analytics');
      setDetail(EMPTY_DETAIL);
    }).finally(() => {
      if (requestId === requestRef.current) setLoading(false);
    });
    return () => { requestRef.current += 1; };
  }, [selectedOperation, range.startDate, range.endDate, refreshKey]);

  const openOperation = operation => {
    setDetail(EMPTY_DETAIL);
    setError('');
    setSelectedOperation(operation);
  };

  const closeDrawer = () => {
    requestRef.current += 1;
    setSelectedOperation(null);
    setLoading(false);
    setError('');
  };

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-end">
        <div><div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-600"><BarChart3 size={13} /> Platform intelligence</div><h1 className="text-2xl font-black tracking-tight text-slate-900">Analytics</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Choose an operation to open its detailed analytics. Nothing heavy loads until you ask for it.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"><CalendarDays size={14} className="text-indigo-500" /><select aria-label="Analytics period" value={range.startDate === getPresetRange(7).startDate && range.endDate === getPresetRange(7).endDate ? 7 : range.startDate === getPresetRange(90).startDate && range.endDate === getPresetRange(90).endDate ? 90 : 30} onChange={event => setRange(getPresetRange(Number(event.target.value)))} className="bg-transparent outline-none"><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option></select></label>
          <button type="button" onClick={() => selectedOperation && setRefreshKey(value => value + 1)} disabled={!selectedOperation || loading} aria-label="Refresh selected analytics" title="Refresh selected analytics" data-testid="analytics-refresh" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"><RefreshCw size={14} /> Refresh panel</button>
        </div>
      </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3" data-testid="analytics-info-banner"><div className="flex min-w-0 items-center gap-2 text-xs text-indigo-800"><Info size={15} className="flex-shrink-0" data-testid="analytics-info-icon" /><span><strong>Explore by operation.</strong> Select any module to open a detailed side panel for that area.</span></div><span className="hidden flex-shrink-0 text-[10px] font-bold uppercase tracking-wide text-indigo-500 sm:inline">{OPERATIONS.length} modules</span></div>

      {GROUPS.map(group => <section key={group}><div className="mb-2 flex items-center gap-2"><h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{group}</h2><span className="h-px flex-1 bg-slate-200" /></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{OPERATIONS.filter(operation => operation.group === group).map(operation => <OperationButton key={operation.id} operation={operation} onOpen={openOperation} />)}</div></section>)}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[11px] text-slate-500"><span className="inline-flex items-center gap-1.5"><Activity size={13} className="text-emerald-500" /> Detail data is fetched on demand for the selected module.</span><span className="inline-flex items-center gap-1.5"><ExternalLink size={13} /> Range is capped at 365 days for predictable response time.</span></div>

      {selectedOperation && <AnalyticsDrawer operation={selectedOperation} detail={detail} loading={loading} error={error} settings={settings} range={range} onClose={closeDrawer} onRetry={() => setRefreshKey(value => value + 1)} />}
    </div>
  );
}
