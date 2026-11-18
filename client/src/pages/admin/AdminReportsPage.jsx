import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Download,
  FileSpreadsheet,
  Layers,
  Loader2,
  Package,
  RefreshCw,
  ShoppingCart,
  Star,
  Tag,
  Users,
  WalletCards,
} from 'lucide-react';
import { adminAPI } from '../../services/api';
import toast from 'react-hot-toast';

const REPORT_META = {
  orders: { icon: ShoppingCart, tone: 'indigo', label: 'Orders', description: 'Customer, payment, fulfilment and totals.' },
  products: { icon: Package, tone: 'emerald', label: 'Products', description: 'Catalog, stock, pricing and visibility.' },
  customers: { icon: Users, tone: 'blue', label: 'Customers', description: 'Contacts, account status and registration.' },
  sales_summary: { icon: BarChart3, tone: 'rose', label: 'Sales summary', description: 'Revenue, average order value and breakdowns.' },
  categories: { icon: Layers, tone: 'amber', label: 'Categories', description: 'Hierarchy, visibility and ordering.' },
  brands: { icon: Tag, tone: 'violet', label: 'Brands', description: 'Brand catalog and ordering information.' },
  reviews: { icon: Star, tone: 'orange', label: 'Reviews', description: 'Ratings, moderation and review details.' },
  coupons: { icon: WalletCards, tone: 'cyan', label: 'Coupons', description: 'Rules, limits, usage and expiry.' },
};

const PRESETS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];
const DATE_REPORT_TYPES = ['orders', 'products', 'customers', 'sales_summary', 'reviews', 'inventory', 'returns', 'refunds', 'shipments', 'payments', 'profit'];

const TONE_CLASSES = {
  indigo: { icon: 'bg-indigo-50 text-indigo-600', active: 'border-indigo-300 bg-indigo-50/70' },
  emerald: { icon: 'bg-emerald-50 text-emerald-600', active: 'border-emerald-300 bg-emerald-50/70' },
  blue: { icon: 'bg-blue-50 text-blue-600', active: 'border-blue-300 bg-blue-50/70' },
  rose: { icon: 'bg-rose-50 text-rose-600', active: 'border-rose-300 bg-rose-50/70' },
  amber: { icon: 'bg-amber-50 text-amber-600', active: 'border-amber-300 bg-amber-50/70' },
  violet: { icon: 'bg-violet-50 text-violet-600', active: 'border-violet-300 bg-violet-50/70' },
  orange: { icon: 'bg-orange-50 text-orange-600', active: 'border-orange-300 bg-orange-50/70' },
  cyan: { icon: 'bg-cyan-50 text-cyan-600', active: 'border-cyan-300 bg-cyan-50/70' },
};

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

