import { useEffect, useState } from 'react';
import { Edit3, ExternalLink, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { vendorAPI } from '../../services/api';

export default function VendorPagesPage() {
  const [landingPage, setLandingPage] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [templateId, setTemplateId] = useState('');

  const refresh = async () => {
    setLoading(true);
    try {
      const [pagesResponse, templatesResponse] = await Promise.all([vendorAPI.getPages({ archived: 'exclude' }), vendorAPI.getPageTemplates()]);
      setLandingPage(pagesResponse.data?.items?.[0] || null);
      setTemplates(templatesResponse.data?.items || []);
    } catch (error) { toast.error(error.response?.data?.error || 'Could not load landing page'); }
    finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  const openEditor = (id) => window.open(`/vendor/page-builder/${id}`, '_blank', 'noopener');
  const createLandingPage = async (event) => {
    event.preventDefault();
    if (!title.trim()) return;
    try {
      const response = await vendorAPI.createPage({ title: title.trim(), fromTemplateId: templateId || undefined });
      setTitle(''); setTemplateId(''); setCreating(false);
      toast.success('Store landing page created');
      await refresh();
      if (response.data?.page?._id) openEditor(response.data.page._id);
    } catch (error) { toast.error(error.response?.data?.error || 'Could not create landing page'); }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">Store landing page</h1><p className="mt-1 text-sm text-slate-500">Your storefront has one editable landing page. Use the visual builder to design the complete store experience.</p></div>{landingPage && <div className="flex items-center gap-2"><a href={`/store/${landingPage.vendor?.slug || ''}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-indigo-300"><ExternalLink size={15} /> Preview store</a><button onClick={() => openEditor(landingPage._id)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"><Edit3 size={15} /> Edit landing page</button></div>}</div>

      {loading ? <div className="rounded-xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-400">Loading landing page…</div> : landingPage ? <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-4"><div><div className="flex items-center gap-2"><h2 className="text-lg font-semibold text-slate-900">{landingPage.title}</h2><span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600">LANDING PAGE</span></div><div className="mt-1 font-mono text-xs text-slate-500">/store/{landingPage.vendor?.slug || 'your-store'}</div><p className="mt-3 text-sm text-slate-500">{landingPage.status === 'published' ? 'Live for customers. Draft changes remain private until you publish.' : 'Draft only. Publish it from the builder when ready.'}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${landingPage.status === 'published' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{landingPage.status === 'published' ? 'Published' : 'Draft'}</span></div></div> : <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center"><div className="text-lg font-semibold text-slate-800">Create your store landing page</div><p className="mt-1 text-sm text-slate-500">This is the only page vendors can manage. It becomes your public storefront home.</p><button onClick={() => setCreating(true)} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"><Plus size={16} /> Create landing page</button></div>}

      {!landingPage && creating && <form onSubmit={createLandingPage} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_1fr_auto_auto] md:items-end"><label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Page title<input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="My store home" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal normal-case outline-none focus:border-indigo-400" /></label><label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Starter template<select value={templateId} onChange={e => setTemplateId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal normal-case outline-none focus:border-indigo-400"><option value="">Blank landing page</option>{templates.map(template => <option key={template._id} value={template._id}>{template.title}</option>)}</select></label><button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Create</button><button type="button" onClick={() => setCreating(false)} className="px-2 py-2 text-sm text-slate-500">Cancel</button></form>}

      <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm text-indigo-900"><strong>What vendors can manage:</strong> landing page layout, content, products showcase, branding, page SEO and publishing. Additional pages, custom paths and duplicate pages are controlled by the platform admin.</div>
    </div>
  );
}
