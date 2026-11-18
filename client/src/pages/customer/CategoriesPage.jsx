import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, FolderTree, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { categoryAPI } from '../../services/api';
import SEO from '../../components/common/SEO';
import EmptyState from '../../components/common/EmptyState';
import Loader from '../../components/common/Loader';
import { categoryChildren, flattenCategoryTree } from '../../utils/categoryTree';

const imageFallback = 'https://via.placeholder.com/640x480/e0e7ff/3730a3?text=Category';

const CategoriesPage = () => {
  const [categories, setCategories] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadCategories = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await categoryAPI.getAll();
      setCategories((response.data.categories || []).filter(category => category && category.slug));
    } catch {
      setError('Categories could not be loaded right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadCategories(); }, []);

  const filteredCategories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return categories;
    return categories.filter(category => flattenCategoryTree([category]).some(item => [item.name, item.description].some(value => String(value || '').toLowerCase().includes(normalizedQuery))));
  }, [categories, query]);

  const renderDescendants = (items, depth = 1) => items.map(item => (
    <div key={item._id || item.slug} className="border-l border-gray-200 pl-3">
      <div className="flex items-center justify-between gap-2 py-1 text-xs text-gray-500"><span>{item.name}</span><span className="text-[10px] uppercase tracking-wide text-gray-300">{item.level || ['submenu', 'category', 'subcategory'][depth - 1] || 'subcategory'}</span></div>
      {categoryChildren(item).length > 0 && renderDescendants(categoryChildren(item), depth + 1)}
    </div>
  ));

  return (
    <div className="page-container py-6 sm:py-8" data-testid="categories-page">
      <SEO
        title="Categories"
        description="Explore all product categories and find what you need faster."
        breadcrumbs={[{ name: 'Home', url: '/' }, { name: 'Categories', url: '/categories' }]}
      />

      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-primary-600">Browse the catalog</p>
          <h1 className="text-2xl font-black tracking-tight text-gray-900 sm:text-3xl">Shop by category</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">Find the right collection, then browse every product in one place.</p>
        </div>
        <Link to="/search" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 transition hover:border-primary-300 hover:text-primary-600">
          Browse all products <ArrowRight size={15} />
        </Link>
      </div>

      <div className="relative mb-7 max-w-xl">
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search categories"
          aria-label="Search categories"
          className="input w-full rounded-2xl bg-white py-3 pl-11 pr-4 shadow-sm"
        />
      </div>

      {loading ? (
        <div className="flex min-h-52 items-center justify-center"><Loader size="lg" text="Loading categories" /></div>
      ) : error ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-8 text-center" role="alert">
          <p className="text-sm font-semibold text-red-700">{error}</p>
          <button type="button" onClick={loadCategories} className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700">Try again</button>
        </div>
      ) : filteredCategories.length === 0 ? (
        <EmptyState icon={FolderTree} title="No categories found" description={query ? 'Try a different search term.' : 'Categories will appear here once they are added.'} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="category-directory">
          {filteredCategories.map(category => (
            <Link
              key={category._id || category.slug}
              to={`/category/${category.slug}`}
              data-testid={`category-directory-${category.slug}`}
              className="group overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-lg"
            >
              <div className="relative aspect-[16/9] overflow-hidden bg-primary-50">
                {category.image ? (
                  <img
                    src={category.image}
                    alt={category.name}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = imageFallback; }}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary-100 via-indigo-50 to-white text-5xl font-black text-primary-200" aria-hidden="true">
                    {category.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-primary-600 shadow-sm transition group-hover:bg-primary-600 group-hover:text-white">
                  <ArrowRight size={17} />
                </span>
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-extrabold text-gray-900 group-hover:text-primary-600">{category.name}</h2>
                  <span className="shrink-0 text-xs font-semibold text-gray-400">{flattenCategoryTree([category]).length - 1} levels below</span>
                </div>
                {category.description && <p className="mt-1 line-clamp-2 text-sm leading-5 text-gray-500">{category.description}</p>}
                {categoryChildren(category).length > 0 && <div className="mt-3 space-y-0.5">{renderDescendants(categoryChildren(category))}</div>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default CategoriesPage;
