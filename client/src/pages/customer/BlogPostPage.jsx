import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Calendar, Clock, Eye, ArrowLeft, ArrowRight, Share2, Copy, Tag } from 'lucide-react';
import toast from 'react-hot-toast';
import { blogAPI } from '../../services/api';
import SEO from '../../components/common/SEO';
import { PLATFORM_NAME } from '../../constants/branding';
import Loader from '../../components/common/Loader';
import DOMPurify from 'dompurify';

const formatDate = (dateStr) => {
 const d = new Date(dateStr);
 return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const BlogPostPage = () => {
 const { slug } = useParams();
 const [post, setPost] = useState(null);
 const [relatedPosts, setRelatedPosts] = useState([]);
 const [prevPost, setPrevPost] = useState(null);
 const [nextPost, setNextPost] = useState(null);
 const [loading, setLoading] = useState(true);
 const [notFound, setNotFound] = useState(false);

 useEffect(() => {
 const fetchPost = async () => {
 setLoading(true);
 setNotFound(false);
 try {
 const res = await blogAPI.getBySlug(slug);
 setPost(res.data.post);
 setRelatedPosts(res.data.relatedPosts || []);
 setPrevPost(res.data.prevPost || null);
 setNextPost(res.data.nextPost || null);
 } catch (err) {
 if (err.status === 404) {
 setNotFound(true);
 } else {
 toast.error(err.message || 'Failed to load post');
 }
 } finally {
 setLoading(false);
 }
 };
 fetchPost();
 window.scrollTo({ top: 0 });
 }, [slug]);

 const handleCopyLink = async () => {
 try {
 await navigator.clipboard.writeText(window.location.href);
 toast.success('Link copied to clipboard!');
 } catch {
 toast.error('Failed to copy link');
 }
 };

 const handleShareTwitter = () => {
 const url = encodeURIComponent(window.location.href);
 const text = encodeURIComponent(post.title);
 window.open(`https://twitter.com/intent/tweet?url=${url}&text=${text}`, '_blank', 'noopener');
 };

 const handleShareWhatsApp = () => {
 const text = encodeURIComponent(`${post.title} - ${window.location.href}`);
 window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener');
 };

 if (loading) {
 return (
 <div className="min-h-screen flex items-center justify-center">
 <Loader size="lg" />
 </div>
 );
 }

 if (notFound || !post) {
 return (
 <div className="page-container py-16 text-center animate-fade-in">
 <h2 className="text-2xl font-bold text-gray-600 mb-4">Post not found</h2>
 <p className="text-gray-500 mb-6">
 The blog post you are looking for does not exist or has been removed.
 </p>
 <Link to="/blog" className="btn-primary inline-flex items-center gap-2">
 <ArrowLeft size={16} />
 Back to Blog
 </Link>
 </div>
 );
 }

 const seoTitle = post.seo?.metaTitle || post.title;
 const seoDescription = post.seo?.metaDescription || post.excerpt;
 const seoKeywords = post.seo?.keywords;
 const seoImage = post.seo?.ogImage || post.featuredImage;

 const jsonLd = {
 '@context': 'https://schema.org',
 '@type': 'BlogPosting',
 headline: post.title,
 description: post.excerpt,
 image: post.featuredImage,
 datePublished: post.publishedAt,
 dateModified: post.updatedAt,
 author: {
 '@type': 'Person',
 name: post.author?.name || 'Admin',
 },
 publisher: {
 '@type': 'Organization',
 name: PLATFORM_NAME,
 },
 wordCount: post.readTime ? post.readTime * 200 : undefined,
 };

 // Admin-authored content is still untrusted at the browser boundary (and
 // may have been imported from an older editor), so sanitize on every render.
 const trustedContent = DOMPurify.sanitize(post.content || '', { USE_PROFILES: { html: true } });

 return (
 <div className="animate-fade-in">
 <SEO
 title={seoTitle}
 description={seoDescription}
 keywords={seoKeywords}
 ogImage={seoImage}
 ogType="article"
 jsonLd={jsonLd}
 />

 {/* Hero Image */}
 {post.featuredImage && (
 <div className="w-full aspect-[3/1] max-h-[400px] bg-gray-100 overflow-hidden">
 <img
 src={post.featuredImage}
 alt={post.title}
 className="w-full h-full object-cover"
 />
 </div>
 )}

 <div className="page-container py-6 sm:py-8">
 {/* Breadcrumb */}
 <nav className="flex flex-wrap items-center gap-2 text-sm text-gray-500 mb-6 sm:mb-8">
 <Link to="/" className="hover:text-primary-600">Home</Link>
 <span>/</span>
 <Link to="/blog" className="hover:text-primary-600">Blog</Link>
 {post.category && (
 <>
 <span>/</span>
 <Link
 to={`/blog?category=${post.category.slug}`}
 className="hover:text-primary-600"
 >
 {post.category.name}
 </Link>
 </>
 )}
 </nav>

 <article className="max-w-3xl mx-auto">
 {/* Category Badge */}
 {post.category && (
 <Link
 to={`/blog?category=${post.category.slug}`}
 className="badge bg-primary-100 text-primary-700 text-xs mb-4 inline-block hover:bg-primary-200 transition-colors"
 >
 {post.category.name}
 </Link>
 )}

 {/* Title */}
 <h1 className="break-anywhere text-2xl font-black text-gray-900 mb-4 leading-tight sm:text-3xl md:text-4xl">
 {post.title}
 </h1>

 {/* Meta */}
 <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 mb-8 pb-8 border-b border-gray-200">
 {post.author?.name && (
 <span className="font-medium text-gray-700">
 {post.author.name}
 </span>
 )}
 <span className="flex items-center gap-1.5">
 <Calendar size={14} />
 {formatDate(post.publishedAt)}
 </span>
 <span className="flex items-center gap-1.5">
 <Clock size={14} />
 {post.readTime || 1} min read
 </span>
 <span className="flex items-center gap-1.5">
 <Eye size={14} />
 {post.viewCount || 0} views
 </span>
 </div>

 {/* Content — admin-authored trusted HTML */}
 <div
 className="prose prose-lg max-w-none mb-8
 prose-headings:font-bold prose-headings:text-gray-900
 prose-a:text-primary-600
 prose-img:rounded-xl"
 dangerouslySetInnerHTML={{ __html: trustedContent }}
 />

 {/* Tags */}
 {post.tags && post.tags.length > 0 && (
 <div className="flex flex-wrap items-center gap-2 py-6 border-t border-gray-200">
 <Tag size={16} className="text-gray-400" />
 {post.tags.map((tag) => (
 <Link
 key={tag}
 to={`/blog?tag=${encodeURIComponent(tag)}`}
 className="badge bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
 >
 {tag}
 </Link>
 ))}
 </div>
 )}

 {/* Share */}
 <div className="flex flex-wrap items-center gap-2 py-6 border-t border-gray-200 sm:gap-3">
 <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
 <Share2 size={16} />
 Share
 </span>
 <button
 onClick={handleCopyLink}
 className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
 >
 <Copy size={14} />
 Copy link
 </button>
 <button
 onClick={handleShareTwitter}
 className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
 >
 X / Twitter
 </button>
 <button
 onClick={handleShareWhatsApp}
 className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
 >
 WhatsApp
 </button>
 </div>
 </article>

 {/* Related Products */}
 {post.relatedProducts && post.relatedProducts.length > 0 && (
 <section className="max-w-3xl mx-auto mt-12">
 <h2 className="text-xl font-bold text-gray-900 mb-5">Related Products</h2>
 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
 {post.relatedProducts.map((product) => (
 <Link
 key={product._id}
 to={`/product/${product.slug}`}
 className="card group hover:shadow-md transition-all"
 >
 <div className="aspect-square bg-gray-50 overflow-hidden">
 <img
 src={product.images?.[0]?.url || 'https://via.placeholder.com/300'}
 alt={product.title}
 className="w-full h-full object-contain p-2 transition-transform duration-300 group-hover:scale-105"
 />
 </div>
 <div className="p-3">
 <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 mb-1 group-hover:text-primary-600 transition-colors">
 {product.title}
 </h3>
 <p className="text-sm font-bold text-gray-900">
 {product.comparePrice && product.comparePrice > product.price && (
 <span className="text-xs text-gray-400 line-through mr-1.5">
 &#8377;{product.comparePrice.toFixed(2)}
 </span>
 )}
 &#8377;{product.price.toFixed(2)}
 </p>
 </div>
 </Link>
 ))}
 </div>
 </section>
 )}

 {/* Prev / Next Navigation */}
 {(prevPost || nextPost) && (
 <nav className="max-w-3xl mx-auto mt-12 grid grid-cols-1 sm:grid-cols-2 gap-4">
 {prevPost ? (
 <Link
 to={`/blog/${prevPost.slug}`}
 className="card p-4 sm:p-5 group hover:shadow-md transition-all flex items-start gap-3"
 >
 <ArrowLeft size={20} className="text-gray-400 mt-0.5 flex-shrink-0 group-hover:text-primary-600 transition-colors" />
 <div>
 <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
 Previous
 </span>
 <p className="text-sm font-semibold text-gray-900 group-hover:text-primary-600 transition-colors line-clamp-2">
 {prevPost.title}
 </p>
 </div>
 </Link>
 ) : (
 <div />
 )}
 {nextPost ? (
 <Link
 to={`/blog/${nextPost.slug}`}
 className="card p-4 sm:p-5 group hover:shadow-md transition-all flex items-start gap-3 text-right sm:justify-end"
 >
 <div>
 <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
 Next
 </span>
 <p className="text-sm font-semibold text-gray-900 group-hover:text-primary-600 transition-colors line-clamp-2">
 {nextPost.title}
 </p>
 </div>
 <ArrowRight size={20} className="text-gray-400 mt-0.5 flex-shrink-0 group-hover:text-primary-600 transition-colors" />
 </Link>
 ) : (
 <div />
 )}
 </nav>
 )}

 {/* Related Posts */}
 {relatedPosts.length > 0 && (
 <section className="mt-16">
 <h2 className="section-title">Related Posts</h2>
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
 {relatedPosts.map((rp) => (
 <Link
 key={rp._id}
 to={`/blog/${rp.slug}`}
 className="card group hover:shadow-md transition-all duration-200"
 >
 <div className="aspect-[16/10] bg-gray-100 overflow-hidden">
 {rp.featuredImage ? (
 <img
 src={rp.featuredImage}
 alt={rp.title}
 className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
 />
 ) : (
 <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary-100 to-purple-100">
 <span className="text-5xl font-black text-primary-300 select-none">
 {rp.title?.charAt(0)?.toUpperCase()}
 </span>
 </div>
 )}
 </div>
 <div className="p-4">
 <h3 className="text-base font-bold text-gray-900 line-clamp-2 mb-1.5 group-hover:text-primary-600 transition-colors">
 {rp.title}
 </h3>
 {rp.excerpt && (
 <p className="text-sm text-gray-500 line-clamp-2 mb-3">
 {rp.excerpt}
 </p>
 )}
 <div className="flex items-center gap-3 text-xs text-gray-400">
 <span className="flex items-center gap-1">
 <Calendar size={12} />
 {formatDate(rp.publishedAt)}
 </span>
 <span className="flex items-center gap-1">
 <Clock size={12} />
 {rp.readTime || 1} min read
 </span>
 </div>
 </div>
 </Link>
 ))}
 </div>
 </section>
 )}
 </div>
 </div>
 );
};

export default BlogPostPage;
