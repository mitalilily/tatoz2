import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { BadgeCheck, Check, Minus, Plus, ShoppingBag, Sparkles, Tag, Trash2, Truck, X } from 'lucide-react';
import { setCartOpen } from '../../store/slices/uiSlice';
import { applyCoupon, removeCoupon, removeFromCart, requestAddToCart, updateQuantity, selectCartItems, selectCartTotal, selectCartCount } from '../../store/slices/cartSlice';
import { couponAPI, productAPI } from '../../services/api';
import { useSite } from '../../context/SiteContext';
import { formatPrice } from '../../utils/formatPrice';
import toast from 'react-hot-toast';

const isBundle = item => item?.itemType === 'bundle' || Boolean(item?.bundle);
const titleFor = item => isBundle(item) ? item.bundle?.title || item.bundle?.name || 'Bundle' : item.product?.title || 'Product';
const imageFor = item => isBundle(item) ? item.bundle?.image || item.bundle?.thumbnail || item.components?.[0]?.image || '' : item.product?.thumbnail || item.product?.image || '';

const CartDrawer = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { settings } = useSite();
  const { cartOpen } = useSelector(state => state.ui);
  const items = useSelector(selectCartItems);
  const total = useSelector(selectCartTotal);
  const count = useSelector(selectCartCount);
  const { coupon, discount = 0, activeMutations, hasUnavailableItems } = useSelector(state => state.cart);
  const [couponCode, setCouponCode] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [availableCoupons, setAvailableCoupons] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const fetchedForOpen = useRef(0);
  const openCount = useRef(0);

  const threshold = Number(settings.freeShippingThreshold ?? 999);
  const shippingCost = Number(settings.standardShippingCost ?? 49);
  const discountedSubtotal = Math.max(0, total - Number(discount || 0));
  const freeShipUnlocked = Boolean(coupon?.freeShipping) || discountedSubtotal >= threshold;
  const shipping = freeShipUnlocked ? 0 : shippingCost;
  const tax = discountedSubtotal * (Number(settings.taxRate ?? 18) / 100);
  const finalTotal = discountedSubtotal + shipping + tax;
  const shipRemaining = Math.max(0, threshold - discountedSubtotal);
  const shipProgress = threshold > 0 ? Math.min(100, Math.round((discountedSubtotal / threshold) * 100)) : 100;

  // Fetch offers + suggestions each time the drawer opens.
  useEffect(() => {
    if (!cartOpen) return undefined;
    openCount.current += 1;
    const runId = openCount.current;
    fetchedForOpen.current = runId;
    let cancelled = false;
    couponAPI.getAvailable()
      .then(res => { if (!cancelled && fetchedForOpen.current === runId) setAvailableCoupons(res.data.coupons || []); })
      .catch(() => {});
    const cartIds = new Set(items.map(i => i.product?._id).filter(Boolean));
    productAPI.getAll({ limit: 8, sort: 'bestseller' })
      .then(res => {
        if (cancelled || fetchedForOpen.current !== runId) return;
        setSuggestions((res.data.products || []).filter(p => p && (p._id || p.slug) && !cartIds.has(p._id)).slice(0, 6));
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartOpen]);

  const handleCheckout = () => {
    if (hasUnavailableItems) { toast.error('Resolve unavailable bundle components before checkout'); return; }
    dispatch(setCartOpen(false));
    navigate('/checkout');
  };

  const applyCode = async (code) => {
    const value = String(code || '').trim();
    if (!value || couponLoading) return;
    setCouponLoading(true);
    try {
      const response = await couponAPI.validate(value, total, items, { channel: 'website' });
      dispatch(applyCoupon({ coupon: response.data.coupon, discount: response.data.coupon.discount }));
      toast.success(response.data.coupon.freeShipping ? 'Coupon applied. Free shipping unlocked.' : `${response.data.coupon.code} applied!`);
      setCouponCode('');
    } catch (error) { toast.error(error.message || 'Could not apply coupon'); }
    finally { setCouponLoading(false); }
  };

  const closeCart = () => dispatch(setCartOpen(false));

  return <>
    <div className={`fixed inset-0 z-50 bg-slate-950/50 transition-opacity ${cartOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`} onClick={closeCart} />
    <aside className={`fixed right-0 top-0 z-50 flex h-full w-[88%] max-w-sm flex-col bg-slate-50 shadow-2xl transition-transform duration-300 sm:max-w-md ${cartOpen ? 'translate-x-0' : 'translate-x-full'}`} aria-label="Shopping cart">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200/70 bg-white px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
            <ShoppingBag size={17} />
          </span>
          <h2 className="truncate text-base font-extrabold tracking-tight text-slate-900">Your cart</h2>
          {count > 0 && <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-bold text-white">{count} item{count === 1 ? '' : 's'}</span>}
        </div>
        <button onClick={closeCart} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="Close cart"><X size={19} /></button>
      </header>

      {/* Free shipping meter */}
      {items.length > 0 && (
        <div className="shrink-0 border-b border-slate-200/70 bg-white px-4 pb-3.5 pt-3">
          {freeShipUnlocked ? (
            <p className="flex items-center gap-1.5 text-[13px] font-bold text-emerald-700">
              <BadgeCheck size={15} /> You’ve unlocked FREE delivery
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-[13px] font-medium text-slate-600">
              <Truck size={15} className="text-slate-400" /> Add <span className="font-extrabold text-slate-900">{formatPrice(shipRemaining, settings)}</span> more for FREE delivery
            </p>
          )}
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${freeShipUnlocked ? 100 : shipProgress}%` }} />
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {!items.length ? (
          <div className="py-14 text-center">
            <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-sm">
              <ShoppingBag size={34} className="text-slate-300" />
            </span>
            <p className="mt-4 text-base font-extrabold text-slate-900">Your cart is empty</p>
            <p className="mt-1 text-sm text-slate-500">Beautiful things are waiting for you.</p>
            <Link to="/search" onClick={closeCart} className="btn-primary mt-5 inline-flex items-center gap-2 px-6 text-sm">
              Continue shopping
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map(item => {
              const bundle = isBundle(item);
              const unitPrice = Number(item.price ?? item.unitPrice ?? 0);
              const comparePrice = Number(bundle ? item.bundle?.comparePrice || 0 : item.product?.comparePrice || 0);
              return (
                <article key={item.key} className="flex min-w-0 gap-3 rounded-2xl border border-slate-200/70 bg-white p-3" data-testid={`cart-drawer-item-${item.key}`}>
                  <img src={imageFor(item) || 'https://via.placeholder.com/80'} alt={titleFor(item)} className="h-[72px] w-[72px] shrink-0 rounded-xl bg-slate-100 object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 break-anywhere text-[13px] font-bold leading-snug text-slate-800">{titleFor(item)}</p>
                      <button disabled={activeMutations > 0} onClick={() => dispatch(removeFromCart(item.key))} className="shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500" aria-label="Remove item"><Trash2 size={15} /></button>
                    </div>
                    {!bundle && item.variant && Object.keys(item.variant).length > 0 && <p className="mt-0.5 truncate text-[11px] text-slate-400">{Object.values(item.variant).join(' · ')}</p>}
                    {bundle && <p className="mt-0.5 truncate text-[11px] text-slate-400">{(item.components || []).length} items in combo</p>}
                    {item.availability !== 'available' && <p className="mt-0.5 text-[11px] font-semibold text-red-600">Needs attention</p>}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center rounded-full border border-slate-200 p-0.5">
                        <button disabled={activeMutations > 0 || Number(item.quantity) <= 1} onClick={() => dispatch(updateQuantity({ key: item.key, quantity: Number(item.quantity) - 1 }))} className="flex h-6 w-6 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-40" aria-label="Decrease quantity"><Minus size={12} /></button>
                        <span className="w-6 text-center text-xs font-extrabold">{item.quantity}</span>
                        <button disabled={activeMutations > 0 || Number(item.quantity) >= Number(item.maxQuantity || 100)} onClick={() => dispatch(updateQuantity({ key: item.key, quantity: Number(item.quantity) + 1 }))} className="flex h-6 w-6 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-40" aria-label="Increase quantity"><Plus size={12} /></button>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-extrabold text-slate-900">{formatPrice(unitPrice * Number(item.quantity || 0), settings)}</p>
                        {comparePrice > unitPrice && <p className="text-[10px] font-semibold text-emerald-600">Save {formatPrice((comparePrice - unitPrice) * Number(item.quantity || 0), settings)}</p>}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}

            {/* Coupon */}
            <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-3.5" aria-label="Apply coupon">
              {coupon ? (
                <div className="flex items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2.5">
                  <p className="flex min-w-0 items-center gap-2 text-[13px] font-bold text-emerald-800">
                    <Check size={15} className="shrink-0" />
                    <span className="truncate">{coupon.code} applied</span>
                  </p>
                  <button onClick={() => dispatch(removeCoupon())} className="shrink-0 text-xs font-bold text-emerald-700 underline">Remove</button>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <input
                      value={couponCode}
                      onChange={e => setCouponCode(e.target.value.toUpperCase())}
                      onKeyDown={e => e.key === 'Enter' && applyCode(couponCode)}
                      placeholder="Coupon code"
                      aria-label="Coupon code"
                      className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold uppercase tracking-wide placeholder:font-medium placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                    />
                    <button onClick={() => applyCode(couponCode)} disabled={!couponCode.trim() || couponLoading} className="h-10 shrink-0 rounded-xl bg-slate-900 px-4 text-[13px] font-bold text-white disabled:opacity-40">
                      {couponLoading ? 'Applying…' : 'Apply'}
                    </button>
                  </div>
                  {availableCoupons.length > 0 && (
                    <div className="mt-2.5 space-y-1.5">
                      <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-slate-400"><Tag size={11} /> Available offers</p>
                      {availableCoupons.slice(0, 3).map(c => (
                        <button key={c.code} onClick={() => applyCode(c.code)} disabled={couponLoading} className="flex w-full items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-left hover:bg-slate-100 disabled:opacity-50">
                          <span className="min-w-0">
                            <span className="block text-[13px] font-extrabold text-slate-900">{c.code}</span>
                            {(c.description || c.title) && <span className="block truncate text-[11px] text-slate-500">{c.description || c.title}</span>}
                          </span>
                          <span className="shrink-0 text-xs font-extrabold text-indigo-600">Apply</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <section aria-label="You may also like">
                <p className="mb-2 flex items-center gap-1.5 text-[13px] font-extrabold text-slate-900"><Sparkles size={14} className="text-amber-500" /> You may also like</p>
                <div className="flex gap-2.5 overflow-x-auto pb-1">
                  {suggestions.map(p => (
                    <div key={p._id || p.slug} className="w-32 shrink-0 rounded-2xl border border-slate-200/70 bg-white p-2">
                      <Link to={`/product/${p.slug}`} onClick={closeCart} className="block aspect-square overflow-hidden rounded-xl bg-slate-100">
                        <img src={p.thumbnail || p.images?.[0]?.url || 'https://via.placeholder.com/200'} alt={p.title} loading="lazy" className="h-full w-full object-cover" />
                      </Link>
                      <p className="mt-1.5 truncate text-xs font-bold text-slate-800">{p.title}</p>
                      <div className="mt-1 flex items-center justify-between gap-1">
                        <span className="text-[13px] font-extrabold text-slate-900">{formatPrice(p.price, settings)}</span>
                        <button
                          onClick={() => dispatch(requestAddToCart({ product: p, quantity: 1, source: 'cart-suggestions' }))}
                          aria-label={`Add ${p.title} to cart`}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white hover:bg-orange-600"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {items.length > 0 && (
        <footer className="shrink-0 space-y-2.5 border-t border-slate-200/70 bg-white px-4 py-4">
          <div className="flex justify-between text-[13px] text-slate-600"><span>Subtotal ({count} item{count === 1 ? '' : 's'})</span><span className="font-bold text-slate-900">{formatPrice(total, settings)}</span></div>
          {discount > 0 && <div className="flex justify-between text-[13px] text-emerald-600"><span>Coupon discount{coupon?.code ? ` (${coupon.code})` : ''}</span><span className="font-bold">-{formatPrice(discount, settings)}</span></div>}
          <div className="flex justify-between text-[13px] text-slate-500"><span className="inline-flex items-center gap-1"><Truck size={14} /> Shipping</span><span className={shipping === 0 ? 'font-bold text-emerald-600' : 'font-bold text-slate-900'}>{shipping === 0 ? 'FREE' : formatPrice(shipping, settings)}</span></div>
          <div className="flex justify-between border-t border-slate-100 pt-2.5 text-base font-extrabold text-slate-900"><span>Total</span><span>{formatPrice(finalTotal, settings)}</span></div>
          <button onClick={handleCheckout} disabled={hasUnavailableItems || activeMutations > 0} className="btn-primary w-full py-3 disabled:opacity-50">Proceed to checkout</button>
          <Link to="/cart" onClick={closeCart} className="block text-center text-[13px] font-semibold text-slate-500 hover:text-slate-900">View full cart</Link>
        </footer>
      )}
    </aside>
  </>;
};

export default CartDrawer;
