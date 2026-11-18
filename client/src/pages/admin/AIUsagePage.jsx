import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Download,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { aiAPI } from '../../services/api';
import toast from 'react-hot-toast';

const PRESETS = [
  { value: 7, label: '7D' },
  { value: 30, label: '30D' },
  { value: 90, label: '90D' },
];

const FEATURE_OPTIONS = [
  ['product_ai', 'Product AI'],
  ['seo', 'SEO AI'],
  ['blog', 'Blog AI'],
  ['click_tracking', 'Click Tracking AI'],
  ['chat', 'Customer Chat AI'],
  ['page_builder', 'Page Builder AI'],
];

const CREDIT_COSTS = [
  { service: 'Product AI', action: 'Image analysis, product content & product SEO', credits: 2, note: 'Per request' },
  { service: 'Site SEO AI', action: 'Generate all site SEO', credits: 50, note: 'Per request' },
  { service: 'SEO Audit', action: 'Audit site SEO', credits: 20, note: 'Per request' },
  { service: 'Bulk SEO AI', action: 'Generate SEO for products/categories/brands/blogs', credits: 2, note: 'Per item' },
  { service: 'Blog AI', action: 'Generate blog post', credits: 2, note: 'Per request' },
  { service: 'Click Tracking AI', action: 'Summarize click analytics', credits: 2, note: 'Per request' },
  { service: 'Customer Chat AI', action: 'Start a new conversation', credits: 0.25, note: 'Per conversation' },
  { service: 'Customer Chat AI', action: 'Continue an existing conversation', credits: 0.05, note: 'Per message' },
  { service: 'Page Builder AI', action: 'Plan page changes', credits: 2, note: 'Per request' },
];

const FEATURE_BAR_COLORS = ['bg-teal-600', 'bg-sky-600', 'bg-amber-500', 'bg-rose-500', 'bg-slate-800'];

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-IN');
}

