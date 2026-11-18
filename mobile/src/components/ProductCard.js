import { Image, Pressable, StyleSheet, Text, View, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { absoluteUrl, authApi, productApi } from '../lib/api';
import { useSite } from '../context/SiteContext';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { formatPrice } from './Common';

export default function ProductCard({ product, compact = false }) {
  const { settings, theme } = useSite();
  const { isAuthenticated, setUser } = useAuth();
  const { addItem } = useCart();
  if (!product || !(product._id || product.slug)) return null;

  const image = absoluteUrl(product.thumbnail) || absoluteUrl(product.images?.[0]?.url || product.images?.[0]);
  const price = Number(product.price || 0);
  const comparePrice = Number(product.comparePrice || 0);
  const hasDiscount = comparePrice > price;
  const discount = Math.round(Number(product.discount || (hasDiscount ? ((comparePrice - price) / comparePrice) * 100 : 0)));
  const isOut = product.stock !== undefined && Number(product.stock) <= 0 && !product.preorderEnabled && !product.backorderEnabled;
  const wishlisted = Boolean(product.isWishlisted);

  const openProduct = () => router.push(`/product/${encodeURIComponent(product.slug)}`);
  const addToCart = async () => {
    if (!isAuthenticated) { router.push('/login'); return; }
    if (Array.isArray(product.variants) && product.variants.some(item => item?.options?.length)) { openProduct(); return; }
    try {
      await addItem({ productId: product._id, quantity: 1, source: 'mobile-product-card' });
      Alert.alert('', 'Added to cart');
    } catch (error) { Alert.alert('', error.message || 'Could not add this item'); }
  };

  const toggleWishlist = async () => {
    if (!isAuthenticated) { router.push('/login'); return; }
    try {
      await productApi.toggleWishlist(product._id);
      const session = await authApi.me();
      setUser(session.user || null);
    } catch (error) { Alert.alert('', error.message || 'Could not update wishlist'); }
  };

  return <View style={[styles.card, compact && styles.compact]}>
    <Pressable onPress={openProduct} accessibilityRole="button" accessibilityLabel={product.title}>
      <View style={styles.media}>
        {image ? <Image source={{ uri: image }} resizeMode="cover" style={styles.image} /> : <View style={styles.imageFallback} />}
        {hasDiscount ? <View style={styles.discount}><Text style={styles.discountText}>{discount}% off</Text></View> : null}
        {product.isFlashDeal ? <View style={[styles.flash, { backgroundColor: theme.accent }]}><Text style={styles.flashText}>Flash</Text></View> : null}
        {isOut ? <View style={styles.sold}><Text style={styles.soldText}>Sold out</Text></View> : null}
      </View>
    </Pressable>
    <View style={styles.content}>
      {product.brand?.name || product.brand ? <Text numberOfLines={1} style={styles.brand}>{product.brand?.name || product.brand}</Text> : null}
      <Pressable onPress={openProduct}><Text numberOfLines={2} style={styles.title}>{product.title}</Text></Pressable>
      {Number(product.ratings?.count) > 0 ? <View style={styles.rating}><Ionicons name="star" size={13} color="#f59e0b" /><Text style={styles.ratingText}>{Number(product.ratings.average || 0).toFixed(1)} ({product.ratings.count})</Text></View> : null}
      <View style={styles.priceRow}><Text numberOfLines={1} style={[styles.price, { color: theme.text }]}>{formatPrice(price, settings)}</Text>{hasDiscount ? <Text style={styles.off}>{discount}% off</Text> : null}</View>
      {hasDiscount ? <Text numberOfLines={1} style={styles.compare}>M.R.P. <Text style={styles.strike}>{formatPrice(comparePrice, settings)}</Text></Text> : <View style={styles.compareSpace} />}
      {!compact ? <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'} onPress={toggleWishlist} style={styles.heart}><Ionicons name={wishlisted ? 'heart' : 'heart-outline'} size={19} color={wishlisted ? '#dc2626' : '#64748b'} /></Pressable>
        <Pressable accessibilityRole="button" disabled={isOut} onPress={addToCart} style={[styles.addButton, { backgroundColor: theme.brand, opacity: isOut ? 0.45 : 1 }]}><Ionicons name="bag-add-outline" color="#ffffff" size={17} /><Text style={styles.addText}>Add</Text></Pressable>
      </View> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { width: 184, borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#ffffff', overflow: 'hidden' },
  compact: { width: 152 },
  media: { width: '100%', aspectRatio: 1, backgroundColor: '#f3f4f6', position: 'relative' },
  image: { width: '100%', height: '100%' },
  imageFallback: { flex: 1, backgroundColor: '#f3f4f6' },
  discount: { position: 'absolute', left: 8, top: 8, borderRadius: 12, backgroundColor: '#cc0c39', paddingHorizontal: 8, paddingVertical: 4 },
  discountText: { color: '#ffffff', fontSize: 10, fontWeight: '800' },
  flash: { position: 'absolute', left: 8, top: 34, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  flashText: { color: '#ffffff', fontSize: 10, fontWeight: '800' },
  sold: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.58)', alignItems: 'center', justifyContent: 'center' },
  soldText: { backgroundColor: '#111827', color: '#ffffff', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, fontSize: 10, fontWeight: '800' },
  content: { padding: 10, gap: 4 },
  brand: { color: '#6b7280', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  title: { color: '#111827', fontSize: 12, lineHeight: 17, minHeight: 34, fontWeight: '600' },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ratingText: { color: '#64748b', fontSize: 10 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 3 },
  price: { flexShrink: 1, fontSize: 14, fontWeight: '900' },
  off: { color: '#15803d', fontSize: 10, fontWeight: '800' },
  compare: { color: '#9ca3af', fontSize: 10, minHeight: 14 },
  strike: { textDecorationLine: 'line-through' },
  compareSpace: { height: 14 },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 },
  heart: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
  addButton: { flex: 1, minHeight: 36, borderRadius: 10, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
  addText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
});
