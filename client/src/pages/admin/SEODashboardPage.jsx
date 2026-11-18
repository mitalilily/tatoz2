import { useState, useEffect, useCallback } from 'react';
import {
 FileText, Share2, Code, Bot, Map, Link, BarChart2, Globe, ShoppingBag, Copy,
 Search, Save, Plus, Trash2, ExternalLink,
 AlertTriangle, Check, RefreshCw, Sparkles, ClipboardCheck,
 ChevronDown, ChevronUp, Zap, Info,
 CheckCircle, AlertCircle, XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { seoAPI, merchantAPI } from '../../services/api';
import { PLATFORM_NAME, displayPlatformName } from '../../constants/branding';
import Modal from '../../components/common/Modal';

const TABS = [
 { id: 'content', label: 'Content SEO', icon: Search },
 { id: 'meta', label: 'Meta Tags', icon: FileText },
 { id: 'social', label: 'Open Graph & Social', icon: Share2 },
 { id: 'schema', label: 'Structured Data', icon: Code },
 { id: 'robots', label: 'Robots & Crawl', icon: Bot },
 { id: 'sitemap', label: 'Sitemap', icon: Map },
 { id: 'urls', label: 'URL & Redirects', icon: Link },
 { id: 'analytics', label: 'Analytics & Tracking', icon: BarChart2 },
 { id: 'google', label: 'Google Shopping', icon: ShoppingBag },
 { id: 'i18n', label: 'International', icon: Globe },
];

const DEFAULTS = {
 seo_title_template: `%s | ${PLATFORM_NAME}`,
 seo_meta_description: '',
 seo_canonical_base: '',
 seo_robots_default: 'index, follow',
 seo_favicon_url: '',
 seo_preconnect_urls: [],
 seo_og_title: '',
 seo_og_description: '',
 seo_og_image: '',
 seo_og_type: 'website',
 seo_twitter_card: 'summary_large_image',
 seo_twitter_site: '',
 seo_social_profiles: [],
 seo_organization_schema: { name: '', logo: '', url: '', socialProfiles: [], contactEmail: '', contactPhone: '' },
 seo_website_schema: { searchActionUrl: '' },
 seo_localbusiness_enabled: false,
 seo_localbusiness_schema: { name: '', address: '', phone: '', openingHours: '', latitude: '', longitude: '' },
 seo_robots_txt: 'User-agent: *\nAllow: /',
 seo_noindex_patterns: [],
 seo_sitemap_enabled: true,
 seo_sitemap_types: ['products', 'categories', 'brands', 'blog'],
 seo_sitemap_changefreq: 'weekly',
 seo_sitemap_priority: 0.8,
 seo_sitemap_custom_urls: [],
 seo_trailing_slash: false,
 seo_redirects: [],
 seo_404_title: '',
 seo_404_description: '',
 seo_ga4_id: '',
 seo_gtm_id: '',
 seo_verification_google: '',
 seo_fb_pixel: '',
 seo_custom_head_scripts: '',
 seo_custom_body_scripts: '',
 seo_default_language: 'en',
 seo_hreflang_entries: [],
};

const ROBOTS_OPTIONS = [
 'index, follow',
 'noindex, follow',
 'index, nofollow',
 'noindex, nofollow',
];

const CHANGEFREQ_OPTIONS = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'];

const LANGUAGES = [
 { code: 'en', label: 'English' }, { code: 'hi', label: 'Hindi' },
 { code: 'es', label: 'Spanish' }, { code: 'fr', label: 'French' },
 { code: 'de', label: 'German' }, { code: 'ja', label: 'Japanese' },
 { code: 'zh', label: 'Chinese' }, { code: 'ar', label: 'Arabic' },
 { code: 'pt', label: 'Portuguese' }, { code: 'ru', label: 'Russian' },
 { code: 'ko', label: 'Korean' }, { code: 'it', label: 'Italian' },
];

// ─── Reusable sub-components ────────────────────────────────────────

const Card = ({ title, description, children }) => (
 <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
 {title && (
 <div className="mb-3">
 <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
 {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
 </div>
 )}
 {children}
 </div>
);

const Field = ({ label, hint, children }) => (
 <div className="min-w-0">
 <label className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
 {children}
 {hint && <p className="text-[11px] leading-snug text-gray-400 mt-1">{hint}</p>}
 </div>
);

const CharCount = ({ value, max }) => {
 const len = (value || '').length;
 return (
 <span className={`text-xs ${len > max ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
 {len}/{max}
 </span>
 );
};

const Toggle = ({ checked, onChange, label }) => (
 <label className="flex items-center gap-2.5 cursor-pointer">
 <button
 type="button"
 role="switch"
 aria-checked={checked}
 onClick={() => onChange(!checked)}
 className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-indigo-600' : 'bg-gray-200'}`}
 >
 <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
 </button>
 {label && <span className="text-xs font-medium text-gray-700">{label}</span>}
 </label>
);

// Credit badge shown on AI action buttons — single source for the numbers in UI.
const CreditBadge = ({ value, tone }) => (
 <span
 title={`${value} AI credits`}
 className={`inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-full font-bold leading-none ${
 tone === 'amber' ? 'bg-amber-200 text-amber-800' : 'bg-purple-200 text-purple-800'
 }`}
 >
 <Zap size={10} strokeWidth={2.5} />
 {value}
 </span>
);

const AI_AUDIT_CREDITS = 20;
const AI_SEO_CREDITS = 50;
const ITEM_SEO_CREDITS = 2;
const getApiErrorMessage = (error, fallback) => error?.response?.data?.message || error?.message || fallback;

// ─── Main component ─────────────────────────────────────────────────

const SEODashboardPage = () => {
 const [activeTab, setActiveTab] = useState('meta');
 const [settings, setSettings] = useState(DEFAULTS);
 const [loading, setLoading] = useState(true);
 const [loadError, setLoadError] = useState('');
 const [saving, setSaving] = useState(false);
 const [saveError, setSaveError] = useState('');
 const [googleSaveHandler, setGoogleSaveHandler] = useState(null);
 const registerGoogleSave = useCallback((handler) => setGoogleSaveHandler(() => handler), []);
 const [dirty, setDirty] = useState(false);
 const [aiGenerating, setAiGenerating] = useState(false);
 const [aiAuditing, setAiAuditing] = useState(false);
 const [auditResult, setAuditResult] = useState(null);
 const [showAuditModal, setShowAuditModal] = useState(false);

 const setField = useCallback((key, value) => {
 setSettings((s) => ({ ...s, [key]: value }));
 setDirty(true);
 }, []);

 const setNested = useCallback((parentKey, childKey, value) => {
 setSettings((s) => ({
 ...s,
 [parentKey]: { ...s[parentKey], [childKey]: value },
 }));
 setDirty(true);
 }, []);

 const addListItem = useCallback((key, template) => {
 setSettings((s) => ({ ...s, [key]: [...(s[key] || []), template] }));
 setDirty(true);
 }, []);

 const removeListItem = useCallback((key, index) => {
 setSettings((s) => ({ ...s, [key]: s[key].filter((_, i) => i !== index) }));
 setDirty(true);
 }, []);

 const updateListItem = useCallback((key, index, value) => {
 setSettings((s) => ({
 ...s,
 [key]: s[key].map((item, i) => (i === index ? value : item)),
 }));
 setDirty(true);
 }, []);

 // Load settings. Defaults keep the editor usable if an older deployment has no SEO rows yet.
 const loadSettings = useCallback(async () => {
  setLoading(true);
  setLoadError('');
  try {
   const { data } = await seoAPI.getSettings();
   const payload = data?.settings || data || {};
   setSettings((prev) => {
    const merged = { ...prev };
    Object.entries(payload).forEach(([key, value]) => {
     if (key in merged) merged[key] = key === 'seo_title_template' || key === 'seo_og_title' || key === 'seo_404_title'
      ? displayPlatformName(value)
      : key === 'seo_organization_schema' || key === 'seo_localbusiness_schema'
       ? { ...value, name: displayPlatformName(value?.name) }
       : value;
    });
    return merged;
   });
   setDirty(false);
  } catch (err) {
   setLoadError(err.message || 'Unable to load SEO settings');
  } finally {
   setLoading(false);
  }
 }, []);

 useEffect(() => { loadSettings(); }, [loadSettings]);

 // Save
 const handleSave = async () => {
 if (activeTab === 'google') {
  if (googleSaveHandler) await googleSaveHandler();
  return;
 }
 setSaving(true);
 setSaveError('');
 try {
 const { data } = await seoAPI.updateSettings(settings);
 if (data?.settings) {
  setSettings((prev) => ({ ...prev, ...data.settings }));
 }
 toast.success('SEO settings saved');
 setDirty(false);
 } catch (err) {
 const message = err.response?.data?.message || err.message || 'Failed to save settings';
 setSaveError(message);
 toast.error(message);
 } finally {
 setSaving(false);
 }
 };

 // AI SEO Generate
 const handleAiGenerate = async () => {
 if (!window.confirm('AI SEO will analyze your site and update all SEO fields (except third-party IDs like GA4, Pixel, etc). This costs 50 AI credits. Continue?')) return;
 setAiGenerating(true);
 try {
 const { data } = await seoAPI.aiGenerate();
 if (data.generated) {
 setSettings((prev) => {
 const merged = { ...prev };
 Object.entries(data.generated).forEach(([key, value]) => {
 if (key in merged) merged[key] = value;
 });
 return merged;
 });
 setDirty(true);
 toast.success(`AI updated ${data.fieldsUpdated} SEO fields. Review and save.`);
 }
 } catch (err) {
 const msg = getApiErrorMessage(err, 'AI generation failed');
 toast.error(msg);
 } finally {
 setAiGenerating(false);
 }
 };

 // AI SEO Audit
 const handleAiAudit = async () => {
 if (!window.confirm('SEO Audit will analyze your current settings and provide improvement suggestions. This costs 20 AI credits. Continue?')) return;
 setAiAuditing(true);
 try {
 const { data } = await seoAPI.aiAudit();
 if (data.audit) {
 setAuditResult(data.audit);
 setShowAuditModal(true);
 }
 } catch (err) {
 const msg = getApiErrorMessage(err, 'SEO audit failed');
 toast.error(msg);
 } finally {
 setAiAuditing(false);
 }
 };

 if (loading) {
 return (
 <div className="space-y-4">
 <div className="animate-pulse bg-gray-200 rounded-xl h-16 w-full" />
 <div className="animate-pulse bg-gray-200 rounded-xl h-96 w-full" />
 </div>
 );
 }

 return (
 <div className="w-full space-y-4">
 {/* Header */}
 <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm px-4 py-3 flex flex-wrap items-center justify-between gap-3">
 <div className="flex items-center gap-2.5 min-w-0">
 <div className="p-2 bg-gray-900 rounded-lg shrink-0">
 <Search size={17} className="text-white" strokeWidth={2.25} />
 </div>
 <div className="min-w-0">
 <div className="flex items-center gap-2">
 <h1 className="text-[15px] font-bold text-gray-900 leading-tight tracking-tight">SEO Dashboard</h1>
 {dirty && activeTab !== 'google' && (
 <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
 <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
 Unsaved
 </span>
 )}
 </div>
 <p className="text-xs text-gray-600">Site-wide meta, social, crawl & tracking settings</p>
 </div>
 </div>
 <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:justify-end">
 <button
 onClick={handleAiAudit}
 data-testid="seo-audit-trigger"
 disabled={aiAuditing || aiGenerating}
 title={`SEO Audit · ${AI_AUDIT_CREDITS} AI credits`}
 className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-amber-200 bg-amber-50 text-amber-700 shadow-sm hover:bg-amber-100 hover:border-amber-300 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100"
 >
 {aiAuditing ? <RefreshCw size={14} className="animate-spin" /> : <ClipboardCheck size={14} />}
 {aiAuditing ? 'Auditing...' : 'SEO Audit'}
 <CreditBadge value={AI_AUDIT_CREDITS} tone="amber" />
 </button>
 <button
 onClick={handleAiGenerate}
 data-testid="seo-ai-generate"
 disabled={aiGenerating || aiAuditing}
 title={`AI SEO · ${AI_SEO_CREDITS} AI credits`}
 className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-purple-200 bg-purple-50 text-purple-700 shadow-sm hover:bg-purple-100 hover:border-purple-300 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100"
 >
 {aiGenerating ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
 {aiGenerating ? 'Generating...' : 'AI SEO'}
 <CreditBadge value={AI_SEO_CREDITS} tone="purple" />
 </button>
 <button
 onClick={handleSave}
 disabled={saving || (!dirty && activeTab !== 'google') || (activeTab === 'google' && !googleSaveHandler)}
 className="btn-primary flex items-center gap-1.5 !py-2 !text-xs shadow-sm active:scale-[0.98] transition-transform"
 >
 {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
 {saving ? 'Saving...' : activeTab === 'google' ? 'Save Google settings' : 'Save Changes'}
 </button>
 </div>
 </div>

 {loadError && (
 <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
  <span>{loadError}. Showing local defaults; retry to load saved values.</span>
  <button onClick={loadSettings} className="font-semibold underline">Retry</button>
 </div>
 )}
 {saveError && (
  <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert" data-testid="seo-save-error">
   <span>{saveError}</span>
   <button type="button" onClick={() => setSaveError('')} className="font-semibold underline">Dismiss</button>
  </div>
 )}

 {/* Tabs */}
 <div className="bg-white rounded-xl shadow-sm border border-gray-200/80 p-1 sticky top-0 z-10">
 <div className="flex gap-0.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
 {TABS.map((tab) => {
 const Icon = tab.icon;
 const active = activeTab === tab.id;
 return (
 <button
 key={tab.id}
 data-testid={`seo-main-tab-${tab.id}`}
 onClick={() => setActiveTab(tab.id)}
 className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
 active
 ? 'bg-indigo-600 text-white shadow-sm'
 : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
 }`}
 >
 <Icon size={14} />
 {tab.label}
 </button>
 );
 })}
 </div>
 </div>

 {/* Tab Content */}
 <div className="space-y-4">
 {activeTab === 'content' && <ContentSeoTab />}
 {activeTab === 'meta' && <MetaTab settings={settings} setField={setField} addListItem={addListItem} removeListItem={removeListItem} updateListItem={updateListItem} />}
 {activeTab === 'social' && <SocialTab settings={settings} setField={setField} addListItem={addListItem} removeListItem={removeListItem} updateListItem={updateListItem} />}
 {activeTab === 'schema' && <SchemaTab settings={settings} setField={setField} setNested={setNested} addListItem={addListItem} removeListItem={removeListItem} updateListItem={updateListItem} />}
 {activeTab === 'robots' && <RobotsTab settings={settings} setField={setField} addListItem={addListItem} removeListItem={removeListItem} updateListItem={updateListItem} />}
 {activeTab === 'sitemap' && <SitemapTab settings={settings} setField={setField} addListItem={addListItem} removeListItem={removeListItem} updateListItem={updateListItem} />}
 {activeTab === 'urls' && <UrlsTab settings={settings} setField={setField} addListItem={addListItem} removeListItem={removeListItem} updateListItem={updateListItem} />}
 {activeTab === 'analytics' && <AnalyticsTab settings={settings} setField={setField} />}
 {activeTab === 'google' && <GoogleShoppingTab onRegisterSave={registerGoogleSave} />}
 {activeTab === 'i18n' && <I18nTab settings={settings} setField={setField} addListItem={addListItem} removeListItem={removeListItem} updateListItem={updateListItem} />}
 </div>

 {/* Audit Modal */}
 {showAuditModal && auditResult && (
 <AuditModal audit={auditResult} onClose={() => setShowAuditModal(false)} />
 )}
 </div>
 );
};

// ─── Audit Modal ────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
 critical: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', badge: 'bg-red-100 text-red-700' },
 warning: { icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700' },
 info: { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700' },
 pass: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', badge: 'bg-green-100 text-green-700' },
};

const STATUS_COLORS = {
 critical: 'text-red-600',
 warning: 'text-amber-600',
 good: 'text-green-600',
};

const ScoreRing = ({ score }) => {
 const radius = 32;
 const circumference = 2 * Math.PI * radius;
 const offset = circumference - (score / 100) * circumference;
 const color = score >= 80 ? '#16a34a' : score >= 50 ? '#d97706' : '#dc2626';
 return (
 <div className="relative inline-flex items-center justify-center shrink-0">
 <svg width="80" height="80" className="-rotate-90">
 <circle cx="40" cy="40" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="7" />
 <circle cx="40" cy="40" r={radius} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} className="transition-all duration-700" />
 </svg>
 <span className="absolute text-xl font-bold" style={{ color }}>{score}</span>
 </div>
 );
};

const AuditCategory = ({ category }) => {
 const [expanded, setExpanded] = useState(true);
 const statusColor = STATUS_COLORS[category.status] || 'text-gray-600';

 return (
 <div className="border border-gray-200 rounded-xl overflow-hidden">
 <button
 onClick={() => setExpanded(!expanded)}
 className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
 >
 <div className="flex items-center gap-3">
 <span className={`text-sm font-bold ${statusColor}`}>{category.score}/100</span>
 <span className="text-sm font-semibold text-gray-900">{category.name}</span>
 <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor} ${category.status === 'critical' ? 'bg-red-50' : category.status === 'warning' ? 'bg-amber-50' : 'bg-green-50'}`}>
 {category.status}
 </span>
 </div>
 {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
 </button>
 {expanded && (
 <div className="divide-y divide-gray-100">
 {(category.findings || []).map((finding, i) => {
 const cfg = SEVERITY_CONFIG[finding.severity] || SEVERITY_CONFIG.info;
 const SevIcon = cfg.icon;
 return (
 <div key={i} className={`px-4 py-3 ${cfg.bg}`}>
 <div className="flex items-start gap-3">
 <SevIcon size={18} className={`${cfg.color} mt-0.5 shrink-0`} />
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-1">
 <span className="text-sm font-medium text-gray-900">{finding.title}</span>
 <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${cfg.badge}`}>{finding.severity}</span>
 </div>
 <p className="text-sm text-gray-600">{finding.description}</p>
 {finding.recommendation && (
 <div className="mt-2 flex items-start gap-1.5">
 <Zap size={13} className="text-indigo-500 mt-0.5 shrink-0" />
 <p className="text-sm text-indigo-700 font-medium">{finding.recommendation}</p>
 </div>
 )}
 {finding.currentValue && finding.suggestedValue && (
 <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
 <div className="bg-white/60 rounded-lg px-3 py-2">
 <span className="text-gray-500 block mb-0.5">Current</span>
 <code className="text-gray-800 break-all">{typeof finding.currentValue === 'object' ? JSON.stringify(finding.currentValue) : String(finding.currentValue)}</code>
 </div>
 <div className="bg-white/60 rounded-lg px-3 py-2">
 <span className="text-gray-500 block mb-0.5">Suggested</span>
 <code className="text-indigo-700 break-all">{typeof finding.suggestedValue === 'object' ? JSON.stringify(finding.suggestedValue) : String(finding.suggestedValue)}</code>
 </div>
 </div>
 )}
 </div>
 </div>
 </div>
 );
 })}
 </div>
 )}
 </div>
 );
};

const AuditModal = ({ audit, onClose }) => {
 const findings = (audit.categories || []).flatMap(category => category.findings || []);
 const counts = findings.reduce((result, finding) => {
  const severity = ['critical', 'warning', 'pass'].includes(finding.severity) ? finding.severity : 'info';
  result[severity] += 1;
  return result;
 }, { critical: 0, warning: 0, pass: 0, info: 0 });
 const stats = audit.siteStats || {};
 const source = audit.auditMeta?.source === 'ai' ? 'AI analysis' : 'Fast local checks';

 return (
  <Modal
   isOpen
   onClose={onClose}
   title="SEO Audit Report"
   drawer
   wide
   testId="seo-audit-panel"
   className="bg-slate-50"
  >
   <div data-testid="seo-audit-content" className="space-y-5">
    <div className="flex items-start gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
     <ScoreRing score={audit.overallScore || 0} />
     <div className="min-w-0 flex-1">
      <div className="mb-1 flex flex-wrap items-center gap-2">
       <h3 className="text-sm font-semibold text-gray-900">Overall SEO health</h3>
       <span data-testid="seo-audit-source" className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">{source}</span>
       {audit.auditMeta?.cached && <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">cached</span>}
      </div>
      <p className="text-sm leading-6 text-gray-600">{audit.summary}</p>
      {audit.auditMeta?.durationMs !== undefined && (
       <p className="mt-2 text-[11px] text-gray-400">Completed in {Math.max(0, Math.round(audit.auditMeta.durationMs))} ms</p>
      )}
     </div>
    </div>

    <div data-testid="seo-audit-severity-stats" className="grid grid-cols-3 gap-2">
     <div data-testid="seo-audit-critical-count" className="rounded-xl border border-red-100 bg-red-50 px-3 py-2.5"><p className="text-[11px] font-semibold uppercase tracking-wide text-red-600">Critical</p><p className="mt-1 text-xl font-bold text-red-700">{counts.critical}</p></div>
     <div data-testid="seo-audit-warning-count" className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5"><p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">Warnings</p><p className="mt-1 text-xl font-bold text-amber-700">{counts.warning}</p></div>
     <div data-testid="seo-audit-pass-count" className="rounded-xl border border-green-100 bg-green-50 px-3 py-2.5"><p className="text-[11px] font-semibold uppercase tracking-wide text-green-600">Passed</p><p className="mt-1 text-xl font-bold text-green-700">{counts.pass}</p></div>
    </div>

    <div data-testid="seo-audit-site-stats" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
     {[
      ['Products', stats.totalProducts],
      ['Categories', stats.totalCategories],
      ['Published posts', stats.totalBlogPosts],
      ['Content gaps', Number(stats.productsWithoutSeoMeta || 0) + Number(stats.productsWithoutImageAlt || 0)],
     ].map(([label, value]) => <div key={label} className="rounded-xl border border-gray-200 bg-white px-3 py-2.5"><p className="text-[11px] text-gray-500">{label}</p><p className="mt-1 text-lg font-bold text-gray-900">{Number(value || 0).toLocaleString()}</p></div>)}
    </div>

    {audit.quickWins?.length > 0 && (
     <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-indigo-900"><Zap size={15} /> Quick wins</h3>
      <ul className="space-y-1.5">{audit.quickWins.map((win, i) => <li key={i} className="flex items-start gap-2 text-sm text-indigo-800"><CheckCircle size={14} className="mt-0.5 shrink-0 text-indigo-500" />{win}</li>)}</ul>
     </div>
    )}

    {audit.missingEssentials?.length > 0 && (
     <div className="rounded-xl border border-red-200 bg-red-50 p-4">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-900"><AlertTriangle size={15} /> Missing essentials</h3>
      <ul className="space-y-1.5">{audit.missingEssentials.map((item, i) => <li key={i} className="flex items-start gap-2 text-sm text-red-800"><XCircle size={14} className="mt-0.5 shrink-0 text-red-500" />{item}</li>)}</ul>
     </div>
    )}

    {audit.categories?.length > 0 && (
     <div className="space-y-3">
      <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-gray-900">Detailed findings</h3><span className="text-xs text-gray-500">{audit.categories.length} areas checked</span></div>
      {audit.categories.map((cat, i) => <AuditCategory key={i} category={cat} />)}
     </div>
    )}

    <button data-testid="seo-audit-panel-done" onClick={onClose} className="btn-primary flex w-full items-center justify-center gap-2"><Check size={16} /> Close report</button>
   </div>
  </Modal>
 );
};

// ─── Tab: Content SEO ───────────────────────────────────────────────

const CONTENT_TYPES = [
 { id: 'products', label: 'Products' },
 { id: 'categories', label: 'Categories' },
 { id: 'brands', label: 'Brands' },
 { id: 'blog', label: 'Blog Posts' },
];

const FILTER_OPTIONS = [
 { value: 'all', label: 'All' },
 { value: 'missing', label: 'Missing SEO' },
 { value: 'complete', label: 'Complete' },
];

const scoreColor = (score) => {
 if (score >= 80) return 'bg-green-100 text-green-700';
 if (score >= 50) return 'bg-yellow-100 text-yellow-700';
 return 'bg-red-100 text-red-700';
};

const ContentSeoTab = () => {
 const [contentType, setContentType] = useState('products');
 const [items, setItems] = useState([]);
 const [total, setTotal] = useState(0);
 const [page, setPage] = useState(1);
 const [filter, setFilter] = useState('all');
 const [loadingContent, setLoadingContent] = useState(true);
 const [contentError, setContentError] = useState('');
 const [expandedId, setExpandedId] = useState(null);
 const [editSeo, setEditSeo] = useState({});
 const [savingId, setSavingId] = useState(null);
 const [generatingId, setGeneratingId] = useState(null);
 const [bulkGenerating, setBulkGenerating] = useState(false);

 const fetchItems = useCallback(async () => {
 setLoadingContent(true);
 setContentError('');
 try {
 const res = await seoAPI.getContentSeoStats({ type: contentType, page, limit: 50, filter });
 setItems(res.data.items || []);
 setTotal(res.data.total || 0);
 } catch (err) {
  setContentError(err.message || 'Unable to load content SEO data');
 } finally { setLoadingContent(false); }
 }, [contentType, page, filter]);

 useEffect(() => { fetchItems(); }, [fetchItems]);

 const handleExpand = (item) => {
 if (expandedId === item._id) {
 setExpandedId(null);
 return;
 }
 setExpandedId(item._id);
 setEditSeo({
 metaTitle: item.seo?.metaTitle || '',
 metaDescription: item.seo?.metaDescription || '',
 keywords: (item.seo?.keywords || []).join(', '),
 });
 };

 const handleSaveItem = async (item) => {
 setSavingId(item._id);
 try {
 const keywords = (editSeo.keywords || '').split(',').map(k => k.trim()).filter(Boolean);
 await seoAPI.updateItemSeo(contentType, item._id, {
 metaTitle: editSeo.metaTitle,
 metaDescription: editSeo.metaDescription,
 keywords,
 });
 toast.success('SEO updated!');
 setExpandedId(null);
 fetchItems();
 } catch (err) { toast.error(err.message); }
 finally { setSavingId(null); }
 };

 const handleGenerateItem = async (item) => {
  if (!window.confirm(`Generate AI SEO for "${item.name}"? This costs ${ITEM_SEO_CREDITS} credits.`)) return;
  setGeneratingId(item._id);
  try {
   const res = await seoAPI.generateItemSeo(contentType, item._id);
   toast.success(`AI SEO generated for ${item.name}`);
   setItems(current => current.map(row => row._id === item._id ? { ...row, seo: res.data.seo || row.seo } : row));
   if (expandedId === item._id) {
    const seo = res.data.seo || {};
    setEditSeo({ metaTitle: seo.metaTitle || '', metaDescription: seo.metaDescription || '', keywords: (seo.keywords || []).join(', ') });
   }
   await fetchItems();
  } catch (err) {
   toast.error(getApiErrorMessage(err, 'Could not generate item SEO'));
  } finally { setGeneratingId(null); }
 };

 const handleBulkGenerate = async () => {
 if (!confirm(`Generate AI SEO for all ${contentType} missing SEO data? This costs 2 credits per item.`)) return;
 setBulkGenerating(true);
 try {
 const res = await seoAPI.bulkGenerateSeo(contentType);
 toast.success(`Generated SEO for ${res.data.updated} items!`);
 fetchItems();
 } catch (err) { toast.error(err.message); }
 finally { setBulkGenerating(false); }
 };

 const totalPages = Math.ceil(total / 50);

 return (
 <div className="space-y-3">
 {/* Sub-tabs + controls */}
 <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
 <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
 <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
 {CONTENT_TYPES.map(t => (
 <button key={t.id} data-testid={`seo-content-type-${t.id}`} onClick={() => { setContentType(t.id); setPage(1); setExpandedId(null); }}
 className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${contentType === t.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
 {t.label}
 </button>
 ))}
 </div>
 <div className="flex items-center gap-2">
 <select value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }} className="input py-1.5 text-xs w-36 bg-white">
 {FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
 </select>
 <button onClick={handleBulkGenerate} disabled={bulkGenerating}
 className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5">
 {bulkGenerating ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
 {bulkGenerating ? 'Generating...' : 'AI Bulk Generate'}
 </button>
 </div>
 </div>

 <p className="text-xs text-gray-400 mb-3">{total} {contentType} total</p>
 {contentError && <div className="mb-3 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"><span>{contentError}</span><button onClick={fetchItems} className="font-semibold underline">Retry</button></div>}

 {loadingContent ? (
 <div className="flex justify-center py-10"><RefreshCw size={20} className="animate-spin text-gray-400" /></div>
 ) : items.length === 0 ? (
 <p className="text-center text-gray-400 py-8 text-sm">No items found</p>
 ) : (
 <div className="space-y-1">
 {/* Table header */}
 <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase">
 <div className="col-span-3">Name</div>
 <div className="col-span-1 text-center">Score</div>
 <div className="col-span-2">Meta Title</div>
 <div className="col-span-3">Meta Description</div>
 <div className="col-span-1 text-center">Keywords</div>
 <div className="col-span-2 text-right">Actions</div>
 </div>

 {items.map(item => (
 <div key={item._id}>
 <div onClick={() => handleExpand(item)}
 className={`grid grid-cols-12 gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-sm ${expandedId === item._id ? 'bg-indigo-50/70 border-indigo-200' : 'border-transparent hover:bg-gray-50 hover:border-gray-200'}`}>
 <div className="col-span-3 font-medium text-gray-800 truncate">{item.name}</div>
 <div className="col-span-1 flex justify-center">
 <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${scoreColor(item.seoScore)}`}>{item.seoScore}</span>
 </div>
 <div className="col-span-2 text-xs text-gray-500 truncate">{item.seo?.metaTitle || <span className="text-red-400 italic">Missing</span>}</div>
 <div className="col-span-3 text-xs text-gray-500 truncate">{item.seo?.metaDescription || <span className="text-red-400 italic">Missing</span>}</div>
 <div className="col-span-1 text-center text-xs text-gray-500">{item.seo?.keywords?.length || 0}</div>
 <div className="col-span-2 flex justify-end">
  <button
   type="button"
   data-testid={`seo-generate-${contentType}-${item._id}`}
   title={`Generate AI SEO for ${item.name}`}
   onClick={(event) => { event.stopPropagation(); handleGenerateItem(item); }}
   disabled={generatingId === item._id || bulkGenerating}
   className="inline-flex items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 px-2 py-1 text-[11px] font-semibold text-purple-700 transition-colors hover:border-purple-300 hover:bg-purple-100 disabled:cursor-wait disabled:opacity-60"
  >
   {generatingId === item._id ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
   <span>AI Generate</span>
  </button>
 </div>
 </div>

 {/* Expanded inline editor */}
 {expandedId === item._id && (
 <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 mx-2 mb-2 space-y-3">
 <div>
 <label className="text-xs font-medium text-gray-600 mb-1 block">Meta Title <span className="text-gray-400">({editSeo.metaTitle.length}/60)</span></label>
 <input value={editSeo.metaTitle} maxLength={60} onChange={e => setEditSeo(s => ({ ...s, metaTitle: e.target.value }))}
 className="input text-sm" placeholder="SEO meta title..." />
 </div>
 <div>
 <label className="text-xs font-medium text-gray-600 mb-1 block">Meta Description <span className="text-gray-400">({editSeo.metaDescription.length}/160)</span></label>
 <textarea value={editSeo.metaDescription} maxLength={160} onChange={e => setEditSeo(s => ({ ...s, metaDescription: e.target.value }))}
 className="input text-sm resize-none" rows={2} placeholder="SEO meta description..." />
 </div>
 <div>
 <label className="text-xs font-medium text-gray-600 mb-1 block">Keywords <span className="text-gray-400">(comma-separated)</span></label>
 <input value={editSeo.keywords} onChange={e => setEditSeo(s => ({ ...s, keywords: e.target.value }))}
 className="input text-sm" placeholder="keyword1, keyword2, keyword3" />
 </div>
 <div className="flex gap-2 justify-end">
 <button onClick={() => setExpandedId(null)} className="btn-secondary text-xs py-1.5 px-3">Cancel</button>
 <button onClick={() => handleSaveItem(item)} disabled={savingId === item._id} className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5">
 {savingId === item._id ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
 Save SEO
 </button>
 </div>
 </div>
 )}
 </div>
 ))}
 </div>
 )}

 {/* Pagination */}
 {totalPages > 1 && (
 <div className="flex items-center justify-center gap-2 pt-3">
 <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="btn-secondary text-xs py-1 px-2">Prev</button>
 <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
 <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="btn-secondary text-xs py-1 px-2">Next</button>
 </div>
 )}
 </div>
 </div>
 );
};

// ─── Tab: Meta Tags ─────────────────────────────────────────────────

const MetaTab = ({ settings, setField, addListItem, removeListItem, updateListItem }) => (
 <div className="space-y-4">
 <Card title="Default Meta Tags" description="These apply as fallback for pages without specific meta tags.">
 <div className="space-y-3">
 <Field label="Site Title Template" hint={`Use %s as placeholder for page title. Example: %s | ${PLATFORM_NAME}`}>
 <input className="input" value={settings.seo_title_template} onChange={(e) => setField('seo_title_template', e.target.value)} maxLength={160} placeholder={`%s | ${PLATFORM_NAME}`} data-testid="seo-title-template" />
 </Field>
 <Field label="Default Meta Description">
 <div className="flex justify-between mb-1">
 <span />
 <CharCount value={settings.seo_meta_description} max={160} />
 </div>
 <textarea className="input" rows={3} value={settings.seo_meta_description} onChange={(e) => setField('seo_meta_description', e.target.value)} maxLength={160} placeholder="Your site's default meta description..." data-testid="seo-meta-description" />
 </Field>
 <Field label="Canonical URL Base" hint="Root URL of your site (e.g. https://tatoz.com). No trailing slash.">
 <input type="url" className="input" value={settings.seo_canonical_base} onChange={(e) => setField('seo_canonical_base', e.target.value)} maxLength={2048} placeholder="https://tatoz.com" />
 </Field>
 <Field label="Default Robots Directive">
 <select className="input" value={settings.seo_robots_default} onChange={(e) => setField('seo_robots_default', e.target.value)}>
 {ROBOTS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
 </select>
 </Field>
 <Field label="Favicon URL" hint="URL or path to your favicon (e.g. /favicon.ico)">
 <input className="input" value={settings.seo_favicon_url} onChange={(e) => setField('seo_favicon_url', e.target.value)} maxLength={2048} placeholder="/favicon.ico" />
 </Field>
 </div>
 </Card>

 <Card title="Preconnect URLs" description="Add domains to preconnect for faster resource loading (fonts, CDNs, APIs).">
 <div className="space-y-3">
 {(settings.seo_preconnect_urls || []).map((url, i) => (
 <div key={i} className="flex gap-2">
 <input className="input flex-1" value={url} onChange={(e) => updateListItem('seo_preconnect_urls', i, e.target.value)} maxLength={2048} placeholder="https://fonts.googleapis.com" />
 <button onClick={() => removeListItem('seo_preconnect_urls', i)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
 </div>
 ))}
 <button onClick={() => addListItem('seo_preconnect_urls', '')} className="btn-secondary text-sm flex items-center gap-1.5">
 <Plus size={14} /> Add URL
 </button>
 </div>
 </Card>

 {/* SERP Preview */}
 <Card title="Search Engine Preview">
 <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
 <p className="text-lg text-blue-700 font-medium truncate">
 {(settings.seo_title_template || '').replace('%s', 'Page Title')}
 </p>
 <p className="text-sm text-green-700 truncate mt-0.5">
 {settings.seo_canonical_base || 'https://www.example.com'}
 </p>
 <p className="text-sm text-gray-600 mt-1 line-clamp-2">
 {settings.seo_meta_description || 'Your meta description will appear here...'}
 </p>
 </div>
 </Card>
 </div>
);

// ─── Tab: Open Graph & Social ───────────────────────────────────────

const SocialTab = ({ settings, setField, addListItem, removeListItem, updateListItem }) => (
 <div className="space-y-4">
 <Card title="Open Graph Defaults" description="Default values when sharing pages on social media.">
 <div className="space-y-3">
 <Field label="OG Title" hint="Leave empty to use the page title">
 <input className="input" value={settings.seo_og_title} onChange={(e) => setField('seo_og_title', e.target.value)} maxLength={120} placeholder={`${PLATFORM_NAME} - Premium Products`} />
 </Field>
 <Field label="OG Description">
 <textarea className="input" rows={2} value={settings.seo_og_description} onChange={(e) => setField('seo_og_description', e.target.value)} maxLength={300} placeholder="Default description for social media..." />
 </Field>
 <Field label="OG Image URL" hint="Recommended: 1200x630px. Used when no page-specific image is set.">
 <input type="url" className="input" value={settings.seo_og_image} onChange={(e) => setField('seo_og_image', e.target.value)} maxLength={2048} placeholder="https://tatoz.com/og-image.jpg" />
 </Field>
 <Field label="OG Type">
 <select className="input" value={settings.seo_og_type} onChange={(e) => setField('seo_og_type', e.target.value)}>
 <option value="website">website</option>
 <option value="article">article</option>
 <option value="product">product</option>
 </select>
 </Field>
 </div>
 </Card>

 {settings.seo_og_image && (
 <Card title="Social Share Preview">
 <div className="border border-gray-200 rounded-xl overflow-hidden max-w-md">
 <div className="aspect-[1200/630] bg-gray-100">
 <img src={settings.seo_og_image} alt="OG Preview" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
 </div>
 <div className="p-3 bg-gray-50">
 <p className="text-xs text-gray-500 uppercase">{settings.seo_canonical_base?.replace(/https?:\/\//, '') || 'example.com'}</p>
 <p className="text-sm font-semibold text-gray-900 mt-0.5 truncate">{settings.seo_og_title || 'Page Title'}</p>
 <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{settings.seo_og_description || 'Page description'}</p>
 </div>
 </div>
 </Card>
 )}

 <Card title="Twitter Card" description="How your content appears when shared on Twitter/X.">
 <div className="space-y-3">
 <Field label="Card Type">
 <select className="input" value={settings.seo_twitter_card} onChange={(e) => setField('seo_twitter_card', e.target.value)}>
 <option value="summary">summary</option>
 <option value="summary_large_image">summary_large_image</option>
 </select>
 </Field>
 <Field label="Twitter Handle" hint="Your Twitter @handle (e.g. @tatoz)">
 <input className="input" value={settings.seo_twitter_site} onChange={(e) => setField('seo_twitter_site', e.target.value)} maxLength={120} placeholder="@tatoz" />
 </Field>
 </div>
 </Card>

 <Card title="Social Profile URLs" description="Used in Organization schema and social meta tags.">
 <div className="space-y-3">
 {(settings.seo_social_profiles || []).map((url, i) => (
 <div key={i} className="flex gap-2">
 <input type="url" className="input flex-1" value={url} onChange={(e) => updateListItem('seo_social_profiles', i, e.target.value)} maxLength={2048} placeholder="https://facebook.com/tatoz" />
 <button onClick={() => removeListItem('seo_social_profiles', i)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
 </div>
 ))}
 <button onClick={() => addListItem('seo_social_profiles', '')} className="btn-secondary text-sm flex items-center gap-1.5">
 <Plus size={14} /> Add Profile
 </button>
 </div>
 </Card>
 </div>
);

// ─── Tab: Structured Data ───────────────────────────────────────────

const SchemaTab = ({ settings, setNested, setField }) => {
 const org = {
  ...(settings.seo_organization_schema || {}),
  socialProfiles: settings.seo_social_profiles?.length
   ? settings.seo_social_profiles
   : (settings.seo_organization_schema?.socialProfiles || []),
 };
 const website = settings.seo_website_schema || {};
 const lb = settings.seo_localbusiness_schema || {};

 const buildOrgSchema = () => {
 const schema = {
 '@context': 'https://schema.org',
 '@type': 'Organization',
 name: org.name || '',
 url: org.url || '',
 logo: org.logo || '',
 contactPoint: org.contactEmail ? { '@type': 'ContactPoint', email: org.contactEmail, telephone: org.contactPhone || '' } : undefined,
 sameAs: org.socialProfiles || [],
 };
 return JSON.stringify(schema, null, 2);
 };

 const buildWebsiteSchema = () => {
 const schema = {
 '@context': 'https://schema.org',
 '@type': 'WebSite',
 url: settings.seo_canonical_base || '',
 potentialAction: website.searchActionUrl ? {
 '@type': 'SearchAction',
 target: { '@type': 'EntryPoint', urlTemplate: website.searchActionUrl },
 'query-input': 'required name=search_term_string',
 } : undefined,
 };
 return JSON.stringify(schema, null, 2);
 };

 return (
 <div className="space-y-4">
 <Card title="Organization Schema" description="Tells search engines about your business.">
 <div className="space-y-3">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <Field label="Organization Name">
 <input className="input" value={org.name || ''} onChange={(e) => setNested('seo_organization_schema', 'name', e.target.value)} maxLength={160} placeholder={PLATFORM_NAME} />
 </Field>
 <Field label="Website URL">
 <input type="url" className="input" value={org.url || ''} onChange={(e) => setNested('seo_organization_schema', 'url', e.target.value)} maxLength={2048} placeholder="https://tatoz.com" />
 </Field>
 <Field label="Logo URL">
 <input type="url" className="input" value={org.logo || ''} onChange={(e) => setNested('seo_organization_schema', 'logo', e.target.value)} maxLength={2048} placeholder="https://tatoz.com/logo.png" />
 </Field>
 <Field label="Contact Email">
 <input type="email" className="input" value={org.contactEmail || ''} onChange={(e) => setNested('seo_organization_schema', 'contactEmail', e.target.value)} maxLength={160} placeholder="contact@tatoz.com" />
 </Field>
 <Field label="Contact Phone">
 <input type="tel" className="input" value={org.contactPhone || ''} onChange={(e) => setNested('seo_organization_schema', 'contactPhone', e.target.value)} maxLength={30} placeholder="+91-XXXXX-XXXXX" />
 </Field>
 </div>
 <div className="mt-4">
 <p className="text-xs font-medium text-gray-500 mb-2">JSON-LD Preview</p>
 <pre className="bg-gray-900 text-green-400 p-4 rounded-xl text-xs overflow-x-auto leading-relaxed">{buildOrgSchema()}</pre>
 </div>
 </div>
 </Card>

 <Card title="WebSite Schema" description="Enables sitelinks search box in Google results.">
 <div className="space-y-3">
 <Field label="Search Action URL Template" hint="URL with {search_term_string} placeholder. Example: https://tatoz.com/search?q={search_term_string}">
 <input type="url" className="input" value={website.searchActionUrl || ''} onChange={(e) => setNested('seo_website_schema', 'searchActionUrl', e.target.value)} maxLength={2048} placeholder="https://tatoz.com/search?q={search_term_string}" />
 </Field>
 <div>
 <p className="text-xs font-medium text-gray-500 mb-2">JSON-LD Preview</p>
 <pre className="bg-gray-900 text-green-400 p-4 rounded-xl text-xs overflow-x-auto leading-relaxed">{buildWebsiteSchema()}</pre>
 </div>
 </div>
 </Card>

 <Card title="LocalBusiness Schema" description="Use if you have a physical store location.">
 <div className="space-y-3">
 <Toggle checked={settings.seo_localbusiness_enabled} onChange={(v) => setField('seo_localbusiness_enabled', v)} label="Enable LocalBusiness schema" />
 {settings.seo_localbusiness_enabled && (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
 <Field label="Business Name">
 <input className="input" value={lb.name || ''} onChange={(e) => setNested('seo_localbusiness_schema', 'name', e.target.value)} maxLength={160} placeholder={`${PLATFORM_NAME} Store`} />
 </Field>
 <Field label="Phone Number">
 <input type="tel" className="input" value={lb.phone || ''} onChange={(e) => setNested('seo_localbusiness_schema', 'phone', e.target.value)} maxLength={30} placeholder="+91-XXXXX-XXXXX" />
 </Field>
 <Field label="Address" hint="Full street address">
 <input className="input" value={lb.address || ''} onChange={(e) => setNested('seo_localbusiness_schema', 'address', e.target.value)} maxLength={500} placeholder="123 Main St, City, State, ZIP" />
 </Field>
 <Field label="Opening Hours" hint="e.g. Mo-Fr 09:00-18:00">
 <input className="input" value={lb.openingHours || ''} onChange={(e) => setNested('seo_localbusiness_schema', 'openingHours', e.target.value)} maxLength={300} placeholder="Mo-Fr 09:00-18:00" />
 </Field>
 <Field label="Latitude">
 <input className="input" type="number" min="-90" max="90" step="any" value={lb.latitude || ''} onChange={(e) => setNested('seo_localbusiness_schema', 'latitude', e.target.value)} placeholder="28.6139" />
 </Field>
 <Field label="Longitude">
 <input className="input" type="number" min="-180" max="180" step="any" value={lb.longitude || ''} onChange={(e) => setNested('seo_localbusiness_schema', 'longitude', e.target.value)} placeholder="77.2090" />
 </Field>
 </div>
 )}
 </div>
 </Card>
 </div>
 );
};

// ─── Tab: Robots & Crawl ────────────────────────────────────────────

const RobotsTab = ({ settings, setField, addListItem, removeListItem, updateListItem }) => (
 <div className="space-y-4">
 <Card title="robots.txt" description="Controls which pages search engine bots can crawl.">
 <div className="space-y-3">
 <textarea
 className="input font-mono text-sm"
 rows={12}
 value={settings.seo_robots_txt}
 onChange={(e) => setField('seo_robots_txt', e.target.value)}
 maxLength={10000}
 placeholder={'User-agent: *\nAllow: /\nDisallow: /admin/\nSitemap: https://tatoz.com/sitemap.xml'}
 />
 <div className="flex items-center gap-2 text-xs text-gray-400">
 <ExternalLink size={12} />
 <span>Accessible at <code className="bg-gray-100 px-1.5 py-0.5 rounded">/robots.txt</code></span>
 </div>
 </div>
 </Card>

 <Card title="Noindex Patterns" description="URL patterns that should have noindex meta tag (e.g. /account/*, /search*)">
 <div className="space-y-3">
 {(settings.seo_noindex_patterns || []).map((pattern, i) => (
 <div key={i} className="flex gap-2">
 <input className="input flex-1 font-mono text-sm" value={pattern} onChange={(e) => updateListItem('seo_noindex_patterns', i, e.target.value)} maxLength={200} placeholder="/account/*" />
 <button onClick={() => removeListItem('seo_noindex_patterns', i)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
 </div>
 ))}
 <button onClick={() => addListItem('seo_noindex_patterns', '')} className="btn-secondary text-sm flex items-center gap-1.5">
 <Plus size={14} /> Add Pattern
 </button>
 </div>
 </Card>
 </div>
);

// ─── Tab: Sitemap ───────────────────────────────────────────────────

const SitemapTab = ({ settings, setField, addListItem, removeListItem, updateListItem }) => {
 const contentTypes = [
 { key: 'products', label: 'Products' },
 { key: 'categories', label: 'Categories' },
 { key: 'brands', label: 'Brands' },
 { key: 'blog', label: 'Blog Posts' },
 ];

 const toggleType = (type) => {
 const current = settings.seo_sitemap_types || [];
 if (current.includes(type)) {
 setField('seo_sitemap_types', current.filter((t) => t !== type));
 } else {
 setField('seo_sitemap_types', [...current, type]);
 }
 };

 return (
 <div className="space-y-4">
 <Card title="Sitemap Configuration" description="Auto-generated XML sitemap for search engine crawling.">
 <div className="space-y-3">
 <Toggle checked={settings.seo_sitemap_enabled} onChange={(v) => setField('seo_sitemap_enabled', v)} label="Enable auto-generated sitemap" />

 {settings.seo_sitemap_enabled && (
 <>
 <Field label="Include Content Types">
 <div className="flex flex-wrap gap-3 mt-1">
 {contentTypes.map((ct) => (
 <label key={ct.key} className="flex items-center gap-2 cursor-pointer">
 <input
 type="checkbox"
 checked={(settings.seo_sitemap_types || []).includes(ct.key)}
 onChange={() => toggleType(ct.key)}
 className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
 />
 <span className="text-sm text-gray-700">{ct.label}</span>
 </label>
 ))}
 </div>
 </Field>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <Field label="Change Frequency">
 <select className="input" value={settings.seo_sitemap_changefreq} onChange={(e) => setField('seo_sitemap_changefreq', e.target.value)}>
 {CHANGEFREQ_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
 </select>
 </Field>
 <Field label="Default Priority" hint="0.0 to 1.0">
 <input className="input" type="number" min="0" max="1" step="0.1" value={settings.seo_sitemap_priority} onChange={(e) => setField('seo_sitemap_priority', parseFloat(e.target.value) || 0)} />
 </Field>
 </div>

 <div className="flex items-center gap-2 text-xs text-gray-400">
 <ExternalLink size={12} />
 <span>Accessible at <code className="bg-gray-100 px-1.5 py-0.5 rounded">/sitemap.xml</code></span>
 </div>
 </>
 )}
 </div>
 </Card>

 {settings.seo_sitemap_enabled && (
 <Card title="Custom Sitemap URLs" description="Additional URLs to include in the sitemap.">
 <div className="space-y-3">
 {(settings.seo_sitemap_custom_urls || []).map((item, i) => (
 <div key={i} className="flex gap-2">
 <input
 className="input flex-1"
 value={item.url || ''}
 onChange={(e) => updateListItem('seo_sitemap_custom_urls', i, { ...item, url: e.target.value })}
 maxLength={2048}
 placeholder="/about or https://tatoz.com/about"
 />
 <select
 className="input w-32"
 value={item.changefreq || settings.seo_sitemap_changefreq}
 onChange={(e) => updateListItem('seo_sitemap_custom_urls', i, { ...item, changefreq: e.target.value })}
 >
 {CHANGEFREQ_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
 </select>
 <button onClick={() => removeListItem('seo_sitemap_custom_urls', i)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
 </div>
 ))}
 <button onClick={() => addListItem('seo_sitemap_custom_urls', { url: '', changefreq: 'weekly', priority: 0.5 })} className="btn-secondary text-sm flex items-center gap-1.5">
 <Plus size={14} /> Add URL
 </button>
 </div>
 </Card>
 )}
 </div>
 );
};

// ─── Tab: URL & Redirects ───────────────────────────────────────────

const UrlsTab = ({ settings, setField, addListItem, removeListItem, updateListItem }) => (
 <div className="space-y-4">
 <Card title="URL Settings">
 <div className="space-y-3">
 <Field label="Canonical URL Base" hint="Same as in Meta Tags. Ensures all canonical URLs are consistent.">
 <input type="url" className="input" value={settings.seo_canonical_base} onChange={(e) => setField('seo_canonical_base', e.target.value)} maxLength={2048} placeholder="https://tatoz.com" />
 </Field>
 <Toggle checked={settings.seo_trailing_slash} onChange={(v) => setField('seo_trailing_slash', v)} label="Enforce trailing slash on URLs" />
 </div>
 </Card>

 <Card title="301 Redirects" description="Redirect old or changed URLs to new ones. Important for preserving SEO value.">
 <div className="space-y-3">
 {(settings.seo_redirects || []).length > 0 && (
 <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium text-gray-500 px-1">
 <span>From URL</span>
 <span>To URL</span>
 <span className="w-9" />
 </div>
 )}
 {(settings.seo_redirects || []).map((r, i) => (
 <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
 <input className="input font-mono text-sm" value={r.from || ''} onChange={(e) => updateListItem('seo_redirects', i, { ...r, from: e.target.value })} maxLength={200} placeholder="/old-page" />
 <input className="input font-mono text-sm" value={r.to || ''} onChange={(e) => updateListItem('seo_redirects', i, { ...r, to: e.target.value })} maxLength={2048} placeholder="/new-page" />
 <button onClick={() => removeListItem('seo_redirects', i)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
 </div>
 ))}
 <button onClick={() => addListItem('seo_redirects', { from: '', to: '' })} className="btn-secondary text-sm flex items-center gap-1.5">
 <Plus size={14} /> Add Redirect
 </button>
 </div>
 </Card>

 <Card title="404 Page SEO" description="Meta tags for your 404 error page.">
 <div className="space-y-3">
 <Field label="404 Meta Title">
 <input className="input" value={settings.seo_404_title} onChange={(e) => setField('seo_404_title', e.target.value)} maxLength={120} placeholder={`Page Not Found | ${PLATFORM_NAME}`} />
 </Field>
 <Field label="404 Meta Description">
 <textarea className="input" rows={2} value={settings.seo_404_description} onChange={(e) => setField('seo_404_description', e.target.value)} maxLength={300} placeholder="The page you're looking for doesn't exist..." />
 </Field>
 </div>
 </Card>
 </div>
);

// ─── Tab: Analytics & Tracking ──────────────────────────────────────

const AnalyticsTab = ({ settings, setField }) => (
 <div className="space-y-4">
 <Card title="Google" description="Connect your Google analytics and search tools.">
 <div className="space-y-3">
 <Field label="Google Analytics 4 Measurement ID" hint="Starts with G- (e.g. G-XXXXXXXXXX)">
 <input className="input" value={settings.seo_ga4_id} onChange={(e) => setField('seo_ga4_id', e.target.value.toUpperCase())} maxLength={40} placeholder="G-XXXXXXXXXX" />
 </Field>
 <Field label="Google Tag Manager Container ID" hint="Starts with GTM- (e.g. GTM-XXXXXXX)">
 <input className="input" value={settings.seo_gtm_id} onChange={(e) => setField('seo_gtm_id', e.target.value.toUpperCase())} maxLength={40} placeholder="GTM-XXXXXXX" />
 </Field>
 <Field label="Google Search Console Verification" hint="Content value of the google-site-verification meta tag">
 <input className="input" value={settings.seo_verification_google} onChange={(e) => setField('seo_verification_google', e.target.value)} maxLength={300} placeholder="abc123..." />
 </Field>
 </div>
 </Card>

 <Card title="Facebook" description="Facebook Pixel for conversion tracking.">
 <Field label="Facebook Pixel ID">
 <input className="input" value={settings.seo_fb_pixel} onChange={(e) => setField('seo_fb_pixel', e.target.value.replace(/\D/g, '').slice(0, 20))} maxLength={20} inputMode="numeric" placeholder="123456789012345" />
 </Field>
 </Card>

 <Card title="Custom Scripts" description="Add custom scripts to your site's head or body.">
 <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl mb-4">
 <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
 <p className="text-xs text-amber-700">Only paste scripts from trusted sources. Malicious scripts can compromise your site's security.</p>
 </div>
 <div className="space-y-3">
 <Field label="Custom Head Scripts" hint="Injected before </head>. Include full <script> or <link> tags.">
 <textarea className="input font-mono text-sm" rows={5} value={settings.seo_custom_head_scripts} onChange={(e) => setField('seo_custom_head_scripts', e.target.value)} maxLength={20000} placeholder={'<!-- Custom head scripts -->\n<script>...</script>'} />
 </Field>
 <Field label="Custom Body Scripts" hint="Injected before </body>. Include full <script> tags.">
 <textarea className="input font-mono text-sm" rows={5} value={settings.seo_custom_body_scripts} onChange={(e) => setField('seo_custom_body_scripts', e.target.value)} maxLength={20000} placeholder={'<!-- Custom body scripts -->\n<script>...</script>'} />
 </Field>
 </div>
 </Card>
 </div>
);

// ─── Tab: Google Shopping ──────────────────────────────────────────

const MERCHANT_DEFAULTS = {
 google_merchant_enabled: false,
 google_merchant_id: '',
 google_merchant_feed_key: '',
 google_merchant_country: 'IN',
 google_merchant_language: 'en',
 google_merchant_currency: 'INR',
 google_merchant_brand: PLATFORM_NAME,
 google_ads_conversion_id: '',
 google_ads_purchase_label: '',
 google_ads_begin_checkout_label: '',
 google_ads_add_to_cart_label: '',
 feed_url: '',
};

const GoogleShoppingTab = ({ onRegisterSave }) => {
 const [settings, setSettings] = useState(MERCHANT_DEFAULTS);
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);
 const [generating, setGenerating] = useState(false);
 const [copied, setCopied] = useState(false);
 const [error, setError] = useState('');

 const loadSettings = useCallback(async () => {
  setLoading(true);
  setError('');
  try {
   const { data } = await merchantAPI.getSettings();
   setSettings((prev) => ({ ...prev, ...(data?.settings || {}) }));
  } catch (err) {
   setError(err.response?.data?.message || err.message || 'Unable to load Google settings');
  } finally {
   setLoading(false);
  }
 }, []);

 useEffect(() => { loadSettings(); }, [loadSettings]);

 const setField = (key, value) => setSettings((prev) => {
  const next = { ...prev, [key]: value };
  if (key === 'google_merchant_feed_key') {
   const feedBase = (prev.feed_url || `${window.location.origin}/google-merchant-feed.xml`).split('?')[0];
   next.feed_url = value ? `${feedBase}?key=${encodeURIComponent(value)}` : '';
  }
  return next;
 });

 const save = useCallback(async () => {
  setSaving(true);
  try {
   await merchantAPI.updateSettings(settings);
   await loadSettings();
   toast.success('Google Shopping settings saved');
  } catch (err) {
   toast.error(err.response?.data?.message || 'Failed to save Google settings');
  } finally {
   setSaving(false);
  }
 }, [loadSettings, settings]);

 useEffect(() => {
  onRegisterSave?.(save);
  return () => onRegisterSave?.(null);
 }, [onRegisterSave, save]);

 const createFeedKey = async () => {
  setGenerating(true);
  try {
   const { data } = await merchantAPI.generateFeedKey();
   const key = data.key || '';
   setSettings((prev) => ({
    ...prev,
    google_merchant_feed_key: key,
    feed_url: `${window.location.origin}/google-merchant-feed.xml?key=${encodeURIComponent(key)}`,
   }));
   toast.success('New feed key generated. Save settings to activate it.');
  } catch (err) {
   toast.error(err.response?.data?.message || 'Could not generate feed key');
  } finally {
   setGenerating(false);
  }
 };

 const copyFeedUrl = async () => {
  if (!settings.feed_url || settings.feed_url.includes('YOUR_FEED_KEY')) return;
  try {
   await navigator.clipboard.writeText(settings.feed_url);
   setCopied(true);
   setTimeout(() => setCopied(false), 1800);
  } catch {
   toast.error('Could not copy feed URL');
  }
 };

 if (loading) return <div className="animate-pulse bg-gray-200 rounded-xl h-96 w-full" />;

 const feedReady = settings.google_merchant_enabled && settings.google_merchant_id && settings.google_merchant_feed_key;

 return (
  <div className="space-y-4">
   {error && (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
     <span>{error}</span><button onClick={loadSettings} className="font-semibold underline">Retry</button>
    </div>
   )}

   <Card title="Google Merchant Center" description="Create a live product feed that Merchant Center can fetch on schedule. Prices, stock, images and variants are generated from your catalog.">
    <div className="flex items-center justify-between gap-4 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 mb-4">
     <div>
      <p className="text-sm font-semibold text-indigo-900">Product feed sync</p>
      <p className="text-xs text-indigo-700 mt-0.5">Enable this after your feed URL is ready in Merchant Center.</p>
     </div>
     <Toggle checked={!!settings.google_merchant_enabled} onChange={(value) => setField('google_merchant_enabled', value)} label={settings.google_merchant_enabled ? 'Enabled' : 'Disabled'} />
    </div>
    <div className="grid md:grid-cols-2 gap-4">
     <Field label="Merchant Center ID" hint="Your numeric Merchant Center account ID.">
      <input className="input" value={settings.google_merchant_id} onChange={(e) => setField('google_merchant_id', e.target.value.replace(/\D/g, '').slice(0, 30))} maxLength={30} placeholder="123456789" inputMode="numeric" />
     </Field>
     <Field label="Brand / Store name" hint="Used in the feed when a product has no brand.">
 <input className="input" value={settings.google_merchant_brand} onChange={(e) => setField('google_merchant_brand', e.target.value)} maxLength={100} placeholder={PLATFORM_NAME} />
     </Field>
     <Field label="Feed access key" hint="This is a private feed URL key, not a Google API key. Keep it secret.">
      <div className="flex gap-2">
       <input className="input font-mono text-sm flex-1" value={settings.google_merchant_feed_key} onChange={(e) => setField('google_merchant_feed_key', e.target.value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 128))} maxLength={128} placeholder="Generate a secure key" />
       <button type="button" onClick={createFeedKey} disabled={generating} className="btn-secondary whitespace-nowrap">{generating ? 'Generating...' : 'Generate key'}</button>
      </div>
     </Field>
     <div className="grid grid-cols-3 gap-3">
      <Field label="Country"><input className="input uppercase" maxLength={2} value={settings.google_merchant_country} onChange={(e) => setField('google_merchant_country', e.target.value.toUpperCase())} /></Field>
      <Field label="Language"><input className="input" maxLength={5} value={settings.google_merchant_language} onChange={(e) => setField('google_merchant_language', e.target.value.toLowerCase())} /></Field>
      <Field label="Currency"><input className="input uppercase" maxLength={3} value={settings.google_merchant_currency} onChange={(e) => setField('google_merchant_currency', e.target.value.toUpperCase())} /></Field>
     </div>
    </div>
    <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
     <div className="flex items-center justify-between gap-3 mb-2">
      <p className="text-sm font-semibold text-gray-800">Scheduled fetch URL</p>
      {feedReady && <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700"><CheckCircle size={14} /> Ready</span>}
     </div>
     <div className="flex gap-2">
      <input readOnly className="input font-mono text-xs flex-1 bg-white" value={settings.feed_url || 'Save a feed key to generate the URL'} />
      <button type="button" onClick={copyFeedUrl} disabled={!feedReady} className="btn-secondary inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"><Copy size={14} />{copied ? 'Copied' : 'Copy URL'}</button>
     </div>
     <ol className="mt-3 text-xs text-gray-500 space-y-1 list-decimal list-inside">
      <li>Save settings and copy this URL.</li>
      <li>Merchant Center → Settings → Data sources → add a Scheduled Fetch.</li>
      <li>Use this URL, then set a daily or hourly refresh schedule.</li>
     </ol>
    </div>
   </Card>

   <Card title="Google Ads conversions" description="Paste the Conversion ID and labels from Google Ads. The site will send add-to-cart, begin-checkout and purchase conversions automatically.">
    <div className="grid md:grid-cols-2 gap-4">
     <Field label="Google Ads Conversion ID" hint="Usually starts with AW-, for example AW-123456789.">
      <input className="input" value={settings.google_ads_conversion_id} onChange={(e) => setField('google_ads_conversion_id', e.target.value.trim().slice(0, 40))} maxLength={40} placeholder="AW-123456789" />
     </Field>
     <Field label="Purchase conversion label" hint="Label from the Purchase conversion action.">
      <input className="input" value={settings.google_ads_purchase_label} onChange={(e) => setField('google_ads_purchase_label', e.target.value.trim().slice(0, 100))} maxLength={100} placeholder="AbCdEfGhIjK" />
     </Field>
     <Field label="Begin checkout label" hint="Optional conversion action label.">
      <input className="input" value={settings.google_ads_begin_checkout_label} onChange={(e) => setField('google_ads_begin_checkout_label', e.target.value.trim().slice(0, 100))} maxLength={100} placeholder="AbCdEfGhIjK" />
     </Field>
     <Field label="Add to cart label" hint="Optional conversion action label.">
      <input className="input" value={settings.google_ads_add_to_cart_label} onChange={(e) => setField('google_ads_add_to_cart_label', e.target.value.trim().slice(0, 100))} maxLength={100} placeholder="AbCdEfGhIjK" />
     </Field>
    </div>
    <div className="mt-5 flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
     <Info size={15} className="mt-0.5 shrink-0" />
     <p>Merchant Center feed setup and Google Ads conversion tracking are separate: use the feed URL for products, and add these Ads values for campaign measurement.</p>
    </div>
   </Card>

   <div className="flex justify-end">
    <button onClick={save} disabled={saving} className="btn-primary inline-flex items-center gap-2">
     {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
     {saving ? 'Saving...' : 'Save Google settings'}
    </button>
   </div>
  </div>
 );
};

// ─── Tab: International ─────────────────────────────────────────────

const I18nTab = ({ settings, setField, addListItem, removeListItem, updateListItem }) => (
 <div className="space-y-4">
 <Card title="Language Settings" description="Set the default language and hreflang tags for international SEO.">
 <div className="space-y-3">
 <Field label="Default Language" hint="Sets the lang attribute on your HTML tag.">
 <select className="input" value={settings.seo_default_language} onChange={(e) => setField('seo_default_language', e.target.value)}>
 {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label} ({l.code})</option>)}
 </select>
 </Field>
 </div>
 </Card>

 <Card title="Hreflang Tags" description="Tell search engines about alternate language/region versions of your pages.">
 <div className="space-y-3">
 {(settings.seo_hreflang_entries || []).length > 0 && (
 <div className="grid grid-cols-[120px_1fr_auto] gap-2 text-xs font-medium text-gray-500 px-1">
 <span>Language Code</span>
 <span>URL</span>
 <span className="w-9" />
 </div>
 )}
 {(settings.seo_hreflang_entries || []).map((entry, i) => (
 <div key={i} className="grid grid-cols-[120px_1fr_auto] gap-2">
 <input className="input text-sm" value={entry.lang || ''} onChange={(e) => updateListItem('seo_hreflang_entries', i, { ...entry, lang: e.target.value.slice(0, 35) })} maxLength={35} placeholder="en-US" />
 <input type="url" className="input text-sm" value={entry.url || ''} onChange={(e) => updateListItem('seo_hreflang_entries', i, { ...entry, url: e.target.value })} maxLength={2048} placeholder="https://tatoz.com/en" />
 <button onClick={() => removeListItem('seo_hreflang_entries', i)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
 </div>
 ))}
 <button onClick={() => addListItem('seo_hreflang_entries', { lang: '', url: '' })} className="btn-secondary text-sm flex items-center gap-1.5">
 <Plus size={14} /> Add Language
 </button>
 </div>
 </Card>
 </div>
);

export default SEODashboardPage;
