import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { absoluteUrl } from '../../lib/api';
import { ScreenFrame, ScreenScroll, LoadingView, formatPrice, SectionHeading, PrimaryButton } from '../../components/Common';
import StorefrontHeader from '../../components/StorefrontHeader';
import { useCart } from '../../context/CartContext';
import { useSite } from '../../context/SiteContext';

export default function CartScreen() {
  const { cart, loading, updateItem, removeItem, refresh } = useCart();
  const { settings, theme } = useSite();
  const [busyItem, setBusyItem] = useState('');
  const items = Array.isArray(cart.items) ? cart.items : [];

  const changeQuantity = async (item, quantity) => {
    setBusyItem(item.id);
    try {
      if (quantity <= 0) await removeItem(item.id);
      else await updateItem(item.id, Math.min(100, quantity));
    } catch (error) { Alert.alert('', error.message || 'Cart could not be updated.'); await refresh().catch(() => {}); }
    finally { setBusyItem(''); }
  };

  return <ScreenFrame><ScreenScroll contentContainerStyle={styles.content}>
    <StorefrontHeader />
    <View style={styles.heading}><SectionHeading title="Your cart" /><Text style={styles.count}>{cart.itemCount || 0} items</Text></View>
    {loading && !items.length ? <LoadingView /> : !items.length ? <View style={styles.empty}><Ionicons name="bag-handle-outline" size={42} color="#cbd5e1" /><Text style={styles.emptyTitle}>Your cart is empty</Text><Text style={styles.muted}>Browse the store and add products to your cart.</Text><Pressable onPress={() => router.push('/shop')} style={[styles.shopButton, { backgroundColor: theme.brand }]}><Text style={styles.shopButtonText}>Continue shopping</Text></Pressable></View> : <>
      {cart.hasUnavailableItems ? <Text style={styles.notice}>Some items are unavailable or have limited stock. Review them before checkout.</Text> : null}
      {items.map(item => {
        const product = item.product || {};
        const image = absoluteUrl(product.image || product.thumbnail || product.images?.[0]?.url);
        const variantText = Object.entries(item.variant || {}).map(([key, value]) => `${key}: ${value}`).join(' · ');
        return <View key={item.id} style={styles.item}>
          {image ? <Image source={{ uri: image }} resizeMode="cover" style={styles.photo} /> : <View style={styles.photo} />}
          <View style={styles.itemBody}>
            <Text numberOfLines={2} style={styles.title}>{product.title || 'Product'}</Text>
            {variantText ? <Text style={styles.variant}>{variantText}</Text> : null}
            {item.availability && item.availability !== 'available' ? <Text style={styles.unavailable}>{item.availability.replace(/_/g, ' ')}</Text> : null}
            <Text style={styles.price}>{item.unitPrice == null ? '' : formatPrice(item.unitPrice, settings)}</Text>
            <View style={styles.itemBottom}>
              <View style={styles.quantity}>
                <Pressable disabled={busyItem === item.id} onPress={() => changeQuantity(item, Number(item.quantity) - 1)} style={styles.quantityButton}><Ionicons name="remove" size={16} color="#334155" /></Pressable>
                <Text style={styles.quantityValue}>{item.quantity}</Text>
                <Pressable disabled={busyItem === item.id || Number(item.quantity) >= Number(item.maxQuantity || 100)} onPress={() => changeQuantity(item, Number(item.quantity) + 1)} style={styles.quantityButton}><Ionicons name="add" size={16} color="#334155" /></Pressable>
              </View>
              <Text style={styles.lineTotal}>{item.lineTotal == null ? '' : formatPrice(item.lineTotal, settings)}</Text>
            </View>
          </View>
          <Pressable accessibilityLabel="Remove item" onPress={() => changeQuantity(item, 0)} style={styles.remove}><Ionicons name="close" size={18} color="#64748b" /></Pressable>
        </View>;
      })}
      <View style={styles.summary}><View style={styles.summaryRow}><Text style={styles.summaryLabel}>Subtotal</Text><Text style={styles.summaryValue}>{formatPrice(cart.subtotal, settings)}</Text></View><Text style={styles.muted}>Shipping and taxes are calculated at checkout.</Text><PrimaryButton title="Proceed to checkout" onPress={() => router.push('/checkout')} disabled={cart.hasUnavailableItems} style={{ marginTop: 12 }} /></View>
    </>}
  </ScreenScroll></ScreenFrame>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 28 },
  heading: { paddingHorizontal: 16, paddingTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { color: '#64748b', fontSize: 12 },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 32, minHeight: 360, gap: 10 },
  emptyTitle: { color: '#111827', fontSize: 18, fontWeight: '800' },
  muted: { color: '#64748b', fontSize: 12, lineHeight: 18 },
  shopButton: { marginTop: 8, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
  shopButtonText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },
  notice: { marginHorizontal: 16, padding: 11, color: '#92400e', backgroundColor: '#fffbeb', borderRadius: 10, fontSize: 12 },
  item: { marginHorizontal: 16, marginTop: 12, padding: 10, flexDirection: 'row', gap: 11, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 15, backgroundColor: '#ffffff' },
  photo: { width: 84, height: 94, borderRadius: 10, backgroundColor: '#f1f5f9' },
  itemBody: { flex: 1, minWidth: 0, gap: 4, paddingRight: 5 },
  title: { color: '#111827', fontSize: 13, fontWeight: '700', lineHeight: 18 },
  variant: { color: '#64748b', fontSize: 10 },
  unavailable: { color: '#b91c1c', fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  price: { color: '#111827', fontSize: 13, fontWeight: '900' },
  itemBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  quantity: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 9 },
  quantityButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  quantityValue: { minWidth: 23, textAlign: 'center', color: '#111827', fontSize: 12, fontWeight: '700' },
  lineTotal: { color: '#111827', fontSize: 12, fontWeight: '800' },
  remove: { width: 24, height: 26, alignItems: 'center', justifyContent: 'center' },
  summary: { margin: 16, padding: 15, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 16, gap: 9 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryLabel: { color: '#475569', fontSize: 14, fontWeight: '700' },
  summaryValue: { color: '#111827', fontSize: 18, fontWeight: '900' },
});

