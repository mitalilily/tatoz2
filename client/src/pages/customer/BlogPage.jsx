import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Calendar, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { blogAPI } from '../../services/api';
import SEO from '../../components/common/SEO';
import Loader from '../../components/common/Loader';

const formatDate = (dateStr) => {
 const d = new Date(dateStr);
 return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const PostCard = ({ post }) => (
 <Link to={`/blog/${post.slug}`} className="card group hover:shadow-md transition-all duration-200">
 <div className="aspect-[16/10] bg-gray-100 overflow-hidden relative">
 {post.featuredImage ? (
 <img
 src={post.featuredImage}
 alt={post.title}
 className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
 />
 ) : (
 <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary-100 to-purple-100">
 <span className="text-5xl font-black text-primary-300 select-none">
 {post.title?.charAt(0)?.toUpperCase()}
 </span>
 </div>
 )}
 {post.category && (
 <span className="absolute top-3 left-3 badge bg-primary-600 text-white text-xs">
 {post.category.name}
 </span>
 )}
 </div>
 <div className="p-4">
 <h3 className="text-base font-bold text-gray-900 line-clamp-2 mb-1.5 group-hover:text-primary-600 transition-colors">
 {post.title}
 </h3>
 {post.excerpt && (
 <p className="text-sm text-gray-500 line-clamp-2 mb-3">
 {post.excerpt}
 </p>
 )}
 <div className="flex items-center gap-3 text-xs text-gray-400">
 <span className="flex items-center gap-1">
 <Calendar size={12} />
 {formatDate(post.publishedAt)}
 </span>
 <span className="flex items-center gap-1">
 <Clock size={12} />
 {post.readTime || 1} min read
 </span>
 </div>
 </div>
 </Link>
);

const BlogPage = () => {
 const [searchParams, setSearchParams] = useSearchParams();
 const [posts, setPosts] = useState([]);
 const [pagination, setPagination] = useState(null);
 const [categories, setCategories] = useState([]);
 const [featuredPosts, setFeaturedPosts] = useState([]);
 const [loading, setLoading] = useState(true);
 const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');

 const currentPage = parseInt(searchParams.get('page')) || 1;
 const activeCategory = searchParams.get('category') || '';
 const activeTag = searchParams.get('tag') || '';
 const activeSearch = searchParams.get('search') || '';

 // Fetch posts when params change
 useEffect(() => {
 const fetchPosts = async () => {
 setLoading(true);
 try {
 const params = { page: currentPage, limit: 12 };
 if (activeCategory) params.category = activeCategory;
 if (activeTag) params.tag = activeTag;
 if (activeSearch) params.search = activeSearch;

 const res = await blogAPI.getPosts(params);
 setPosts(res.data.posts);
 setPagination(res.data.pagination);
 } catch {
 // silently handle
 } finally {
 setLoading(false);
 }
 };
 fetchPosts();
 }, [currentPage, activeCategory, activeTag, activeSearch]);

 // Fetch categories once
 useEffect(() => {
 const fetchCategories = async () => {
 try {
 const res = await blogAPI.getCategories();
 setCategories(res.data.categories);
 } catch {
 // silently handle
 }
 };
 fetchCategories();
 }, []);

 // Fetch featured posts once
 useEffect(() => {
 const fetchFeatured = async () => {
 try {
 const res = await blogAPI.getFeatured();
 setFeaturedPosts(res.data.posts);
 } catch {
 // silently handle
 }
 };
 fetchFeatured();
 }, []);

 const updateParams = (updates) => {
 const newParams = new URLSearchParams(searchParams);
 Object.entries(updates).forEach(([key, value]) => {
 if (value) {
 newParams.set(key, value);
 } else {
 newParams.delete(key);
 }
 });
 setSearchParams(newParams);
 };

 const handleSearch = (e) => {
 e.preventDefault();
 updateParams({ search: searchInput, page: '' });
 };

 const handleCategoryClick = (slug) => {
 updateParams({ category: slug === activeCategory ? '' : slug, page: '' });
 };

 const handlePageChange = (page) => {
 updateParams({ page: page === 1 ? '' : String(page) });
 window.scrollTo({ top: 0, behavior: 'smooth' });
 };

 const hasActiveFilters = activeCategory || activeTag || activeSearch;
 const showFeaturedHero = !hasActiveFilters && currentPage === 1 && featuredPosts.length > 0;
 const featuredPost = featuredPosts[0];

 return (
 <div className="page-container py-6 sm:py-8 animate-fade-in">
 <SEO title="Blog" description="Read the latest articles, guides, and updates from our blog." />

 {/* Header */}
 <div className="mb-8">
 <h1 className="text-2xl font-extrabold text-gray-900 mb-2 sm:text-3xl md:text-4xl">Blog</h1>
 <p className="text-gray-500">Insights, guides, and the latest updates</p>
 </div>

 {/* Featured Hero */}
 {showFeaturedHero && (
 <Link
 to={`/blog/${featuredPost.slug}`}
 className="block mb-10 card group hover:shadow-lg transition-all duration-300 overflow-hidden"
 >
 <div className="grid md:grid-cols-2">
 <div className="aspect-[16/10] md:aspect-auto bg-gray-100 overflow-hidden">
 {featuredPost.featuredImage ? (
 <img
 src={featuredPost.featuredImage}
 alt={featuredPost.title}
 className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
 />
 ) : (
 <div className="w-full h-full min-h-[240px] flex items-center justify-center bg-gradient-to-br from-primary-100 to-purple-100">
 <span className="text-7xl font-black text-primary-300 select-none">
 {featuredPost.title?.charAt(0)?.toUpperCase()}
 </span>
 </div>
 )}
 </div>
 <div className="p-4 sm:p-6 md:p-8 flex flex-col justify-center">
 {featuredPost.category && (
 <span className="badge bg-primary-100 text-primary-700 text-xs mb-3 self-start">
 {featuredPost.category.name}
 </span>
 )}
 <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3 group-hover:text-primary-600 transition-colors">
 {featuredPost.title}
 </h2>
 {featuredPost.excerpt && (
 <p className="text-gray-500 mb-4 line-clamp-3">
 {featuredPost.excerpt}
 </p>
 )}
 <div className="flex items-center gap-3 text-sm text-gray-400">
 <span className="flex items-center gap-1">
 <Calendar size={14} />
 {formatDate(featuredPost.publishedAt)}
 </span>
 <span className="flex items-center gap-1">
 <Clock size={14} />
 {featuredPost.readTime || 1} min read
 </span>
 </div>
 </div>
 </div>
 </Link>
 )}

 <div className="flex flex-col lg:flex-row gap-8">
 {/* Sidebar */}
 <aside className="lg:w-64 flex-shrink-0 space-y-6">
 {/* Search */}
 <form onSubmit={handleSearch}>
 <div className="relative">
 <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
 <input
 type="text"
 value={searchInput}
 onChange={(e) => setSearchInput(e.target.value)}
 placeholder="Search posts..."
 className="input pl-9 py-2.5 text-sm bg-white"
 />
 </div>
 </form>

 {/* Categories */}
 <div>
 <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wider">
 Categories
 </h3>
 <div className="flex flex-wrap lg:flex-col gap-2">
 <button
 onClick={() => handleCategoryClick('')}
 className={`text-sm px-3 py-1.5 rounded-lg text-left transition-colors ${
 !activeCategory
 ? 'bg-primary-600 text-white font-medium'
 : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
 }`}
 >
 All Posts
 </button>
 {categories.map((cat) => (
 <button
 key={cat._id}
 onClick={() => handleCategoryClick(cat.slug)}
 className={`text-sm px-3 py-1.5 rounded-lg text-left transition-colors ${
 activeCategory === cat.slug
 ? 'bg-primary-600 text-white font-medium'
 : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
 }`}
 >
 {cat.name}
 </button>
 ))}
 </div>
 </div>

 {/* Active filters */}
 {hasActiveFilters && (
 <button
 onClick={() => {
 setSearchInput('');
 setSearchParams({});
 }}
 className="text-sm text-red-500 hover:text-red-600 font-medium"
 >
 Clear all filters
 </button>
 )}
 </aside>

 {/* Main Content */}
 <div className="flex-1 min-w-0">
 {/* Active tag indicator */}
 {activeTag && (
 <div className="mb-4 flex items-center gap-2 text-sm text-gray-600">
 Posts tagged with
 <span className="badge bg-gray-200 text-gray-700">
 {activeTag}
 </span>
 <button
 onClick={() => updateParams({ tag: '' })}
 className="text-red-500 hover:text-red-600 font-medium ml-1"
 >
 Remove
 </button>
 </div>
 )}

 {loading ? (
 <div className="flex items-center justify-center py-20">
 <Loader size="lg" />
 </div>
 ) : posts.length === 0 ? (
 <div className="text-center py-20">
 <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
 <Search size={24} className="text-gray-400" />
 </div>
 <h3 className="text-lg font-semibold text-gray-900 mb-2">No posts found</h3>
 <p className="text-gray-500 text-sm">
 {activeSearch
 ? `No results for "${activeSearch}". Try different keywords.`
 : 'No blog posts match the current filters.'}
 </p>
 </div>
 ) : (
 <>
 <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 mb-8">
 {posts.map((post) => (
 <PostCard key={post._id} post={post} />
 ))}
 </div>

 {/* Pagination */}
 {pagination && pagination.pages > 1 && (
 <div className="flex items-center justify-center gap-1.5">
 <button
 onClick={() => handlePageChange(currentPage - 1)}
 disabled={currentPage <= 1}
 className="w-9 h-9 rounded-lg flex items-center justify-center border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
 >
 <ChevronLeft size={16} />
 </button>
 {Array.from({ length: pagination.pages }, (_, i) => i + 1)
 .filter((p) => {
 // Show first, last, current, and neighbors
 if (p === 1 || p === pagination.pages) return true;
 if (Math.abs(p - currentPage) <= 1) return true;
 return false;
 })
 .reduce((acc, p, idx, arr) => {
 // Insert ellipsis between gaps
 if (idx > 0 && p - arr[idx - 1] > 1) {
 acc.push('...' + p);
 }
 acc.push(p);
 return acc;
 }, [])
 .map((p) =>
 typeof p === 'string' ? (
 <span
 key={p}
 className="w-9 h-9 flex items-center justify-center text-sm text-gray-400"
 >
 ...
 </span>
 ) : (
 <button
 key={p}
 onClick={() => handlePageChange(p)}
 className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-medium transition-colors ${
 p === currentPage
 ? 'bg-primary-600 text-white'
 : 'border border-gray-200 text-gray-600 hover:bg-gray-100'
 }`}
 >
 {p}
 </button>
 )
 )}
 <button
 onClick={() => handlePageChange(currentPage + 1)}
 disabled={currentPage >= (pagination?.pages || 1)}
 className="w-9 h-9 rounded-lg flex items-center justify-center border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
 >
 <ChevronRight size={16} />
 </button>
 </div>
 )}
 </>
 )}
 </div>
 </div>
 </div>
 );
};

export default BlogPage;
