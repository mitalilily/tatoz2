import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  BadgePercent,
  Banknote,
  Boxes,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Headset,
  LifeBuoy,
  Package,
  PackageCheck,
  Plus,
  RefreshCw,
  RotateCcw,
  ShoppingCart,
  Star,
  Store,
  Tag,
  TrendingUp,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { adminAPI } from '../../services/api';
import { useSite } from '../../context/SiteContext';
import { formatPrice } from '../../utils/formatPrice';

const MAX_RANGE_DAYS = 366;
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function toKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseKey(key) {
  const [y, m, d] = String(key || '').split('-').map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}

function addDaysKey(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

function shortDate(key) {
  if (!key) return '—';
  return parseKey(key).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function defaultRange() {
  const to = toKey(new Date());
  return { from: addDaysKey(to, -29), to };
}

function MonthGrid({ year, month, start, end, hover, todayKey, onHover, onPick }) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const previewEnd = !end && start && hover && hover >= start ? hover : null;
  const lo = start || null;
  const hi = end || previewEnd;
  const title = new Date(year, month, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1.5 text-center text-xs font-bold text-slate-800">{title}</p>
      <div className="grid grid-cols-7 text-center">
        {WEEKDAYS.map(w => <span key={w} className="pb-1 text-[10px] font-bold text-slate-400">{w}</span>)}
        {cells.map((day, i) => {
          if (!day) return <span key={`blank-${i}`} />;
          const key = toKey(new Date(year, month, day));
          const disabled = key > todayKey || (start && !end && key > addDaysKey(start, MAX_RANGE_DAYS - 1));
          const isStart = key === start;
          const isEnd = key === end || (previewEnd && key === previewEnd);
          const inRange = lo && hi && key > lo && key < hi;
          let btn = 'flex h-8 items-center justify-center ';
          let dot = 'flex h-7 w-7 items-center justify-center rounded-full text-[11px] transition-colors ';
          if (disabled) {
            dot += 'cursor-not-allowed text-slate-300';
          } else if (isStart || isEnd) {
            btn += key === lo ? 'rounded-l-full bg-indigo-50 ' : 'rounded-r-full bg-indigo-50 ';
            if (isStart && isEnd) btn = 'flex h-8 items-center justify-center ';
            dot += 'bg-slate-900 font-bold text-white shadow';
          } else if (inRange) {
            btn += 'bg-indigo-50 ';
            dot += 'font-semibold text-indigo-700';
          } else {
            dot += 'text-slate-600 hover:bg-slate-100';
          }
          return (
            <button key={key} type="button" disabled={disabled} onMouseEnter={() => onHover(key)} onFocus={() => onHover(key)} onClick={() => onPick(key)} className={btn} aria-label={key}>
              <span className={dot}>{day}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HotelDatePicker({ value, onApply, onClose }) {
  const todayKey = toKey(new Date());
  const [sel, setSel] = useState({ start: value.from, end: value.to });
  const [hover, setHover] = useState(null);
  const initial = parseKey(value.from);
  const [view, setView] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const right = new Date(view.getFullYear(), view.getMonth() + 1, 1);
  const thisMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pick = key => {
    setSel(s => {
      if (!s.start || (s.start && s.end)) return { start: key, end: null };
      if (key < s.start) return { start: key, end: null };
      return { start: s.start, end: key };
    });
  };

  const shortcut = n => setSel({ start: addDaysKey(todayKey, -(n - 1)), end: todayKey });
  const thisMonthShortcut = () => setSel({ start: toKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), end: todayKey });

  const complete = Boolean(sel.start && sel.end);
  const canNext = right < thisMonth;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-[2px] sm:pt-14" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Choose custom date range" className="w-full max-w-[580px] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-900">Pick your dates</h3>
            <p className="text-[11px] text-slate-400">Tap a start date, then tap an end date</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close date picker" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={16} /></button>
        </div>

        <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
          <div className={`rounded-xl border-2 px-3 py-2 ${sel.start && !sel.end ? 'border-slate-900 bg-slate-50' : 'border-slate-200'}`}>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Start</p>
            <p className="text-sm font-black text-slate-900">{shortDate(sel.start)}</p>
            <p className="text-[10px] text-slate-400">{sel.start ? parseKey(sel.start).toLocaleDateString('en-IN', { weekday: 'short' }) : ''}</p>
          </div>
          <div className="flex items-center">
            <span className="whitespace-nowrap rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-bold text-white">
              {complete ? `${shortDate(sel.start)} → ${shortDate(sel.end)}` : 'Select dates'}
            </span>
          </div>
          <div className={`rounded-xl border-2 px-3 py-2 text-right ${sel.start && !sel.end ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-200'}`}>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">End</p>
            <p className="text-sm font-black text-slate-900">{shortDate(sel.end)}</p>
            <p className="text-[10px] text-slate-400">{sel.end ? parseKey(sel.end).toLocaleDateString('en-IN', { weekday: 'short' }) : ''}</p>
          </div>
        </div>

        <div className="mb-2 flex items-center justify-between">
          <button type="button" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} aria-label="Previous month"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"><ChevronLeft size={15} /></button>
          <div className="flex gap-1.5">
            {[{ n: 7, label: 'Past week' }, { n: 30, label: 'Past month' }, { n: 90, label: 'Past 3 months' }].map(({ n, label }) => (
              <button key={n} type="button" onClick={() => shortcut(n)}
                className="rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-bold text-slate-500 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600">{label}</button>
            ))}
            <button type="button" onClick={thisMonthShortcut}
              className="rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-bold text-slate-500 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600">This month</button>
          </div>
          <button type="button" onClick={() => canNext && setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} disabled={!canNext} aria-label="Next month"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30"><ChevronRight size={15} /></button>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row">
          <MonthGrid year={view.getFullYear()} month={view.getMonth()} start={sel.start} end={sel.end} hover={hover} todayKey={todayKey} onHover={setHover} onPick={pick} />
          <div className="hidden sm:block sm:flex-1">
            <MonthGrid year={right.getFullYear()} month={right.getMonth()} start={sel.start} end={sel.end} hover={hover} todayKey={todayKey} onHover={setHover} onPick={pick} />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
          <button type="button" onClick={onClose} className="rounded-lg px-3.5 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">Cancel</button>
          <button type="button" disabled={!complete} onClick={() => complete && onApply({ from: sel.start, to: sel.end })}
            className="rounded-lg bg-slate-900 px-5 py-2 text-xs font-bold text-white shadow hover:bg-slate-800 disabled:opacity-40">
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

const STATUS_META = {
  pending: { label: 'Pending', bar: 'bg-amber-400', chip: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  confirmed: { label: 'Confirmed', bar: 'bg-blue-400', chip: 'bg-blue-50 text-blue-700', dot: 'bg-blue-500' },
  packed: { label: 'Packed', bar: 'bg-violet-400', chip: 'bg-violet-50 text-violet-700', dot: 'bg-violet-500' },
  shipped: { label: 'Shipped', bar: 'bg-indigo-400', chip: 'bg-indigo-50 text-indigo-700', dot: 'bg-indigo-500' },
  out_for_delivery: { label: 'Out for delivery', bar: 'bg-orange-400', chip: 'bg-orange-50 text-orange-700', dot: 'bg-orange-500' },
  delivered: { label: 'Delivered', bar: 'bg-emerald-400', chip: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  cancelled: { label: 'Cancelled', bar: 'bg-rose-400', chip: 'bg-red-50 text-red-700', dot: 'bg-red-500' },
  returned: { label: 'Returned', bar: 'bg-slate-400', chip: 'bg-slate-100 text-slate-600', dot: 'bg-slate-500' },
};

const SKELETON = 'animate-pulse rounded-md bg-slate-100';

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function pctChange(current, previous) {
  const curr = Number(current || 0);
  const prev = Number(previous || 0);
  if (!prev) return curr > 0 ? 100 : 0;
  return ((curr - prev) / prev) * 100;
}

function Delta({ value }) {
  const num = Number(value || 0);
  const up = num >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${up ? 'bg-emerald-500/20 text-emerald-50' : 'bg-rose-500/25 text-rose-50'}`}>
      {up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
      {Math.abs(num) >= 100 ? Math.round(Math.abs(num)) : Math.abs(num).toFixed(1)}%
    </span>
  );
}

function Sparkline({ points, stroke = '#fff' }) {
  const data = points.length > 1 ? points : [0, ...points, 0];
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = Math.max(max - min, 1);
  const w = 96;
  const h = 30;
  const coords = data.map((v, i) => [
    (i / (data.length - 1)) * w,
    h - 3 - ((v - min) / span) * (h - 6),
  ]);
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[30px] w-24 opacity-90" preserveAspectRatio="none" aria-hidden="true">
      <path d={`${line} L${w},${h} L0,${h} Z`} fill="#ffffff" opacity="0.18" />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AreaChart({ data, settings, loading }) {
  if (loading) {
    return <div className="flex h-44 items-end gap-1.5">{Array.from({ length: 18 }).map((_, i) => <div key={i} className={`${SKELETON} flex-1`} style={{ height: `${30 + ((i * 23) % 60)}%` }} />)}</div>;
  }
  if (!data.length) {
    return <div className="flex h-44 items-center justify-center text-xs text-slate-400" data-testid="dashboard-sales-trend-empty">No paid-order data for this period.</div>;
  }
  const W = 600;
  const H = 176;
  const PAD = 6;
  const max = Math.max(...data.map(d => d.revenue), 1);
  const stepX = data.length > 1 ? (W - PAD * 2) / (data.length - 1) : 0;
  const y = v => H - PAD - (v / max) * (H - PAD * 2 - 14);
  const pts = data.map((d, i) => [PAD + i * stepX, y(d.revenue)]);
  const line = pts.map(([x, py], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${py.toFixed(1)}`).join(' ');
  const area = `${line} L${(PAD + (data.length - 1) * stepX).toFixed(1)},${H} L${PAD},${H} Z`;
  return (
    <div data-testid="dashboard-sales-trend">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" preserveAspectRatio="none" role="img" aria-label="Revenue trend">
        <defs>
          <linearGradient id="dashRevFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map(f => (
          <line key={f} x1={PAD} x2={W - PAD} y1={H * f} y2={H * f} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 4" />
        ))}
        <path d={area} fill="url(#dashRevFill)" />
        <path d={line} fill="none" stroke="#6366f1" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map(([x, py], i) => (
          <circle key={data[i].date} cx={x} cy={py} r={data.length > 20 ? 0 : 3} fill="#fff" stroke="#6366f1" strokeWidth="2">
            <title>{`${data[i].date} · ${formatPrice(data[i].revenue, settings)} · ${data[i].orders} orders`}</title>
          </circle>
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[9px] font-medium text-slate-400">
        <span>{formatDate(data[0].date)}</span>
        <span>{data.length > 2 ? formatDate(data[Math.floor(data.length / 2)].date) : ''}</span>
        <span>{formatDate(data[data.length - 1].date)}</span>
      </div>
    </div>
  );
}

function Card({ children, className = '' }) {
  return <section className={`min-w-0 rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)] ${className}`}>{children}</section>;
}

function CardHead({ title, subtitle, action }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3.5 pb-2 pt-3">
      <div className="min-w-0">
        <h2 className="truncate text-[13px] font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="truncate text-[11px] text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: String(status || 'Unknown').replace(/_/g, ' '), chip: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' };
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${meta.chip}`}><span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}</span>;
}

const KPI = [
  { key: 'revenue', label: 'Revenue', icon: Banknote, gradient: 'from-indigo-500 via-indigo-600 to-violet-600', to: '/admin/analytics' },
  { key: 'orders', label: 'Orders', icon: ShoppingCart, gradient: 'from-rose-500 via-rose-600 to-orange-500', to: '/admin/orders' },
  { key: 'customers', label: 'Customers', icon: Users, gradient: 'from-emerald-500 via-emerald-600 to-teal-600', to: '/admin/customers' },
  { key: 'aov', label: 'Avg. order value', icon: TrendingUp, gradient: 'from-amber-500 via-orange-500 to-orange-600', to: '/admin/analytics' },
];

const DashboardPage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [range, setRange] = useState(defaultRange);
  const [pickerOpen, setPickerOpen] = useState(false);
  const requestRef = useRef(0);
  const { settings } = useSite();

  const fetchDashboard = async (silent = false, target = null) => {
    const active = target || range;
    const requestId = ++requestRef.current;
    if (silent) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const response = await adminAPI.getDashboard({ from: active.from, to: active.to });
      if (requestId !== requestRef.current) return;
      setData(response.data || {});
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setError(err.message || 'Failed to load dashboard');
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => { fetchDashboard(); }, []);

  const applyRange = next => {
    setRange(next);
    setPickerOpen(false);
    fetchDashboard(false, next);
  };

  const stats = data?.stats || {};
  const inventory = stats.products || {};
  const orders = stats.orders || {};
  const revenue = stats.revenue || {};
  const users = stats.users || {};
  const chartData = useMemo(() => {
    const raw = (data?.salesPeriod || []).map(item => ({
      date: item._id,
      revenue: Number(item.revenue || 0),
      orders: Number(item.count || 0),
    }));
    const from = data?.period?.from || range.from;
    const to = data?.period?.to || range.to;
    const map = new Map(raw.map(r => [r.date, r]));
    const out = [];
    let cursor = from;
    let guard = 0;
    while (cursor && to && cursor <= to && guard < 400) {
      out.push(map.get(cursor) || { date: cursor, revenue: 0, orders: 0 });
      cursor = addDaysKey(cursor, 1);
      guard += 1;
    }
    return out.length ? out : raw;
  }, [data, range]);

  const recentOrders = data?.recentOrders || [];
  const topProducts = data?.topProducts || [];
  const newCustomers = data?.newCustomers || [];
  const lowStockProducts = data?.lowStockProducts || [];
  const byStatus = orders.byStatus || [];
  const payments = stats.payments || [];
  const totalStatus = byStatus.reduce((s, r) => s + Number(r.count || 0), 0);
  const paidTotal = payments.filter(p => p._id === 'paid').reduce((s, p) => s + Number(p.total || 0), 0);
  const effectiveFrom = data?.period?.from || range.from;
  const effectiveTo = data?.period?.to || range.to;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const kpiValues = {
    revenue: { value: formatPrice(revenue.period ?? 0, settings), caption: `${formatPrice(revenue.today || 0, settings)} today`, delta: pctChange(revenue.period, revenue.previousPeriod), spark: chartData.map(d => d.revenue) },
    orders: { value: Number(orders.period ?? orders.total ?? 0).toLocaleString(), caption: `${Number(orders.today || 0)} today · ${Number(orders.total || 0).toLocaleString()} all-time`, delta: pctChange(orders.period, orders.previousPeriod), spark: chartData.map(d => d.orders) },
    customers: { value: Number(users.total || 0).toLocaleString(), caption: `${Number(users.today || 0)} new today`, delta: null, spark: chartData.map(d => d.orders) },
    aov: { value: formatPrice(revenue.avgOrderValue || 0, settings), caption: `${formatPrice(paidTotal || revenue.total || 0, settings)} lifetime paid`, delta: null, spark: chartData.map(d => d.revenue) },
  };

  const attention = [
    Number(inventory.lowStock || 0) > 0 && { label: `${inventory.lowStock} low-stock`, to: '/admin/inventory?status=low_stock' },
    Number(inventory.outOfStock || 0) > 0 && { label: `${inventory.outOfStock} out of stock`, to: '/admin/inventory?status=out_of_stock' },
    Number(stats.vendors?.pending || 0) > 0 && { label: `${stats.vendors.pending} vendors to review`, to: '/admin/vendors?status=pending' },
    Number(stats.support?.openTickets || 0) > 0 && { label: `${stats.support.openTickets} open tickets`, to: '/admin/support' },
    Number(stats.reviews?.pending || 0) > 0 && { label: `${stats.reviews.pending} reviews to moderate`, to: '/admin/reviews' },
    Number(stats.returns?.pending || 0) > 0 && { label: `${stats.returns.pending} open returns`, to: '/admin/returns' },
    Number(stats.refunds?.pending || 0) > 0 && { label: `${stats.refunds.pending} refunds pending`, to: '/admin/refunds' },
  ].filter(Boolean);

  const actionCenter = [
    { icon: PackageCheck, label: 'To fulfil', count: orders.pending, to: '/admin/orders?status=pending', tone: 'text-indigo-600 bg-indigo-50' },
    { icon: Store, label: 'Vendor review', count: stats.vendors?.pending, to: '/admin/vendors?status=pending', tone: 'text-violet-600 bg-violet-50' },
    { icon: LifeBuoy, label: 'Open tickets', count: stats.support?.openTickets, to: '/admin/support', tone: 'text-sky-600 bg-sky-50' },
    { icon: Star, label: 'Reviews', count: stats.reviews?.pending, to: '/admin/reviews', tone: 'text-amber-600 bg-amber-50' },
    { icon: RotateCcw, label: 'Returns', count: stats.returns?.pending, to: '/admin/returns', tone: 'text-orange-600 bg-orange-50' },
    { icon: Wallet, label: 'Refunds', count: stats.refunds?.pending, to: '/admin/refunds', tone: 'text-rose-600 bg-rose-50' },
  ];

  return (
    <div className="mx-auto max-w-[1400px] space-y-3 pb-8">
      {error && <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700"><span>{error}</span><button type="button" onClick={() => fetchDashboard()} className="font-bold underline">Retry</button></div>}

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-black tracking-tight text-slate-900">{greeting}, here&apos;s your store</h1>
          <p className="text-[11px] text-slate-400">{shortDate(effectiveFrom)} – {shortDate(effectiveTo)} · vs previous period</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPickerOpen(true)} aria-haspopup="dialog"
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm transition-colors hover:border-indigo-300">
            <CalendarDays size={14} className="flex-shrink-0 text-indigo-600" />
            <span className="font-bold text-slate-700">{shortDate(range.from)} – {shortDate(range.to)}</span>
          </button>
          <button type="button" onClick={() => fetchDashboard(true)} disabled={loading || refreshing} title="Refresh"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-800 disabled:opacity-50">
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <Link to="/admin/products/new" className="hidden items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-bold text-white shadow-sm hover:bg-slate-800 sm:inline-flex"><Plus size={13} /> Product</Link>
          <Link to="/admin/coupons" className="hidden items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-2 text-[11px] font-bold text-white shadow-sm hover:opacity-95 md:inline-flex"><BadgePercent size={13} /> Coupon</Link>
        </div>
      </div>

      {!loading && attention.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50 px-3.5 py-2 text-[11px] text-amber-800">
          <span className="flex items-center gap-1.5 font-bold"><AlertTriangle size={13} className="text-amber-500" /> Needs attention</span>
          {attention.map((a, i) => <span key={a.to} className="flex items-center gap-3"><Link to={a.to} className="font-semibold hover:underline">{a.label}</Link>{i < attention.length - 1 && <span className="text-amber-300">•</span>}</span>)}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        {KPI.map(({ key, label, icon: Icon, gradient, to }) => {
          const v = kpiValues[key];
          return (
            <Link key={key} to={to} className={`group relative overflow-hidden rounded-xl bg-gradient-to-br p-3.5 text-white shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md ${gradient}`}>
              <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10 transition-transform group-hover:scale-110" />
              <div className="absolute -bottom-8 -left-4 h-20 w-20 rounded-full bg-black/10" />
              {loading ? (
                <div className="space-y-2"><div className="h-7 w-7 rounded-lg bg-white/25" /><div className="h-3 w-20 rounded bg-white/25" /><div className="h-6 w-24 rounded bg-white/25" /></div>
              ) : (
                <div className="relative">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 backdrop-blur"><Icon size={14} /></span>
                    {v.delta !== null && <Delta value={v.delta} />}
                  </div>
                  <p className="mt-2.5 truncate text-xl font-black tracking-tight">{v.value}</p>
                  <div className="mt-0.5 flex items-end justify-between gap-2">
                    <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-white/80">{label}</p><p className="truncate text-[10px] text-white/70">{v.caption}</p></div>
                    <Sparkline points={v.spark} />
                  </div>
                </div>
              )}
            </Link>
          );
        })}
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <Card>
          <CardHead
            title="Sales performance"
            subtitle={`${Number(orders.period || 0).toLocaleString()} paid orders · ${formatPrice(revenue.period || 0, settings)} in selected range`}
            action={<Link to="/admin/analytics" className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-600 hover:bg-indigo-100">Analytics <ArrowRight size={12} /></Link>}
          />
          <div className="px-3.5 pb-3"><AreaChart data={chartData} settings={settings} loading={loading} /></div>
        </Card>

        <Card>
          <CardHead title="Order pipeline" subtitle="All-time fulfilment mix" action={<Link to="/admin/orders" className="text-[11px] font-bold text-indigo-600 hover:underline">All orders</Link>} />
          <div className="space-y-2 px-3.5 pb-3.5">
            {loading ? [1, 2, 3, 4, 5].map(i => <div key={i} className={`${SKELETON} h-7`} />)
              : byStatus.length === 0 ? <p className="py-6 text-center text-xs text-slate-400">No orders yet.</p>
                : byStatus.slice(0, 6).map(row => {
                  const meta = STATUS_META[row._id] || { label: String(row._id || '').replace(/_/g, ' '), bar: 'bg-slate-400' };
                  const pct = totalStatus ? Math.round((Number(row.count) / totalStatus) * 100) : 0;
                  return (
                    <Link key={row._id} to={`/admin/orders?status=${row._id}`} className="group block">
                      <div className="mb-1 flex items-center justify-between text-[11px]">
                        <span className="font-semibold capitalize text-slate-600 group-hover:text-slate-900">{meta.label}</span>
                        <span className="font-black text-slate-800">{Number(row.count).toLocaleString()} <span className="font-medium text-slate-400">· {pct}%</span></span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${meta.bar}`} style={{ width: `${Math.max(pct, 3)}%` }} /></div>
                    </Link>
                  );
                })}
            {!loading && payments.length > 0 && (
              <div className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-2.5">
                {payments.map(p => (
                  <span key={p._id} className="rounded-full bg-slate-50 px-2 py-1 text-[10px] font-semibold capitalize text-slate-500 ring-1 ring-slate-100">
                    {String(p._id || '').replace(/_/g, ' ')} · {Number(p.count || 0)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
        {actionCenter.map(({ icon: Icon, label, count, to, tone }) => (
          <Link key={label} to={to} className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-2.5 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-all hover:-translate-y-0.5 hover:shadow-md">
            <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${tone}`}><Icon size={15} /></span>
            <span className="min-w-0"><span className="block truncate text-sm font-black text-slate-900">{loading ? '—' : Number(count || 0).toLocaleString()}</span><span className="block truncate text-[10px] font-medium text-slate-400">{label}</span></span>
          </Link>
        ))}
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <Card>
          <CardHead title="Recent orders" subtitle="Latest store activity"
            action={<Link to="/admin/orders" className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline">View all <ArrowRight size={12} /></Link>} />
          <div className="overflow-x-auto pb-1">
            {loading ? <div className="space-y-2 px-3.5 pb-3.5">{[1, 2, 3, 4, 5].map(i => <div key={i} className={`${SKELETON} h-9`} />)}</div>
              : recentOrders.length === 0 ? <p className="flex h-28 items-center justify-center text-xs text-slate-400">No orders yet.</p>
                : (
                  <table className="w-full min-w-[560px] text-left">
                    <thead><tr className="border-y border-slate-100 bg-slate-50/70 text-[10px] uppercase tracking-wide text-slate-400">
                      <th className="px-3.5 py-2 font-semibold">Order</th><th className="px-3.5 py-2 font-semibold">Customer</th>
                      <th className="px-3.5 py-2 font-semibold">Total</th><th className="px-3.5 py-2 font-semibold">Status</th><th className="px-3.5 py-2 font-semibold">Date</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-50">
                      {recentOrders.map(order => (
                        <tr key={order._id} className="transition-colors hover:bg-indigo-50/40">
                          <td className="px-3.5 py-2 text-xs font-bold text-indigo-600">#{order.orderNumber || String(order._id || '').slice(-6).toUpperCase()}</td>
                          <td className="px-3.5 py-2"><p className="text-xs font-medium text-slate-700">{order.user?.name || 'Guest'}</p><p className="text-[10px] text-slate-400">{order.user?.email || ''}</p></td>
                          <td className="px-3.5 py-2 text-xs font-bold text-slate-900">{formatPrice(order.total, settings)}</td>
                          <td className="px-3.5 py-2"><StatusBadge status={order.orderStatus} /></td>
                          <td className="px-3.5 py-2 text-[11px] text-slate-400"><Clock className="mr-1 inline" size={11} />{formatDate(order.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
          </div>
        </Card>

        <div className="min-w-0 space-y-3">
          <Card>
            <CardHead title="Top products" subtitle="Best sellers · selected range" action={<Link to="/admin/analytics" className="text-[11px] font-bold text-indigo-600 hover:underline">More</Link>} />
            <div className="space-y-1 px-2.5 pb-3">
              {loading ? [1, 2, 3].map(i => <div key={i} className={`${SKELETON} h-11`} />)
                : topProducts.length === 0 ? <p className="py-4 text-center text-[11px] text-slate-400">No paid sales in this period.</p>
                  : topProducts.map((p, i) => (
                    <div key={`${p.title}-${i}`} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-slate-50">
                      <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md text-[10px] font-black ${i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{i + 1}</span>
                      {p.image
                        ? <img src={p.image} alt="" className="h-8 w-8 flex-shrink-0 rounded-lg border border-slate-100 object-cover" loading="lazy" />
                        : <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400"><Package size={14} /></span>}
                      <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-700">{p.title || 'Untitled item'}</span><span className="text-[10px] text-slate-400">{Number(p.qty || 0)} sold</span></span>
                      <span className="flex-shrink-0 text-xs font-black text-slate-900">{formatPrice(p.revenue || 0, settings)}</span>
                    </div>
                  ))}
            </div>
          </Card>

          <Card>
            <CardHead title="Inventory alerts" subtitle="Restock before they run out" action={<Link to="/admin/inventory?status=low_stock" className="text-[11px] font-bold text-indigo-600 hover:underline">Inventory</Link>} />
            <div className="space-y-1.5 px-3.5 pb-3.5">
              {loading ? [1, 2].map(i => <div key={i} className={`${SKELETON} h-9`} />)
                : lowStockProducts.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5"><CheckCircle2 size={15} className="flex-shrink-0 text-emerald-500" /><p className="text-[11px] font-semibold text-emerald-700">Inventory looks healthy</p></div>
                ) : lowStockProducts.slice(0, 5).map(product => {
                  const critical = Number(product.stock) <= 2;
                  return (
                    <Link key={product._id} to={`/admin/inventory?status=low_stock&search=${encodeURIComponent(product.title || '')}`}
                      className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 ${critical ? 'bg-red-50' : 'bg-amber-50/70'}`}>
                      <span className={`truncate text-[11px] font-semibold ${critical ? 'text-red-800' : 'text-amber-800'}`}>{product.title}</span>
                      <span className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-black ${critical ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{product.stock} left</span>
                    </Link>
                  );
                })}
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHead title="New customers" subtitle="Fresh faces" action={<Link to="/admin/customers" className="text-[11px] font-bold text-indigo-600 hover:underline">All</Link>} />
          <div className="space-y-1 px-2.5 pb-3">
            {loading ? [1, 2, 3].map(i => <div key={i} className={`${SKELETON} h-9`} />)
              : newCustomers.length === 0 ? <p className="py-4 text-center text-[11px] text-slate-400">No customers yet.</p>
                : newCustomers.map(c => (
                  <div key={c._id} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5">
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-[10px] font-black text-white">{(c.name || 'G').charAt(0).toUpperCase()}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-700">{c.name || 'Guest'}</span><span className="block truncate text-[10px] text-slate-400">{c.email || ''}</span></span>
                    <span className="flex-shrink-0 text-[10px] text-slate-400">{formatDate(c.createdAt)}</span>
                  </div>
                ))}
          </div>
        </Card>

        <Card>
          <CardHead title="Catalog health" subtitle="Live assortment" action={<Link to="/admin/products" className="text-[11px] font-bold text-indigo-600 hover:underline">Catalog</Link>} />
          <div className="grid grid-cols-2 gap-2 px-3.5 pb-3.5">
            {[
              { label: 'Live products', value: inventory.total, tone: 'bg-indigo-50 text-indigo-700' },
              { label: 'Healthy', value: inventory.healthy, tone: 'bg-emerald-50 text-emerald-700' },
              { label: 'Low stock', value: inventory.lowStock, tone: 'bg-amber-50 text-amber-700' },
              { label: 'Out of stock', value: inventory.outOfStock, tone: 'bg-red-50 text-red-700' },
            ].map(row => (
              <div key={row.label} className={`rounded-lg px-2.5 py-2 ${row.tone}`}>
                <p className="text-base font-black">{loading ? '—' : Number(row.value || 0).toLocaleString()}</p>
                <p className="text-[10px] font-semibold opacity-80">{row.label}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHead title="Quick actions" subtitle="One-click tasks" />
          <div className="grid grid-cols-2 gap-1.5 px-3.5 pb-3.5">
            {[
              { icon: Package, label: 'Add product', to: '/admin/products/new', tone: 'text-indigo-600 bg-indigo-50' },
              { icon: ShoppingCart, label: 'Orders', to: '/admin/orders', tone: 'text-emerald-600 bg-emerald-50' },
              { icon: Tag, label: 'Coupon', to: '/admin/coupons', tone: 'text-rose-600 bg-rose-50' },
              { icon: Boxes, label: 'Inventory', to: '/admin/inventory', tone: 'text-amber-600 bg-amber-50' },
              { icon: Headset, label: 'Campaign', to: '/admin/campaigns', tone: 'text-violet-600 bg-violet-50' },
              { icon: TrendingUp, label: 'Reports', to: '/admin/reports', tone: 'text-sky-600 bg-sky-50' },
            ].map(({ icon: Icon, label, to, tone }) => (
              <Link key={label} to={to} className="flex items-center gap-2 rounded-lg border border-slate-100 px-2.5 py-2 text-[11px] font-bold text-slate-600 transition-all hover:-translate-y-px hover:border-slate-200 hover:shadow-sm">
                <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${tone}`}><Icon size={14} /></span>{label}
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <div className="flex items-center justify-center gap-4 text-[10px] text-slate-300">
        <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Live data</span>
        {data?.generatedAt && <span>Updated {new Date(data.generatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
        <span className="inline-flex items-center gap-1"><Headset size={10} /> vs previous period</span>
      </div>

      {pickerOpen && <HotelDatePicker value={range} onApply={applyRange} onClose={() => setPickerOpen(false)} />}
    </div>
  );
};

export default DashboardPage;
