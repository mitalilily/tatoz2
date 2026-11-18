import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { authApi, couponApi, orderApi, paymentApi, shippingApi, taxApi } from '../lib/api';
import { ScreenFrame, ScreenScroll, LoadingView, SectionHeading, formatPrice } from '../components/Common';
import StorefrontHeader from '../components/StorefrontHeader';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useSite } from '../context/SiteContext';

const humanize = value => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const scriptJson = value => JSON.stringify(value).replace(/</g, '\\u003c');
const SUPPORTED_GATEWAYS = new Set(['cod', 'razorpay', 'manual', 'bank_transfer', 'upi']);

function RazorpayWebCheckout({ paymentOrder, siteName, address, onMessage, onNavigation }) {
  const checkout = {
    key: paymentOrder.key_id,
    amount: paymentOrder.amount,
    currency: paymentOrder.currency,
    order_id: paymentOrder.id,
    name: siteName || '',
    description: paymentOrder.description || '',
    prefill: { name: address.fullName || '', email: address.email || '', contact: address.phone || '' },
    theme: { color: paymentOrder.themeColor || '#4f46e5' },
  };
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"><meta charset="utf-8"><script src="https://checkout.razorpay.com/v1/checkout.js"></script></head><body style="font-family: sans-serif;display:flex;min-height:90vh;align-items:center;justify-content:center;color:#475569"><p id="status">Opening secure payment…</p><script>
    const config = ${scriptJson(checkout)};
    const send = (data) => window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(data));
    try {
      if (!window.Razorpay) throw new Error('Payment provider could not be loaded');
      config.handler = (response) => send({ type: 'success', response });
      config.modal = { ondismiss: () => send({ type: 'dismiss' }) };
      const checkout = new Razorpay(config);
      checkout.on('payment.failed', (event) => send({ type: 'failure', message: event.error && event.error.description || 'Payment failed' }));
      checkout.open();
    } catch (error) { send({ type: 'failure', message: error.message || 'Payment could not be started' }); }
  </script></body></html>`;
  return <WebView source={{ html, baseUrl: 'https://tatoz.com' }} originWhitelist={['https://*', 'http://*', 'about:blank', 'upi://*', 'intent://*']} javaScriptEnabled domStorageEnabled onMessage={onMessage} onShouldStartLoadWithRequest={onNavigation} setSupportMultipleWindows={false} style={styles.webView} />;
}

export default function CheckoutScreen() {
  const { user, setUser } = useAuth();
  const { cart, loading: cartLoading, clear, refresh } = useCart();
  const { site, settings, theme } = useSite();
  const items = useMemo(() => Array.isArray(cart.items) ? cart.items : [], [cart.items]);
  const savedAddresses = useMemo(() => Array.isArray(user?.addresses) ? user.addresses : [], [user]);
  const preferredIndex = Math.max(0, savedAddresses.findIndex(address => address.isDefault));
  const [addressIndex, setAddressIndex] = useState(preferredIndex);
  const [useNewAddress, setUseNewAddress] = useState(savedAddresses.length === 0);
  const [newAddress, setNewAddress] = useState({ fullName: user?.name || '', phone: user?.phone || '', street: '', addressLine2: '', city: '', state: '', pincode: '', country: settings.country || 'India' });
  const [gateways, setGateways] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [coupons, setCoupons] = useState([]);
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [shippingQuoteState, setShippingQuoteState] = useState({ key: '', quote: null });
  const [taxProfile, setTaxProfile] = useState(null);
  const [paymentSession, setPaymentSession] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const paymentMessageSeen = useRef(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      paymentApi.gateways().catch(() => ({ gateways: [] })),
      couponApi.available().catch(() => ({ coupons: [] })),
      taxApi.profile().catch(() => ({ profile: null })),
    ]).then(([paymentResult, couponResult, taxResult]) => {
      if (!active) return;
      const activeGateways = paymentResult.gateways || [];
      setGateways(activeGateways);
      setPaymentMethod(activeGateways.find(item => item.id === 'cod')?.id || activeGateways[0]?.id || '');
      setCoupons(couponResult.coupons || []);
      setTaxProfile(taxResult.profile || null);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const activeAddress = useMemo(() => useNewAddress ? newAddress : savedAddresses[addressIndex] || newAddress, [useNewAddress, newAddress, savedAddresses, addressIndex]);
  const subtotal = Number(cart.subtotal || 0);
  const shippingItems = useMemo(() => items.map(item => ({
    itemType: item.itemType || (item.bundle ? 'bundle' : 'product'),
    product: item.product?._id || item.product,
    bundle: item.bundle?._id || item.bundle,
    quantity: Number(item.quantity || 1),
    price: Number(item.unitPrice || item.product?.price || 0),
    variant: item.variant,
  })), [items]);
  const pincode = String(activeAddress?.pincode || '').replace(/\D/g, '');
  const quoteReady = pincode.length === 6 && Boolean(activeAddress?.street && activeAddress?.city && activeAddress?.state);
  const quoteRequest = useMemo(() => ({
    items: shippingItems,
    shippingAddress: activeAddress,
    paymentMethod: paymentMethod === 'cod' ? 'cod' : 'prepaid',
    discount: Number(appliedCoupon?.discount || 0),
    couponFreeShipping: appliedCoupon?.freeShipping === true,
  }), [shippingItems, activeAddress, paymentMethod, appliedCoupon]);
  const quoteKey = JSON.stringify(quoteRequest);

  useEffect(() => {
    if (!quoteReady || !items.length) return undefined;
    let active = true;
    shippingApi.quote(quoteRequest)
      .then(result => { if (active) setShippingQuoteState({ key: quoteKey, quote: { ...(result.quote || {}), pincode, paymentMethod: quoteRequest.paymentMethod } }); })
      .catch(reason => { if (active) setShippingQuoteState({ key: quoteKey, quote: { serviceable: false, error: reason.message || 'Delivery quote is not available.', pincode, paymentMethod: quoteRequest.paymentMethod } }); });
    return () => { active = false; };
  }, [quoteReady, items.length, quoteRequest, quoteKey, pincode]);

  const shippingQuote = shippingQuoteState.key === quoteKey ? shippingQuoteState.quote : null;
  const shippingBusy = Boolean(quoteReady && items.length && !shippingQuote);

  const estimatedShipping = shippingQuote?.shippingCost !== undefined
    ? Number(shippingQuote.shippingCost)
    : subtotal >= Number(settings.freeShippingThreshold || 999) ? 0 : Number(settings.standardShippingCost || 0);
  const taxRateDefault = Number(settings.taxRate || 0);
  const rawTax = items.reduce((sum, item) => {
    const amount = Number(item.unitPrice || item.price || item.product?.price || 0) * Number(item.quantity || 1);
    const rate = Number(item.product?.gstRate ?? item.gstRate ?? taxRateDefault);
    return sum + (taxProfile?.pricingMode === 'inclusive' ? amount - amount / (1 + rate / 100) : amount * rate / 100);
  }, 0);
  const estimatedTax = taxProfile?.pricingMode === 'inclusive' ? 0 : Math.round(rawTax * 100) / 100;
  const discount = Number(appliedCoupon?.discount || 0);
  const estimatedTotal = Math.max(0, subtotal - discount + estimatedShipping + estimatedTax);

  const applyCoupon = async codeValue => {
    const code = String(codeValue || couponCode).trim();
    if (!code) return;
    if (!activeAddress?.pincode) { Alert.alert('', 'Add a delivery address before applying an offer code.'); return; }
    setCouponBusy(true);
    try {
      const result = await couponApi.validate({ code, paymentMethod, shippingAddress: activeAddress, channel: 'mobile' });
      setAppliedCoupon(result.coupon || null);
      setCouponCode(result.coupon?.code || code.toUpperCase());
    } catch (reason) {
      setAppliedCoupon(null);
      Alert.alert('', reason.message || 'This offer code could not be applied.');
    } finally { setCouponBusy(false); }
  };

  const makeOrderItems = () => items.map(item => item.itemType === 'bundle' || item.bundle
    ? { itemType: 'bundle', bundle: item.bundle?._id || item.bundle, bundleSelections: item.bundleSelections || {}, quantity: item.quantity }
    : { itemType: 'product', product: item.product?._id || item.product, quantity: item.quantity, variant: item.variant });

  const goToOrder = async order => {
    await clear().catch(() => refresh().catch(() => {}));
    router.replace(`/orders/${encodeURIComponent(order._id)}`);
  };

  const placeOrder = async () => {
    const address = activeAddress || {};
    if (!address.fullName || !address.phone || !address.street || !address.city || !address.state || !/^\d{6}$/.test(String(address.pincode || ''))) {
      Alert.alert('', 'Complete all required delivery address fields.');
      return;
    }
    if (!paymentMethod) { Alert.alert('', 'Choose a payment method.'); return; }
    if (!SUPPORTED_GATEWAYS.has(paymentMethod)) { Alert.alert('', `${humanize(paymentMethod)} is configured on the store, but this mobile checkout does not have its payment flow enabled yet.`); return; }
    if (!items.length || cart.hasUnavailableItems) { Alert.alert('', 'Review unavailable cart items before checking out.'); return; }
    if (shippingQuote?.serviceable === false) { Alert.alert('', shippingQuote.error || 'Delivery is not available at this address.'); return; }
    setPlacing(true);
    try {
      if (useNewAddress) {
        const addressResult = await authApi.addAddress({ ...address, label: 'Home', isDefault: savedAddresses.length === 0 }).catch(() => null);
        if (addressResult?.user) setUser(addressResult.user);
        else if (addressResult?.addresses) setUser(current => ({ ...current, addresses: addressResult.addresses }));
      }
      const result = await orderApi.create({
        items: makeOrderItems(),
        shippingAddress: address,
        paymentMethod,
        couponCode: appliedCoupon?.code || undefined,
        channel: 'mobile',
      });
      const order = result.order;
      if (!order?._id) throw new Error('The server did not return the created order.');
      if (paymentMethod === 'razorpay') {
        const paymentResult = await paymentApi.createOrder({ gatewayId: 'razorpay', orderId: order._id });
        if (!paymentResult.paymentOrder) throw new Error('The payment provider did not return a checkout order.');
        paymentMessageSeen.current = false;
        setPaymentSession({ order, paymentOrder: paymentResult.paymentOrder, address });
      } else {
        await goToOrder(order);
      }
    } catch (reason) { Alert.alert('', reason.message || 'Your order could not be placed.'); }
    finally { setPlacing(false); }
  };

  const handlePaymentMessage = async event => {
    if (paymentMessageSeen.current) return;
    let message;
    try { message = JSON.parse(event.nativeEvent.data); } catch (_) { return; }
    if (message.type === 'dismiss') {
      paymentMessageSeen.current = true;
      setPaymentSession(null);
      Alert.alert('', 'Payment was not completed. The order remains pending in your order history.');
      return;
    }
    if (message.type === 'failure') {
      paymentMessageSeen.current = true;
      setPaymentSession(null);
      Alert.alert('', message.message || 'Payment failed. The order remains pending.');
      return;
    }
    if (message.type !== 'success' || !paymentSession?.order?._id) return;
    paymentMessageSeen.current = true;
    setVerifying(true);
    try {
      await paymentApi.verify({ gatewayId: 'razorpay', orderId: paymentSession.order._id, ...message.response });
      setPaymentSession(null);
      await goToOrder(paymentSession.order);
    } catch (reason) {
      setPaymentSession(null);
      Alert.alert('', reason.message || 'Payment verification failed. The order is still available in your history.');
    } finally { setVerifying(false); }
  };

  const handlePaymentNavigation = request => {
    const url = request.url || '';
    if (url.startsWith('intent://') || url.startsWith('upi://')) {
      Linking.openURL(url).catch(() => {});
      return false;
    }
    return url.startsWith('https://') || url.startsWith('http://') || url === 'about:blank';
  };

  if (loading || cartLoading && !items.length) return <ScreenFrame><LoadingView /></ScreenFrame>;
  if (!items.length) return <ScreenFrame><StorefrontHeader /><View style={styles.empty}><Ionicons name="bag-outline" size={42} color="#cbd5e1" /><Text style={styles.emptyTitle}>Your cart is empty</Text><Pressable onPress={() => router.replace('/shop')} style={[styles.primaryButton, { backgroundColor: theme.brand }]}><Text style={styles.primaryText}>Browse products</Text></Pressable></View></ScreenFrame>;

  return <ScreenFrame><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScreenScroll contentContainerStyle={styles.content}>
      <StorefrontHeader />
      <View style={styles.pageHeading}><Text style={styles.title}>Checkout</Text><Text style={styles.subtitle}>Confirm your delivery details and payment method.</Text></View>

      <View style={styles.section}><SectionHeading title="Delivery address" />
        {savedAddresses.map((address, index) => <Pressable key={address._id || `${address.street}-${index}`} onPress={() => { setAddressIndex(index); setUseNewAddress(false); }} style={[styles.addressCard, !useNewAddress && addressIndex === index && { borderColor: theme.brand, backgroundColor: `${theme.brand}0a` }]}><Ionicons name={!useNewAddress && addressIndex === index ? 'radio-button-on' : 'radio-button-off'} size={19} color={!useNewAddress && addressIndex === index ? theme.brand : '#94a3b8'} /><View style={{ flex: 1 }}><Text style={styles.addressName}>{address.label || 'Address'} · {address.fullName}</Text><Text style={styles.addressText}>{[address.street, address.addressLine2, address.city, address.state, address.pincode].filter(Boolean).join(', ')}</Text><Text style={styles.addressText}>{address.phone}</Text></View></Pressable>)}
        <Pressable onPress={() => setUseNewAddress(true)} style={[styles.addressCard, useNewAddress && { borderColor: theme.brand, backgroundColor: `${theme.brand}0a` }]}><Ionicons name={useNewAddress ? 'radio-button-on' : 'radio-button-off'} size={19} color={useNewAddress ? theme.brand : '#94a3b8'} /><Text style={styles.newAddressText}>{savedAddresses.length ? 'Use a new delivery address' : 'Add a delivery address'}</Text></Pressable>
        {useNewAddress ? <View style={styles.formGrid}>
          <TextInput value={newAddress.fullName} onChangeText={value => setNewAddress(current => ({ ...current, fullName: value }))} placeholder="Full name" style={styles.input} />
          <TextInput value={newAddress.phone} onChangeText={value => setNewAddress(current => ({ ...current, phone: value.replace(/\D/g, '').slice(0, 15) }))} placeholder="Phone number" keyboardType="phone-pad" style={styles.input} />
          <TextInput value={newAddress.pincode} onChangeText={value => setNewAddress(current => ({ ...current, pincode: value.replace(/\D/g, '').slice(0, 6) }))} placeholder="6-digit pincode" keyboardType="number-pad" maxLength={6} style={styles.input} />
          <TextInput value={newAddress.street} onChangeText={value => setNewAddress(current => ({ ...current, street: value }))} placeholder="House, street, locality" style={[styles.input, styles.fullWidth]} />
          <TextInput value={newAddress.addressLine2} onChangeText={value => setNewAddress(current => ({ ...current, addressLine2: value }))} placeholder="Landmark or area (optional)" style={[styles.input, styles.fullWidth]} />
          <TextInput value={newAddress.city} onChangeText={value => setNewAddress(current => ({ ...current, city: value }))} placeholder="City" style={styles.input} />
          <TextInput value={newAddress.state} onChangeText={value => setNewAddress(current => ({ ...current, state: value }))} placeholder="State" style={styles.input} />
        </View> : null}
      </View>

      <View style={styles.section}><SectionHeading title="Offer code" />
        <View style={styles.couponRow}><TextInput value={couponCode} onChangeText={setCouponCode} placeholder="Enter coupon code" autoCapitalize="characters" style={styles.couponInput} /><Pressable disabled={couponBusy} onPress={() => appliedCoupon ? setAppliedCoupon(null) : applyCoupon()} style={[styles.couponButton, { borderColor: theme.brand }]}><Text style={[styles.couponButtonText, { color: theme.brand }]}>{couponBusy ? '…' : appliedCoupon ? 'Remove' : 'Apply'}</Text></Pressable></View>
        {appliedCoupon ? <Text style={styles.couponSuccess}>{appliedCoupon.code} · saved {formatPrice(appliedCoupon.discount || 0, settings)}</Text> : null}
        {coupons.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.couponList}>{coupons.map(coupon => <Pressable key={coupon._id || coupon.code} onPress={() => { setCouponCode(coupon.code); applyCoupon(coupon.code); }} style={styles.couponCard}><Text style={styles.couponCode}>{coupon.code}</Text><Text style={styles.couponDescription}>{coupon.description || `${coupon.type === 'percentage' ? `${coupon.value}%` : formatPrice(coupon.value, settings)} offer`}</Text></Pressable>)}</ScrollView> : null}
      </View>

      <View style={styles.section}><SectionHeading title="Payment method" />{gateways.map(gateway => { const supported = SUPPORTED_GATEWAYS.has(gateway.id); return <Pressable key={gateway.id} disabled={!supported} onPress={() => { setPaymentMethod(gateway.id); if (appliedCoupon) setAppliedCoupon(null); }} style={[styles.paymentCard, paymentMethod === gateway.id && { borderColor: theme.brand, backgroundColor: `${theme.brand}0a` }, !supported && styles.unsupportedPayment]}><Ionicons name={paymentMethod === gateway.id ? 'radio-button-on' : 'radio-button-off'} size={19} color={paymentMethod === gateway.id ? theme.brand : '#94a3b8'} /><View style={{ flex: 1 }}><Text style={styles.addressName}>{gateway.displayName || humanize(gateway.id)}</Text>{gateway.description ? <Text style={styles.addressText}>{gateway.description}</Text> : null}{!supported ? <Text style={styles.unsupportedText}>Payment flow is not available in this app.</Text> : null}</View></Pressable>; })}{!gateways.length ? <Text style={styles.addressText}>No payment method is currently available. Contact the store.</Text> : null}</View>

      <View style={styles.section}><SectionHeading title="Order summary" />{items.map((item, index) => { const title = item.product?.title || item.bundle?.title || item.title || 'Product'; const lineTotal = Number(item.lineTotal ?? Number(item.unitPrice || item.price || item.product?.price || 0) * Number(item.quantity || 1)); return <View key={item.id || item._id || index} style={styles.summaryRow}><Text numberOfLines={2} style={styles.summaryName}>{title} × {item.quantity}</Text><Text style={styles.summaryPrice}>{formatPrice(lineTotal, settings)}</Text></View>; })}<View style={styles.summaryDivider} />
        <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Subtotal</Text><Text style={styles.summaryPrice}>{formatPrice(subtotal, settings)}</Text></View>
        {discount > 0 ? <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Offer discount</Text><Text style={styles.discountValue}>−{formatPrice(discount, settings)}</Text></View> : null}
        <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Shipping</Text><Text style={styles.summaryPrice}>{shippingBusy ? 'Checking…' : formatPrice(estimatedShipping, settings)}</Text></View>
        <View style={styles.summaryRow}><Text style={styles.summaryLabel}>{taxProfile?.pricingMode === 'inclusive' ? 'Tax included' : 'Estimated tax'}</Text><Text style={styles.summaryPrice}>{formatPrice(estimatedTax, settings)}</Text></View>
        {shippingQuote?.serviceable === false ? <Text style={styles.errorText}>{shippingQuote.error || 'Delivery is not available at this address.'}</Text> : null}
        <View style={[styles.summaryRow, styles.grandTotal]}><Text style={styles.grandTotalLabel}>Estimated total</Text><Text style={styles.grandTotalAmount}>{formatPrice(estimatedTotal, settings)}</Text></View>
        <Text style={styles.note}>The server confirms final prices, tax, shipping and stock when the order is placed.</Text>
      </View>

      <Pressable onPress={placeOrder} disabled={placing || !paymentMethod || shippingQuote?.serviceable === false} style={[styles.primaryButton, { backgroundColor: theme.brand, opacity: placing || !paymentMethod || shippingQuote?.serviceable === false ? 0.55 : 1 }]}>{placing ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryText}>{paymentMethod === 'cod' ? 'Place order' : 'Continue to payment'}</Text>}</Pressable>
    </ScreenScroll>
    <Modal visible={Boolean(paymentSession)} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => { setPaymentSession(null); }}>
      <View style={styles.paymentModal}><View style={styles.modalHeader}><Pressable onPress={() => setPaymentSession(null)}><Ionicons name="close" size={24} color="#0f172a" /></Pressable><Text style={styles.modalTitle}>{verifying ? 'Verifying payment…' : 'Secure payment'}</Text><View style={{ width: 24 }} /></View>{paymentSession ? <RazorpayWebCheckout paymentOrder={paymentSession.paymentOrder} siteName={settings.siteName || site?.name} address={paymentSession.address} onMessage={handlePaymentMessage} onNavigation={handlePaymentNavigation} /> : null}{verifying ? <View style={styles.verifying}><ActivityIndicator color={theme.brand} size="large" /><Text style={styles.note}>Confirming your payment with the store</Text></View> : null}</View>
    </Modal>
  </KeyboardAvoidingView></ScreenFrame>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 28 },
  pageHeading: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8, gap: 4 },
  title: { color: '#111827', fontSize: 23, fontWeight: '900' },
  subtitle: { color: '#64748b', fontSize: 12 },
  section: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 15, borderTopWidth: 1, borderTopColor: '#f1f5f9', gap: 10 },
  addressCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 13, padding: 12 },
  paymentCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 13, padding: 12 },
  unsupportedPayment: { opacity: 0.58 },
  unsupportedText: { color: '#b45309', fontSize: 10, marginTop: 3 },
  addressName: { color: '#1f2937', fontSize: 12, fontWeight: '800' },
  addressText: { color: '#64748b', fontSize: 11, lineHeight: 17, marginTop: 3 },
  newAddressText: { color: '#334155', fontSize: 12, fontWeight: '700' },
  formGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 9, paddingTop: 3 },
  input: { width: '48%', minHeight: 46, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 11, backgroundColor: '#ffffff', color: '#111827', fontSize: 12 },
  fullWidth: { width: '100%' },
  couponRow: { flexDirection: 'row', gap: 8 },
  couponInput: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 12, color: '#111827', fontSize: 12 },
  couponButton: { minWidth: 75, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  couponButtonText: { fontSize: 12, fontWeight: '800' },
  couponSuccess: { color: '#15803d', fontSize: 11, fontWeight: '700' },
  couponList: { gap: 8, paddingVertical: 2 },
  couponCard: { width: 180, borderWidth: 1, borderStyle: 'dashed', borderColor: '#cbd5e1', borderRadius: 10, padding: 10, gap: 4 },
  couponCode: { color: '#111827', fontSize: 11, fontWeight: '900' },
  couponDescription: { color: '#64748b', fontSize: 10, lineHeight: 14 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 5 },
  summaryName: { flex: 1, color: '#475569', fontSize: 11, lineHeight: 17 },
  summaryLabel: { color: '#64748b', fontSize: 12 },
  summaryPrice: { color: '#334155', fontSize: 12, fontWeight: '700' },
  discountValue: { color: '#15803d', fontSize: 12, fontWeight: '800' },
  summaryDivider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 5 },
  grandTotal: { borderTopWidth: 1, borderTopColor: '#e2e8f0', marginTop: 5, paddingTop: 12 },
  grandTotalLabel: { color: '#111827', fontSize: 14, fontWeight: '900' },
  grandTotalAmount: { color: '#111827', fontSize: 17, fontWeight: '900' },
  note: { color: '#94a3b8', fontSize: 10, lineHeight: 15 },
  errorText: { color: '#b91c1c', fontSize: 11, fontWeight: '700' },
  primaryButton: { marginHorizontal: 16, marginTop: 10, minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  primaryText: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  emptyTitle: { color: '#111827', fontSize: 18, fontWeight: '800' },
  paymentModal: { flex: 1, paddingTop: Platform.OS === 'android' ? 24 : 48, backgroundColor: '#ffffff' },
  modalHeader: { height: 52, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { color: '#111827', fontSize: 14, fontWeight: '800' },
  webView: { flex: 1, backgroundColor: '#ffffff' },
  verifying: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.93)', alignItems: 'center', justifyContent: 'center', gap: 12 },
});
