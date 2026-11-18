import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { productApi } from '../lib/api';
import { ScreenFrame, ScreenScroll, LoadingView, SectionHeading } from '../components/Common';
import StorefrontHeader from '../components/StorefrontHeader';
import StorefrontFooter from '../components/StorefrontFooter';
import ProductCard from '../components/ProductCard';
import { useAuth } from '../context/AuthContext';
import { useSite } from '../context/SiteContext';

export default function WishlistScreen() {
  const { user } = useAuth();
  const { theme } = useSite();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const saved = useMemo(() => Array.isArray(user?.wishlist) ? user.wishlist : [], [user]);

  const load = useCallback(async () => {
    if (!saved.length) return;
    try {
      const ids = saved.map(item => String(item?._id || item?.id || item)).filter(id => /^[a-f\d]{24}$/i.test(id));
      let fetched = [];
      if (ids.length) {
        const result = await productApi.list({ ids: ids.join(','), limit: Math.max(ids.length, 20) });
        fetched = result.products || result.items || [];
      } else await Promise.resolve();
      const fetchedById = new Map(fetched.map(item => [String(item._id), item]));
      setProducts(saved.map(item => typeof item === 'object' && item?.title ? item : fetchedById.get(String(item?._id || item?.id || item))).filter(Boolean));
    } catch (error) {
      setProducts(saved.filter(item => typeof item === 'object' && item?.title));
      if (!saved.length) Alert.alert('', error.message || 'Wishlist could not be loaded.');
    } finally { setLoading(false); }
  }, [saved]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const savedIds = useMemo(() => new Set(saved.map(item => String(item?._id || item?.id || item))), [saved]);
  const visibleProducts = products.filter(product => savedIds.has(String(product._id || product.id)));

  return <ScreenFrame><ScreenScroll contentContainerStyle={styles.content}>
    <StorefrontHeader />
    <View style={styles.heading}><SectionHeading title="Wishlist" /><Text style={styles.count}>{products.length || saved.length} items</Text></View>
    {loading && saved.length ? <LoadingView /> : visibleProducts.length ? <View style={styles.grid}>{visibleProducts.map(product => <ProductCard key={product._id || product.slug} product={{ ...product, isWishlisted: true }} compact />)}</View> : <View style={styles.empty}><Ionicons name="heart-outline" size={42} color="#cbd5e1" /><Text style={styles.emptyTitle}>Your wishlist is empty</Text><Text style={styles.emptyText}>Products you save will appear here.</Text><Pressable onPress={() => router.push('/shop')} style={[styles.shopButton, { backgroundColor: theme.brand }]}><Text style={styles.shopButtonText}>Browse products</Text></Pressable></View>}
    <StorefrontFooter />
  </ScreenScroll></ScreenFrame>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 24 },
  heading: { paddingHorizontal: 16, paddingTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { color: '#64748b', fontSize: 12 },
  grid: { paddingHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 32, minHeight: 320, gap: 10 },
  emptyTitle: { color: '#111827', fontSize: 18, fontWeight: '800' },
  emptyText: { color: '#64748b', fontSize: 12 },
  shopButton: { marginTop: 8, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
  shopButtonText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },
});
