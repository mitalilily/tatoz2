import { useState, useEffect, useRef, useMemo } from 'react';
import { FolderOpen, Plus, Edit, Trash2, Upload, Loader2, ChevronRight, ChevronDown } from 'lucide-react';
import { categoryAPI, adminAPI } from '../../services/api';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import Loader from '../../components/common/Loader';
import Toggle from '../../components/common/Toggle';
import toast from 'react-hot-toast';
import { buildCategoryTree, categoryChildren, flattenCategoryTree, categoryPathLabel } from '../../utils/categoryTree';

const CATEGORY_PLACEHOLDER = 'https://via.placeholder.com/200/c4b5fd/1e1b4b?text=Category';
const defaultForm = { name: '', description: '', image: '', icon: '', parent: '', isActive: true, order: 0, commissionRate: 10 };

const AdminCategoriesPage = () => {
 const [categories, setCategories] = useState([]);
 const [loading, setLoading] = useState(true);
 const [showModal, setShowModal] = useState(false);
 const [editItem, setEditItem] = useState(null);
 const [deleteItem, setDeleteItem] = useState(null);
 const [form, setForm] = useState(defaultForm);
 const [saving, setSaving] = useState(false);
 const [uploadingImage, setUploadingImage] = useState(false);
 const [expandedParents, setExpandedParents] = useState({});
 const imageInputRef = useRef(null);

 useEffect(() => { fetchCategories(); }, []);

 const handleImageUpload = async (e) => {
 const file = e.target.files?.[0];
 if (!file) return;
 setUploadingImage(true);
 try {
 const formData = new FormData();
 formData.append('file', file);
 formData.append('type', 'category');
 const res = await adminAPI.uploadSiteAsset(formData);
 setForm(f => ({ ...f, image: res.data.url }));
 toast.success('Image uploaded');
 } catch (err) {
 toast.error(err.message || 'Upload failed');
 } finally {
 setUploadingImage(false);
 if (imageInputRef.current) imageInputRef.current.value = '';
 }
 };

 const fetchCategories = async () => {
 setLoading(true);
 try { const res = await categoryAPI.adminGetAll(); setCategories(res.data.categories); }
 catch {} finally { setLoading(false); }
 };

 const categoryTree = useMemo(() => buildCategoryTree(categories), [categories]);
 const categoryOptions = useMemo(() => flattenCategoryTree(categoryTree), [categoryTree]);

 const toggleExpand = (id) => setExpandedParents(prev => ({ ...prev, [id]: !prev[id] }));

 const openCreate = (parentId = '') => {
 setForm({ ...defaultForm, parent: parentId });
 setEditItem(null);
 setShowModal(true);
 };

 const openEdit = (cat) => {
 setForm({
 name: cat.name, description: cat.description || '', image: cat.image || '',
 icon: cat.icon || '', parent: cat.parent?._id || cat.parent || '',
   isActive: cat.isActive, order: cat.order || 0, commissionRate: cat.commissionRate ?? 10,
 });
 setEditItem(cat);
 setShowModal(true);
 };

 const handleSave = async () => {
 if (!form.name.trim()) { toast.error('Name is required'); return; }
 setSaving(true);
 try {
 if (editItem) {
 const categoryId = editItem._id || editItem.id;
 if (!categoryId) { toast.error('Category could not be identified.'); return; }
 await categoryAPI.update(categoryId, form);
 toast.success('Category updated!');
 } else {
 await categoryAPI.create(form);
 toast.success('Category created!');
 }
 setShowModal(false);
 fetchCategories();
 } catch (err) { toast.error(err.message); }
 finally { setSaving(false); }
 };

 const handleDelete = async () => {
 const categoryId = deleteItem._id || deleteItem.id;
 if (!categoryId) { toast.error('Category could not be identified.'); setDeleteItem(null); return; }
 try { await categoryAPI.delete(categoryId); toast.success('Category deleted'); setDeleteItem(null); fetchCategories(); }
 catch (err) { toast.error(err.message); }
 };

 const renderCategoryCard = (cat, depth, onEdit, onDelete) => (
 <div className={`bg-white rounded-2xl p-4 shadow-sm border-2 transition-all ${cat.isActive ? 'border-gray-100' : 'border-red-100 opacity-70'} ${depth > 0 ? 'border-dashed' : ''}`} style={{ marginLeft: `${Math.min(depth, 3) * 32}px` }}>
 <div className="flex items-center gap-3">
 <div className={`${depth > 0 ? 'w-10 h-10 rounded-xl' : 'w-14 h-14 rounded-2xl'} bg-gray-100 overflow-hidden flex-shrink-0`}>
 <img src={cat.image || CATEGORY_PLACEHOLDER} alt={cat.name} className="w-full h-full object-cover"
 onError={e => { e.target.onerror = null; e.target.src = CATEGORY_PLACEHOLDER; }} />
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2">
 <h3 className={`font-bold text-gray-900 ${depth > 0 ? 'text-sm' : ''}`}>{cat.name}</h3>
 <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${cat.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
 {cat.isActive ? 'Active' : 'Hidden'}
 </span>
 </div>
 {cat.description && <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{cat.description}</p>}
 </div>
 <div className="flex gap-1.5 flex-shrink-0">
 <button onClick={() => onEdit(cat)} className="p-2 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-xl transition-colors" aria-label={`Edit category ${cat.name}`} title={`Edit ${cat.name}`}>
 <Edit size={13} />
 </button>
 <button onClick={() => onDelete(cat)} className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition-colors" aria-label={`Delete category ${cat.name}`} title={`Delete ${cat.name}`}>
 <Trash2 size={13} />
 </button>
 </div>
 </div>
 </div>
 );

 return (
 <div className="space-y-5">
 <div className="flex items-center justify-between">
 <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
 <FolderOpen className="text-primary-600" size={26} />Categories
 </h1>
 <button onClick={() => openCreate()} className="btn-primary text-sm py-2.5 flex items-center gap-2">
 <Plus size={16} />Add Category
 </button>
 </div>

 {loading ? <div className="flex justify-center py-10"><Loader size="md" /></div> : (
 <div className="space-y-3">
 {categoryTree.length === 0 && (
 <p className="text-center py-10 text-gray-400">No categories yet. Create your first category.</p>
 )}
 {categoryTree.map(root => {
 const renderTree = (cat, depth = 0) => {
 const children = categoryChildren(cat);
 const isExpanded = expandedParents[cat._id] !== false;
 return <div key={cat._id} className="space-y-2">
   <div className="flex items-center gap-2">
    {children.length > 0 ? <button onClick={() => toggleExpand(cat._id)} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">{isExpanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}</button> : <div className="w-7" />}
    <div className="flex-1">{renderCategoryCard(cat, depth, openEdit, setDeleteItem)}</div>
   </div>
   {isExpanded && children.length > 0 && <div className="space-y-2">{children.map(child => renderTree(child, depth + 1))}</div>}
   {isExpanded && depth < 3 && <div className="flex items-center gap-2"><div className="w-7" /><button onClick={() => openCreate(cat._id)} aria-label={`Add child category to ${cat.name}`} title={`Add child category to ${cat.name}`} className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-700 font-medium px-3 py-2 rounded-xl border border-dashed border-primary-300 hover:bg-primary-50 transition-colors" style={{ marginLeft: `${Math.min(depth + 1, 3) * 32}px` }}><Plus size={12} />Add child level</button></div>}
 </div>;
 };
 return renderTree(root);
 })}
 </div>
 )}

 <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editItem ? 'Edit Category' : form.parent ? 'New Sub-Category' : 'New Category'} size="md">
 <div className="space-y-4">
 <div>
 <label className="text-sm font-medium text-gray-700 mb-1 block">Category Name *</label>
 <input data-testid="category-name" maxLength={80} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input" placeholder="Electronics, Fashion..." />
 </div>
 <div>
 <label className="text-sm font-medium text-gray-700 mb-1 block">Category Image (1:1)</label>
 <div className="flex items-start gap-4">
 <div className="w-24 h-24 flex-shrink-0 rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
 <img src={form.image || CATEGORY_PLACEHOLDER} alt="" className="w-full h-full object-cover" onError={e => { e.target.onerror = null; e.target.src = CATEGORY_PLACEHOLDER; }} />
 </div>
 <div className="flex-1 min-w-0">
 <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
 <button type="button" onClick={() => imageInputRef.current?.click()} disabled={uploadingImage} className="btn-secondary text-sm py-2 flex items-center gap-2">
 {uploadingImage ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
 {uploadingImage ? 'Uploading…' : 'Upload image'}
 </button>
 {form.image && (
 <button type="button" onClick={() => setForm(f => ({ ...f, image: '' }))} className="mt-2 text-xs text-red-600 hover:underline">
 Remove image
 </button>
 )}
 </div>
 </div>
 </div>
 <div>
 <label className="text-sm font-medium text-gray-700 mb-1 block">Description</label>
 <textarea data-testid="category-description" maxLength={1000} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className="input resize-none" placeholder="Category description..." />
 </div>
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
 <div>
 <label className="text-sm font-medium text-gray-700 mb-1 block">Parent Category</label>
 <select value={form.parent} onChange={e => setForm(f => ({ ...f, parent: e.target.value }))} className="input bg-white text-sm">
 <option value="">No parent (top-level)</option>
 {categoryOptions.filter(c => (Number(c.depth) || 0) < 3 && (!editItem || (c._id !== editItem._id && !(editItem.ancestors || []).some(id => String(id) === String(c._id))))).map(c => (
 <option key={c._id} value={c._id}>{categoryPathLabel(c._id, categories)}</option>
 ))}
 </select>
 </div>
 <div>
 <label className="text-sm font-medium text-gray-700 mb-1 block">Seller commission rate (%)</label>
 <input data-testid="category-commission-rate" type="number" min="0" max="100" step="0.01" value={form.commissionRate} onChange={e => setForm(f => ({ ...f, commissionRate: Number(e.target.value) }))} className="input" />
 <p className="mt-1 text-xs text-gray-500">Applied to seller order lines in this category unless a seller override is configured.</p>
 </div>
 <div>
 <label className="text-sm font-medium text-gray-700 mb-1 block">Sort Order</label>
 <input type="number" value={form.order} onChange={e => setForm(f => ({ ...f, order: parseInt(e.target.value) || 0 }))} className="input" />
 </div>
 </div>
 <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
 <div><p className="font-medium text-gray-800 text-sm">Visible to customers</p><p className="text-xs text-gray-500">Toggle to show/hide this category</p></div>
 <Toggle checked={form.isActive} onChange={() => setForm(f => ({ ...f, isActive: !f.isActive }))} aria-label="Visible to customers" />
 </div>
 <div className="flex gap-3">
 <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
 <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
 {saving ? <Loader size="sm" /> : editItem ? 'Update' : 'Create'}
 </button>
 </div>
 </div>
 </Modal>

 <ConfirmDialog isOpen={!!deleteItem} onClose={() => setDeleteItem(null)} onConfirm={handleDelete}
 title="Delete Category" message={`Delete "${deleteItem?.name}"? Products in this category won't be deleted.`}
 confirmLabel="Delete" isDanger />
 </div>
 );
};

export default AdminCategoriesPage;
