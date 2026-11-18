import { useCallback, useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { absoluteUrl, blogApi } from '../../lib/api';
import { ScreenFrame, ScreenScroll, LoadingView, ErrorView } from '../../components/Common';
import StorefrontHeader from '../../components/StorefrontHeader';
import StorefrontFooter from '../../components/StorefrontFooter';

const plainText = value => String(value || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?\s*>|<\/(p|div|li|h[1-6])>/gi, '\n').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/\n\s+/g, '\n').trim();

export default function BlogPostScreen() {
  const params = useLocalSearchParams();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const result = await blogApi.bySlug(slug);
      setPost(result.post || result.blog || null);
      setError('');
      if (!result.post && !result.blog) setError('This article could not be found.');
    } catch (reason) { setError(reason.message || 'This article could not be loaded.'); }
    finally { setLoading(false); }
  }, [slug]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  if (loading) return <ScreenFrame><LoadingView /></ScreenFrame>;
  if (error || !post) return <ScreenFrame><StorefrontHeader /><ErrorView message={error} onRetry={load} /></ScreenFrame>;

  const image = absoluteUrl(post.image || post.thumbnail || post.coverImage || post.featuredImage);
  return <ScreenFrame><ScreenScroll contentContainerStyle={styles.content}>
    <StorefrontHeader />
    {image ? <Image source={{ uri: image }} resizeMode="cover" style={styles.image} /> : null}
    <View style={styles.article}><Text style={styles.title}>{post.title || post.name}</Text>{post.publishedAt || post.createdAt ? <Text style={styles.date}>{new Date(post.publishedAt || post.createdAt).toLocaleDateString()}</Text> : null}{post.excerpt ? <Text style={styles.excerpt}>{plainText(post.excerpt)}</Text> : null}<Text style={styles.body}>{plainText(post.content || post.body || post.description || post.html)}</Text></View>
    <StorefrontFooter />
  </ScreenScroll></ScreenFrame>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 24 },
  image: { width: '100%', aspectRatio: 1.45, backgroundColor: '#f1f5f9' },
  article: { padding: 18, gap: 10 },
  title: { color: '#111827', fontSize: 24, lineHeight: 31, fontWeight: '900' },
  date: { color: '#94a3b8', fontSize: 11 },
  excerpt: { color: '#334155', fontSize: 15, lineHeight: 22, fontWeight: '600' },
  body: { color: '#475569', fontSize: 14, lineHeight: 23 },
});
