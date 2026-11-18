import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { blogAPI } from '../../../services/api';

import { gridStyle } from '../../page/grid';

export default function BlogPosts({ data = {} }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const req = data.source === 'featured' ? blogAPI.getFeatured() : blogAPI.getPosts({ limit: data.count || 3 });
    req
      .then(r => { if (!cancelled) setPosts((r.data?.posts || r.data?.items || []).slice(0, data.count || 3)); })
      .catch(() => { if (!cancelled) setPosts([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [data.source, data.count]);

  if (loading) return <div className="py-6 text-center text-sm text-gray-400">Loading…</div>;
  if (!posts.length) return <div className="py-6 text-center text-sm text-gray-400">No posts to show.</div>;

  return (
    <section className="container mx-auto px-4">
      {(data.heading || data.seeAllLink) && (
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          {data.heading && <h2 className="min-w-0 break-anywhere text-xl font-bold text-gray-900 sm:text-2xl">{data.heading}</h2>}
          {data.seeAllLink && <Link to={data.seeAllLink} className="text-sm font-semibold text-indigo-600">See all →</Link>}
        </div>
      )}
      <div data-page-grid="posts" className="grid" style={gridStyle(data)}>
        {posts.map(p => (
          <Link key={p._id || p.slug} to={`/blog/${p.slug}`} className="group min-w-0 break-words">
            <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden mb-3">
              {p.coverImage || p.image
                ? <img data-page-builder-media="content" src={p.coverImage || p.image} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                : <div className="w-full h-full bg-gradient-to-br from-indigo-100 to-purple-100" />}
            </div>
            <h3 className="font-semibold text-gray-900 group-hover:text-indigo-700 transition line-clamp-2">{p.title}</h3>
            {p.excerpt && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{p.excerpt}</p>}
            <div className="text-xs text-gray-400 mt-2">{p.publishedAt ? new Date(p.publishedAt).toLocaleDateString() : ''}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
