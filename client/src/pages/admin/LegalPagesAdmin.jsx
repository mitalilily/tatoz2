import { useState, useEffect } from 'react';
import { FileText, Save, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { legalAPI } from '../../services/api';
import Loader from '../../components/common/Loader';

const LegalPagesAdmin = () => {
 const [pages, setPages] = useState([]);
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState({});
 const [expanded, setExpanded] = useState(null);
 const [edits, setEdits] = useState({});

 useEffect(() => {
 fetchPages();
 }, []);

 const fetchPages = async () => {
 try {
 const res = await legalAPI.getAll();
 setPages(res.data.pages);
 const initial = {};
 res.data.pages.forEach((p) => {
 initial[p.slug] = { title: p.title, content: p.content, isActive: p.isActive };
 });
 setEdits(initial);
 } catch {
 toast.error('Failed to load legal pages');
 } finally {
 setLoading(false);
 }
 };

 const handleSave = async (slug) => {
 setSaving((s) => ({ ...s, [slug]: true }));
 try {
 const res = await legalAPI.update(slug, edits[slug]);
 setPages((prev) => prev.map((p) => (p.slug === slug ? res.data.page : p)));
 toast.success('Page saved successfully');
 } catch {
 toast.error('Failed to save page');
 } finally {
 setSaving((s) => ({ ...s, [slug]: false }));
 }
 };

 const updateEdit = (slug, field, value) => {
 setEdits((prev) => ({ ...prev, [slug]: { ...prev[slug], [field]: value } }));
 };

 if (loading) return <Loader />;

 return (
 <div className="space-y-5">
 <div className="flex items-center justify-between">
 <div>
 <h1 className="text-2xl font-bold text-gray-900">Legal Pages</h1>
 <p className="text-sm text-gray-500 mt-1">Manage content for legal and policy pages</p>
 </div>
 </div>

 <div className="space-y-3">
 {pages.map((page) => {
 const edit = edits[page.slug] || {};
 const isExpanded = expanded === page.slug;
 const isSaving = saving[page.slug];

 return (
 <div key={page.slug} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
 {/* Header */}
 <button
 onClick={() => setExpanded(isExpanded ? null : page.slug)}
 className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
 >
 <FileText size={18} className="text-primary-500 flex-shrink-0" />
 <div className="flex-1 min-w-0">
 <p className="font-semibold text-gray-900">{page.title}</p>
 <p className="text-xs text-gray-400 mt-0.5">
 /{page.slug} &middot; Last updated: {new Date(page.updatedAt).toLocaleDateString('en-IN')}
 {page.updatedBy?.name && ` by ${page.updatedBy.name}`}
 </p>
 </div>
 <span className={`text-xs font-medium px-2 py-1 rounded-full ${edit.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
 {edit.isActive ? 'Active' : 'Hidden'}
 </span>
 {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
 </button>

 {/* Editor */}
 {isExpanded && (
 <div className="border-t border-gray-100 px-5 py-5 space-y-4">
 {/* Title */}
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">Page Title</label>
 <input
 type="text"
 value={edit.title || ''}
 onChange={(e) => updateEdit(page.slug, 'title', e.target.value)}
 className="input w-full"
 />
 </div>

 {/* Content - HTML editor */}
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">
 Content <span className="text-xs font-normal text-gray-400">(HTML supported)</span>
 </label>
 <textarea
 value={edit.content || ''}
 onChange={(e) => updateEdit(page.slug, 'content', e.target.value)}
 rows={16}
 className="input w-full font-mono text-sm leading-relaxed"
 placeholder="Enter page content (HTML supported)..."
 />
 </div>

 {/* Visibility toggle + Save */}
 <div className="flex items-center justify-between pt-2">
 <button
 onClick={() => updateEdit(page.slug, 'isActive', !edit.isActive)}
 className={`flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-xl border transition-colors ${
 edit.isActive
 ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
 : 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100'
 }`}
 >
 {edit.isActive ? <Eye size={14} /> : <EyeOff size={14} />}
 {edit.isActive ? 'Visible' : 'Hidden'}
 </button>

 <button
 onClick={() => handleSave(page.slug)}
 disabled={isSaving}
 className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm"
 >
 <Save size={14} />
 {isSaving ? 'Saving...' : 'Save Changes'}
 </button>
 </div>
 </div>
 )}
 </div>
 );
 })}
 </div>
 </div>
 );
};

export default LegalPagesAdmin;
