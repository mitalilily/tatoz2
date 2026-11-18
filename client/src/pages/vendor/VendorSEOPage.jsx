import { useEffect, useState } from 'react';
import { ExternalLink, Save, Settings2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { vendorAPI } from '../../services/api';

const blankSeo = { metaTitle: '', metaDescription: '', canonical: '', ogImage: '', robots: 'index, follow' };

function SeoInput({ label, value, onChange, multiline = false, placeholder = '' }) {
  const Input = multiline ? 'textarea' : 'input';
  return <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}<Input value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={multiline ? 3 : undefined} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal normal-case outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></label>;
}

export default function VendorSEOPage() {
  const [store, setStore] = useState(null);
  const [pages, setPages] = useState([]);
  const [storeSeo, setStoreSeo] = useState(blankSeo);
  const [pageSeo, setPageSeo] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingStore, setSavingStore] = useState(false);
  const [savingPage, setSavingPage] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [storeResponse, pageResponse] = await Promise.all([vendorAPI.getStore(), vendorAPI.getPages({ archived: 'exclude' })]);
      const data = storeResponse.data.data;
      const list = pageResponse.data?.items || [];
      setStore(data);
      setStoreSeo({ ...blankSeo, ...(data.storefront?.seo || {}) });
      setPages(list);
      setPageSeo(Object.fromEntries(list.map(page => [page._id, { ...blankSeo, ...(page.seo || {}) }])));
    } catch (error) { toast.error(error.response?.data?.error || 'Could not load SEO settings'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const landingPage = pages[0] || null;
  const updatePageSeo = (id, field, value) => setPageSeo(current => ({ ...current, [id]: { ...current[id], [field]: value } }));

  const saveStoreSeo = async () => {
    setSavingStore(true);
    try { await vendorAPI.updateStore({ storefront: { seo: storeSeo } }); toast.success('Store SEO saved'); }
    catch (error) { toast.error(error.response?.data?.error || 'Store SEO save failed'); }
    finally { setSavingStore(false); }
  };

  const savePageSeo = async (page) => {
    setSavingPage(page._id);
    try { await vendorAPI.updatePage(page._id, { seo: pageSeo[page._id] }); toast.success(`${page.title} SEO saved`); }
    catch (error) { toast.error(error.response?.data?.error || 'Page SEO save failed'); }
    finally { setSavingPage(''); }
  };

  if (loading) return <div className="py-12 text-center text-sm text-slate-400">Loading SEO workspace…</div>;
  if (!store) return null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">Store SEO</h1><p className="mt-1 text-sm text-slate-500">Manage SEO for your store landing page and its public storefront URL.</p></div><a href={`/store/${store.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-indigo-300"><ExternalLink size={15} /> Preview storefront</a></div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center gap-2"><Settings2 size={18} className="text-indigo-600" /><div><h2 className="font-semibold text-slate-900">Store home SEO</h2><p className="text-xs text-slate-500">Used on your store root when a page does not override the value.</p></div></div><div className="grid gap-4 md:grid-cols-2"><SeoInput label="Meta title" value={storeSeo.metaTitle} onChange={value => setStoreSeo({ ...storeSeo, metaTitle: value })} placeholder={store.storeName} /><SeoInput label="Robots" value={storeSeo.robots} onChange={value => setStoreSeo({ ...storeSeo, robots: value })} /><div className="md:col-span-2"><SeoInput label="Meta description" value={storeSeo.metaDescription} onChange={value => setStoreSeo({ ...storeSeo, metaDescription: value })} multiline placeholder="Describe your store in 150–160 characters" /></div><SeoInput label="Canonical URL" value={storeSeo.canonical} onChange={value => setStoreSeo({ ...storeSeo, canonical: value })} placeholder={`${window.location.origin}/store/${store.slug}`} /><SeoInput label="Open Graph image URL" value={storeSeo.ogImage} onChange={value => setStoreSeo({ ...storeSeo, ogImage: value })} placeholder="https://.../store-cover.jpg" /></div><div className="mt-4 flex justify-end"><button onClick={saveStoreSeo} disabled={savingStore} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save size={15} />{savingStore ? 'Saving…' : 'Save store SEO'}</button></div></section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold text-slate-900">Landing page SEO</h2><p className="text-xs text-slate-500">Your store has one editable landing page at <code>/store/{store.slug}</code>.</p></div><div className="divide-y divide-slate-100">{!landingPage ? <div className="p-8 text-center text-sm text-slate-400">Create your store landing page first from the Store pages section.</div> : (() => { const page = landingPage; const seo = pageSeo[page._id] || blankSeo; return <div className="p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><div className="flex items-center gap-2 font-semibold text-slate-900">{page.title}<span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600">LANDING PAGE</span></div><div className="mt-1 font-mono text-xs text-slate-500">/</div></div><div className="flex items-center gap-2">{page.status === 'published' && <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">Published</span>}<a href={`/vendor/page-builder/${page._id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600"><ExternalLink size={13} /> Open builder</a></div></div><div className="grid gap-4 md:grid-cols-2"><SeoInput label="Meta title" value={seo.metaTitle} onChange={value => updatePageSeo(page._id, 'metaTitle', value)} placeholder={page.title} /><SeoInput label="Robots" value={seo.robots} onChange={value => updatePageSeo(page._id, 'robots', value)} /><div className="md:col-span-2"><SeoInput label="Meta description" value={seo.metaDescription} onChange={value => updatePageSeo(page._id, 'metaDescription', value)} multiline placeholder="One clear sentence for search results" /></div><SeoInput label="Canonical URL" value={seo.canonical} onChange={value => updatePageSeo(page._id, 'canonical', value)} placeholder={`${window.location.origin}/store/${store.slug}`} /><SeoInput label="Open Graph image URL" value={seo.ogImage} onChange={value => updatePageSeo(page._id, 'ogImage', value)} placeholder="https://.../store-cover.jpg" /></div><div className="mt-4 flex justify-end"><button onClick={() => savePageSeo(page)} disabled={savingPage === page._id} className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-50"><Save size={14} />{savingPage === page._id ? 'Saving…' : 'Save landing SEO'}</button></div></div>; })()}</div></section>
    </div>
  );
}
