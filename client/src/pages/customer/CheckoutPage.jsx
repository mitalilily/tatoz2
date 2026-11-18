import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { CreditCard, Wallet, Award, Gift, MapPin, ChevronDown, Lock, Tag, Trash2, Plus, Check, Truck } from 'lucide-react';
import { orderAPI, paymentAPI, walletAPI, loyaltyAPI, giftCardAPI, couponAPI, cartSyncAPI, authAPI, taxAPI, shippingAPI, trackingAPI } from '../../services/api';
import { clearCart, selectCartItems, selectCartTotal, applyCoupon, removeCoupon } from '../../store/slices/cartSlice';
import { getMe } from '../../store/slices/authSlice';
import { useSite } from '../../context/SiteContext';
import { PLATFORM_NAME } from '../../constants/branding';
import { formatPrice } from '../../utils/formatPrice';
import { INDIAN_STATES } from '../../constants/indianStates';
import { lookupPincode } from '../../utils/pincode';
import Loader from '../../components/common/Loader';
import toast from 'react-hot-toast';
import SEO from '../../components/common/SEO';
import { trackGoogleAdsConversion } from '../../utils/googleAds';
import { trackMetaPixel } from '../../utils/metaPixel';
import { getAttribution, getOrderAttribution } from '../../utils/attribution';

const GATEWAY_ICONS = { razorpay: CreditCard };

const loadRazorpayScript = () =>
  new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

const loadScript = (src, globalName) => new Promise((resolve) => {
  if (window[globalName]) return resolve(true);
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) { existing.addEventListener('load', () => resolve(true), { once: true }); existing.addEventListener('error', () => resolve(false), { once: true }); return; }
  const script = document.createElement('script'); script.src = src; script.async = true;
  script.onload = () => resolve(true); script.onerror = () => resolve(false); document.body.appendChild(script);
 });

const emptyAddress = { fullName: '', phone: '', street: '', city: '', state: '', pincode: '', country: 'India' };

const getStoredDeliveryPincode = () => {
  try { return localStorage.getItem('deliverPincode') || ''; } catch { return ''; }
};

const roundMoney = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const isBundleItem = item => item?.itemType === 'bundle' || Boolean(item?.bundle);

const taxRowsForCart = cartItems => (cartItems || []).flatMap(item => {
  if (!isBundleItem(item)) return [{ item, gross: Number(item?.lineTotal ?? Number(item?.unitPrice || item?.product?.price || 0) * Number(item?.quantity || 0)), rate: item?.product?.gstRate }];
  const bundleQuantity = Number(item.quantity || 0);
  const components = [...(item.components || []), ...(item.freeRewards || [])];
  if (!components.length) return [{ item, gross: Number(item?.lineTotal ?? Number(item?.unitPrice || 0) * bundleQuantity), rate: undefined }];
  return components.map(component => ({
    item: component,
    gross: Number(component.allocatedUnitPrice ?? component.unitPrice ?? 0) * Number(component.quantity || 0) * bundleQuantity,
    rate: component.taxRate,
  }));
});

const shippingInputsFor = cartItems => {
  const rows = [];
  (cartItems || []).forEach(item => {
    if (!isBundleItem(item)) {
      if (item.product?._id) rows.push({ product: item.product._id, quantity: item.quantity, variant: item.variant || {} });
      return;
    }
    [...(item.components || []), ...(item.freeRewards || [])].forEach(component => {
      if (component.product) rows.push({ product: component.product, quantity: Number(component.quantity || 0) * Number(item.quantity || 0), variant: component.variant || {} });
    });
  });
  return rows.reduce((result, row) => {
    const key = `${row.product}:${JSON.stringify(row.variant || {})}`;
    const existing = result.find(item => `${item.product}:${JSON.stringify(item.variant || {})}` === key);
    if (existing) existing.quantity += Number(row.quantity || 0);
    else result.push({ ...row });
    return result;
  }, []);
};

const displayTaxForCart = (cartItems, cartSubtotal, discount, profile, fallbackRate) => {
  const enabled = profile?.enabled !== false;
  if (!enabled) return 0;
  const defaultRate = Number.isFinite(Number(profile?.defaultRate)) ? Number(profile.defaultRate) : Number(fallbackRate || 18);
  const rows = taxRowsForCart(cartItems);
  const grossSubtotal = Number(cartSubtotal || 0);
  let remainingDiscount = Math.min(Math.max(0, Number(discount || 0)), grossSubtotal);
  return roundMoney(rows.reduce((sum, row, index) => {
    const gross = row.gross;
    const allocated = index === rows.length - 1
      ? remainingDiscount
      : grossSubtotal > 0 ? roundMoney(Number(discount || 0) * gross / grossSubtotal) : 0;
    remainingDiscount = roundMoney(remainingDiscount - allocated);
    const discountedGross = Math.max(0, gross - allocated);
    const rawItemRate = row.rate;
    const itemRate = rawItemRate !== null && rawItemRate !== undefined && rawItemRate !== '' && Number.isFinite(Number(rawItemRate))
      ? Number(rawItemRate)
      : defaultRate;
    if (profile?.pricingMode === 'inclusive') return sum + roundMoney(discountedGross - discountedGross / (1 + itemRate / 100));
    return sum + roundMoney(discountedGross * itemRate / 100);
  }, 0));
};

const CheckoutPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector(state => state.auth);
  const items = useSelector(selectCartItems);
  const subtotal = useSelector(selectCartTotal);
  const { coupon, discount, referralCode, hydrated: cartHydrated, loading: cartLoading, hasUnavailableItems } = useSelector(state => state.cart);
  const { settings } = useSite();

  const savedAddresses = user?.addresses || [];
  const defaultIdx = savedAddresses.findIndex(a => a.isDefault);
  const mostRecent = savedAddresses[defaultIdx >= 0 ? defaultIdx : 0];

  const seedNewAddress = () => ({
    ...emptyAddress,
    fullName: mostRecent?.fullName || user?.name || '',
    phone: mostRecent?.phone || user?.phone || '',
    pincode: mostRecent?.pincode || getStoredDeliveryPincode(),
    city: mostRecent?.city || '',
    state: mostRecent?.state || '',
  });

  const [selectedAddrIdx, setSelectedAddrIdx] = useState(defaultIdx >= 0 ? defaultIdx : (savedAddresses.length > 0 ? 0 : -1));
  const [showNewForm, setShowNewForm] = useState(savedAddresses.length === 0);
  const [newAddress, setNewAddress] = useState(seedNewAddress);
  const [pincodeLookup, setPincodeLookup] = useState({ loading: false, cities: [], areas: [], error: '' });
  const [paymentMethod, setPaymentMethod] = useState('');
  const [placing, setPlacing] = useState(false);
  const [guestEmail, setGuestEmail] = useState('');
  const orderComplete = useRef(false);
  const addressSelectionTouched = useRef(false);
  const [gateways, setGateways] = useState([]);
  const [loadingGateways, setLoadingGateways] = useState(true);
  const [couponCode, setCouponCode] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [availableCoupons, setAvailableCoupons] = useState([]);
  const stripeCardRef = useRef(null);
  const stripeCardElementRef = useRef(null);
  const stripeElementsRef = useRef(null);
  const stripeRef = useRef(null);
  const [stripeReady, setStripeReady] = useState(false);
  const [wallet, setWallet] = useState(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [useWallet, setUseWallet] = useState(false);
  const [walletAmountInput, setWalletAmountInput] = useState('0');
  const [loyalty, setLoyalty] = useState(null);
  const [loyaltyLoading, setLoyaltyLoading] = useState(true);
  const [useLoyalty, setUseLoyalty] = useState(false);
  const [loyaltyPointsInput, setLoyaltyPointsInput] = useState('0');
  const [giftCardCodeInput, setGiftCardCodeInput] = useState('');
  const [giftCardAmountInput, setGiftCardAmountInput] = useState('');
  const [giftCardQuote, setGiftCardQuote] = useState(null);
  const [useGiftCard, setUseGiftCard] = useState(false);
  const [giftCardLoading, setGiftCardLoading] = useState(false);
  const storedTenderInteraction = useRef(false);
  const [taxProfile, setTaxProfile] = useState(null);
  const [shippingQuote, setShippingQuote] = useState(null);
  const [shippingQuoteLoading, setShippingQuoteLoading] = useState(false);
  const checkoutIdempotencyKey = useRef(null);
  const checkoutTracked = useRef(false);

  useEffect(() => {
    if (!items.length || checkoutTracked.current) return;
    checkoutTracked.current = true;
    trackingAPI.track({ eventType: 'checkout_start', page: '/checkout', metadata: { attribution: getAttribution() } });
    trackMetaPixel('InitiateCheckout', {
      content_ids: items.map(item => String(item.product?._id || item.product?.id || '')).filter(Boolean),
      contents: items.map(item => ({
        id: String(item.product?._id || item.product?.id || ''),
        quantity: Number(item.quantity || 0),
        item_price: Number(item.price || item.product?.price || 0),
      })).filter(item => item.id),
      num_items: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      value: Number(total || 0),
      currency: 'INR',
    });
  }, [items.length]);

  // The authenticated user can hydrate after the checkout component mounts.
  // In that case the initial empty-address state would keep the new-address
  // form active even though a saved address is now available, leaving the
  // shipping quote and stored-tender controls in an incomplete state. Apply
  // the first saved address once, unless the shopper has explicitly chosen or
  // started editing the new-address form.
  useEffect(() => {
    if (!savedAddresses.length || addressSelectionTouched.current) return;
    const preferredIdx = defaultIdx >= 0 ? defaultIdx : 0;
    setSelectedAddrIdx(current => (current >= 0 && current < savedAddresses.length ? current : preferredIdx));
    setShowNewForm(false);
  }, [user?._id, savedAddresses.length, defaultIdx]);

  const activeAddress = showNewForm ? newAddress : savedAddresses[selectedAddrIdx] || newAddress;
  const quotePincode = String(activeAddress?.pincode || '').replace(/\D/g, '');
  const shippingPaymentMethod = paymentMethod === 'cod' ? 'cod' : 'prepaid';
  const threshold = settings.freeShippingThreshold ?? 999;
  const legacyShippingCost = settings.standardShippingCost ?? 49;
  const legacyShipping = coupon?.freeShipping || subtotal - discount >= threshold ? 0 : legacyShippingCost;
  const quoteMatchesAddress = shippingQuote?.pincode === quotePincode && shippingQuote?.paymentMethod === shippingPaymentMethod;
  const quoteAddressReady = quotePincode.length === 6
    && Boolean(String(activeAddress?.city || '').trim())
    && Boolean(String(activeAddress?.state || '').trim());
  const shippingRulesReady = !quoteAddressReady || (quoteMatchesAddress && !shippingQuoteLoading);
  const shippingQuoteItems = shippingInputsFor(items);
  // Redux cart hydration can replace the items array even when its contents
  // are unchanged. Use a value-based request key so a render cannot restart
  // the quote indefinitely and leave stored-tender controls hidden.
  const shippingQuoteRequestKey = JSON.stringify({
    items: shippingQuoteItems,
    pincode: quotePincode,
    city: activeAddress?.city || '',
    state: activeAddress?.state || '',
    country: activeAddress?.country || 'India',
    paymentMethod: shippingPaymentMethod,
    discount,
    couponFreeShipping: coupon?.freeShipping === true,
  });
  const shipping = quoteMatchesAddress && shippingQuote?.serviceable !== false
    ? Number(shippingQuote.shippingCost || 0)
    : legacyShipping;
  const tax = displayTaxForCart(items, subtotal, discount, taxProfile, settings.taxRate ?? 18);
  const total = subtotal - discount + shipping + (taxProfile?.pricingMode === 'inclusive' ? 0 : tax);

  const walletBalance = Number(wallet?.totalBalance || 0);
  const requestedWalletAmount = Number(walletAmountInput);
  const appliedWalletAmount = useWallet && Number.isFinite(requestedWalletAmount)
    ? Math.min(Math.max(0, requestedWalletAmount), walletBalance, Math.max(0, total))
    : 0;
  const walletCoversTotal = appliedWalletAmount > 0 && Math.abs(appliedWalletAmount - total) <= 0.01;
  const loyaltyProgram = loyalty?.program || null;
  const loyaltyAccount = loyalty?.account || null;
  const loyaltyBalance = Number(loyaltyAccount?.pointsBalance || 0);
  const loyaltyRedeemRate = Number(loyaltyProgram?.redeemPointsPerCurrency || 0);
  const loyaltyMinimum = Number(loyaltyProgram?.minimumRedeemPoints || 0);
  const loyaltyMaxByOrder = loyaltyRedeemRate > 0
    ? Math.floor((Math.max(0, total) * Number(loyaltyProgram?.maxRedeemPercent || 0) / 100) * loyaltyRedeemRate + 1e-9)
    : 0;
  const loyaltyMaxPoints = Math.min(loyaltyBalance, loyaltyMaxByOrder);
  const requestedLoyaltyPoints = Number(loyaltyPointsInput);
  const appliedLoyaltyPoints = useLoyalty && loyaltyProgram?.enabled && Number.isInteger(requestedLoyaltyPoints)
    ? Math.min(Math.max(0, requestedLoyaltyPoints), loyaltyMaxPoints)
    : 0;
  const appliedLoyaltyAmount = loyaltyRedeemRate > 0 ? Math.round((appliedLoyaltyPoints / loyaltyRedeemRate) * 100) / 100 : 0;
  const giftCardBalance = Number(giftCardQuote?.giftCard?.balance || 0);
  const requestedGiftCardAmount = Number(giftCardAmountInput);
  const appliedGiftCardAmount = useGiftCard && giftCardQuote
    ? Math.min(Math.max(0, Number.isFinite(requestedGiftCardAmount) && requestedGiftCardAmount > 0 ? requestedGiftCardAmount : Number(giftCardQuote.amount || 0)), giftCardBalance, Math.max(0, total))
    : 0;
  const remainingExternalAmount = Math.max(0, Math.round((total - appliedWalletAmount - appliedLoyaltyAmount - appliedGiftCardAmount) * 100) / 100);
  const storedTendersCoverTotal = appliedWalletAmount + appliedLoyaltyAmount + appliedGiftCardAmount >= total - 0.01;
  const selectedExternalMethod = ['wallet', 'loyalty', 'gift_card'].includes(paymentMethod)
    ? gateways.find(gateway => gateway.id !== 'cod')?.id || gateways[0]?.id || 'cod'
    : paymentMethod;
  const orderPaymentMethod = storedTendersCoverTotal
    ? (appliedGiftCardAmount > 0 && appliedWalletAmount <= 0 && appliedLoyaltyAmount <= 0 ? 'gift_card' : appliedWalletAmount > 0 ? 'wallet' : 'loyalty')
    : selectedExternalMethod;

  useEffect(() => {
    if (!quoteAddressReady || !items.length) {
      setShippingQuote(null);
      setShippingQuoteLoading(false);
      return undefined;
    }
    let cancelled = false;
    setShippingQuoteLoading(true);
    shippingAPI.quote({
      items: shippingQuoteItems,
      shippingAddress: activeAddress,
      paymentMethod: shippingPaymentMethod,
      discount,
      couponFreeShipping: coupon?.freeShipping === true,
    }).then(response => {
      if (cancelled) return;
      setShippingQuote({ ...(response.data?.quote || {}), pincode: quotePincode, paymentMethod: shippingPaymentMethod });
    }).catch(error => {
      if (cancelled) return;
      setShippingQuote({ pincode: quotePincode, paymentMethod: shippingPaymentMethod, serviceable: false, error: error.response?.data?.message || error.message || 'This pincode is not serviceable' });
    }).finally(() => {
      if (!cancelled) {
        setShippingQuoteLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [quoteAddressReady, shippingQuoteRequestKey]);

  useEffect(() => {
    paymentAPI.getActiveGateways()
      .then(res => {
        const active = res.data.gateways || [];
        setGateways(active);
        const preferred = active.find(gateway => gateway.id === 'cod') || active[0];
        // StrictMode can resolve the duplicated bootstrap request after the
        // customer has selected a stored tender. Never overwrite that choice.
        if (preferred && !storedTenderInteraction.current) setPaymentMethod(current => current || preferred.id);
      })
      .catch(() => {})
      .finally(() => setLoadingGateways(false));
    couponAPI.getAvailable()
      .then(res => setAvailableCoupons(res.data.coupons || []))
      .catch(() => {});
    if (user) {
      taxAPI.getProfile()
        .then(res => setTaxProfile(res.data?.profile || null))
        .catch(() => setTaxProfile(null));
    } else {
      setTaxProfile(null);
    }
  }, [user?._id]);

  useEffect(() => {
    if (!user) {
      setLoyalty(null);
      setLoyaltyLoading(false);
      return undefined;
    }
    let cancelled = false;
    loyaltyAPI.get({ page: 1, limit: 1 })
      .then(res => { if (!cancelled) setLoyalty(res.data || null); })
      .catch(() => { if (!cancelled) setLoyalty(null); })
      .finally(() => { if (!cancelled) setLoyaltyLoading(false); });
    return () => { cancelled = true; };
  }, [user?._id]);

  useEffect(() => {
    if (!user) {
      setWallet(null);
      setWalletLoading(false);
      return undefined;
    }
    let cancelled = false;
    walletAPI.get({ page: 1, limit: 1 })
      .then(res => { if (!cancelled) setWallet(res.data.wallet || null); })
      .catch(() => { if (!cancelled) setWallet(null); })
      .finally(() => { if (!cancelled) setWalletLoading(false); });
    return () => { cancelled = true; };
  }, [user?._id]);

  useEffect(() => {
    if (!useWallet || !walletBalance) return;
    const capped = Math.min(walletBalance, Math.max(0, total));
    setWalletAmountInput(String(Math.round(capped * 100) / 100));
  }, [useWallet, walletBalance, total]);

  useEffect(() => {
    if (!useLoyalty) {
      setLoyaltyPointsInput('0');
      if (paymentMethod === 'loyalty') setPaymentMethod(gateways.find(gateway => gateway.id !== 'cod')?.id || gateways[0]?.id || 'cod');
      return;
    }
    setLoyaltyPointsInput(String(Math.max(0, loyaltyMaxPoints)));
  }, [useLoyalty, loyaltyMaxPoints]);

  useEffect(() => {
    if (!useWallet || shippingQuoteLoading || !quoteMatchesAddress) return;
    if (storedTendersCoverTotal && appliedWalletAmount > 0 && paymentMethod !== 'wallet') setPaymentMethod('wallet');
    if (!storedTendersCoverTotal && paymentMethod === 'wallet') setPaymentMethod(gateways.find(gateway => gateway.id !== 'cod')?.id || gateways[0]?.id || 'cod');
  }, [useWallet, shippingQuoteLoading, quoteMatchesAddress, storedTendersCoverTotal, appliedWalletAmount, paymentMethod, gateways]);

  useEffect(() => {
    if (shippingQuoteLoading || !quoteMatchesAddress) return;
    if (storedTendersCoverTotal && appliedWalletAmount <= 0 && appliedLoyaltyPoints > 0 && paymentMethod !== 'loyalty') setPaymentMethod('loyalty');
    if (!storedTendersCoverTotal && paymentMethod === 'loyalty') setPaymentMethod(gateways.find(gateway => gateway.id !== 'cod')?.id || gateways[0]?.id || 'cod');
  }, [shippingQuoteLoading, quoteMatchesAddress, storedTendersCoverTotal, appliedWalletAmount, appliedLoyaltyPoints, paymentMethod, gateways]);

  useEffect(() => {
    if (shippingQuoteLoading || !quoteMatchesAddress) return;
    if (!useGiftCard) {
      if (paymentMethod === 'gift_card') setPaymentMethod(gateways.find(gateway => gateway.id !== 'cod')?.id || gateways[0]?.id || 'cod');
      return;
    }
    if (storedTendersCoverTotal && appliedGiftCardAmount > 0 && appliedWalletAmount <= 0 && appliedLoyaltyAmount <= 0 && paymentMethod !== 'gift_card') setPaymentMethod('gift_card');
    if (!storedTendersCoverTotal && paymentMethod === 'gift_card') setPaymentMethod(gateways.find(gateway => gateway.id !== 'cod')?.id || gateways[0]?.id || 'cod');
  }, [useGiftCard, shippingQuoteLoading, quoteMatchesAddress, storedTendersCoverTotal, appliedGiftCardAmount, appliedWalletAmount, appliedLoyaltyAmount, paymentMethod, gateways]);

  const stripeGateway = gateways.find(gateway => gateway.id === 'stripe');

  useEffect(() => {
    if (paymentMethod !== 'stripe') return undefined;
    let cancelled = false;
    loadScript('https://js.stripe.com/v3/', 'Stripe').then(loaded => {
      if (!cancelled) setStripeReady(loaded);
    });
    return () => { cancelled = true; };
  }, [paymentMethod]);

  useEffect(() => {
    if (!stripeReady || !stripeGateway?.publishable_key || !stripeCardRef.current || stripeCardElementRef.current) return undefined;
    stripeRef.current = window.Stripe(stripeGateway.publishable_key);
    stripeElementsRef.current = stripeRef.current.elements();
    stripeCardElementRef.current = stripeElementsRef.current.create('card', { hidePostalCode: true });
    stripeCardElementRef.current.mount(stripeCardRef.current);
    return () => {
      try { stripeCardElementRef.current?.destroy(); } catch (_) { /* already unmounted */ }
      stripeCardElementRef.current = null; stripeElementsRef.current = null; stripeRef.current = null;
    };
  }, [stripeReady, stripeGateway?.publishable_key]);

  useEffect(() => {
    const code = (newAddress.pincode || '').replace(/\D/g, '');
    if (code.length !== 6) {
      setPincodeLookup({ loading: false, cities: [], areas: [], error: '' });
      return;
    }
    let cancelled = false;
    setPincodeLookup(prev => ({ ...prev, loading: true, error: '' }));
    const t = setTimeout(async () => {
      const result = await lookupPincode(code);
      if (cancelled) return;
      if (!result) {
        setPincodeLookup({ loading: false, cities: [], areas: [], error: 'Invalid pincode' });
        return;
      }
      setPincodeLookup({ loading: false, cities: result.cities, areas: result.areas, error: '' });
      setNewAddress(prev => ({
        ...prev,
        // Auto-fill city/state when empty, or refresh when pincode determines a different state.
        city: prev.city && result.cities.includes(prev.city) ? prev.city : result.city,
        state: result.state,
      }));
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [newAddress.pincode]);

  useEffect(() => {
    if (cartHydrated && !cartLoading && !orderComplete.current && (items.length === 0 || hasUnavailableItems)) {
      if (hasUnavailableItems) toast.error('Resolve unavailable cart items before checkout');
      navigate('/cart', { replace: true });
    }
  }, [cartHydrated, cartLoading, hasUnavailableItems, items.length, navigate]);

  if (!cartHydrated || cartLoading) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader size="lg" /></div>;
  }
  if ((items.length === 0 || hasUnavailableItems) && !orderComplete.current) return null;

  const handleApplyCouponByCode = async (code) => {
    if (!code) return;
    setCouponLoading(true);
    try {
      const res = await couponAPI.validate(code, subtotal, items, {
        paymentMethod: orderPaymentMethod,
        shippingAddress: activeAddress,
        channel: 'website',
      });
      const { coupon: c } = res.data;
      dispatch(applyCoupon({ coupon: c, discount: c.discount }));
      toast.success(`Coupon "${c.code}" applied! Saved ${formatPrice(c.discount || 0, settings)}`);
      setCouponCode('');
    } catch (err) { toast.error(err.message || 'Invalid or expired coupon'); }
    finally { setCouponLoading(false); }
  };

  const handleApplyCoupon = () => handleApplyCouponByCode(couponCode.trim());

  const handleApplyGiftCard = async () => {
    const code = giftCardCodeInput.trim();
    if (!code) {
      toast.error('Enter a gift card code');
      return;
    }
    storedTenderInteraction.current = true;
    setGiftCardLoading(true);
    try {
      const response = await giftCardAPI.validate({
        code,
        orderTotal: total,
        requestedAmount: giftCardAmountInput ? Number(giftCardAmountInput) : undefined,
      });
      setGiftCardQuote(response.data);
      setGiftCardAmountInput(String(response.data.amount || ''));
      setUseGiftCard(true);
      toast.success('Gift card applied. The server will re-check its balance at checkout.');
    } catch (error) {
      setGiftCardQuote(null);
      setUseGiftCard(false);
      toast.error(error.response?.data?.message || error.message || 'Invalid or expired gift card');
    } finally { setGiftCardLoading(false); }
  };

  const paymentMethods = [
    ...(storedTendersCoverTotal && appliedWalletAmount > 0 ? [{ id: 'wallet', label: appliedLoyaltyPoints > 0 ? 'Wallet + loyalty points' : 'Wallet / Store Credit', icon: Wallet, desc: 'Pay the complete order from your available stored balances.' }] : []),
    ...(storedTendersCoverTotal && appliedWalletAmount <= 0 && appliedLoyaltyPoints > 0 ? [{ id: 'loyalty', label: 'Loyalty points', icon: Award, desc: 'Pay the complete order using redeemed loyalty points.' }] : []),
    ...(storedTendersCoverTotal && appliedGiftCardAmount > 0 ? [{ id: 'gift_card', label: 'Gift card' + (appliedWalletAmount > 0 || appliedLoyaltyAmount > 0 ? ' + stored balances' : ''), icon: Gift, desc: 'Pay the complete order from the applied gift card and stored balances.' }] : []),
    ...gateways.map(gw => ({ id: gw.id, label: gw.displayName, icon: GATEWAY_ICONS[gw.id] || CreditCard, desc: gw.description || '' })),
  ];

  const saveAddressIfNew = (addr) => {
    const isDuplicate = savedAddresses.some(s => s.street === addr.street && s.pincode === addr.pincode && s.phone === addr.phone);
    if (!isDuplicate) {
      if (!user) return;
      authAPI.addAddress({ ...addr, label: 'Home', isDefault: savedAddresses.length === 0 })
        .then(() => dispatch(getMe()))
        .catch(() => {});
    }
  };

  const handlePlaceOrder = async () => {
    const addr = activeAddress;
    if (!addr.fullName || !addr.phone || !addr.street || !addr.city || !addr.pincode) {
      toast.error('Please fill all required address fields');
      return;
    }
    if (!orderPaymentMethod) {
      toast.error('Please select a payment method');
      return;
    }
    if (shippingQuote?.pincode === quotePincode && shippingQuote?.serviceable === false) {
      toast.error(shippingQuote.error || 'This pincode is not serviceable');
      return;
    }
    if (useLoyalty && appliedLoyaltyPoints > 0 && appliedLoyaltyPoints < loyaltyMinimum) {
      toast.error(`Redeem at least ${loyaltyMinimum} loyalty points or switch it off`);
      return;
    }
    if (useGiftCard && (!giftCardCodeInput.trim() || appliedGiftCardAmount <= 0)) {
      toast.error('Apply a valid gift card or switch it off');
      return;
    }

    setPlacing(true);
    let createdOrder = null;
    try {
      trackMetaPixel('AddPaymentInfo', {
        content_ids: items.map(i => String(isBundleItem(i) ? i.bundle?._id || i.bundle : i.product?._id || i.product?.id || '')).filter(Boolean),
        value: Number(total || 0),
        currency: 'INR',
        payment_method: orderPaymentMethod,
      });
      trackGoogleAdsConversion('begin_checkout', {
        value: total,
        items: items.map(i => ({
          item_id: isBundleItem(i) ? i.bundle?._id || i.bundle : i.product?._id,
          item_name: isBundleItem(i) ? i.bundle?.title || i.bundle?.name : i.product?.title,
          price: Number(i.price || i.product?.price || 0),
          quantity: i.quantity,
        })),
      });
      if (!checkoutIdempotencyKey.current) {
        checkoutIdempotencyKey.current = `checkout-${Date.now()}-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
      }
      const orderRes = await orderAPI.create({
        items: items.map(i => isBundleItem(i)
          ? { itemType: 'bundle', bundle: i.bundle?._id || i.bundle, bundleSelections: i.bundleSelections || {}, quantity: i.quantity }
          : { itemType: 'product', product: i.product._id, quantity: i.quantity, variant: i.variant }),
        shippingAddress: addr,
        paymentMethod: orderPaymentMethod,
        walletAmount: appliedWalletAmount,
        loyaltyPoints: appliedLoyaltyPoints,
        giftCardCode: useGiftCard ? giftCardCodeInput.trim() : undefined,
        giftCardAmount: appliedGiftCardAmount,
        couponCode: coupon?.code,
        referralCode,
        referralSource: getOrderAttribution().source,
        utm: getOrderAttribution(),
        customerEmail: !user ? guestEmail.trim() || undefined : undefined,
        guestAccessToken: !user ? sessionStorage.getItem('tatoz_guest_checkout_token') || undefined : undefined,
        channel: 'website',
      }, checkoutIdempotencyKey.current);
      const order = orderRes.data.order;
      createdOrder = order;
      if (!user && orderRes.data.guestAccessToken) {
        sessionStorage.setItem(`tatoz_guest_order_token:${order._id}`, orderRes.data.guestAccessToken);
        sessionStorage.setItem('tatoz_guest_checkout_token', orderRes.data.guestAccessToken);
      }

      saveAddressIfNew(addr);
      orderComplete.current = true;

      if (orderPaymentMethod === 'cod' || orderPaymentMethod === 'wallet' || orderPaymentMethod === 'loyalty' || orderPaymentMethod === 'gift_card' || Number(order.externalPaymentAmount || 0) <= 0.01) {
        await dispatch(clearCart()); cartSyncAPI.recovered();
        navigate(`/order-confirmation/${order._id}`, { replace: true });
        return;
      }

      if (['manual', 'bank_transfer', 'upi'].includes(orderPaymentMethod)) {
        await dispatch(clearCart()); cartSyncAPI.recovered();
        navigate(`/order-confirmation/${order._id}`, { replace: true });
        return;
      }

      if (orderPaymentMethod === 'razorpay') {
        const loaded = await loadRazorpayScript();
        if (!loaded) throw new Error('Failed to load Razorpay SDK');
        const pgRes = await paymentAPI.createOrder({ gatewayId: 'razorpay', orderId: order._id });
        const { id: rzpOrderId, amount, currency, key_id } = pgRes.data.paymentOrder;

        await new Promise((resolve, reject) => {
          const rzp = new window.Razorpay({
            key: key_id, amount, currency, order_id: rzpOrderId,
            name: PLATFORM_NAME, description: `Order #${order._id}`,
            prefill: { name: addr.fullName, email: user?.email || '', contact: addr.phone },
            handler: async (response) => {
              try {
                await paymentAPI.verify({
                  gatewayId: 'razorpay', orderId: order._id,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                });
                resolve();
              } catch (e) { reject(e); }
            },
            modal: { ondismiss: () => reject(new Error('Payment cancelled')) },
          });
          rzp.open();
        });

        await dispatch(clearCart()); cartSyncAPI.recovered();
        navigate(`/order-confirmation/${order._id}`, { replace: true });
        return;
      }

      const pgRes = await paymentAPI.createOrder({ gatewayId: orderPaymentMethod, orderId: order._id });
      const paymentOrder = pgRes.data.paymentOrder;

      if (orderPaymentMethod === 'cashfree') {
        const loaded = await loadScript('https://sdk.cashfree.com/js/v3/cashfree.js', 'Cashfree');
        if (!loaded) throw new Error('Failed to load Cashfree SDK');
        const cashfree = window.Cashfree({ mode: paymentOrder.environment === 'production' ? 'production' : 'sandbox' });
        const result = await cashfree.checkout({ paymentSessionId: paymentOrder.paymentSessionId, redirectTarget: '_modal' });
        if (result?.error) throw new Error(result.error.message || 'Cashfree payment failed');
        await paymentAPI.verify({ gatewayId: 'cashfree', orderId: order._id, cashfree_order_id: paymentOrder.externalOrderId });
        await dispatch(clearCart()); cartSyncAPI.recovered();
        navigate(`/order-confirmation/${order._id}`, { replace: true });
        return;
      }

      if (orderPaymentMethod === 'stripe') {
        if (!stripeRef.current || !stripeCardElementRef.current || !paymentOrder.clientSecret) throw new Error('Stripe card form is not ready. Please try again.');
        const result = await stripeRef.current.confirmCardPayment(paymentOrder.clientSecret, {
          payment_method: { card: stripeCardElementRef.current, billing_details: { name: addr.fullName, email: user?.email || '', phone: addr.phone, address: { city: addr.city, state: addr.state, postal_code: addr.pincode, country: 'IN' } } },
        });
        if (result.error) throw new Error(result.error.message || 'Stripe payment failed');
        if (!result.paymentIntent?.id) throw new Error('Stripe did not return a payment intent');
        await paymentAPI.verify({ gatewayId: 'stripe', orderId: order._id, payment_intent: result.paymentIntent.id });
        await dispatch(clearCart()); cartSyncAPI.recovered();
        navigate(`/order-confirmation/${order._id}`, { replace: true });
        return;
      }

      throw new Error(`Unsupported payment method: ${orderPaymentMethod}`);
    } catch (err) {
      if (createdOrder && (appliedWalletAmount > 0 || appliedLoyaltyPoints > 0 || appliedGiftCardAmount > 0) && !createdOrder.paymentProviderOrderId) {
        await paymentAPI.releaseWallet({ orderId: createdOrder._id }).catch(() => {});
      }
      toast.error(err.message || 'Failed to place order');
    }
    finally { setPlacing(false); }
  };

  return (
    <>
      <SEO title="Checkout" noindex={true} />
      <div className="page-container checkout-page py-6 sm:py-8 animate-fade-in">
        <div className="mb-4 sm:mb-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-600">Secure checkout</p>
          <h1 className="mt-1 text-xl sm:text-2xl font-bold text-gray-900">Checkout</h1>
        </div>

        <div className="grid min-w-0 gap-5 lg:grid-cols-3 lg:gap-8">
          <div className="min-w-0 space-y-4 sm:space-y-6 lg:col-span-2">

            <div className="card p-4 sm:p-6">
              <h2 className="font-bold text-base sm:text-lg text-gray-900 mb-4 flex items-center gap-2">
                <MapPin size={20} className="text-primary-600" />Delivery Address
              </h2>

              {savedAddresses.length > 0 && (
                <div className="space-y-2 mb-4">
                  {savedAddresses.map((addr, i) => (
                    <label key={i} data-testid={`checkout-saved-address-${i}`} onClick={() => { addressSelectionTouched.current = true; setSelectedAddrIdx(i); setShowNewForm(false); }}
                      className={`flex items-start gap-3 p-3 border-2 rounded-xl cursor-pointer transition-all ${!showNewForm && selectedAddrIdx === i ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <div className={`w-5 h-5 mt-0.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${!showNewForm && selectedAddrIdx === i ? 'border-primary-600 bg-primary-600' : 'border-gray-300'}`}>
                        {!showNewForm && selectedAddrIdx === i && <Check size={12} className="text-white" />}
                      </div>
                      <div className="min-w-0 text-sm">
                        <p className="font-semibold text-gray-800">{addr.label || 'Address'} — {addr.fullName}</p>
                        <p className="text-gray-600 break-anywhere">{addr.street}, {addr.city}, {addr.state} {addr.pincode}</p>
                        <p className="text-gray-500">{addr.phone}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {!showNewForm && savedAddresses.length > 0 ? (
                <button onClick={() => { addressSelectionTouched.current = true; setShowNewForm(true); }} className="flex items-center gap-2 text-sm text-primary-600 font-medium hover:underline">
                  <Plus size={16} /> Add New Address
                </button>
              ) : (
                <div>
                  {savedAddresses.length > 0 && (
                    <button onClick={() => { addressSelectionTouched.current = true; setShowNewForm(false); }} className="text-xs text-gray-500 hover:underline mb-3">
                      Use saved address instead
                    </button>
                  )}
                  <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                    {!user && <div className="sm:col-span-2">
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Email for order updates (optional)</label>
                      <input type="email" value={guestEmail} onChange={e => setGuestEmail(e.target.value)} className="input py-2.5 text-sm" placeholder="you@example.com" autoComplete="email" />
                    </div>}
                    <div className="sm:col-span-2">
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Full Name *</label>
                      <input type="text" value={newAddress.fullName}
                        onChange={e => { addressSelectionTouched.current = true; setNewAddress(a => ({ ...a, fullName: e.target.value })); }}
                        className="input py-2.5 text-sm" placeholder="Full Name" />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Phone Number *</label>
                      <input type="tel" inputMode="numeric" value={newAddress.phone}
                        onChange={e => { addressSelectionTouched.current = true; setNewAddress(a => ({ ...a, phone: e.target.value })); }}
                        className="input py-2.5 text-sm" placeholder="10-digit mobile" />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block flex items-center gap-2">
                        Pincode *
                        {pincodeLookup.loading && <Loader size="sm" inline className="text-gray-400" />}
                      </label>
                      <input type="text" inputMode="numeric" maxLength={6} value={newAddress.pincode}
                        onChange={e => { addressSelectionTouched.current = true; setNewAddress(a => ({ ...a, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })); }}
                        className="input py-2.5 text-sm" placeholder="6-digit pincode" />
                      {pincodeLookup.error && <p className="text-xs text-red-500 mt-1">{pincodeLookup.error}</p>}
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Street Address *</label>
                      <input type="text" value={newAddress.street}
                        list="area-suggestions"
                        onChange={e => { addressSelectionTouched.current = true; setNewAddress(a => ({ ...a, street: e.target.value })); }}
                        className="input py-2.5 text-sm" placeholder="House/flat, street, locality" />
                      {pincodeLookup.areas.length > 0 && (
                        <datalist id="area-suggestions">
                          {pincodeLookup.areas.map(a => <option key={a} value={a} />)}
                        </datalist>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">City *</label>
                      <input type="text" value={newAddress.city}
                        list="city-suggestions"
                        onChange={e => { addressSelectionTouched.current = true; setNewAddress(a => ({ ...a, city: e.target.value })); }}
                        className="input py-2.5 text-sm" placeholder="City" />
                      {pincodeLookup.cities.length > 0 && (
                        <datalist id="city-suggestions">
                          {pincodeLookup.cities.map(c => <option key={c} value={c} />)}
                        </datalist>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">State *</label>
                      <div className="relative">
                        <select value={newAddress.state}
                          onChange={e => { addressSelectionTouched.current = true; setNewAddress(a => ({ ...a, state: e.target.value })); }}
                          className="input py-2.5 text-sm appearance-none pr-8 w-full">
                          <option value="">Select state</option>
                          {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="card p-4" data-testid="checkout-shipping-quote">
              <div className="flex items-start gap-3">
                <Truck size={20} className="mt-0.5 flex-shrink-0 text-primary-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900">Delivery estimate</p>
                  {shippingQuoteLoading && <p className="mt-1 text-xs text-gray-500">Checking serviceability and delivery options...</p>}
                  {!shippingQuoteLoading && shippingQuote?.serviceable === false && shippingQuote?.pincode === quotePincode && <p className="mt-1 text-xs font-semibold text-red-600">{shippingQuote.error || 'This pincode is not serviceable.'}</p>}
                  {!shippingQuoteLoading && quoteMatchesAddress && shippingQuote?.serviceable !== false && <p className="mt-1 text-xs text-gray-600">{shippingQuote.shippingCost > 0 ? `${formatPrice(shippingQuote.shippingCost, settings)} shipping` : 'Free shipping'} · {shippingQuote.estimatedMinDays}-{shippingQuote.estimatedMaxDays} business days{shippingQuote.source === 'configured' ? ` · ${shippingQuote.rate?.name || 'Store rate'}` : ''}</p>}
                  {!shippingQuoteLoading && quotePincode.length !== 6 && <p className="mt-1 text-xs text-gray-500">Enter a valid pincode to see the applicable shipping rule.</p>}
                </div>
              </div>
            </div>

            {shippingRulesReady && !walletLoading && walletBalance > 0 && (
              <div className="card p-4 sm:p-6" data-testid="checkout-wallet-panel">
                <h2 className="font-bold text-base sm:text-lg text-gray-900 mb-3 flex items-center gap-2">
                  <Wallet size={20} className="text-primary-600" />Wallet / Store Credit
                </h2>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useWallet}
                    onChange={event => {
                      const checked = event.target.checked;
                      storedTenderInteraction.current = true;
                      setUseWallet(checked);
                      if (!checked) {
                        setWalletAmountInput('0');
                        if (paymentMethod === 'wallet') setPaymentMethod(gateways.find(gateway => gateway.id !== 'cod')?.id || gateways[0]?.id || 'cod');
                      }
                    }}
                    className="mt-1 text-primary-600"
                    data-testid="checkout-wallet-toggle"
                  />
                  <span className="min-w-0 text-sm text-gray-700">
                    Use available wallet balance <strong>{formatPrice(walletBalance, settings)}</strong>
                    <span className="block text-xs text-gray-500 mt-1">Wallet debits are confirmed server-side with this order.</span>
                  </span>
                </label>
                {useWallet && (
                  <div className="mt-4">
                    <label className="text-xs font-medium text-gray-600 mb-1 block" htmlFor="checkout-wallet-amount">Amount to apply</label>
                    <input
                      id="checkout-wallet-amount"
                      data-testid="checkout-wallet-amount"
                      type="number"
                      min="0"
                      max={Math.min(walletBalance, total)}
                      step="0.01"
                      value={walletAmountInput}
                      onChange={event => {
                        const value = event.target.value;
                        setWalletAmountInput(value);
                        if (paymentMethod === 'wallet' && Number(value) < total) setPaymentMethod(gateways.find(gateway => gateway.id !== 'cod')?.id || gateways[0]?.id || 'cod');
                      }}
                      className="input py-2.5 text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-2" data-testid="checkout-wallet-applied">
                      Applied now: {formatPrice(appliedWalletAmount, settings)}{appliedWalletAmount > 0 && appliedWalletAmount < total ? ` · Pay the remaining ${formatPrice(total - appliedWalletAmount, settings)} below` : ''}
                    </p>
                  </div>
                )}
              </div>
            )}

            {shippingRulesReady && !loyaltyLoading && loyaltyProgram?.enabled && (
              <div className="card p-4 sm:p-6" data-testid="checkout-loyalty-panel">
                <h2 className="font-bold text-base sm:text-lg text-gray-900 mb-3 flex items-center gap-2">
                  <Award size={20} className="text-amber-500" /> Loyalty & Rewards
                </h2>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useLoyalty}
                    disabled={loyaltyMaxPoints < loyaltyMinimum || loyaltyMaxPoints <= 0}
                    onChange={event => {
                      storedTenderInteraction.current = true;
                      setUseLoyalty(event.target.checked);
                    }}
                    className="mt-1 text-primary-600"
                    data-testid="checkout-loyalty-toggle"
                  />
                  <span className="min-w-0 text-sm text-gray-700">
                    Redeem points <strong>{loyaltyBalance.toLocaleString('en-IN')}</strong>
                    <span className="block text-xs text-gray-500 mt-1">Up to {Number(loyaltyProgram.maxRedeemPercent || 0)}% of this order · {loyaltyProgram.redeemPointsPerCurrency} points = ₹1</span>
                  </span>
                </label>
                {useLoyalty && (
                  <div className="mt-4">
                    <label className="text-xs font-medium text-gray-600 mb-1 block" htmlFor="checkout-loyalty-points">Points to redeem</label>
                    <input
                      id="checkout-loyalty-points"
                      data-testid="checkout-loyalty-points"
                      type="number"
                      min="0"
                      max={loyaltyMaxPoints}
                      step="1"
                      value={loyaltyPointsInput}
                      onChange={event => setLoyaltyPointsInput(event.target.value)}
                      className="input py-2.5 text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-2" data-testid="checkout-loyalty-applied">
                      Applied now: {appliedLoyaltyPoints.toLocaleString('en-IN')} points ({formatPrice(appliedLoyaltyAmount, settings)})
                      {appliedLoyaltyPoints > 0 && appliedLoyaltyAmount + appliedWalletAmount < total ? ` · Remaining ${formatPrice(total - appliedLoyaltyAmount - appliedWalletAmount, settings)}` : ''}
                    </p>
                  </div>
                )}
                {loyaltyMaxPoints < loyaltyMinimum && <p className="mt-3 text-xs text-amber-700">At least {loyaltyMinimum} points are required and this order's redemption cap is lower.</p>}
              </div>
            )}

            {user && shippingRulesReady && <div className="card p-4 sm:p-6" data-testid="checkout-gift-card-panel">
              <h2 className="font-bold text-base sm:text-lg text-gray-900 mb-3 flex items-center gap-2">
                <Gift size={20} className="text-fuchsia-600" /> Gift Card
              </h2>
              <p className="text-xs text-gray-500 mb-3">Apply a gift card code. The server checks its live balance, expiry, and tenant ownership.</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={giftCardCodeInput}
                  onChange={event => setGiftCardCodeInput(event.target.value.toUpperCase())}
                  className="input flex-1 py-2.5 text-sm font-mono"
                  placeholder="TATOZ-GIFT-XXXX-XXXX-XXXX"
                  data-testid="checkout-gift-card-code"
                />
                <button type="button" onClick={handleApplyGiftCard} disabled={giftCardLoading} className="btn-secondary w-full py-2.5 px-4 text-sm whitespace-nowrap sm:w-auto" data-testid="checkout-gift-card-apply">
                  {giftCardLoading ? <Loader size="sm" inline /> : 'Apply'}
                </button>
              </div>
              {giftCardQuote && (
                <div className="mt-3 rounded-xl border border-fuchsia-200 bg-fuchsia-50 p-3" data-testid="checkout-gift-card-quote">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-fuchsia-900">Card ending {giftCardQuote.codeLast4}</p>
                    <button type="button" className="text-xs font-semibold text-red-600 hover:underline" onClick={() => { setUseGiftCard(false); setGiftCardQuote(null); setGiftCardAmountInput(''); }}>Remove</button>
                  </div>
                  <label className="block mt-3 text-xs font-semibold text-fuchsia-900" htmlFor="checkout-gift-card-amount">Amount to apply</label>
                  <input
                    id="checkout-gift-card-amount"
                    data-testid="checkout-gift-card-amount"
                    type="number"
                    min="0.01"
                    max={Math.min(giftCardBalance, total)}
                    step="0.01"
                    value={giftCardAmountInput}
                    onChange={event => setGiftCardAmountInput(event.target.value)}
                    className="input mt-1 py-2.5 text-sm"
                  />
                  <p className="mt-2 text-xs text-fuchsia-800" data-testid="checkout-gift-card-applied">
                    Applied now: {formatPrice(appliedGiftCardAmount, settings)} · Remaining card balance: {formatPrice(Math.max(0, giftCardBalance - appliedGiftCardAmount), settings)}
                  </p>
                </div>
              )}
            </div>}

            <div className="card p-4 sm:p-6">
              <h2 className="font-bold text-base sm:text-lg text-gray-900 mb-4 flex items-center gap-2">
                <CreditCard size={20} className="text-primary-600" />Payment Method
              </h2>
              {loadingGateways ? (
                <div className="flex items-center gap-3 py-4 text-gray-400">
                  <Loader size="sm" inline />
                  <span className="text-sm">Loading payment options...</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {paymentMethods.length === 0 && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">No payment methods are currently enabled. Please contact the store administrator.</p>}
                  {paymentMethods.map(method => (
                    <label key={method.id} className={`flex items-start gap-3 p-3 border-2 rounded-xl cursor-pointer transition-all ${paymentMethod === method.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <input type="radio" name="payment" value={method.id} checked={paymentMethod === method.id}
                        onChange={() => {
                          if (method.id !== 'wallet' && useWallet && walletCoversTotal) {
                            setUseWallet(false);
                            setWalletAmountInput('0');
                          }
                          setPaymentMethod(method.id);
                        }} className="text-primary-600" />
                      <method.icon size={20} className={paymentMethod === method.id ? 'text-primary-600' : 'text-gray-400'} />
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-gray-800">{method.label}</p>
                        <p className="text-xs text-gray-500">{method.desc}</p>
                      </div>
                    </label>
                  ))}
                  {['manual', 'bank_transfer', 'upi'].includes(paymentMethod) && gateways.find(gateway => gateway.id === paymentMethod)?.instructions && (
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs leading-5 whitespace-pre-wrap text-indigo-800">
                      {gateways.find(gateway => gateway.id === paymentMethod).instructions}
                    </div>
                  )}
                  {paymentMethod === 'stripe' && (
                    <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <p className="mb-2 text-xs font-semibold text-gray-600">Card details</p>
                      {!stripeGateway?.publishable_key && <p className="text-xs text-amber-700">Stripe publishable key is not configured by the administrator.</p>}
                      <div ref={stripeCardRef} className="rounded-lg border border-gray-200 bg-white p-3" />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="min-w-0 h-fit space-y-4 lg:sticky lg:top-24">
            <div className="card p-4 sm:p-5">
              <h3 className="font-bold text-gray-900 mb-4">Order Summary</h3>

              <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
                {items.map(item => {
                  const bundle = isBundleItem(item);
                  const title = bundle ? item.bundle?.title || item.bundle?.name || 'Bundle' : item.product?.title || 'Product';
                  const image = bundle ? item.bundle?.image || item.bundle?.thumbnail || item.components?.[0]?.image : item.product?.thumbnail;
                  return <div key={item.key} className="flex min-w-0 items-start gap-3 rounded-lg bg-gray-50 p-2" data-testid={`checkout-summary-item-${item.key}`}>
                    <img src={image || 'https://via.placeholder.com/48'} alt={title} className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1"><p className="line-clamp-1 text-xs font-medium text-gray-800">{title}</p><p className="text-xs text-gray-500">Qty: {item.quantity}{bundle ? ' bundle' : ''}</p>{bundle && <p className="mt-0.5 line-clamp-1 text-[10px] text-indigo-600">{(item.components || []).map(component => component.title).join(' · ')}</p>}</div>
                    <p className="shrink-0 text-xs font-semibold">{formatPrice(Number(item.price || 0) * Number(item.quantity || 0), settings)}</p>
                  </div>;
                })}
              </div>

              <div className="mb-4">
                <p className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1"><Tag size={12} />Coupon</p>
                {coupon ? (
                  <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl p-2.5">
                    <div>
                      <p className="text-sm font-semibold text-green-700">{coupon.code}</p>
                      <p className="text-xs text-green-600">Saved {formatPrice(discount, settings)}</p>
                    </div>
                    <button onClick={() => dispatch(removeCoupon())} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
                  </div>
                ) : (
                  <>
                    {/* Available coupons */}
                    {availableCoupons.length > 0 && (
                      <div className="space-y-1.5 mb-2">
                        {availableCoupons.map(ac => (
                          <button key={ac._id} onClick={() => { setCouponCode(ac.code); setTimeout(() => { setCouponCode(ac.code); handleApplyCouponByCode(ac.code); }, 0); }}
                            className="w-full flex items-center gap-2 p-2 border border-dashed border-indigo-200 bg-indigo-50/50 rounded-lg hover:bg-indigo-50 transition-colors text-left">
                            <div className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-mono text-xs font-bold flex-shrink-0">{ac.code}</div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-700 truncate">
                                {ac.type === 'percentage' ? `${ac.value}% off` : ac.type === 'fixed' ? `₹${ac.value} off` : ac.type === 'free_shipping' ? 'Free shipping' : `${ac.value}% off`}
                                {ac.minOrderAmount > 0 && <span className="text-gray-400"> on ₹{ac.minOrderAmount}+</span>}
                              </p>
                              {ac.description && <p className="text-xs text-gray-400 truncate">{ac.description}</p>}
                            </div>
                            <span className="text-xs text-indigo-600 font-semibold flex-shrink-0">Apply</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Manual code input */}
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input type="text" value={couponCode} onChange={e => setCouponCode(e.target.value.toUpperCase())}
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleApplyCoupon())}
                        className="input flex-1 py-2 text-sm" placeholder="Enter code" />
                      <button onClick={handleApplyCoupon} disabled={couponLoading} className="btn-secondary w-full py-2 px-3 text-sm whitespace-nowrap sm:w-auto">
                        {couponLoading ? <Loader size="sm" inline /> : 'Apply'}
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-2 text-sm mb-4">
                <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatPrice(subtotal, settings)}</span></div>
                {discount > 0 && <div className="flex justify-between text-green-600"><span>Discount</span><span>-{formatPrice(discount, settings)}</span></div>}
                <div className="flex justify-between text-gray-600"><span>Shipping</span><span className={shipping === 0 ? 'text-green-600 font-medium' : ''}>{shipping === 0 ? 'FREE' : formatPrice(shipping, settings)}</span></div>
                <div className="flex justify-between text-gray-600"><span>{taxProfile?.pricingMode === 'inclusive' ? 'GST included' : `Tax (${(taxProfile?.defaultRate ?? settings.taxRate ?? 18)}%)`}</span><span>{formatPrice(tax, settings)}</span></div>
                {appliedWalletAmount > 0 && <div className="flex justify-between text-green-600"><span>Wallet applied</span><span>-{formatPrice(appliedWalletAmount, settings)}</span></div>}
                {appliedGiftCardAmount > 0 && <div className="flex justify-between text-fuchsia-600"><span>Gift card applied</span><span>-{formatPrice(appliedGiftCardAmount, settings)}</span></div>}
                <div className="border-t pt-2 flex justify-between font-bold text-primary-600 text-base"><span>Total</span><span>{formatPrice(total, settings)}</span></div>
                {remainingExternalAmount > 0.01 && <div className="flex justify-between text-gray-700 font-semibold"><span>Pay now</span><span>{formatPrice(remainingExternalAmount, settings)}</span></div>}
              </div>
              {referralCode && <p className="text-xs text-primary-600 bg-primary-50 rounded-lg p-2 mb-4">Referral: {referralCode}</p>}

              <button onClick={handlePlaceOrder} disabled={placing}
                className="btn-primary hidden w-full py-3 items-center justify-center gap-2 text-base font-bold lg:flex">
                {placing ? <Loader size="sm" inline /> : (
                  <>
                    <Lock size={16} />
                    Place Order &bull; {formatPrice(total, settings)}
                  </>
                )}
              </button>
              <p className="text-xs text-gray-400 text-center mt-2 flex items-center justify-center gap-1">
                <Lock size={10} /> Secure & encrypted checkout
              </p>
            </div>
          </div>
        </div>
        {/* Mobile CTA stays available while the shopper moves through the form. */}
        <div className="checkout-mobile-bar lg:hidden">
          <button onClick={handlePlaceOrder} disabled={placing}
            className="btn-primary w-full py-3 flex items-center justify-center gap-2 text-base font-bold">
            {placing ? <Loader size="sm" inline /> : (
              <>
                <Lock size={16} />
                Place Order &bull; {formatPrice(total, settings)}
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
};

export default CheckoutPage;
