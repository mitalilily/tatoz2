import { useState, useEffect } from 'react';
import { FolderOpen, Search, ChevronRight, ChevronDown } from 'lucide-react';
import { vendorAPI } from '../../services/api';
import Loader from '../../components/common/Loader';
import { buildCategoryTree, categoryChildren, flattenCategoryTree } from '../../utils/categoryTree';

const CATEGORY_PLACEHOLDER = 'https://via.placeholder.com/200/c4b5fd/1e1b4b?text=Category';

export default function VendorCategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedParents, setExpandedParents] = useState({});
  const [treeView, setTreeView] = useState(false);

  useEffect(() => {
    vendorAPI.getCategories().then(r => setCategories(buildCategoryTree(r.data.data || []))).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const allCategories = flattenCategoryTree(categories);
  const filtered = search
    ? allCategories.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : allCategories;
  const topLevel = search ? filtered.filter(c => !c.parent) : categories;

  const toggleExpand = (id) => setExpandedParents(p => ({ ...p, [id]: !p[id] }));

  const renderTree = (cat, depth = 0) => {
    const children = search ? categoryChildren(cat).filter(child => filtered.some(item => String(item._id) === String(child._id))) : categoryChildren(cat);
    const expanded = expandedParents[cat._id] !== false;
    return <div key={cat._id} className="space-y-2" style={{ marginLeft: `${Math.min(depth, 3) * 18}px` }}>
      <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
        <button onClick={() => toggleExpand(cat._id)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-left">
          <div className="flex items-center gap-3">
            {children.length > 0 ? (expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />) : <span className="w-4" />}
            {cat.image && <img src={cat.image} alt="" className="w-8 h-8 rounded object-cover" />}
            <span className="font-medium">{cat.name}</span>
            <span className="text-[10px] uppercase tracking-wide text-gray-400">{cat.level || ['menu', 'submenu', 'category', 'subcategory'][depth]}</span>
          </div>
        </button>
        {expanded && children.length > 0 && <div className="border-t border-gray-100 bg-gray-50 p-3 space-y-2">{children.map(child => renderTree(child, depth + 1))}</div>}
      </div>
    </div>;
  };

  if (loading) return <div className="text-center py-12"><Loader /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FolderOpen className="text-primary-600" size={28} /> Categories
          </h1>
          <p className="text-gray-500 mt-1">Browse available categories</p>
        </div>
        <button
          onClick={() => setTreeView(t => !t)}
          className="text-sm text-indigo-600 hover:text-indigo-700 font-medium self-start"
        >
          {treeView ? 'Grid view' : 'Tree view'}
        </button>
      </div>

      <div className="relative max-w-md">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search categories..." className="input pl-10 w-full"
        />
      </div>

      {treeView ? (
        <div className="space-y-2">
          {topLevel.map(cat => renderTree(cat))}
          {topLevel.length === 0 && <p className="text-center py-8 text-gray-400">No categories found</p>}
        </div>
      ) : (
        <>
          {filtered.length === 0 ? (
            <p className="text-center py-12 text-gray-400">No categories found</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filtered.map(cat => (
                <div key={cat._id} className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
                  <div className="h-32 bg-gray-50 flex items-center justify-center overflow-hidden">
                    <img
                      src={cat.image || CATEGORY_PLACEHOLDER}
                      alt={cat.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-3">
                    <h3 className="font-medium text-gray-900">{cat.name}</h3>
                    {cat.parent?.name && <p className="text-xs text-gray-400 mt-0.5">Sub of: {cat.parent.name}</p>}
                    {cat.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{cat.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
