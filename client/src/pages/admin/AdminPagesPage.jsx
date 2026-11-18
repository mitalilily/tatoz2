import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Copy, Archive, Edit3, ExternalLink, BookmarkPlus, BookmarkCheck, RotateCcw, Trash2, PanelTop, PanelBottom, History } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminPageAPI } from '../../services/api';
import TemplateVersionsModal from '../../components/admin/TemplateVersionsModal';

export default function AdminPagesPage() {
  const [view, setView] = useState('pages'); // 'pages' | 'templates' | 'archived'
  const [items, setItems] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [archived, setArchived] = useState([]);
  const [chrome, setChrome] = useState([]); // [{kind:'header',_id,...}, {kind:'footer',_id,...}]
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [createError, setCreateError] = useState('');
  const [newTemplateId, setNewTemplateId] = useState('');
  const [newTemplateVersionId, setNewTemplateVersionId] = useState('');
  const [versionTemplate, setVersionTemplate] = useState(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const [pagesRes, templatesRes, archivedRes, chromeRes] = await Promise.all([
        adminPageAPI.list({ templates: 'exclude', archived: 'exclude', kind: 'page' }),
        adminPageAPI.list({ templates: 'only', archived: 'exclude', kind: 'page' }),
        adminPageAPI.list({ templates: 'include', archived: 'only', kind: 'all' }),
        adminPageAPI.list({ kind: 'chrome', archived: 'include' }),
      ]);
      setItems(pagesRes.data?.items || []);
      setTemplates(templatesRes.data?.items || []);
      setArchived(archivedRes.data?.items || []);
      // Sort chrome rows so header always appears before footer
      const c = chromeRes.data?.items || [];
      c.sort((a, b) => (a.kind === 'header' ? -1 : 1));
      setChrome(c);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const openEditor = (id) => {
    window.open(`/admin/page-builder/${id}`, '_blank', 'noopener');
  };
  const onDuplicate = async (id) => {
    try { await adminPageAPI.duplicate(id); toast.success('Duplicated'); refresh(); }
    catch (e) { toast.error(e.response?.data?.error || 'Duplicate failed'); }
  };
  const onArchive = async (id) => {
    if (!confirm('Archive this page? It will be moved to the Archived tab — you can restore it later.')) return;
    try { await adminPageAPI.archive(id); toast.success('Archived'); refresh(); }
    catch (e) { toast.error(e.response?.data?.error || 'Archive failed'); }
  };
  const onUnarchive = async (page) => {
    try {
      const res = await adminPageAPI.unarchive(page._id);
      const restored = res.data?.page;
      if (restored && restored.slug !== page.slug) {
        toast.success(`Restored as draft at ${restored.slug} (slug renamed to avoid conflict)`);
      } else {
        toast.success('Restored');
      }
      refresh();
    } catch (e) { toast.error(e.response?.data?.error || 'Restore failed'); }
  };
  const onHardDelete = async (page) => {
    const ok = confirm(`Permanently delete "${page.title}"?\n\nThis cannot be undone. The page and all of its version history will be removed.`);
    if (!ok) return;
    // Second confirmation for emphasis
    const sure = confirm('Are you absolutely sure? Click OK to permanently delete.');
    if (!sure) return;
    try { await adminPageAPI.hardDelete(page._id); toast.success('Page permanently deleted'); refresh(); }
    catch (e) { toast.error(e.response?.data?.error || 'Delete failed'); }
  };
  const onToggleTemplate = async (page) => {
    const next = !page.isTemplate;
    try {
      await adminPageAPI.update(page._id, { isTemplate: next });
      toast.success(next ? 'Saved as template' : 'Unmarked as template');
      refresh();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };
  const onUseTemplateVersion = (template, version) => {
    setView('pages');
    setCreating(true);
    setNewTemplateId(template._id);
    setNewTemplateVersionId(version._id);
    setVersionTemplate(null);
    toast.success(`Selected ${template.title} v${version.version} as page starter`);
  };
  const onCreate = async (e) => {
    e.preventDefault();
    const title = newTitle.trim();
    const slug = newSlug.trim();
    if (!title) {
      setCreateError('Page title is required.');
      return;
    }
    if (title.length > 120) {
      setCreateError('Page title must be 120 characters or fewer.');
      return;
    }
    if (/[<>]/.test(title)) {
      setCreateError('Page title must contain plain text only.');
      return;
    }
    if (slug && (slug.length > 120 || !/^\/?(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*[a-z0-9]+(?:-[a-z0-9]+)*\/?$/i.test(slug))) {
      setCreateError('Slug must be a URL-safe path of 120 characters or fewer.');
      return;
    }
    setCreateError('');
    try {
      const r = await adminPageAPI.create({
        title,
        slug: slug || undefined,
        fromTemplateId: newTemplateId || undefined,
        fromTemplateVersionId: newTemplateVersionId || undefined,
      });
      toast.success('Page created');
      setCreating(false); setNewTitle(''); setNewSlug(''); setNewTemplateId(''); setNewTemplateVersionId(''); setCreateError('');
      refresh();
      openEditor(r.data?.page?._id);
    } catch (e) {
      const message = e.response?.data?.message || e.response?.data?.error || 'Could not create page';
      setCreateError(message);
      toast.error(message);
    }
  };

  const visible = view === 'templates' ? templates : view === 'archived' ? archived : items;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Pages</h1>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 rounded-lg p-0.5 text-sm">
            <button onClick={() => setView('pages')} className={`px-4 py-1.5 rounded ${view === 'pages' ? 'bg-white shadow font-semibold text-gray-900' : 'text-gray-600'}`}>Pages ({items.length})</button>
            <button onClick={() => setView('templates')} className={`px-4 py-1.5 rounded ${view === 'templates' ? 'bg-white shadow font-semibold text-gray-900' : 'text-gray-600'}`}>Templates ({templates.length})</button>
            <button onClick={() => setView('archived')} className={`px-4 py-1.5 rounded ${view === 'archived' ? 'bg-white shadow font-semibold text-gray-900' : 'text-gray-600'}`}>Archived ({archived.length})</button>
          </div>
          {view === 'pages' && (
            <button onClick={() => setCreating(v => !v)} className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-2 hover:bg-indigo-700"><Plus size={16} /> New page</button>
          )}
        </div>
      </div>

      {creating && view === 'pages' && (
        <form onSubmit={onCreate} className="bg-white rounded-lg border border-gray-200 p-4 mb-6 flex flex-wrap items-end gap-3" noValidate data-testid="page-create-form">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold text-gray-700 mb-1">TITLE</label>
            <input required maxLength={120} value={newTitle} onChange={e => { setNewTitle(e.target.value); setCreateError(''); }} placeholder="About us" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" autoFocus data-testid="page-create-title" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold text-gray-700 mb-1">SLUG (optional)</label>
            <input maxLength={120} value={newSlug} onChange={e => { setNewSlug(e.target.value); setCreateError(''); }} placeholder="/about" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono" data-testid="page-create-slug" />
          </div>
          {templates.length > 0 && (
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs font-semibold text-gray-700 mb-1">START FROM TEMPLATE (optional)</label>
              <select value={newTemplateId} onChange={e => setNewTemplateId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white">
                <option value="">— blank —</option>
                {templates.map(t => <option key={t._id} value={t._id}>{t.title}</option>)}
              </select>
              {newTemplateVersionId && <div className="mt-1 text-[11px] text-purple-700">A specific template version is selected.</div>}
            </div>
          )}
          {createError && <p className="basis-full text-sm font-medium text-red-600" role="alert" data-testid="page-create-error">{createError}</p>}
          <button type="submit" className="bg-gray-900 text-white px-4 py-2 rounded-md text-sm font-semibold">Create</button>
          <button type="button" onClick={() => setCreating(false)} className="text-sm text-gray-600 px-2">Cancel</button>
        </form>
      )}

      {view === 'archived' && archived.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-md px-4 py-2 mb-4 text-sm">
          Archived pages aren't visible to customers. Restore them to bring them back, or permanently delete them (cannot be undone).
        </div>
      )}

      {/* Site chrome (header + footer) — always pinned above the regular pages list */}
      {view === 'pages' && chrome.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-6">
          <div className="bg-gray-50 px-4 py-2 text-xs uppercase tracking-wide font-semibold text-gray-500 flex items-center justify-between gap-3">
            <span>Site chrome</span>
            <span className="flex items-center gap-3">
              <span className="font-normal normal-case text-[11px] text-gray-500 hidden sm:inline">Renders on every customer page. Drag-and-drop edit — start empty, add what you need.</span>
              <Link to="/admin/customization#header-settings" className="font-semibold normal-case text-[11px] text-primary-600 hover:underline whitespace-nowrap">Header & footer style →</Link>
            </span>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {chrome.map(p => {
                const Icon = p.kind === 'header' ? PanelTop : PanelBottom;
                const where = p.kind === 'header' ? 'Above the navbar' : 'Above the site footer';
                return (
                  <tr key={p._id} className="border-t border-gray-100 first:border-t-0">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        <Icon size={16} className="text-indigo-500 flex-shrink-0" />
                        <span>{p.title || (p.kind === 'header' ? 'Site Header' : 'Site Footer')}</span>
                        <span className="inline-block bg-indigo-100 text-indigo-700 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase">{p.kind}</span>
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5 ml-6">{where}</div>
                    </td>
                    <td className="px-4 py-3">
                      {p.status === 'published'
                        ? <span className="inline-block bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded">Live</span>
                        : <span className="inline-block bg-gray-100 text-gray-700 text-xs font-semibold px-2 py-0.5 rounded">Draft</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{new Date(p.updatedAt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openEditor(p._id)} className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 px-2 py-1 text-sm font-semibold"><Edit3 size={14} /> Edit {p.kind}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="text-left px-4 py-2">Title</th>
              <th className="text-left px-4 py-2">{view === 'templates' ? 'Type' : 'Slug'}</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">{view === 'archived' ? 'Archived' : 'Updated'}</th>
              <th className="text-right px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan="5" className="text-center text-gray-400 py-6">Loading…</td></tr> :
             visible.length === 0 ? <tr><td colSpan="5" className="text-center text-gray-400 py-6">
              {view === 'templates' ? 'No templates yet — mark any page as a template to reuse it.'
               : view === 'archived' ? 'No archived pages.'
               : 'No pages yet.'}
             </td></tr> :
             visible.map(p => (
              <tr key={p._id} className={`border-t border-gray-100 ${p.archivedAt ? 'opacity-70' : ''}`}>
                <td className="px-4 py-2.5 font-medium text-gray-900 flex items-center gap-2">
                  {p.isHomepage && <span className="inline-block bg-indigo-100 text-indigo-700 text-[10px] font-bold px-1.5 py-0.5 rounded">HOME</span>}
                  {p.isTemplate && <span className="inline-block bg-purple-100 text-purple-700 text-[10px] font-bold px-1.5 py-0.5 rounded">TEMPLATE</span>}
                  {p.archivedAt && <span className="inline-block bg-gray-200 text-gray-700 text-[10px] font-bold px-1.5 py-0.5 rounded">ARCHIVED</span>}
                  {p.title}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600">{view === 'templates' ? 'Reusable starter' : p.slug}</td>
                <td className="px-4 py-3">
                  {p.scheduledPublishAt
                    ? <span className="inline-block bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded">Scheduled</span>
                    : p.status === 'published'
                      ? <span className="inline-block bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded">Published</span>
                      : <span className="inline-block bg-gray-100 text-gray-700 text-xs font-semibold px-2 py-0.5 rounded">Draft</span>}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{new Date(p.archivedAt || p.updatedAt).toLocaleString()}</td>
                <td className="px-4 py-3 text-right">
                  {view === 'archived' ? (
                    <>
                      <button onClick={() => onUnarchive(p)} className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 px-2 py-1 text-sm font-semibold"><RotateCcw size={14} /> Restore</button>
                      <button onClick={() => onHardDelete(p)} className="inline-flex items-center gap-1 text-red-600 hover:text-red-800 px-2 py-1 text-sm font-semibold"><Trash2 size={14} /> Delete forever</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => openEditor(p._id)} className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 px-2 py-1 text-sm"><Edit3 size={14} /> Edit</button>
                      {!p.isTemplate && (
                        <Link to={p.slug || '/'} target="_blank" className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900 px-2 py-1 text-sm"><ExternalLink size={14} /> View</Link>
                      )}
                      {view === 'templates' && <button data-testid={`template-versions-${p._id}`} onClick={() => setVersionTemplate(p)} className="inline-flex items-center gap-1 text-purple-700 hover:text-purple-900 px-2 py-1 text-sm"><History size={14} /> Versions</button>}
                      {!p.isHomepage && (
                        <button onClick={() => onToggleTemplate(p)} className="inline-flex items-center gap-1 text-gray-600 hover:text-purple-700 px-2 py-1 text-sm">
                          {p.isTemplate ? <><BookmarkCheck size={14} /> Unmark</> : <><BookmarkPlus size={14} /> Save as template</>}
                        </button>
                      )}
                      {!p.isHomepage && <button onClick={() => onDuplicate(p._id)} className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900 px-2 py-1 text-sm"><Copy size={14} /> Duplicate</button>}
                      {!p.isHomepage && <button onClick={() => onArchive(p._id)} className="inline-flex items-center gap-1 text-red-600 hover:text-red-800 px-2 py-1 text-sm"><Archive size={14} /> Archive</button>}
                    </>
                  )}
                </td>
              </tr>
             ))}
          </tbody>
        </table>
      </div>
      <TemplateVersionsModal template={versionTemplate} onClose={() => setVersionTemplate(null)} onUseVersion={onUseTemplateVersion} />
    </div>
  );
}
