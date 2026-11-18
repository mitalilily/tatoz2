import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { categoryApi, productApi } from '../../lib/api';
import { ScreenFrame, ScreenScroll, LoadingView, SectionHeading } from '../../components/Common';
import StorefrontHeader from '../../components/StorefrontHeader';
import ProductCard from '../../components/ProductCard';
import { useSite } from '../../context/SiteContext';

export default function ShopScreen() {
  const params = useLocalSearchParams();
  const routeKey = JSON.stringify([params.q || params.search || '', params.category || '', params.brand || '']);
  return <ShopContent key={routeKey} params={params} />;
}

function ShopContent({ params }) {
  const { theme, header } = useSite();
  const [search, setSearch] = useState(String(params.q || params.search || ''));
  const [submittedSearch, setSubmittedSearch] = useState(String(params.q || params.search || ''));
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [sort, setSort] = useState('newest');
  const [reloadKey, setReloadKey] = useState(0);

  const filters = useMemo(() => ({
    search: submittedSearch || undefined,
    category: params.category || undefined,
    brand: params.brand || undefined,
    sort,
    page,
    limit: 12,
  }), [submittedSearch, params.category, params.brand, sort, page]);

  const load = useCallback(async (append = false) => {
    try {
      const [productResult, categoryResult] = await Promise.all([productApi.list(filters), categoryApi.list()]);
      const next = productResult.products || productResult.items || [];
      setProducts(current => append ? [...current, ...next] : next);
      setHasMore(Boolean(productResult.pagination?.hasNextPage || productResult.pagination?.hasMore || (next.length === filters.limit)));
      setCategories(categoryResult.categories || categoryResult.items || []);
    } catch (error) { Alert.alert('', error.message || 'Products could not be loaded.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [filters]);

  useEffect(() => { void Promise.resolve().then(() => load(page > 1)); }, [load, page, reloadKey]);

  const submit = () => { setProducts([]); setLoading(true); setPage(1); setSubmittedSearch(search.trim()); setReloadKey(value => value + 1); };
  const selectCategory = slug => { router.setParams({ category: slug }); };
  const loadMore = () => { setLoading(true); setPage(value => value + 1); };

  return <ScreenFrame>
    <ScreenScroll refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setPage(1); setLoading(true); setRefreshing(true); setReloadKey(value => value + 1); }} />} contentContainerStyle={styles.content}>
      <StorefrontHeader />
      <View style={styles.searchRow}><TextInput value={search} onChangeText={setSearch} onSubmitEditing={submit} returnKeyType="search" placeholder={header.searchPlaceholder || 'Search'} style={styles.searchInput} /><Pressable onPress={submit} style={[styles.searchButton, { backgroundColor: theme.brand }]}><Ionicons name="search" size={18} color="#ffffff" /></Pressable></View>
      {categories.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>{categories.map(item => <Pressable key={item._id || item.slug} onPress={() => selectCategory(item.slug)} style={[styles.categoryChip, String(params.category || '') === String(item.slug) && { borderColor: theme.brand, backgroundColor: `${theme.brand}12` }]}><Text style={styles.categoryText}>{item.name}</Text></Pressable>)}</ScrollView> : null}
      <View style={styles.topline}><SectionHeading title={submittedSearch ? `Results for “${submittedSearch}”` : params.category ? categories.find(item => item.slug === params.category)?.name || 'Products' : 'Shop'} /><Pressable onPress={() => setSort(value => value === 'newest' ? 'bestseller' : 'newest')} style={styles.sortButton}><Ionicons name="swap-vertical" size={15} color="#475569" /><Text style={styles.sortText}>{sort === 'newest' ? 'Newest' : 'Bestsellers'}</Text></Pressable></View>
      {loading && !products.length ? <LoadingView /> : products.length ? <View style={styles.grid}>{products.map(item => <ProductCard key={item._id || item.slug} product={item} compact />)}</View> : <Text style={styles.empty}>No products found.</Text>}
      {hasMore && products.length ? <Pressable onPress={loadMore} style={[styles.more, { borderColor: theme.brand }]}><Text style={{ color: theme.brand, fontWeight: '800' }}>Load more</Text></Pressable> : null}
    </ScreenScroll>
  </ScreenFrame>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 28 },
  searchRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  searchInput: { flex: 1, height: 46, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingHorizontal: 13, backgroundColor: '#ffffff' },
  searchButton: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  categories: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  categoryChip: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
  categoryText: { color: '#334155', fontSize: 11, fontWeight: '700' },
  topline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 8 },
  sortButton: { flexDirection: 'row', gap: 4, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 8 },
  sortText: { color: '#475569', fontSize: 11, fontWeight: '700' },
  grid: { paddingHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
  empty: { textAlign: 'center', color: '#64748b', padding: 30 },
  more: { margin: 18, minHeight: 42, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