function humanize(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatReportDate(value) {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function Panel({ children, className = '', ...props }) {
  return <section className={`rounded-xl border border-slate-200 bg-white ${className}`} {...props}>{children}</section>;
}

function PanelHeader({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon && <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Icon size={15} /></div>}
        <div className="min-w-0"><h2 className="truncate text-sm font-bold text-slate-900">{title}</h2>{subtitle && <p className="mt-0.5 text-[11px] text-slate-400">{subtitle}</p>}</div>
      </div>
      {action}
    </div>
  );
}

function Stat({ label, value, caption, tone = 'indigo' }) {
  const toneClass = TONE_CLASSES[tone] || TONE_CLASSES.indigo;
  return <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-0.5 truncate text-base font-black text-slate-900">{value}</p><p className={`mt-0.5 truncate text-[10px] font-semibold ${toneClass.icon.split(' ')[1]}`}>{caption}</p></div>;
}

export default function AdminReportsPage() {
  const [types, setTypes] = useState([]);
  const [selectedType, setSelectedType] = useState('orders');
  const [downloading, setDownloading] = useState(false);
  const [refreshingTypes, setRefreshingTypes] = useState(false);
  const [error, setError] = useState('');
  const initialRange = getDateRange(30);
  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [endDate, setEndDate] = useState(initialRange.endDate);

  const selectedMeta = REPORT_META[selectedType] || {};
  const selectedTypeFromApi = types.find((type) => type.id === selectedType);
  const supportsDateRange = selectedTypeFromApi?.supportsDateRange ?? DATE_REPORT_TYPES.includes(selectedType);
  const reportTypes = types.length
    ? types
    : Object.entries(REPORT_META).map(([id, meta]) => ({ id, name: meta.label, description: meta.description, supportsDateRange: DATE_REPORT_TYPES.includes(id) }));

  const fetchTypes = async () => {
    setRefreshingTypes(true);
    setError('');
    try {
      const response = await adminAPI.getReportTypes();
      const nextTypes = response.data?.types || [];
      if (nextTypes.length) {
        setTypes(nextTypes);
        if (!nextTypes.some((type) => type.id === selectedType)) setSelectedType(nextTypes[0].id);
      }
    } catch (err) {
      setError(err.message || 'Failed to load report types');
    } finally {
      setRefreshingTypes(false);
    }
  };

  useEffect(() => { fetchTypes(); }, []);

  const handleDownload = async () => {
    if (!selectedType) return;
    if (supportsDateRange && startDate > endDate) {
      toast.error('Start date must be before end date');
      return;
    }
    setDownloading(true);
    try {
      const params = { type: selectedType };
      if (supportsDateRange) {
        params.startDate = startDate;
        params.endDate = endDate;
      }
      const response = await adminAPI.downloadReport(params);
      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      const disposition = response.headers['content-disposition'] || '';
      const filename = disposition.match(/filename="?([^";]+)"?/)?.[1] || `report-${selectedType}-${Date.now()}.xlsx`;
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`${selectedMeta.label || humanize(selectedType)} report downloaded`);
    } catch (err) {
      toast.error(err.message || 'Failed to download report');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-col justify-between gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end">
        <div><div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Exports</div><h1 className="text-xl font-bold tracking-tight text-slate-900">Reports</h1><p className="mt-1 text-xs text-slate-500">Choose a report, set a period, and download the complete Excel file.</p></div>
        <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={fetchTypes} disabled={refreshingTypes} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-indigo-200 hover:text-indigo-600 disabled:opacity-60" aria-label="Refresh report types" title="Refresh report types" data-testid="reports-refresh"><RefreshCw size={14} className={refreshingTypes ? 'animate-spin' : ''} /> Refresh</button><Link to="/admin/analytics" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-indigo-200 hover:text-indigo-600">View analytics <ArrowRight size={14} /></Link></div>
      </div>

      {error && <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700"><span>{error}</span><button type="button" onClick={fetchTypes} className="font-bold underline">Retry</button></div>}

      <Panel>
        <PanelHeader icon={ClipboardList} title="Choose a report" subtitle={`${reportTypes.length} export types available`} action={<span className="text-[10px] font-semibold text-slate-400">Step 1</span>} />
        <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
          {reportTypes.map((type) => {
            const meta = REPORT_META[type.id] || { icon: FileSpreadsheet, tone: 'indigo', label: type.name, description: type.description };
            const Icon = meta.icon;
            const tone = TONE_CLASSES[meta.tone] || TONE_CLASSES.indigo;
            const active = selectedType === type.id;
            return <button type="button" key={type.id} onClick={() => setSelectedType(type.id)} aria-pressed={active} data-testid={`report-type-${type.id}`} className={`group rounded-lg border p-3 text-left ${active ? tone.active : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}><div className="flex items-start justify-between gap-2"><div className={`relative flex h-8 w-8 items-center justify-center rounded-lg ${tone.icon}`}><Icon size={15} />{active && <CheckCircle2 size={12} className="absolute -right-1 -top-1 rounded-full bg-white text-indigo-500" aria-hidden="true" />}</div>{type.supportsDateRange ? <CalendarDays size={14} className="text-slate-300" aria-hidden="true" /> : <span className="h-3.5 w-3.5" aria-hidden="true" />}</div><p className="mt-2 truncate text-xs font-bold text-slate-800">{meta.label || type.name}</p><p className="mt-1 line-clamp-2 min-h-[28px] text-[10px] leading-4 text-slate-400">{type.description || meta.description}</p><span className={`mt-2 inline-flex text-[10px] font-semibold ${type.supportsDateRange ? 'text-indigo-500' : 'text-slate-400'}`}>{type.supportsDateRange ? 'Date filter available' : 'All records'}</span></button>;
          })}
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
        <Panel>
          <PanelHeader icon={CalendarDays} title={`Configure ${selectedMeta.label || humanize(selectedType)}`} subtitle={supportsDateRange ? 'Set the data period for the Excel export.' : 'This report exports the current full catalog.'} action={<span className="text-[10px] font-semibold text-slate-400">Step 2</span>} />
          <div className="space-y-3 p-4">
            {supportsDateRange ? <>
              <div className="flex flex-wrap items-center gap-2"><span className="text-[11px] font-semibold text-slate-500">Quick range:</span>{PRESETS.map((preset) => <button type="button" key={preset.days} onClick={() => { const range = getDateRange(preset.days); setStartDate(range.startDate); setEndDate(range.endDate); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-500 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600">{preset.label}</button>)}</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-[11px] font-semibold text-slate-500">Start date<input type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></label><label className="text-[11px] font-semibold text-slate-500">End date<input type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></label></div>
            </> : <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-500"><FileSpreadsheet size={18} className="text-indigo-500" /><span>This export includes all currently available records.</span></div>}
            <button type="button" onClick={handleDownload} disabled={downloading} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">{downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} {downloading ? 'Generating Excel...' : 'Download Excel'}</button>
          </div>
        </Panel>

        <Panel data-testid="reports-export-summary">
          <PanelHeader icon={BarChart3} title="Export summary" subtitle="No preview query is run on page load" />
          <div className="grid grid-cols-2 gap-2 p-3"><Stat label="Report" value={selectedMeta.label || humanize(selectedType)} caption="Selected export" tone="indigo" /><Stat label="Scope" value={supportsDateRange ? 'Filtered' : 'Full'} caption={supportsDateRange ? `${formatReportDate(startDate)} → ${formatReportDate(endDate)}` : 'All records'} tone="emerald" /><Stat label="Mode" value="Server" caption="Generated on download" tone="amber" /><Stat label="Format" value=".XLSX" caption="Excel workbook" tone="rose" /></div>
        </Panel>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-[11px] text-slate-500"><span className="inline-flex items-center gap-1.5"><CheckCircle2 size={13} className="text-emerald-500" /> Complete dataset is generated server-side when you download.</span><Link to="/admin/analytics" className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-700">Need deeper trends? Open analytics <ArrowRight size={12} /></Link></div>
    </div>
  );
}
