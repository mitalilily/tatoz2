import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { absoluteUrl, authApi, productApi, shippingApi } from '../../lib/api';
import { ScreenFrame, ScreenScroll, LoadingView, ErrorView, SectionHeading, formatPrice } from '../../components/Common';
import StorefrontHeader from '../../components/StorefrontHeader';
import ProductCard from '../../components/ProductCard';
import { useSite } from '../../context/SiteContext';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';

const plainText = value => String(value || '')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<br\s*\/?\s*>|<\/(p|div|li|h[1-6])>/gi, '\n')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/[ \t]+/g, ' ')
  .replace(/\n\s+/g, '\n')
  .trim();

const idOf = value => String(value?._id || value?.id || value || '');
const imageList = product => {
  const rows = [product?.thumbnail, ...(Array.isArray(product?.images) ? product.images : [])];
  return [...new Set(rows.map(item => absoluteUrl(item?.url || item?.src || item)).filter(Boolean))];
};

export default function ProductDetailScreen() {
  const { slug: routeSlug } = useLocalSearchParams();
  const slug = Array.isArray(routeSlug) ? routeSlug[0] : routeSlug;
  const { settings, theme } = useSite();
  const { user, isAuthenticated, setUser } = useAuth();
  const { addItem } = useCart();
  const [product, setProduct] = useState(null);
  const [loadedSlug, setLoadedSlug] = useState('');
  const [reviews, setReviews] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [related, setRelated] = useState([]);
  const [selectedVariants, setSelectedVariants] = useState({});
  const [imageIndex, setImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState('');
  const [questionBusy, setQuestionBusy] = useState(false);
  const [pincode, setPincode] = useState('');
  const [delivery, setDelivery] = useState(null);
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const load = useCallback(async () => {
    if (!slug) return;
    try {
      const result = await productApi.bySlug(slug);
      const loadedProduct = result.product || null;
      if (!loadedProduct) throw new Error('Product not found.');
      setProduct(loadedProduct);
      setLoadedSlug(String(slug));
      setError('');
      setSelectedVariants({});
      setQuantity(1);
      setImageIndex(0);
      const [reviewResult, questionResult, recommendationResult] = await Promise.all([
        productApi.reviews(loadedProduct._id, { limit: 8 }).catch(() => ({})),
        productApi.questions(slug, { limit: 10 }).catch(() => ({})),
        productApi.recommendations(slug, { type: 'related', limit: 8 }).catch(() => ({})),
      ]);
      setReviews(reviewResult.reviews || []);
      setQuestions(questionResult.questions || []);
      setRelated((recommendationResult.products || []).filter(item => item._id !== loadedProduct._id));
    } catch (reason) {
      setProduct(null);
      setLoadedSlug(String(slug));
      setError(reason.message || 'Product could not be loaded.');
    } finally { setLoading(false); }
  }, [slug]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const variants = useMemo(() => Array.isArray(product?.variants) ? product.variants : [], [product]);
  const chosenOptions = useMemo(() => variants.map(variant =>
    (variant.options || []).find(option => (option.value || option.name || option.label) === selectedVariants[variant.name])
  ).filter(Boolean), [variants, selectedVariants]);
  const pricedOption = [...chosenOptions].reverse().find(option => option.price !== undefined && option.price !== null && option.price !== '');
  const price = Number(pricedOption?.price ?? (Number(product?.price || 0) + chosenOptions.reduce((sum, option) => sum + Number(option.priceModifier || 0), 0)));
  const comparePrice = Number(pricedOption?.comparePrice ?? product?.comparePrice ?? 0);
  const discount = Number(pricedOption?.discount ?? product?.discount ?? (comparePrice > price ? ((comparePrice - price) / comparePrice) * 100 : 0));
  const images = imageList(product || {});
  const stock = Math.max(0, Number(product?.stock || 0) - Number(product?.reservedStock || 0));
  const outOfStock = stock <= 0 && !product?.preorderEnabled && !product?.backorderEnabled;
  const allVariantsSelected = variants.every(variant => Boolean(selectedVariants[variant.name]));
  const wishlisted = Boolean(user?.wishlist?.some(item => idOf(item) === String(product?._id)));
  const displayDescription = plainText(product?.description || product?.shortDescription);

  const toggleWishlist = async () => {
    if (!isAuthenticated) { router.push('/login'); return; }
    try {
      await productApi.toggleWishlist(product._id);
      const session = await authApi.me();
      setUser(session.user || null);
    } catch (reason) { Alert.alert('', reason.message || 'Wishlist could not be updated.'); }
  };

  const addToCart = async (buyNow = false) => {
    if (!isAuthenticated) { router.push('/login'); return; }
    if (variants.length && !allVariantsSelected) {
      Alert.alert('', 'Choose every available option first.');
      return;
    }
    setBusy(true);
    try {
      await addItem({ productId: product._id, quantity, variant: variants.length ? selectedVariants : undefined, source: buyNow ? 'mobile-buy-now' : 'mobile-product-detail' });
      if (buyNow) router.push('/checkout');
      else Alert.alert('', 'Added to cart');
    } catch (reason) { Alert.alert('', reason.message || 'Could not add this item.'); }
    finally { setBusy(false); }
  };

  const checkDelivery = async () => {
    if (!/^\d{6}$/.test(pincode)) { setDelivery({ error: 'Enter a 6-digit pincode.' }); return; }
    setDeliveryBusy(true);
    setDelivery(null);
    try { setDelivery(await shippingApi.checkDelivery(pincode)); }
    catch (reason) { setDelivery({ error: reason.message || 'Delivery availability could not be checked.' }); }
    finally { setDeliveryBusy(false); }
  };

  const askQuestion = async () => {
    if (!isAuthenticated) { router.push('/login'); return; }
    if (!question.trim()) return;
    setQuestionBusy(true);
    try {
      await productApi.askQuestion(slug, question.trim());
      setQuestion('');
      const result = await productApi.questions(slug, { limit: 10 });
      setQuestions(result.questions || []);
      Alert.alert('', 'Your question was submitted.');
    } catch (reason) { Alert.alert('', reason.message || 'Question could not be submitted.'); }
    finally { setQuestionBusy(false); }
  };

  if (loading || loadedSlug !== String(slug || '')) return <ScreenFrame><LoadingView /></ScreenFrame>;
  if (!product) return <ScreenFrame><StorefrontHeader /><ErrorView message={error} onRetry={() => { setLoading(true); load(); }} /></ScreenFrame>;

  const selectedImageUrl = images[imageIndex] || null;
  const ratingAverage = Number(product.ratings?.average || 0);
  const ratingCount = Number(product.ratings?.count || 0);

  return <ScreenFrame>
    <ScreenScroll contentContainerStyle={styles.content}>
      <StorefrontHeader />
      <View style={styles.gallery}>
        {selectedImageUrl ? <Image source={{ uri: selectedImageUrl }} resizeMode="contain" style={styles.mainImage} /> : <View style={styles.imageFallback}><Ionicons name="image-outline" size={42} color="#cbd5e1" /><Text style={styles.fallbackText}>{product.title}</Text></View>}
        {images.length > 1 ? <View style={styles.imageNav}><Pressable onPress={() => setImageIndex(value => (value - 1 + images.length) % images.length)} style={styles.navButton}><Ionicons name="chevron-back" size={20} color="#0f172a" /></Pressable><Text style={styles.imageCounter}>{imageIndex + 1} / {images.length}</Text><Pressable onPress={() => setImageIndex(value => (value + 1) % images.length)} style={styles.navButton}><Ionicons name="chevron-forward" size={20} color="#0f172a" /></Pressable></View> : null}
        <Pressable accessibilityLabel={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'} onPress={toggleWishlist} style={styles.wishlistButton}><Ionicons name={wishlisted ? 'heart' : 'heart-outline'} size={22} color={wishlisted ? '#dc2626' : '#334155'} /></Pressable>
      </View>
      {images.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbnails}>{images.map((uri, index) => <Pressable key={`${uri}-${index}`} onPress={() => setImageIndex(index)} style={[styles.thumbnailFrame, index === imageIndex && { borderColor: theme.brand }]}><Image source={{ uri }} resizeMode="cover" style={styles.thumbnail} /></Pressable>)}</ScrollView> : null}

      <View style={styles.summary}>
        {product.brand?.name || product.brand ? <Text style={styles.brand}>{product.brand?.name || product.brand}</Text> : null}
        <Text style={styles.title}>{product.title}</Text>
        {ratingCount > 0 ? <View style={styles.rating}><Ionicons name="star" size={15} color="#f59e0b" /><Text style={styles.ratingText}>{ratingAverage.toFixed(1)} · {ratingCount} reviews</Text></View> : null}
        <View style={styles.priceLine}><Text style={[styles.price, { color: theme.text }]}>{formatPrice(price, settings)}</Text>{comparePrice > price ? <Text style={styles.comparePrice}>{formatPrice(comparePrice, settings)}</Text> : null}{discount > 0 ? <Text style={styles.discount}>{Math.round(discount)}% off</Text> : null}</View>
        {product.shortDescription ? <Text style={styles.shortDescription}>{plainText(product.shortDescription)}</Text> : null}
        {product.preorderEnabled ? <Text style={styles.stockNotice}>Available for preorder</Text> : product.backorderEnabled && outOfStock ? <Text style={styles.stockNotice}>Available on backorder</Text> : <Text style={[styles.stockNotice, outOfStock ? styles.outStock : null]}>{outOfStock ? 'Currently unavailable' : `${stock} available`}</Text>}
      </View>

      {variants.map(variant => <View key={variant._id || variant.name} style={styles.section}>
        <SectionHeading title={variant.name} />
        <View style={styles.options}>{(variant.options || []).map(option => {
          const value = option.value || option.name || option.label;
          const selected = selectedVariants[variant.name] === value;
          const unavailable = option.stock !== undefined && Number(option.stock) <= 0;
          return <Pressable key={option._id || value} disabled={unavailable} onPress={() => setSelectedVariants(current => ({ ...current, [variant.name]: value }))} style={[styles.option, selected && { borderColor: theme.brand, backgroundColor: `${theme.brand}12` }, unavailable && styles.disabledOption]}><Text style={[styles.optionText, selected && { color: theme.brand }, unavailable && styles.disabledText]}>{option.label || value}{option.price ? ` · ${formatPrice(option.price, settings)}` : ''}</Text></Pressable>;
        })}</View>
      </View>)}

      {product.bulkOrderEnabled && Array.isArray(product.bulkOrderTiers) && product.bulkOrderTiers.length ? <View style={styles.section}><SectionHeading title="Bulk pricing" />{product.bulkOrderTiers.map((tier, index) => <Text key={tier._id || index} style={styles.specRow}>{tier.minQuantity}+ items · {formatPrice(tier.price, settings)} each</Text>)}</View> : null}

      <View style={styles.section}><SectionHeading title="Delivery availability" /><View style={styles.deliveryRow}><TextInput value={pincode} onChangeText={value => { setPincode(value.replace(/\D/g, '').slice(0, 6)); setDelivery(null); }} keyboardType="number-pad" maxLength={6} placeholder="Enter pincode" style={styles.pincode} /><Pressable onPress={checkDelivery} disabled={deliveryBusy} style={[styles.checkButton, { backgroundColor: theme.brand }]}><Text style={styles.checkText}>{deliveryBusy ? 'Checking…' : 'Check'}</Text></Pressable></View>{delivery ? <Text style={[styles.deliveryResult, delivery.error || delivery.serviceable === false || delivery.available === false ? styles.outStock : styles.available]}>{delivery.error || delivery.message || (delivery.serviceable === false || delivery.available === false ? 'Delivery is not available at this pincode.' : 'Delivery is available at this pincode.')}</Text> : null}</View>

      {Array.isArray(product.specifications) && product.specifications.some(item => item?.key && item?.value) ? <View style={styles.section}><SectionHeading title="Specifications" />{product.specifications.filter(item => item?.key && item?.value).map((item, index) => <View key={item._id || `${item.key}-${index}`} style={styles.specRow}><Text style={styles.specKey}>{item.key}</Text><Text style={styles.specValue}>{plainText(item.value)}</Text></View>)}</View> : null}
      {product.attributes && typeof product.attributes === 'object' && Object.entries(product.attributes).filter(([, value]) => value !== undefined && value !== null && value !== '').length ? <View style={styles.section}><SectionHeading title="Product details" />{Object.entries(product.attributes).filter(([, value]) => value !== undefined && value !== null && value !== '').map(([key, value]) => <View key={key} style={styles.specRow}><Text style={styles.specKey}>{key}</Text><Text style={styles.specValue}>{Array.isArray(value) ? value.join(', ') : String(value)}</Text></View>)}</View> : null}
      {displayDescription ? <View style={styles.section}><SectionHeading title="Description" /><Text style={styles.description}>{displayDescription}</Text></View> : null}
      {Array.isArray(product.videos) && product.videos.length ? <View style={styles.section}><SectionHeading title="Product videos" />{product.videos.map((video, index) => { const url = typeof video === 'string' ? video : video.url || video.src; return url ? <Pressable key={video._id || url || index} onPress={() => Linking.openURL(url).catch(() => {})} style={styles.videoLink}><Ionicons name="play-circle-outline" size={20} color={theme.brand} /><Text style={[styles.linkText, { color: theme.brand }]}>{video.title || 'Watch product video'}</Text></Pressable> : null; })}</View> : null}
      {Array.isArray(product.faqs) && product.faqs.length ? <View style={styles.section}><SectionHeading title="Frequently asked questions" />{product.faqs.map((faq, index) => <View key={faq._id || index} style={styles.questionCard}><Text style={styles.questionTitle}>{faq.question || faq.title}</Text><Text style={styles.reviewBody}>{plainText(faq.answer || faq.content)}</Text></View>)}</View> : null}

      <View style={styles.section}><SectionHeading title="Ratings and reviews" action={ratingCount ? `${ratingCount} total` : ''} /><View style={styles.ratingSummary}><Ionicons name="star" size={22} color="#f59e0b" /><Text style={styles.ratingNumber}>{ratingAverage ? ratingAverage.toFixed(1) : '—'}</Text><Text style={styles.muted}>{ratingCount ? `${ratingCount} customer ratings` : 'No ratings yet'}</Text></View>{reviews.length ? reviews.map((review, index) => <View key={review._id || index} style={styles.review}><Text style={styles.reviewTitle}>{review.title || review.user?.name || 'Customer review'}</Text><Text style={styles.reviewStars}>{'★'.repeat(Math.min(5, Math.max(0, Number(review.rating || 0))))}</Text>{review.comment ? <Text style={styles.reviewBody}>{plainText(review.comment)}</Text> : null}<Text style={styles.reviewMeta}>{review.user?.name || review.name || ''}{review.createdAt ? ` · ${new Date(review.createdAt).toLocaleDateString()}` : ''}</Text></View>) : <Text style={styles.muted}>No written reviews yet.</Text>}</View>

      <View style={styles.section}><SectionHeading title="Questions and answers" />{questions.map((item, index) => <View key={item._id || index} style={styles.questionCard}><Text style={styles.questionTitle}>{item.question || item.text}</Text>{item.answer ? <Text style={styles.reviewBody}>{plainText(item.answer)}</Text> : <Text style={styles.muted}>Awaiting an answer</Text>}</View>)}{isAuthenticated ? <View style={styles.askRow}><TextInput value={question} onChangeText={setQuestion} placeholder="Ask a question about this product" style={styles.askInput} multiline /><Pressable disabled={questionBusy || !question.trim()} onPress={askQuestion} style={[styles.askButton, { backgroundColor: theme.brand }]}><Text style={styles.checkText}>{questionBusy ? '…' : 'Ask'}</Text></Pressable></View> : <Pressable onPress={() => router.push('/login')}><Text style={[styles.linkText, { color: theme.brand }]}>Sign in to ask a question</Text></Pressable>}</View>

      {related.length ? <View style={styles.section}><SectionHeading title="You may also like" /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.related}>{related.map(item => <ProductCard key={item._id || item.slug} product={item} />)}</ScrollView></View> : null}
    </ScreenScroll>
    <View style={styles.bottomBar}><View style={{ flex: 1 }}><Text style={styles.bottomLabel}>Price</Text><Text style={[styles.bottomPrice, { color: theme.text }]}>{formatPrice(price, settings)}</Text></View><View style={styles.quantityControl}><Pressable onPress={() => setQuantity(value => Math.max(1, value - 1))} style={styles.quantityAction}><Ionicons name="remove" size={17} color="#334155" /></Pressable><Text style={styles.quantityValue}>{quantity}</Text><Pressable onPress={() => setQuantity(value => Math.min(value + 1, Math.max(stock, 1)))} style={styles.quantityAction}><Ionicons name="add" size={17} color="#334155" /></Pressable></View><Pressable disabled={busy || outOfStock} onPress={() => addToCart(false)} style={[styles.addButton, { backgroundColor: theme.brand, opacity: busy || outOfStock ? 0.55 : 1 }]}><Text style={styles.addText}>{busy ? 'Please wait…' : 'Add to cart'}</Text></Pressable></View>
  </ScreenFrame>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 30 },
  gallery: { height: 360, backgroundColor: '#f8fafc', position: 'relative', alignItems: 'center', justifyContent: 'center' },
  mainImage: { width: '100%', height: '100%' },
  imageFallback: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 36 },
  fallbackText: { color: '#64748b', textAlign: 'center', fontSize: 12 },
  imageNav: { position: 'absolute', bottom: 12, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', elevation: 2 },
  imageCounter: { backgroundColor: 'rgba(15,23,42,0.7)', color: '#ffffff', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, fontSize: 11 },
  wishlistButton: { position: 'absolute', right: 14, top: 14, height: 42, width: 42, borderRadius: 21, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', elevation: 2 },
  thumbnails: { paddingHorizontal: 14, paddingTop: 10, gap: 8 },
  thumbnailFrame: { width: 58, height: 58, borderWidth: 2, borderColor: '#e2e8f0', borderRadius: 10, overflow: 'hidden' },
  thumbnail: { width: '100%', height: '100%' },
  summary: { padding: 16, gap: 8 },
  brand: { color: '#64748b', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  title: { color: '#111827', fontSize: 21, lineHeight: 28, fontWeight: '900' },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  ratingText: { color: '#475569', fontSize: 12, fontWeight: '600' },
  priceLine: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  price: { fontSize: 24, fontWeight: '900' },
  comparePrice: { color: '#94a3b8', textDecorationLine: 'line-through', fontSize: 14 },
  discount: { color: '#15803d', fontSize: 12, fontWeight: '800' },
  shortDescription: { color: '#475569', fontSize: 13, lineHeight: 20 },
  stockNotice: { color: '#15803d', fontSize: 12, fontWeight: '700' },
  outStock: { color: '#b91c1c' },
  available: { color: '#15803d' },
  section: { paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#f1f5f9', gap: 9 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10 },
  optionText: { color: '#334155', fontSize: 12, fontWeight: '700' },
  disabledOption: { opacity: 0.45, backgroundColor: '#f1f5f9' },
  disabledText: { textDecorationLine: 'line-through' },
  deliveryRow: { flexDirection: 'row', gap: 8 },
  pincode: { flex: 1, height: 44, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 12, color: '#111827' },
  checkButton: { minWidth: 76, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  checkText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  deliveryResult: { fontSize: 12, fontWeight: '700' },
  specRow: { flexDirection: 'row', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  specKey: { flex: 0.9, color: '#64748b', fontSize: 12, fontWeight: '600' },
  specValue: { flex: 1.1, color: '#1f2937', fontSize: 12, lineHeight: 18 },
  description: { color: '#475569', fontSize: 13, lineHeight: 21 },
  videoLink: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  linkText: { fontSize: 13, fontWeight: '700' },
  ratingSummary: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 5 },
  ratingNumber: { color: '#111827', fontSize: 20, fontWeight: '900' },
  muted: { color: '#64748b', fontSize: 12, lineHeight: 18 },
  review: { paddingVertical: 11, borderTopWidth: 1, borderTopColor: '#f1f5f9', gap: 4 },
  reviewTitle: { color: '#111827', fontSize: 13, fontWeight: '800' },
  reviewStars: { color: '#f59e0b', fontSize: 13 },
  reviewBody: { color: '#475569', fontSize: 12, lineHeight: 18 },
  reviewMeta: { color: '#94a3b8', fontSize: 10 },
  questionCard: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', gap: 5 },
  questionTitle: { color: '#1f2937', fontSize: 13, fontWeight: '700' },
  askRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  askInput: { flex: 1, minHeight: 44, maxHeight: 90, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9, color: '#111827' },
  askButton: { height: 42, minWidth: 54, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  related: { gap: 12, paddingBottom: 4 },
  bottomBar: { minHeight: 68, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8, borderTopWidth: 1, borderTopColor: '#e2e8f0', backgroundColor: '#ffffff', flexDirection: 'row', alignItems: 'center', gap: 10 },
  bottomLabel: { color: '#64748b', fontSize: 10 },
  bottomPrice: { fontSize: 16, fontWeight: '900' },
  quantityControl: { minHeight: 38, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, flexDirection: 'row', alignItems: 'center' },
  quantityAction: { width: 30, height: 36, alignItems: 'center', justifyContent: 'center' },
  quantityValue: { color: '#111827', minWidth: 20, textAlign: 'center', fontSize: 12, fontWeight: '800' },
  addButton: { minHeight: 44, borderRadius: 11, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  addText: { color: '#ffffff', fontSize: 12, fontWeight: '900' },
});
