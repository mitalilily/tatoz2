import { useEffect, useState } from 'react';
import { Bot, Plus, Trash2, Save, Loader2, MessageSquare, Palette, ListChecks, Gauge, MessagesSquare } from 'lucide-react';
import { chatbotAdminAPI } from '../../services/api';
import Loader from '../../components/common/Loader';
import toast from 'react-hot-toast';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100';
const labelClass = 'mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500';
const cardClass = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';

const TOOLSET_OPTIONS = [
 { value: 'shop_assistant', label: 'Shop (products + store info)' },
 { value: 'order_query', label: 'Orders (track + details)' },
 { value: 'payment_query', label: 'Payments (status + history)' },
 { value: 'general', label: 'General (store info only)' },
];

const BLANK_CATEGORY = () => ({ key: `custom_${Date.now().toString(36)}`, label: 'New Category', desc: '', enabled: true, toolset: 'general', greeting: '', prompt: '' });

const Toggle = ({ checked, onChange }) => (
 <button type="button" role="switch" aria-checked={!!checked} onClick={() => onChange(!checked)}
  className={`relative h-7 w-12 flex-shrink-0 rounded-full transition ${checked ? 'bg-indigo-600' : 'bg-slate-300'}`}>
  <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'right-1' : 'left-1'}`} />
 </button>
);

const ChatbotSettingsPage = () => {
 const [config, setConfig] = useState(null);
 const [saved, setSaved] = useState(null);
 const [loading, setLoading] = useState(true);
 const [loadError, setLoadError] = useState('');
 const [saving, setSaving] = useState(false);
 const [faqDraft, setFaqDraft] = useState({ question: '', answer: '' });
 const [replyDraft, setReplyDraft] = useState('');

 const load = () => {
  setLoading(true);
  setLoadError('');
  chatbotAdminAPI.getConfig()
   .then((res) => { setConfig(res.data.config); setSaved(res.data.config); })
   .catch((err) => {
    const msg = err.message || 'Could not load chatbot settings';
    setLoadError(msg);
    toast.error(msg);
   })
   .finally(() => setLoading(false));
 };

 useEffect(load, []);

 if (loading) return <div className="flex justify-center py-20"><Loader size="lg" /></div>;
 if (!config) return (
  <div className="py-20 text-center">
   <p className="text-sm text-slate-500">Could not load chatbot settings{loadError ? `: ${loadError}` : '.'}</p>
   <button onClick={load} className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700">Retry</button>
  </div>
 );

 const set = (patch) => setConfig((c) => ({ ...c, ...patch }));
 const dirty = JSON.stringify(config) !== JSON.stringify(saved);

 const save = async () => {
  setSaving(true);
  try {
   const res = await chatbotAdminAPI.updateConfig(config);
   setConfig(res.data.config);
   setSaved(res.data.config);
   toast.success('Chatbot settings saved');
  } catch (err) {
   toast.error(err.message || 'Could not save settings');
  } finally {
   setSaving(false);
  }
 };

 const updateCategory = (index, patch) => {
  setConfig((c) => ({ ...c, categories: c.categories.map((cat, i) => (i === index ? { ...cat, ...patch } : cat)) }));
 };
 const removeCategory = (index) => {
  if (config.categories.length <= 1) {
   toast.error('At least one category is required');
   return;
  }
  setConfig((c) => ({ ...c, categories: c.categories.filter((_, i) => i !== index) }));
 };

 const addFaq = () => {
  if (!faqDraft.question.trim() || !faqDraft.answer.trim()) {
   toast.error('Both question and answer are required');
   return;
  }
  setConfig((c) => ({ ...c, faqs: [...(c.faqs || []), { question: faqDraft.question.trim(), answer: faqDraft.answer.trim(), enabled: true }] }));
  setFaqDraft({ question: '', answer: '' });
 };

 const addReply = () => {
  if (!replyDraft.trim()) return;
  if ((config.quickReplies || []).length >= 12) {
   toast.error('Maximum 12 quick replies');
   return;
  }
  setConfig((c) => ({ ...c, quickReplies: [...(c.quickReplies || []), replyDraft.trim()] }));
  setReplyDraft('');
 };

 const enabledCategories = (config.categories || []).filter((c) => c.enabled !== false);

 return (
 <div className="space-y-6 animate-fade-in">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div>
    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Bot size={24} className="text-indigo-600" /> Chatbot Settings</h1>
    <p className="text-sm text-gray-500 mt-1">Full control over the storefront assistant — branding, categories, FAQs, AI behaviour and limits.</p>
   </div>
   <div className="flex items-center gap-3">
    <span className={`text-xs font-semibold ${dirty ? 'text-amber-600' : 'text-slate-400'}`}>{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
    <button onClick={save} disabled={!dirty || saving}
     className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40">
     {saving ? <Loader size="sm" /> : <Save size={15} />} Save changes
    </button>
   </div>
  </div>

  {/* Enable + appearance */}
  <div className={cardClass}>
   <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4"><Palette size={15} className="text-indigo-600" /> Availability & appearance</h2>
   <div className="grid gap-4 sm:grid-cols-2">
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
     <div><p className="text-sm font-semibold text-slate-800">Chatbot enabled</p><p className="text-xs text-slate-500">Off hides the widget and blocks chat APIs.</p></div>
     <Toggle checked={config.enabled !== false} onChange={(v) => set({ enabled: v })} />
    </div>
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
     <div><p className="text-sm font-semibold text-slate-800">Product cards</p><p className="text-xs text-slate-500">Rich cards with add-to-cart under replies.</p></div>
     <Toggle checked={config.showProductCards !== false} onChange={(v) => set({ showProductCards: v })} />
    </div>
    <div>
     <label className={labelClass}>Bot name</label>
     <input value={config.botName || ''} onChange={(e) => set({ botName: e.target.value })} maxLength={60} className={inputClass} placeholder="AI Assistant" />
    </div>
    <div>
     <label className={labelClass}>Brand color</label>
     <div className="flex items-center gap-2">
      <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(config.primaryColor || '') ? config.primaryColor : '#0f172a'}
       onChange={(e) => set({ primaryColor: e.target.value })} className="h-10 w-12 cursor-pointer rounded-lg border border-slate-200 bg-white p-1" />
      <input value={config.primaryColor || ''} onChange={(e) => set({ primaryColor: e.target.value })} maxLength={7} className={inputClass} placeholder="#0f172a" />
     </div>
    </div>
    <div className="sm:col-span-2">
     <label className={labelClass}>Welcome message (category screen)</label>
     <textarea value={config.welcomeMessage || ''} onChange={(e) => set({ welcomeMessage: e.target.value })} rows={2} maxLength={500} className={inputClass} />
    </div>
    <div>
     <label className={labelClass}>Input placeholder</label>
     <input value={config.placeholder || ''} onChange={(e) => set({ placeholder: e.target.value })} maxLength={100} className={inputClass} />
    </div>
    <div>
     <label className={labelClass}>Escalation notice</label>
     <input value={config.escalationMessage || ''} onChange={(e) => set({ escalationMessage: e.target.value })} maxLength={500} className={inputClass} />
    </div>
   </div>
  </div>

  {/* Categories */}
  <div className={cardClass}>
   <div className="flex items-center justify-between mb-4">
    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2"><MessagesSquare size={15} className="text-indigo-600" /> Chat categories ({enabledCategories.length} live)</h2>
    <button onClick={() => setConfig((c) => ({ ...c, categories: [...c.categories, BLANK_CATEGORY()] }))}
     disabled={(config.categories || []).length >= 10}
     className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-40">
     <Plus size={13} /> Add category
    </button>
   </div>
   <div className="space-y-3">
    {(config.categories || []).map((cat, i) => (
     <div key={`${cat.key}-${i}`} className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
       <div className="flex items-center gap-2">
        <Toggle checked={cat.enabled !== false} onChange={(v) => updateCategory(i, { enabled: v })} />
        <span className="font-mono text-xs text-slate-400">{cat.key}</span>
       </div>
       <button onClick={() => removeCategory(i)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Delete category">
        <Trash2 size={15} />
       </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
       <div><label className={labelClass}>Label</label><input value={cat.label || ''} onChange={(e) => updateCategory(i, { label: e.target.value })} maxLength={40} className={inputClass} /></div>
       <div><label className={labelClass}>Tool access</label>
        <select value={cat.toolset || 'general'} onChange={(e) => updateCategory(i, { toolset: e.target.value })} className={inputClass}>
         {TOOLSET_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
       </div>
       <div className="sm:col-span-2"><label className={labelClass}>Short description</label><input value={cat.desc || ''} onChange={(e) => updateCategory(i, { desc: e.target.value })} maxLength={120} className={inputClass} /></div>
       <div className="sm:col-span-2"><label className={labelClass}>Instant greeting (no AI cost — blank = AI-generated)</label><textarea value={cat.greeting || ''} onChange={(e) => updateCategory(i, { greeting: e.target.value })} rows={2} maxLength={500} className={inputClass} placeholder="Hello! How can I help?" /></div>
       <div className="sm:col-span-2"><label className={labelClass}>Extra instructions for this category</label><textarea value={cat.prompt || ''} onChange={(e) => updateCategory(i, { prompt: e.target.value })} rows={2} maxLength={2000} className={inputClass} placeholder="e.g. Always mention EMI options…" /></div>
      </div>
     </div>
    ))}
   </div>
  </div>

  {/* FAQs */}
  <div className={cardClass}>
   <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-1"><ListChecks size={15} className="text-indigo-600" /> FAQs — instant answers, zero AI cost</h2>
   <p className="text-xs text-slate-500 mb-4">Matching questions are answered instantly without calling the AI. They are also shown as suggestion chips in chat.</p>
   <div className="space-y-2 mb-4">
    {(config.faqs || []).map((faq, i) => (
     <div key={i} className="flex items-start gap-2 rounded-xl border border-slate-200 p-3">
      <Toggle checked={faq.enabled !== false} onChange={(v) => setConfig((c) => ({ ...c, faqs: c.faqs.map((f, j) => (j === i ? { ...f, enabled: v } : f)) }))} />
      <div className="flex-1 min-w-0">
       <p className="text-sm font-semibold text-slate-800">{faq.question}</p>
       <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{faq.answer}</p>
      </div>
      <button onClick={() => setConfig((c) => ({ ...c, faqs: c.faqs.filter((_, j) => j !== i) }))} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
       <Trash2 size={15} />
      </button>
     </div>
    ))}
    {(config.faqs || []).length === 0 && <p className="text-xs text-slate-400">No FAQs yet — add delivery, return and warranty answers here.</p>}
   </div>
   <div className="grid gap-2 rounded-xl bg-slate-50 p-3">
    <input value={faqDraft.question} onChange={(e) => setFaqDraft((d) => ({ ...d, question: e.target.value }))} maxLength={200} className={inputClass} placeholder="Question — e.g. What is the delivery time?" />
    <textarea value={faqDraft.answer} onChange={(e) => setFaqDraft((d) => ({ ...d, answer: e.target.value }))} rows={2} maxLength={2000} className={inputClass} placeholder="Answer shown instantly to customers…" />
    <div><button onClick={addFaq} className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-600"><Plus size={13} /> Add FAQ</button></div>
   </div>
  </div>

  {/* Quick replies + AI tuning */}
  <div className="grid gap-6 lg:grid-cols-2">
   <div className={cardClass}>
    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4"><MessageSquare size={15} className="text-indigo-600" /> Quick replies</h2>
    <div className="flex flex-wrap gap-1.5 mb-3">
     {(config.quickReplies || []).map((q, i) => (
      <span key={i} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600">
       {q}
       <button onClick={() => setConfig((c) => ({ ...c, quickReplies: c.quickReplies.filter((_, j) => j !== i) }))} className="text-slate-400 hover:text-rose-600">×</button>
      </span>
     ))}
     {(config.quickReplies || []).length === 0 && <span className="text-xs text-slate-400">No quick replies yet.</span>}
    </div>
    <div className="flex gap-2">
     <input value={replyDraft} onChange={(e) => setReplyDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addReply(); } }} maxLength={60} className={`${inputClass} flex-1`} placeholder="e.g. Track my order" />
     <button onClick={addReply} className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3 text-xs font-bold text-white hover:bg-indigo-600"><Plus size={13} /> Add</button>
    </div>
   </div>
   <div className={cardClass}>
    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4"><Gauge size={15} className="text-indigo-600" /> AI behaviour & limits</h2>
    <div className="space-y-3">
     <div><label className={labelClass}>Base system prompt (blank = default)</label><textarea value={config.systemBase || ''} onChange={(e) => set({ systemBase: e.target.value })} rows={3} maxLength={4000} className={inputClass} placeholder="You are a helpful assistant for…" /></div>
     <div className="grid grid-cols-2 gap-3">
      <div><label className={labelClass}>History window</label><input type="number" min={4} max={50} value={config.maxHistory} onChange={(e) => set({ maxHistory: Number(e.target.value) })} className={inputClass} /></div>
      <div><label className={labelClass}>Products / reply</label><input type="number" min={1} max={10} value={config.productsLimit} onChange={(e) => set({ productsLimit: Number(e.target.value) })} className={inputClass} /></div>
      <div><label className={labelClass}>Msgs / min / user</label><input type="number" min={5} max={120} value={config.rateLimitPerMin} onChange={(e) => set({ rateLimitPerMin: Number(e.target.value) })} className={inputClass} /></div>
      <div><label className={labelClass}>Max msg length</label><input type="number" min={200} max={4000} step={100} value={config.maxMessageLength} onChange={(e) => set({ maxMessageLength: Number(e.target.value) })} className={inputClass} /></div>
      <div className="col-span-2"><label className={labelClass}>AI timeout (ms)</label><input type="number" min={5000} max={60000} step={1000} value={config.aiTimeoutMs} onChange={(e) => set({ aiTimeoutMs: Number(e.target.value) })} className={inputClass} /></div>
     </div>
    </div>
   </div>
  </div>

  {/* Preview */}
  <div className={cardClass}>
   <h2 className="text-sm font-bold text-slate-900 mb-3">Live preview</h2>
   <div className="max-w-sm overflow-hidden rounded-2xl border border-slate-200">
    <div className="px-4 py-3" style={{ background: config.primaryColor || '#0f172a' }}>
     <p className="text-sm font-semibold text-white">{config.botName || 'AI Assistant'}</p>
     <p className="text-[11px] text-white/60">Online · replies instantly</p>
    </div>
    <div className="space-y-2 bg-white p-4">
     <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-slate-100 px-3.5 py-2.5 text-[13px] text-slate-800">{(enabledCategories[0]?.greeting || config.welcomeMessage || '').slice(0, 160)}</div>
     <div className="flex flex-wrap gap-1.5">
      {(config.quickReplies || []).slice(0, 4).map((q, i) => (
       <span key={i} className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600">{q}</span>
      ))}
     </div>
     <div className="flex gap-2 pt-1">
      <div className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-xs text-slate-400">{config.placeholder || 'Type a message...'}</div>
     </div>
    </div>
   </div>
  </div>
 </div>
 );
};

export default ChatbotSettingsPage;
