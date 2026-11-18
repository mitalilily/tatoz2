import { useCallback, useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { absoluteUrl, orderApi } from '../../lib/api';
import { ScreenFrame, ScreenScroll, LoadingView, ErrorView, SectionHeading, formatPrice } from '../../components/Common';
import StorefrontHeader from '../../components/StorefrontHeader';
import { useSite } from '../../context/SiteContext';

const humanize = value => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());

export default function OrderDetailScreen() {
  const params = useLocalSearchParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { settings, theme } = useSite();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const result = await orderApi.byId(id);
      setOrder(result.order || null);
      setError('');
      if (!result.order) setError('Order details could not be found.');
    } catch (reason) { setError(reason.message || 'Order details could not be loaded.'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  if (loading) return <ScreenFrame><LoadingView /></ScreenFrame>;
  if (error || !order) return <ScreenFrame><StorefrontHeader /><ErrorView message={error} onRetry={load} /></ScreenFrame>;

  const address = order.shippingAddress || {};
  const lines = Array.isArray(order.items) ? order.items : [];
  const timeline = Array.isArray(order.statusHistory) ? order.statusHistory : Array.isArray(order.timeline) ? order.timeline : [];
  return <ScreenFrame><ScreenScroll contentContainerStyle={styles.content}>
    <StorefrontHeader />
    <View style={styles.heading}><Text style={styles.title}>Order #{order.orderNumber || String(order._id).slice(-8).toUpperCase()}</Text><Text style={styles.status}>{humanize(order.orderStatus || order.status)}</Text><Text style={styles.meta}>{order.createdAt ? new Date(order.createdAt).toLocaleString() : ''}</Text></View>
    <View style={styles.section}><SectionHeading title="Items" />{lines.map((item, index) => { const image = absoluteUrl(item.image || item.thumbnail || item.product?.thumbnail || item.product?.images?.[0]?.url); return <View key={item._id || index} style={styles.item}>{image ? <Image source={{ uri: image }} style={styles.image} /> : <View style={styles.image} />}<View style={styles.itemInfo}><Text style={styles.itemTitle}>{item.title || item.product?.title || item.name || 'Product'}</Text><Text style={styles.meta}>Qty {item.quantity || 1}{item.variant && typeof item.variant === 'object' ? ` · ${Object.entries(item.variant).map(([key, value]) => `${key}: ${value}`).join(', ')}` : ''}</Text></View><Text style={styles.itemPrice}>{formatPrice(item.total || item.lineTotal || Number(item.price || 0) * Number(item.quantity || 1), settings)}</Text></View>; })}</View>
    <View style={styles.section}><SectionHeading title="Payment summary" />{[['Subtotal', order.subtotal], ['Discount', order.discount ? -Math.abs(Number(order.discount)) : 0], ['Shipping', order.shippingCost], ['Tax', order.tax], ['Total', order.total]].filter(([, value]) => value !== undefined && value !== null).map(([label, value]) => <View key={label} style={[styles.summaryRow, label === 'Total' && styles.totalRow]}><Text style={label === 'Total' ? styles.totalLabel : styles.meta}>{label}</Text><Text style={label === 'Total' ? styles.totalValue : styles.meta}>{formatPrice(value, settings)}</Text></View>)}<Text style={styles.meta}>Payment method: {humanize(order.paymentMethod)}</Text><Text style={styles.meta}>Payment status: {humanize(order.paymentStatus)}</Text></View>
    <View style={styles.section}><SectionHeading title="Delivery address" /><Text style={styles.addressName}>{address.fullName || ''}</Text><Text style={styles.address}>{[address.street, address.addressLine2, address.city, address.state, address.pincode, address.country].filter(Boolean).join(', ')}</Text>{address.phone ? <Text style={styles.meta}>{address.phone}</Text> : null}</View>
    {timeline.length ? <View style={styles.section}><SectionHeading title="Order updates" />{timeline.map((entry, index) => <View key={entry._id || index} style={styles.timelineItem}><View style={[styles.timelineDot, { backgroundColor: theme.brand }]} /><View style={{ flex: 1 }}><Text style={styles.timelineTitle}>{humanize(entry.status || entry.orderStatus || entry.title)}</Text>{entry.note || entry.description ? <Text style={styles.meta}>{entry.note || entry.description}</Text> : null}{entry.createdAt || entry.date ? <Text style={styles.date}>{new Date(entry.createdAt || entry.date).toLocaleString()}</Text> : null}</View></View>)}</View> : null}
  </ScreenScroll></ScreenFrame>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 24 },
  heading: { padding: 16, gap: 5 },
  title: { color: '#111827', fontSize: 21, fontWeight: '900' },
  status: { color: '#4f46e5', fontSize: 13, fontWeight: '800' },
  meta: { color: '#64748b', fontSize: 11, lineHeight: 17 },
  section: { paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#f1f5f9', gap: 9 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  image: { width: 54, height: 54, borderRadius: 9, backgroundColor: '#f1f5f9' },
  itemInfo: { flex: 1, gap: 3 },
  itemTitle: { color: '#1f2937', fontSize: 12, lineHeight: 18, fontWeight: '700' },
  itemPrice: { color: '#111827', fontSize: 12, fontWeight: '800' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  totalRow: { borderTopWidth: 1, borderTopColor: '#e2e8f0', marginTop: 4, paddingTop: 10 },
  totalLabel: { color: '#111827', fontSize: 14, fontWeight: '900' },
  totalValue: { color: '#111827', fontSize: 16, fontWeight: '900' },
  addressName: { color: '#1f2937', fontSize: 13, fontWeight: '800' },
  address: { color: '#475569', fontSize: 12, lineHeight: 18 },
  timelineItem: { flexDirection: 'row', gap: 10, paddingVertical: 7 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  timelineTitle: { color: '#1f2937', fontSize: 12, fontWeight: '800' },
  date: { color: '#94a3b8', fontSize: 10, marginTop: 3 },
});
