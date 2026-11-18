import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, Edit2, Trash2, Eye, Calendar, FileText, ChevronDown, Layers, X, Sparkles, Loader2 } from 'lucide-react';
import { blogAPI, adminAPI } from '../../services/api';
import Pagination from '../../components/common/Pagination';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import EmptyState from '../../components/common/EmptyState';
import Loader from '../../components/common/Loader';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
 draft: 'bg-yellow-100 text-yellow-700',
 published: 'bg-green-100 text-green-700',
 archived: 'bg-gray-100 text-gray-600',
};

const Skeleton = ({ className = '' }) => (
 <div className={`animate-pulse bg-gray-200 rounded-lg ${className}`} />
);

const StatusBadge = ({ status }) => (
 <span
 className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
 STATUS_COLORS[status] || STATUS_COLORS.draft
 }`}
 >
 <span
 className={`w-1.5 h-1.5 rounded-full ${
 status === 'published'
 ? 'bg-green-500'
 : status === 'archived'
 ? 'bg-gray-400'
 : 'bg-yellow-500'
 }`}
 />
 {status}
 </span>
);

const TABS = [
 { key: 'posts', label: 'Posts', icon: FileText },
 { key: 'categories', label: 'Categories', icon: Layers },
];

const AdminBlogPage = () => {
 const navigate = useNavigate();
 const [searchParams, setSearchParams] = useSearchParams();
 const activeTab = searchParams.get('tab') || 'posts';
 const setActiveTab = (tab) => setSearchParams(tab === 'posts' ? {} : { tab });

 // Posts state
 const [posts, setPosts] = useState([]);
 const [loading, setLoading] = useState(true);
 const [search, setSearch] = useState('');
 const [statusFilter, setStatusFilter] = useState('');
 const [page, setPage] = useState(1);
 const [totalPages, setTotalPages] = useState(1);
 const [totalItems, setTotalItems] = useState(0);
 const [deleteTarget, setDeleteTarget] = useState(null);
 const [deleting, setDeleting] = useState(false);

 // Categories state
 const [categories, setCategories] = useState([]);
 const [catLoading, setCatLoading] = useState(false);
 const [catForm, setCatForm] = useState({ name: '', description: '', isActive: true });
 const [catEditItem, setCatEditItem] = useState(null);
 const [catDeleteItem, setCatDeleteItem] = useState(null);
 const [catSaving, setCatSaving] = useState(false);
 const [showCatForm, setShowCatForm] = useState(false);

 // AI Blog Writer state
 const [showAiModal, setShowAiModal] = useState(false);
 const [aiTopic, setAiTopic] = useState('');
 const [aiGenerating, setAiGenerating] = useState(false);

 const LIMIT = 15;

 const fetchPosts = useCallback(async () => {
 try {
 setLoading(true);
 const params = { page, limit: LIMIT };
 if (search.trim()) params.search = search.trim();
 if (statusFilter) params.status = statusFilter;
 const res = await blogAPI.adminGetAll(params);
 setPosts(res.data.posts || []);
 setTotalPages(res.data.pagination?.pages || 1);
 setTotalItems(res.data.pagination?.total || 0);
 } catch (err) {
 toast.error(err.message || 'Failed to fetch posts');
 } finally {
 setLoading(false);
 }
 }, [page, search, statusFilter]);

 useEffect(() => {
 fetchPosts();
 }, [fetchPosts]);

 // Debounced search
 useEffect(() => {
 const t = setTimeout(() => {
 setPage(1);
 }, 500);
 return () => clearTimeout(t);
 }, [search]);

 const handleDelete = async () => {
 if (!deleteTarget) return;
 try {
 setDeleting(true);
 const postId = deleteTarget._id || deleteTarget.id;
 await blogAPI.delete(postId);
 toast.success('Post deleted successfully');
 setDeleteTarget(null);
 fetchPosts();
 } catch (err) {
 toast.error(err.message || 'Failed to delete post');
 } finally {
 setDeleting(false);
 }
 };

 // Categories functions
 const fetchCategories = useCallback(async () => {
 setCatLoading(true);
 try {
 const res = await blogAPI.adminGetCategories();
 setCategories(res.data.categories || []);
 } catch { /* silent */ } finally {
 setCatLoading(false);
 }
 }, []);

 useEffect(() => {
 if (activeTab === 'categories' && categories.length === 0) fetchCategories();
 }, [activeTab, fetchCategories, categories.length]);

 const openCatCreate = () => { setCatEditItem(null); setCatForm({ name: '', description: '', isActive: true }); setShowCatForm(true); };
 const openCatEdit = (cat) => { setCatEditItem(cat); setCatForm({ name: cat.name || '', description: cat.description || '', isActive: cat.isActive !== false }); setShowCatForm(true); };

 const handleCatSave = async () => {
 if (!catForm.name.trim()) { toast.error('Name is required'); return; }
 setCatSaving(true);
 try {
 if (catEditItem) {
 await blogAPI.updateCategory(catEditItem._id, catForm);
 toast.success('Category updated');
 } else {
 await blogAPI.createCategory(catForm);
 toast.success('Category created');
 }
 setShowCatForm(false);
 fetchCategories();
 } catch (err) {
 toast.error(err.message || 'Failed to save');
 } finally {
 setCatSaving(false);
 }
 };

 const handleCatDelete = async () => {
 if (!catDeleteItem) return;
 try {
 await blogAPI.deleteCategory(catDeleteItem._id);
 toast.success('Category deleted');
 setCatDeleteItem(null);
 fetchCategories();
 } catch (err) {
 toast.error(err.message || 'Failed to delete');
 }
 };

 const handleAiGenerate = async () => {
 if (!aiTopic.trim()) { toast.error('Please enter a topic'); return; }
 setAiGenerating(true);
 try {
 const res = await blogAPI.aiGenerate({ topic: aiTopic.trim() });
 const post = res.data.post;
 toast.success('AI blog post created as draft!');
 setShowAiModal(false);
 setAiTopic('');
 navigate(`/admin/blog/edit/${post._id}`);
 } catch (err) {
 toast.error(err.response?.data?.message || err.message || 'AI generation failed');
 } finally {
 setAiGenerating(false);
 }
 };

 const formatDate = (dateStr) => {
 if (!dateStr) return '-';
 return new Date(dateStr).toLocaleDateString('en-US', {
 month: 'short',
 day: 'numeric',
 year: 'numeric',
 });
 };

 return (
 <div className="space-y-5">
 {/* Header */}
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
 <div>
 <h2 className="text-xl font-bold text-gray-900">Blog</h2>
 <p className="text-sm text-gray-500 mt-0.5">Manage posts and categories</p>
 </div>
 {activeTab === 'posts' ? (
 <div className="flex items-center gap-2">
 <button
 onClick={() => setShowAiModal(true)}
 className="inline-flex items-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-medium px-4 py-2.5 rounded-xl text-sm transition-all shadow-sm"
 >
 <Sparkles size={16} /> AI Blog Writer
 </button>
 <Link
 to="/admin/blog/new"
 className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-medium px-4 py-2.5 rounded-xl text-sm transition-colors shadow-sm"
 >
 <Plus size={16} /> New Post
 </Link>
 </div>
 ) : (
 <button
 onClick={openCatCreate}
 className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-medium px-4 py-2.5 rounded-xl text-sm transition-colors shadow-sm"
 >
 <Plus size={16} /> New Category
 </button>
 )}
 </div>

 {/* Tabs */}
 <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
 {TABS.map(({ key, label, icon: Icon }) => (
 <button
 key={key}
 onClick={() => setActiveTab(key)}
 className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
 activeTab === key
 ? 'bg-white text-gray-900 shadow-sm'
 : 'text-gray-500 hover:text-gray-700'
 }`}
 >
 <Icon size={15} />
 {label}
 </button>
 ))}
 </div>

 {activeTab === 'posts' && (<>
 {/* Posts Tab */}

 {/* Filters */}
 <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
 <div className="flex flex-col sm:flex-row gap-3">
 {/* Search */}
 <div className="relative flex-1">
 <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
 <input
 type="text"
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 placeholder="Search posts..."
 className="w-full pl-9 pr-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
 />
 </div>

 {/* Status Filter */}
 <div className="relative">
 <select
 value={statusFilter}
 onChange={(e) => {
 setStatusFilter(e.target.value);
 setPage(1);
 }}
 className="appearance-none pl-3 pr-8 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer min-w-[140px]"
 >
 <option value="">All Statuses</option>
 <option value="draft">Draft</option>
 <option value="published">Published</option>
 <option value="archived">Archived</option>
 </select>
 <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
 </div>
 </div>
 </div>

 {/* Table */}
 <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
 <div className="overflow-x-auto">
 <table className="w-full">
 <thead>
 <tr className="bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
 <th className="px-4 py-3.5 text-left">Post</th>
 <th className="px-4 py-3.5 text-left">Category</th>
 <th className="px-4 py-3.5 text-center">Status</th>
 <th className="px-4 py-3.5 text-left">Author</th>
 <th className="px-4 py-3.5 text-left">Date</th>
 <th className="px-4 py-3.5 text-right">Views</th>
 <th className="px-4 py-3.5 text-right">Actions</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-100">
 {loading ? (
 Array.from({ length: 8 }).map((_, i) => (
 <tr key={i}>
 <td className="px-4 py-3.5">
 <div className="flex items-center gap-3">
 <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
 <div className="space-y-1.5 flex-1">
 <Skeleton className="h-3.5 w-40" />
 <Skeleton className="h-3 w-24" />
 </div>
 </div>
 </td>
 <td className="px-4 py-3.5"><Skeleton className="h-3.5 w-20" /></td>
 <td className="px-4 py-3.5"><Skeleton className="h-5 w-16 rounded-full" /></td>
 <td className="px-4 py-3.5"><Skeleton className="h-3.5 w-20" /></td>
 <td className="px-4 py-3.5"><Skeleton className="h-3.5 w-20" /></td>
 <td className="px-4 py-3.5"><Skeleton className="h-3.5 w-12" /></td>
 <td className="px-4 py-3.5"><Skeleton className="h-8 w-24 ml-auto" /></td>
 </tr>
 ))
 ) : posts.length === 0 ? (
 <tr>
 <td colSpan={7}>
 <EmptyState
 icon={FileText}
 title="No blog posts found"
 description="Try adjusting your search or filters, or create your first post."
 actionLabel="New Post"
 onAction={() => navigate('/admin/blog/new')}
 />
 </td>
 </tr>
 ) : (
 posts.map((post) => (
 <tr
 key={post._id}
 className="hover:bg-gray-50 transition-colors"
 >
 <td className="px-4 py-3.5">
 <div className="flex items-center gap-3">
 {post.featuredImage ? (
 <img
 src={post.featuredImage}
 alt={post.title}
 className="w-10 h-10 rounded-xl object-cover flex-shrink-0 border border-gray-100"
 />
 ) : (
 <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
 <FileText size={16} className="text-gray-400" />
 </div>
 )}
 <div className="min-w-0">
 <p className="text-sm font-medium text-gray-900 truncate max-w-[250px]">
 {post.title}
 </p>
 {post.excerpt && (
 <p className="text-xs text-gray-400 truncate max-w-[250px]">{post.excerpt}</p>
 )}
 </div>
 </div>
 </td>
 <td className="px-4 py-3.5 text-sm text-gray-600">
 {post.category?.name || '-'}
 </td>
 <td className="px-4 py-3.5 text-center">
 <StatusBadge status={post.status || 'draft'} />
 </td>
 <td className="px-4 py-3.5 text-sm text-gray-600">
 {post.author?.name || '-'}
 </td>
 <td className="px-4 py-3.5">
 <div className="flex items-center gap-1.5 text-sm text-gray-500">
 <Calendar size={13} />
 {formatDate(post.publishedAt || post.createdAt)}
 </div>
 </td>
 <td className="px-4 py-3.5 text-right text-sm tabular-nums text-gray-600">
 {post.viewCount ?? post.views ?? 0}
 </td>
 <td className="px-4 py-3.5">
 <div className="flex items-center justify-end gap-2">
 {post.slug && (
 <Link
 to={`/blog/${post.slug}`}
 target="_blank"
 className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
 title="View"
 >
 <Eye size={15} />
 </Link>
 )}
 <Link
 to={`/admin/blog/edit/${post._id}`}
 className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
 title="Edit"
 >
 <Edit2 size={15} />
 </Link>
 <button
 onClick={() => setDeleteTarget(post)}
 className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
 title="Delete"
 >
 <Trash2 size={15} />
 </button>
 </div>
 </td>
 </tr>
 ))
 )}
 </tbody>
 </table>
 </div>

 {/* Pagination */}
 {!loading && totalPages > 1 && (
 <div className="px-4 py-4 border-t border-gray-100">
 <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
 </div>
 )}
 </div>

 {/* Delete Confirm */}
 <ConfirmDialog
 isOpen={!!deleteTarget}
 onClose={() => setDeleteTarget(null)}
 onConfirm={handleDelete}
 title="Delete Post"
 message={`Are you sure you want to delete "${deleteTarget?.title}"? This action cannot be undone.`}
 confirmLabel="Delete"
 isDanger
 isLoading={deleting}
 />
 </>)}

 {activeTab === 'categories' && (<>
 {/* Categories Tab */}
 {catLoading ? (
 <div className="flex justify-center py-16"><Loader size="lg" /></div>
 ) : categories.length === 0 ? (
 <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
 <Layers size={40} className="text-gray-300 mx-auto mb-3" />
 <p className="text-gray-500">No blog categories yet.</p>
 <button onClick={openCatCreate} className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-medium px-4 py-2.5 rounded-xl text-sm transition-colors shadow-sm mt-4">
 <Plus size={14} /> Create your first category
 </button>
 </div>
 ) : (
 <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
 <div className="overflow-x-auto">
 <table className="w-full">
 <thead>
 <tr className="bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
 <th className="px-4 py-3.5 text-left">Category</th>
 <th className="px-4 py-3.5 text-left">Slug</th>
 <th className="px-4 py-3.5 text-left">Status</th>
 <th className="px-4 py-3.5 text-right">Actions</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-100">
 {categories.map((cat) => (
 <tr key={cat._id} className="hover:bg-gray-50 transition-colors">
 <td className="px-4 py-3.5">
 <div className="min-w-0">
 <p className="text-sm font-medium text-gray-900">{cat.name}</p>
 {cat.description && <p className="text-xs text-gray-400 truncate max-w-[250px]">{cat.description}</p>}
 </div>
 </td>
 <td className="px-4 py-3.5 text-sm text-gray-500">{cat.slug}</td>
 <td className="px-4 py-3.5">
 <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${cat.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
 <span className={`w-1.5 h-1.5 rounded-full ${cat.isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
 {cat.isActive ? 'Active' : 'Inactive'}
 </span>
 </td>
 <td className="px-4 py-3.5">
 <div className="flex items-center justify-end gap-2">
 <button onClick={() => openCatEdit(cat)} className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors" title="Edit"><Edit2 size={15} /></button>
 <button onClick={() => setCatDeleteItem(cat)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete"><Trash2 size={15} /></button>
 </div>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 )}

 {/* Category Form Modal */}
 {showCatForm && (
 <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowCatForm(false)}>
 <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4" onClick={(e) => e.stopPropagation()}>
 <div className="flex items-center justify-between">
 <h3 className="text-lg font-bold text-gray-900">{catEditItem ? 'Edit Category' : 'New Category'}</h3>
 <button onClick={() => setShowCatForm(false)} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
 <input type="text" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="Category name" />
 </div>
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
 <textarea value={catForm.description} onChange={(e) => setCatForm({ ...catForm, description: e.target.value })} rows={2} className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" placeholder="Optional description" />
 </div>
 <label className="flex items-center gap-2 cursor-pointer">
 <input type="checkbox" checked={catForm.isActive} onChange={(e) => setCatForm({ ...catForm, isActive: e.target.checked })} className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
 <span className="text-sm text-gray-700">Active</span>
 </label>
 <div className="flex justify-end gap-3 pt-2">
 <button onClick={() => setShowCatForm(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">Cancel</button>
 <button onClick={handleCatSave} disabled={catSaving} className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white transition-colors">{catSaving ? 'Saving...' : 'Save'}</button>
 </div>
 </div>
 </div>
 )}

 {/* Category Delete Confirm */}
 <ConfirmDialog
 isOpen={!!catDeleteItem}
 onClose={() => setCatDeleteItem(null)}
 onConfirm={handleCatDelete}
 title="Delete Category"
 message={`Delete "${catDeleteItem?.name}"? Posts in this category will become uncategorized.`}
 confirmLabel="Delete"
 isDanger
 />
 </>)}

 {/* AI Blog Writer Modal */}
 {showAiModal && (
 <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => !aiGenerating && setShowAiModal(false)}>
 <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-xl space-y-5" onClick={(e) => e.stopPropagation()}>
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
 <Sparkles size={20} className="text-white" />
 </div>
 <div>
 <h3 className="text-lg font-bold text-gray-900">AI Blog Writer</h3>
 <p className="text-xs text-gray-500">Enter a topic and AI will write the full blog post</p>
 </div>
 </div>
 <button onClick={() => !aiGenerating && setShowAiModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
 <X size={18} />
 </button>
 </div>

 <div>
 <label className="block text-sm font-medium text-gray-700 mb-1.5">Blog Topic</label>
 <textarea
 value={aiTopic}
 onChange={(e) => setAiTopic(e.target.value)}
 rows={3}
 disabled={aiGenerating}
 className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none disabled:opacity-60"
 placeholder="e.g. 10 Tips for Choosing the Perfect Running Shoes"
 onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !aiGenerating) { e.preventDefault(); handleAiGenerate(); } }}
 />
 <p className="text-xs text-gray-400 mt-1.5">Be specific for better results. The post will be saved as a draft for your review.</p>
 </div>

 <div className="flex justify-end gap-3 pt-1">
 <button
 onClick={() => { setShowAiModal(false); setAiTopic(''); }}
 disabled={aiGenerating}
 className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-60"
 >
 Cancel
 </button>
 <button
 onClick={handleAiGenerate}
 disabled={aiGenerating || !aiTopic.trim()}
 className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed"
 >
 {aiGenerating ? (
 <>
 <Loader2 size={16} className="animate-spin" />
 Generating...
 </>
 ) : (
 <>
 <Sparkles size={16} />
 Generate Blog Post
 </>
 )}
 </button>
 </div>
 </div>
 </div>
 )}
 </div>
 );
};

export default AdminBlogPage;
