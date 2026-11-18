import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { absoluteUrl, orderApi } from '../../lib/api';
import { ScreenFrame, ScreenScroll, LoadingView, ErrorView, SectionHeading, formatPrice } from '../../components/Common';
import StorefrontHeader from '../../components/StorefrontHeader';
import StorefrontFooter from '../../components/StorefrontFooter';
import { useSite } from '../../context/SiteContext';

const humanize = value => String(value || 'pending').replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());

export default function OrdersScreen() {
  const { settings, theme } = useSite();
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const result = await orderApi.mine({ page, limit: 10 });
      setOrders(result.orders || []);
      setPagination(result.pagination || null);
      setError('');
    } catch (reason) { setError(reason.message || 'Orders could not be loaded.'); }
    finally { setLoading(false); }
  }, [page]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  return <ScreenFrame><ScreenScroll contentContainerStyle={styles.content}>
    <StorefrontHeader />
    <View style={styles.heading}><SectionHeading title="My orders" /><Text style={styles.count}>{pagination?.total ?? orders.length}</Text></View>
    {loading ? <LoadingView /> : error ? <ErrorView message={error} onRetry={load} /> : orders.length ? <>
      {orders.map(order => {
        const items = Array.isArray(order.items) ? order.items : [];
        const preview = items.slice(0, 3);
        return <Pressable key={order._id} onPress={() => router.push(`/orders/${encodeURIComponent(order._id)}`)} style={styles.orderCard}>
          <View style={styles.orderTop}><View style={{ flex: 1 }}><Text style={styles.orderNumber}>#{order.orderNumber || String(order._id).slice(-8).toUpperCase()}</Text><Text style={styles.date}>{order.createdAt ? new Date(order.createdAt).toLocaleDateString() : ''}</Text></View><View style={styles.statusBox}><Text style={[styles.status, { color: theme.brand }]}>{humanize(order.orderStatus || order.status)}</Text><Text style={styles.total}>{formatPrice(order.total, settings)}</Text></View></View>
          <View style={styles.itemsPreview}>{preview.map((item, index) => { const uri = absoluteUrl(item.image || item.thumbnail || item.product?.thumbnail || item.product?.images?.[0]?.url); return uri ? <Image key={item._id || index} source={{ uri }} style={styles.productImage} /> : <View key={item._id || index} style={styles.productImage}><Ionicons name="cube-outline" color="#94a3b8" size={17} /></View>; })}<Text style={styles.itemCount}>{items.length} {items.length === 1 ? 'item' : 'items'}</Text></View>
          <View style={styles.orderBottom}><Text style={styles.detailAction}>View order</Text><Ionicons name="chevron-forward" size={17} color="#94a3b8" /></View>
        </Pressable>;
      })}
      <View style={styles.pagination}><Pressable disabled={page <= 1} onPress={() => setPage(value => value - 1)} style={[styles.pageButton, page <= 1 && styles.pageDisabled]}><Text style={styles.pageText}>Previous</Text></Pressable><Text style={styles.pageLabel}>{page}{pagination?.pages ? ` / ${pagination.pages}` : ''}</Text><Pressable disabled={pagination?.pages ? page >= pagination.pages : orders.length < 10} onPress={() => setPage(value => value + 1)} style={[styles.pageButton, pagination?.pages && page >= pagination.pages && styles.pageDisabled]}><Text style={styles.pageText}>Next</Text></Pressable></View>
    </> : <View style={styles.empty}><Ionicons name="receipt-outline" size={42} color="#cbd5e1" /><Text style={styles.emptyTitle}>No orders yet</Text><Text style={styles.date}>Your order history will appear here.</Text><Pressable onPress={() => router.push('/shop')} style={[styles.shopButton, { backgroundColor: theme.brand }]}><Text style={styles.shopText}>Start shopping</Text></Pressable></View>}
    <StorefrontFooter />
  </ScreenScroll></ScreenFrame>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 24 },
  heading: { paddingHorizontal: 16, paddingTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { color: '#64748b', fontSize: 12 },
  orderCard: { marginHorizontal: 16, marginBottom: 12, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 16, backgroundColor: '#ffffff' },
  orderTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  orderNumber: { color: '#111827', fontSize: 14, fontWeight: '900' },
  date: { color: '#64748b', fontSize: 11, marginTop: 4 },
  statusBox: { alignItems: 'flex-end', gap: 4 },
  status: { fontSize: 11, fontWeight: '800' },
  total: { color: '#111827', fontSize: 14, fontWeight: '900' },
  itemsPreview: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 14 },
  productImage: { width: 38, height: 38, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  itemCount: { color: '#64748b', fontSize: 11, marginLeft: 3 },
  orderBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 11, marginTop: 12 },
  detailAction: { color: '#334155', fontSize: 12, fontWeight: '800' },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, marginVertical: 12 },
  pageButton: { paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10 },
  pageDisabled: { opacity: 0.4 },
  pageText: { color: '#334155', fontSize: 11, fontWeight: '700' },
  pageLabel: { color: '#64748b', fontSize: 11 },
  empty: { alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 10 },
  emptyTitle: { color: '#111827', fontSize: 17, fontWeight: '800' },
  shopButton: { marginTop: 8, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
  shopText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },
});
