import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { absoluteUrl, blogApi } from '../../lib/api';
import { ScreenFrame, ScreenScroll, LoadingView, ErrorView, SectionHeading } from '../../components/Common';
import StorefrontHeader from '../../components/StorefrontHeader';
import StorefrontFooter from '../../components/StorefrontFooter';

export default function BlogListScreen() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const result = await blogApi.list({ limit: 30, page: 1 });
      setPosts(result.posts || result.blogs || result.items || []);
      setError('');
    } catch (reason) { setError(reason.message || 'Articles could not be loaded.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  return <ScreenFrame><ScreenScroll refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />} contentContainerStyle={styles.content}>
    <StorefrontHeader />
    <View style={styles.heading}><SectionHeading title="Blog" /></View>
    {loading ? <LoadingView /> : error ? <ErrorView message={error} onRetry={load} /> : posts.length ? posts.map((post, index) => {
      const image = absoluteUrl(post.image || post.thumbnail || post.coverImage || post.featuredImage);
      return <Pressable key={post._id || post.slug || index} onPress={() => post.slug && router.push(`/blog/${encodeURIComponent(post.slug)}`)} style={styles.card}>{image ? <Image source={{ uri: image }} resizeMode="cover" style={styles.image} /> : null}<View style={styles.copy}><Text style={styles.title}>{post.title || post.name}</Text>{post.excerpt || post.description ? <Text numberOfLines={4} style={styles.excerpt}>{String(post.excerpt || post.description).replace(/<[^>]*>/g, ' ')}</Text> : null}<Text style={styles.readMore}>Read article ›</Text></View></Pressable>;
    }) : <Text style={styles.empty}>No articles are published right now.</Text>}
    <StorefrontFooter />
  </ScreenScroll></ScreenFrame>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 24 },
  heading: { paddingHorizontal: 16, paddingTop: 18 },
  card: { marginHorizontal: 16, marginBottom: 14, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 16, overflow: 'hidden', backgroundColor: '#ffffff' },
  image: { width: '100%', aspectRatio: 1.6, backgroundColor: '#f1f5f9' },
  copy: { padding: 14, gap: 7 },
  title: { color: '#111827', fontSize: 16, lineHeight: 22, fontWeight: '900' },
  excerpt: { color: '#64748b', fontSize: 12, lineHeight: 18 },
  readMore: { color: '#4f46e5', fontSize: 12, fontWeight: '800' },
  empty: { color: '#64748b', textAlign: 'center', padding: 30 },
});