function formatCredits(value) {
  return Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[154px] rounded-lg bg-slate-950 px-3 py-2 text-xs shadow-xl">
      <p className="font-bold text-white">{label}</p>
      <div className="mt-1 space-y-1">
        {payload.map((entry) => (
          <p key={entry.dataKey} className="flex items-center justify-between gap-3 text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: entry.stroke }} />
              {entry.name}
            </span>
            <span className="font-bold tabular-nums text-white">{formatNumber(entry.value)}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

function SuccessRing({ value }) {
  const pct = Math.max(0, Math.min(100, Math.round(Number(value || 0))));
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative h-14 w-14 flex-shrink-0" role="img" aria-label={`Success rate ${pct} percent`}>
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="#1e293b" strokeWidth="7" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke="#2dd4bf"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * circumference} ${circumference}`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-extrabold tabular-nums text-white">
        {pct}%
      </span>
    </div>
  );
}

export default function AIUsagePage() {
  const [data, setData] = useState({ summary: {}, dailyTrend: [], featureBreakdown: [], usages: [], pagination: { page: 1, pages: 1, total: 0 } });
  const [filters, setFilters] = useState({ days: 30, feature: '', status: '', search: '', page: 1 });
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchUsage = useCallback(async () => {
    setLoading(true);
    try {
      const response = await aiAPI.getUsage({ ...filters, limit: 1 });
      setData(response.data);
      setLastUpdated(new Date());
    } catch (error) {
      toast.error(error.message || 'Unable to load AI usage');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchUsage(); }, [fetchUsage]);

  const summary = data.summary || {};
  const chartData = useMemo(() => (data.dailyTrend || []).map((item) => ({
    date: item._id || '—',
    short: item._id?.slice(5) || '—',
    requests: Number(item.requests || 0),
    credits: Number(item.credits || 0),
    failed: Number(item.failed || 0),
  })), [data.dailyTrend]);

  const insights = useMemo(() => {
    const peak = chartData.reduce((best, day) => (day.requests > (best?.requests || 0) ? day : best), null);
    const total = chartData.reduce((sum, day) => sum + day.requests, 0);
    return {
      peak,
      avgPerDay: chartData.length ? Math.round(total / chartData.length) : 0,
      issues: Number(summary.failed || 0) + Number(summary.rejected || 0),
      topFeature: data.featureBreakdown?.[0] || null,
    };
  }, [chartData, data.featureBreakdown, summary.failed, summary.rejected]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await aiAPI.exportUsage({ ...filters, page: undefined, limit: undefined });
      const url = URL.createObjectURL(new Blob([response.data], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `ai-usage-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value, page: 1 }));
  const applySearch = (event) => {
    event.preventDefault();
    updateFilter('search', searchInput.trim());
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">Administration / AI</p>
          <h1 className="mt-1 text-[26px] font-extrabold leading-tight tracking-tight text-slate-950">AI usage</h1>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-slate-600">
            Spend, reliability and latency across every model call — from product copy to chat replies.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lastUpdated && (
            <span className="mr-1 hidden text-xs tabular-nums text-slate-500 sm:inline">
              Updated {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            type="button"
            onClick={fetchUsage}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950 disabled:opacity-60"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-full bg-slate-950 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            <Download size={14} /> {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      </div>

      <section className="relative overflow-hidden rounded-2xl bg-slate-950 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)', backgroundSize: '18px 18px' }}
        />
        <div className="relative grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] lg:items-center">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-slate-400">Net credits spent · last {filters.days} days</p>
            <p className="mt-1 truncate text-[42px] font-black leading-none tracking-tight tabular-nums">
              {loading && !summary.requests ? '—' : formatNumber(summary.netCredits)}
            </p>
            <p className="mt-2 text-xs tabular-nums text-slate-400">
              {formatCredits(summary.creditsRefunded)} refunded · {formatNumber(summary.requests)} total requests
            </p>
            <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              {formatNumber(summary.success)} successful
            </p>
          </div>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-white/10 sm:grid-cols-4">
            <div className="bg-slate-950 p-4">
              <p className="text-[11px] font-medium text-slate-400">Requests</p>
              <p className="mt-1 text-xl font-extrabold tabular-nums">{formatNumber(summary.requests)}</p>
              <p className="mt-1 text-[11px] tabular-nums text-slate-500">~{formatNumber(insights.avgPerDay)} / day</p>
            </div>
            <div className="flex items-center gap-3 bg-slate-950 p-4">
              <SuccessRing value={summary.successRate} />
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-400">Success</p>
                <p className="mt-0.5 text-[11px] leading-snug tabular-nums text-slate-500">{formatNumber(insights.issues)} need attention</p>
              </div>
            </div>
            <div className="bg-slate-950 p-4">
              <p className="text-[11px] font-medium text-slate-400">Avg latency</p>
              <p className="mt-1 text-xl font-extrabold tabular-nums">{formatNumber(summary.avgDurationMs)}<span className="ml-1 text-[11px] font-semibold text-slate-500">ms</span></p>
              <p className="mt-1 text-[11px] text-slate-500">per request</p>
            </div>
            <div className="bg-slate-950 p-4">
              <p className="text-[11px] font-medium text-slate-400">Balance left</p>
              <p className="mt-1 text-xl font-extrabold tabular-nums text-teal-300">{formatCredits(summary.currentCredits)}</p>
              <p className="mt-1 text-[11px] text-slate-500">shared wallet</p>
            </div>
          </div>
        </div>
        <div className="relative flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-white/10 px-5 py-3 text-xs sm:px-6">
          <span className="text-slate-400">
            Peak day <span className="ml-1 font-bold tabular-nums text-white">{insights.peak ? `${insights.peak.date} · ${formatNumber(insights.peak.requests)}` : '—'}</span>
          </span>
          <span className="text-slate-400">
            Top feature <span className="ml-1 font-bold text-white">{insights.topFeature?.label || '—'}</span>
          </span>
          {insights.issues > 0 && (
            <span className="inline-flex items-center gap-1 font-semibold text-amber-300">
              <AlertTriangle size={13} /> {formatNumber(insights.issues)} failed or rejected
            </span>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-1 self-start rounded-full bg-slate-100 p-1">
          {PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => updateFilter('days', preset.value)}
              className={`rounded-full px-3.5 py-1.5 text-[11px] font-bold tabular-nums transition ${filters.days === preset.value ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
          <select
            value={filters.feature}
            onChange={(event) => updateFilter('feature', event.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none transition focus:border-teal-600"
          >
            <option value="">All features</option>
            {FEATURE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select
            value={filters.status}
            onChange={(event) => updateFilter('status', event.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 outline-none transition focus:border-teal-600"
          >
            <option value="">All statuses</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="rejected">Rejected</option>
          </select>
          <form
            onSubmit={applySearch}
            className="flex h-9 min-w-[190px] flex-1 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 transition focus-within:border-teal-600 focus-within:bg-white sm:max-w-xs"
          >
            <Search size={13} className="flex-shrink-0 text-slate-400" />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search feature, user, error…"
              className="min-w-0 flex-1 bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400"
            />
            {filters.search && (
              <button
                type="button"
                onClick={() => { setSearchInput(''); updateFilter('search', ''); }}
                className="text-slate-300 transition hover:text-slate-600"
                aria-label="Clear search"
              >
                <XCircle size={14} />
              </button>
            )}
          </form>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-5">
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm xl:col-span-3">
          <div className="flex flex-wrap items-start justify-between gap-2 px-5 pb-1 pt-4">
            <div>
              <h2 className="text-sm font-bold text-slate-950">Usage trend</h2>
              <p className="mt-0.5 text-xs text-slate-500">Requests and net credits · last {filters.days} days</p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-600">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-teal-600" /> Requests</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> Net credits</span>
            </div>
          </div>
          <div className="h-[290px] px-2 pb-1 pt-2">
            {loading && !chartData.length ? (
              <div className="flex h-full items-center justify-center px-4"><div className="h-40 w-full animate-pulse rounded-lg bg-slate-100" /></div>
            ) : chartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 12, left: -14, bottom: 0 }}>
                  <defs>
                    <linearGradient id="aiRequestsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0d9488" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#0d9488" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                  <XAxis dataKey="short" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} minTickGap={24} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} width={38} />
                  <Tooltip content={<TrendTooltip />} cursor={{ stroke: '#cbd5e1', strokeDasharray: '4 4' }} />
                  <Area type="monotone" dataKey="requests" name="Requests" stroke="#0d9488" fill="url(#aiRequestsFill)" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: '#0d9488', stroke: '#fff', strokeWidth: 2 }} />
                  <Area type="monotone" dataKey="credits" name="Net credits" stroke="#d97706" fill="transparent" strokeWidth={2} strokeDasharray="6 3" dot={false} activeDot={{ r: 3.5, fill: '#d97706', stroke: '#fff', strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center px-4 text-center">
                <div>
                  <p className="text-sm font-bold text-slate-800">Nothing here yet</p>
                  <p className="mt-1 text-xs text-slate-500">No AI usage recorded in this period — try widening the range.</p>
                </div>
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100">
            <div className="px-5 py-3">
              <p className="text-[11px] font-medium text-slate-500">Peak day</p>
              <p className="mt-0.5 truncate text-sm font-extrabold tabular-nums text-slate-950">{insights.peak ? `${insights.peak.short} · ${formatNumber(insights.peak.requests)}` : '—'}</p>
            </div>
            <div className="px-5 py-3">
              <p className="text-[11px] font-medium text-slate-500">Avg per day</p>
              <p className="mt-0.5 text-sm font-extrabold tabular-nums text-slate-950">{formatNumber(insights.avgPerDay)}</p>
            </div>
            <div className="px-5 py-3">
              <p className="text-[11px] font-medium text-slate-500">Failures</p>
              <p className={`mt-0.5 text-sm font-extrabold tabular-nums ${insights.issues > 0 ? 'text-amber-600' : 'text-slate-950'}`}>{formatNumber(insights.issues)}</p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm xl:col-span-2">
          <div className="px-5 pb-1 pt-4">
            <h2 className="text-sm font-bold text-slate-950">Where spend goes</h2>
            <p className="mt-0.5 text-xs text-slate-500">Features ranked by request volume</p>
          </div>
          <div className="px-5 py-4">
            {loading && !data.featureBreakdown?.length ? (
              <div className="space-y-4">{[1, 2, 3, 4].map((item) => <div key={item} className="h-9 animate-pulse rounded-lg bg-slate-100" />)}</div>
            ) : data.featureBreakdown?.length ? (
              <ol className="divide-y divide-slate-100">
                {data.featureBreakdown.map((item, index) => {
                  const max = Math.max(...data.featureBreakdown.map((entry) => entry.requests), 1);
                  return (
                    <li key={item._id} className="py-3 first:pt-1 last:pb-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="min-w-0 truncate text-[13px]">
                          <span className="mr-2 font-bold tabular-nums text-slate-300">{String(index + 1).padStart(2, '0')}</span>
                          <span className="font-semibold text-slate-900">{item.label}</span>
                        </p>
                        <p className="flex-shrink-0 text-sm font-extrabold tabular-nums text-slate-950">{formatNumber(item.requests)}</p>
                      </div>
                      <div className="ml-8 mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${FEATURE_BAR_COLORS[index % FEATURE_BAR_COLORS.length]}`}
                          style={{ width: `${Math.max(4, (item.requests / max) * 100)}%` }}
                        />
                      </div>
                      <div className="ml-8 mt-1 flex justify-between text-[11px] tabular-nums text-slate-500">
                        <span>{formatCredits(item.netCredits)} credits</span>
                        <span>{Math.round(item.avgDuration || 0)} ms avg</span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="py-12 text-center text-xs text-slate-500">No feature usage yet.</p>
            )}
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2 px-5 pb-3 pt-4">
          <div>
            <h2 className="text-sm font-bold text-slate-950">Credit costs</h2>
            <p className="mt-0.5 text-xs text-slate-500">What each AI service deducts from the shared wallet</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold tabular-nums text-slate-600">
            {CREDIT_COSTS.length} services
          </span>
        </div>
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="w-full min-w-[620px] text-left">
            <thead>
              <tr className="text-[11px] font-semibold text-slate-500">
                <th className="px-5 py-2.5">Service</th>
                <th className="px-4 py-2.5">What it does</th>
                <th className="px-4 py-2.5 text-right">Credits</th>
                <th className="px-5 py-2.5">Billing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {CREDIT_COSTS.map((item) => (
                <tr key={`${item.service}-${item.action}`} className="transition-colors hover:bg-slate-50">
                  <td className="whitespace-nowrap px-5 py-3 text-xs font-bold text-slate-900">{item.service}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{item.action}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <span className="inline-flex min-w-[44px] items-center justify-center rounded-full bg-slate-950 px-2.5 py-1 text-xs font-bold tabular-nums text-white">
                      {item.credits}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-500">{item.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
