import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Eye, Image, ChevronDown, X } from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { blogAPI, productAPI, adminAPI } from '../../services/api';
import Loader from '../../components/common/Loader';
import toast from 'react-hot-toast';

const QUILL_MODULES = {
 toolbar: [
 [{ header: [1, 2, 3, false] }],
 ['bold', 'italic', 'underline', 'strike'],
 [{ list: 'ordered' }, { list: 'bullet' }],
 ['blockquote', 'code-block'],
 ['link', 'image'],
 [{ align: [] }],
 ['clean'],
 ],
};

const QUILL_FORMATS = [
 'header', 'bold', 'italic', 'underline', 'strike',
 'list', 'bullet', 'blockquote', 'code-block',
 'link', 'image', 'align',
];

const DEFAULT_FORM = {
 title: '',
 content: '',
 excerpt: '',
 featuredImage: '',
 category: '',
 tags: '',
 status: 'draft',
 publishedAt: '',
 isFeatured: false,
 allowComments: true,
 relatedProducts: [],
 seo: { metaTitle: '', metaDescription: '', keywords: '', ogImage: '' },
};

const AddEditBlogPostPage = () => {
 const { id } = useParams();
 const navigate = useNavigate();
 const isEdit = !!id;
 const imageInputRef = useRef(null);

 const [form, setForm] = useState(DEFAULT_FORM);
 const [categories, setCategories] = useState([]);
 const [loading, setLoading] = useState(isEdit);
 const [saving, setSaving] = useState(false);
 const [saveError, setSaveError] = useState('');
 const [uploadingImage, setUploadingImage] = useState(false);
 const [seoOpen, setSeoOpen] = useState(false);

 // Related products state
 const [productSearch, setProductSearch] = useState('');
 const [productResults, setProductResults] = useState([]);
 const [searchingProducts, setSearchingProducts] = useState(false);
 const productSearchTimer = useRef(null);

 const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));
 const setSEO = (key, value) =>
 setForm((f) => ({ ...f, seo: { ...f.seo, [key]: value } }));

 // Content stats
 const stats = useMemo(() => {
 const text = (form.content || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
 const words = text ? text.split(/\s+/).length : 0;
 const chars = text.length;
 const readTime = Math.max(1, Math.ceil(words / 200));
 return { words, chars, readTime };
 }, [form.content]);

 // Load categories
 useEffect(() => {
 blogAPI
 .adminGetCategories()
 .then((res) => setCategories(res.data.categories || res.data || []))
 .catch(() => {});
 }, []);

 // Load post if editing
 useEffect(() => {
 if (!isEdit) return;
 setLoading(true);
 blogAPI
 .adminGetById(id)
 .then((res) => {
 const p = res.data.post || res.data;
 setForm({
 title: p.title || '',
 content: p.content || '',
 excerpt: p.excerpt || '',
 featuredImage: p.featuredImage || '',
 category: p.category?._id || p.category || '',
 tags: Array.isArray(p.tags) ? p.tags.join(', ') : p.tags || '',
 status: p.status || 'draft',
 publishedAt: p.publishedAt
 ? new Date(p.publishedAt).toISOString().slice(0, 16)
 : '',
 isFeatured: p.isFeatured || false,
 allowComments: p.allowComments !== undefined ? p.allowComments : true,
 relatedProducts: p.relatedProducts || [],
 seo: {
 metaTitle: p.seo?.metaTitle || '',
 metaDescription: p.seo?.metaDescription || '',
 keywords: Array.isArray(p.seo?.keywords)
 ? p.seo.keywords.join(', ')
 : p.seo?.keywords || '',
 ogImage: p.seo?.ogImage || '',
 },
 });
 })
 .catch((err) => {
 toast.error(err.message || 'Failed to load post');
 navigate('/admin/blog');
 })
 .finally(() => setLoading(false));
 }, [id, isEdit, navigate]);

 // Debounced product search
 useEffect(() => {
 if (!productSearch.trim()) {
 setProductResults([]);
 return;
 }
 clearTimeout(productSearchTimer.current);
 productSearchTimer.current = setTimeout(async () => {
 setSearchingProducts(true);
 try {
 const res = await productAPI.adminGetAll({
 search: productSearch.trim(),
 limit: 5,
 });
 setProductResults(res.data.products || []);
 } catch {
 setProductResults([]);
 } finally {
 setSearchingProducts(false);
 }
 }, 400);
 return () => clearTimeout(productSearchTimer.current);
 }, [productSearch]);

 // Image upload
 const handleImageUpload = async (e) => {
 const file = e.target.files?.[0];
 if (!file) return;
 setUploadingImage(true);
 try {
 const formData = new FormData();
 formData.append('file', file);
 formData.append('type', 'blog');
 const res = await adminAPI.uploadSiteAsset(formData);
 setField('featuredImage', res.data.url);
 toast.success('Image uploaded');
 } catch (err) {
 toast.error(err.message || 'Upload failed');
 } finally {
 setUploadingImage(false);
 if (imageInputRef.current) imageInputRef.current.value = '';
 }
 };

 // Save
 const handleSave = async (status) => {
 if (!form.title.trim()) {
 toast.error('Title is required');
 return;
 }
 const publishDate = status === 'draft' ? '' : form.publishedAt;
 if (status === 'published' && publishDate && new Date(publishDate) > new Date()) {
  const message = 'Publish date cannot be in the future. Clear the date to publish now.';
  setSaveError(message);
  toast.error(message);
  return;
 }
 setSaveError('');

 setSaving(true);
 try {
 const tagsArray = form.tags
 .split(',')
 .map((t) => t.trim())
 .filter(Boolean);
 const keywordsArray = form.seo.keywords
 .split(',')
 .map((k) => k.trim())
 .filter(Boolean);

 const data = {
 ...form,
 status,
 publishedAt: publishDate || null,
 tags: tagsArray,
 category: form.category || null,
 relatedProducts: form.relatedProducts.map((p) =>
 typeof p === 'string' ? p : p._id || p.id
 ),
 seo: {
 ...form.seo,
 keywords: keywordsArray,
 },
 };

 if (isEdit) {
 const response = await blogAPI.update(id, data);
 const saved = response.data?.post;
 if (saved) setForm(current => ({ ...current, status: saved.status || status, publishedAt: saved.publishedAt ? new Date(saved.publishedAt).toISOString().slice(0, 16) : '' }));
 toast.success('Post updated!');
 } else {
 const res = await blogAPI.create(data);
 const newId = res.data.post?._id || res.data._id;
 toast.success('Post created!');
 if (newId) {
 navigate(`/admin/blog/edit/${newId}`, { replace: true });
 }
 }
 } catch (err) {
 const message = err.response?.data?.message || err.message || 'Failed to save post';
 setSaveError(message);
 toast.error(message);
 } finally {
 setSaving(false);
 }
 };

 const addRelatedProduct = (product) => {
 const already = form.relatedProducts.some(
 (p) => (p._id || p.id || p) === product._id
 );
 if (already) {
 toast.error('Product already added');
 return;
 }
 setField('relatedProducts', [
 ...form.relatedProducts,
 { _id: product._id, title: product.title, images: product.images },
 ]);
 setProductSearch('');
 setProductResults([]);
 };

 const removeRelatedProduct = (idx) => {
 setField(
 'relatedProducts',
 form.relatedProducts.filter((_, i) => i !== idx)
 );
 };

 if (loading) {
 return (
 <div className="flex items-center justify-center min-h-[400px]">
 <Loader size="lg" />
 </div>
 );
 }

 return (
 <div className="space-y-6">
 {/* Header */}
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <button
 onClick={() => navigate('/admin/blog')}
 className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
 >
 <ArrowLeft size={20} className="text-gray-600" />
 </button>
 <h1 className="text-xl font-bold text-gray-900">
 {isEdit ? 'Edit Post' : 'New Post'}
 </h1>
 </div>
 <div className="flex gap-2">
 <button
 onClick={() => handleSave('draft')}
 disabled={saving}
 className="btn-secondary text-sm py-2.5 flex items-center gap-2"
 >
 {saving ? <Loader size="sm" /> : <Save size={14} />}
 Save Draft
 </button>
 <button
 onClick={() => handleSave('published')}
 disabled={saving}
 className="btn-primary text-sm py-2.5 flex items-center gap-2"
 >
 {saving ? <Loader size="sm" /> : <Eye size={14} />}
 Publish
 </button>
 </div>
 {saveError && <p className="mt-2 text-right text-sm font-medium text-red-600" role="alert" data-testid="blog-save-error">{saveError}</p>}
 </div>

 {/* Two-column layout */}
 <div className="grid lg:grid-cols-3 gap-6">
 {/* Left column */}
 <div className="lg:col-span-2 space-y-5">
 {/* Title */}
 <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
 <input
 data-testid="blog-title"
 value={form.title}
 onChange={(e) => setField('title', e.target.value)}
 maxLength={200}
 className="w-full text-2xl font-bold bg-transparent border-none outline-none text-gray-900 placeholder-gray-300"
 placeholder="Post title..."
 />
 </div>

 {/* Featured Image */}
 <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
 <label className="text-sm font-medium text-gray-700 mb-3 block">
 Featured Image
 </label>
 <input
 ref={imageInputRef}
 type="file"
 accept="image/*"
 className="hidden"
 onChange={handleImageUpload}
 />
 {form.featuredImage ? (
 <div className="relative">
 <img
 src={form.featuredImage}
 alt="Featured"
 className="w-full h-48 object-cover rounded-xl"
 />
 <button
 type="button"
 onClick={() => setField('featuredImage', '')}
 className="absolute top-2 right-2 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
 >
 <X size={14} />
 </button>
 </div>
 ) : (
 <button
 type="button"
 onClick={() => imageInputRef.current?.click()}
 disabled={uploadingImage}
 className="w-full h-48 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-primary-400 hover:text-primary-500 transition-colors cursor-pointer"
 >
 {uploadingImage ? (
 <Loader size="md" />
 ) : (
 <>
 <Image size={28} />
 <span className="text-sm">Click to upload featured image</span>
 </>
 )}
 </button>
 )}
 </div>

 {/* Rich Text Editor */}
 <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
 <label className="text-sm font-medium text-gray-700 mb-3 block">
 Content
 </label>
 <ReactQuill
 theme="snow"
 value={form.content}
 onChange={(val) => setField('content', val)}
 modules={QUILL_MODULES}
 formats={QUILL_FORMATS}
 placeholder="Write your post content..."
 className="bg-white rounded-xl [&_.ql-toolbar]:rounded-t-xl [&_.ql-toolbar]:border-gray-200 [&_.ql-toolbar]: [&_.ql-container]:rounded-b-xl [&_.ql-container]:border-gray-200 [&_.ql-container]: [&_.ql-editor]:min-h-[300px] [&_.ql-editor]:text-gray-900 [&_.ql-editor]:"
 />
 </div>

 {/* Excerpt */}
 <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
 <label className="text-sm font-medium text-gray-700 mb-1.5 block">
 Excerpt
 </label>
 <textarea
 value={form.excerpt}
 onChange={(e) => setField('excerpt', e.target.value)}
 maxLength={1000}
 rows={3}
 className="input resize-none"
 placeholder="Brief summary of the post..."
 />
 </div>

 {/* SEO Panel */}
 <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
 <button
 type="button"
 onClick={() => setSeoOpen(!seoOpen)}
 className="w-full flex items-center justify-between px-6 py-4 text-left"
 >
 <span className="text-sm font-medium text-gray-700">
 SEO Settings
 </span>
 <ChevronDown
 size={16}
 className={`text-gray-400 transition-transform ${
 seoOpen ? 'rotate-180' : ''
 }`}
 />
 </button>
 {seoOpen && (
 <div className="px-6 pb-6 space-y-4 border-t border-gray-100 pt-4">
 <div>
 <div className="flex justify-between mb-1.5">
 <label className="text-sm font-medium text-gray-700">
 Meta Title
 </label>
 <span
 className={`text-xs ${
 form.seo.metaTitle.length > 60
 ? 'text-red-500'
 : 'text-gray-400'
 }`}
 >
 {form.seo.metaTitle.length}/60
 </span>
 </div>
 <input
 value={form.seo.metaTitle}
 onChange={(e) => setSEO('metaTitle', e.target.value)}
 maxLength={60}
 className="input"
 placeholder="SEO optimized title"
 />
 </div>
 <div>
 <div className="flex justify-between mb-1.5">
 <label className="text-sm font-medium text-gray-700">
 Meta Description
 </label>
 <span
 className={`text-xs ${
 form.seo.metaDescription.length > 160
 ? 'text-red-500'
 : 'text-gray-400'
 }`}
 >
 {form.seo.metaDescription.length}/160
 </span>
 </div>
 <textarea
 value={form.seo.metaDescription}
 onChange={(e) => setSEO('metaDescription', e.target.value)}
 maxLength={160}
 rows={3}
 className="input resize-none"
 placeholder="Meta description for search engines"
 />
 </div>
 <div>
 <label className="text-sm font-medium text-gray-700 mb-1.5 block">
 Keywords
 </label>
 <input
 value={form.seo.keywords}
 onChange={(e) => setSEO('keywords', e.target.value)}
 maxLength={1600}
 className="input"
 placeholder="Comma-separated keywords"
 />
 </div>
 </div>
 )}
 </div>
 </div>

 {/* Right sidebar */}
 <div className="space-y-5">
 {/* Post Info Stats */}
 <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
 <h3 className="text-sm font-medium text-gray-700 mb-3">
 Post Info
 </h3>
 <div className="grid grid-cols-3 gap-3">
 <div className="text-center p-3 bg-gray-50 rounded-xl">
 <p className="text-lg font-bold text-gray-900">
 {stats.words}
 </p>
 <p className="text-xs text-gray-500">Words</p>
 </div>
 <div className="text-center p-3 bg-gray-50 rounded-xl">
 <p className="text-lg font-bold text-gray-900">
 {stats.chars}
 </p>
 <p className="text-xs text-gray-500">Chars</p>
 </div>
 <div className="text-center p-3 bg-gray-50 rounded-xl">
 <p className="text-lg font-bold text-gray-900">
 {stats.readTime}m
 </p>
 <p className="text-xs text-gray-500">Read</p>
 </div>
 </div>
 </div>

 {/* Status & Publish Date */}
 <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
 <div>
 <label className="text-sm font-medium text-gray-700 mb-1.5 block">
 Status
 </label>
 <select
 data-testid="blog-status"
 value={form.status}
 onChange={(e) => setField('status', e.target.value)}
 className="input bg-white"
 >
 <option value="draft">Draft</option>
 <option value="published">Published</option>
 <option value="archived">Archived</option>
 </select>
 </div>
 <div>
 <label className="text-sm font-medium text-gray-700 mb-1.5 block">
 Publish Date
 </label>
 <input
 data-testid="blog-publish-date"
 type="datetime-local"
 value={form.publishedAt}
 onChange={(e) => setField('publishedAt', e.target.value)}
 className="input"
 />
 </div>
 </div>

 {/* Category */}
 <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
 <label className="text-sm font-medium text-gray-700 mb-1.5 block">
 Category
 </label>
 <select
 value={form.category}
 onChange={(e) => setField('category', e.target.value)}
 className="input bg-white"
 >
 <option value="">No category</option>
 {categories.map((c) => (
 <option key={c._id} value={c._id}>
 {c.name}
 </option>
 ))}
 </select>
 </div>

 {/* Tags */}
 <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
 <label className="text-sm font-medium text-gray-700 mb-1.5 block">
 Tags
 </label>
 <input
 value={form.tags}
 onChange={(e) => setField('tags', e.target.value)}
 className="input"
 placeholder="tag1, tag2, tag3"
 />
 <p className="text-xs text-gray-400 mt-1">Separate tags with commas</p>
 </div>

 {/* Toggles */}
 <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
 <label className="flex items-center gap-3 cursor-pointer">
 <input
 type="checkbox"
 checked={form.isFeatured}
 onChange={(e) => setField('isFeatured', e.target.checked)}
 className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
 />
 <div>
 <p className="text-sm font-medium text-gray-800">
 Featured Post
 </p>
 <p className="text-xs text-gray-500">
 Show in featured section
 </p>
 </div>
 </label>
 <label className="flex items-center gap-3 cursor-pointer">
 <input
 type="checkbox"
 checked={form.allowComments}
 onChange={(e) => setField('allowComments', e.target.checked)}
 className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
 />
 <div>
 <p className="text-sm font-medium text-gray-800">
 Allow Comments
 </p>
 <p className="text-xs text-gray-500">
 Readers can leave comments
 </p>
 </div>
 </label>
 </div>

 {/* Related Products */}
 <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
 <label className="text-sm font-medium text-gray-700 mb-3 block">
 Related Products
 </label>
 <div className="relative">
 <input
 value={productSearch}
 onChange={(e) => setProductSearch(e.target.value)}
 className="input"
 placeholder="Search products..."
 />
 {searchingProducts && (
 <div className="absolute right-3 top-1/2 -translate-y-1/2">
 <Loader size="sm" />
 </div>
 )}
 </div>
 {productResults.length > 0 && (
 <ul className="mt-2 border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
 {productResults.map((product) => (
 <li key={product._id}>
 <button
 type="button"
 onClick={() => addRelatedProduct(product)}
 className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
 >
 {product.images?.[0] ? (
 <img
 src={product.images[0]?.url || product.images[0]}
 alt=""
 className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
 />
 ) : (
 <div className="w-8 h-8 rounded-lg bg-gray-100 flex-shrink-0" />
 )}
 <span className="text-sm text-gray-700 truncate">
 {product.title}
 </span>
 </button>
 </li>
 ))}
 </ul>
 )}
 {form.relatedProducts.length > 0 && (
 <div className="mt-3 space-y-2">
 {form.relatedProducts.map((product, idx) => {
 const title =
 typeof product === 'string' ? product : product.title || 'Product';
 const img =
 typeof product !== 'string' ? (product.images?.[0]?.url || product.images?.[0]) : null;
 return (
 <div
 key={idx}
 className="flex items-center gap-3 p-2 bg-gray-50 rounded-xl"
 >
 {img ? (
 <img
 src={img}
 alt=""
 className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
 />
 ) : (
 <div className="w-8 h-8 rounded-lg bg-gray-200 flex-shrink-0" />
 )}
 <span className="text-sm text-gray-700 truncate flex-1">
 {title}
 </span>
 <button
 type="button"
 onClick={() => removeRelatedProduct(idx)}
 className="p-1 text-gray-400 hover:text-red-500 transition-colors"
 >
 <X size={14} />
 </button>
 </div>
 );
 })}
 </div>
 )}
 </div>
 </div>
 </div>
 </div>
 );
};

export default AddEditBlogPostPage;
