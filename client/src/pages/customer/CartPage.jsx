import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { ArrowRight, Boxes, Minus, Plus, ShoppingBag, Tag, Trash2, Truck } from 'lucide-react';
import { removeFromCart, updateQuantity, clearCart, applyCoupon, removeCoupon, selectCartItems, selectCartTotal, selectCartCount } from '../../store/slices/cartSlice';
import { couponAPI } from '../../services/api';
import { useSite } from '../../context/SiteContext';
import { formatPrice } from '../../utils/formatPrice';
import toast from 'react-hot-toast';
import SEO from '../../components/common/SEO';

const isBundle = item => item?.itemType === 'bundle' || Boolean(item?.bundle);
const imageFor = item => isBundle(item)
  ? item.bundle?.image || item.bundle?.thumbnail || item.components?.[0]?.image || ''
  : item.product?.thumbnail || item.product?.image || '';
const titleFor = item => isBundle(item) ? item.bundle?.title || item.bundle?.name || 'Bundle' : item.product?.title || 'Product';
const compareFor = item => Number(isBundle(item) ? item.bundle?.comparePrice || item.product?.comparePrice || 0 : item.product?.comparePrice || 0);
const unitPriceFor = item => Number(item.price ?? item.unitPrice ?? item.product?.price ?? 0);

const VariantPills = ({ variant }) => {
  const entries = Object.entries(variant || {});
  if (!entries.length) return null;
  return <div className="mt-1 flex flex-wrap gap-1.5">{entries.map(([key, value]) => <span key={key} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"><strong className="text-slate-500">{key}:</strong>{value}</span>)}</div>;
};

const BundleContents = ({ item, compact = false }) => {
  if (!isBundle(item)) return null;
  const components = item.components || [];
  const rewards = item.freeRewards || [];
  const visible = compact ? 2 : 8;
  return <div className={`mt-2 ${compact ? 'space-y-1' : 'space-y-1.5'}`}>
    {components.slice(0, visible).map((component, index) => <div key={`${component.product || component.component}-${index}`} className="flex min-w-0 items-center gap-2 text-xs text-slate-600"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" /><span className="min-w-0 flex-1 truncate">{component.title || 'Product'} <span className="text-slate-400">× {component.quantity || 1}</span></span>{component.variant && Object.keys(component.variant).length > 0 && <span className="hidden shrink-0 text-[10px] text-slate-400 sm:inline">{Object.values(component.variant).join(' · ')}</span>}</div>)}
    {components.length > visible && <p className="pl-3.5 text-[11px] font-semibold text-indigo-600">+{components.length - visible} more items</p>}
    {rewards.map((reward, index) => <div key={`reward-${reward.product || index}`} className="flex min-w-0 items-center gap-2 text-xs font-semibold text-emerald-700"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" /><span className="truncate">Free: {reward.title || 'Reward'} × {reward.quantity || 1}</span></div>)}
  </div>;
};

const CartPage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { settings } = useSite();
  const items = useSelector(selectCartItems);
  const total = useSelector(selectCartTotal);
  const count = useSelector(selectCartCount);
  const { coupon, discount, activeMutations, hasUnavailableItems, loading, hydrated } = useSelector(state => state.cart);
  const [couponCode, setCouponCode] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);

  const threshold = Number(settings.freeShippingThreshold ?? 999);
  const shippingCost = Number(settings.standardShippingCost ?? 49);
  const taxRate = Number(settings.taxRate ?? 18) / 100;
  const discountedSubtotal = Math.max(0, total - Number(discount || 0));
  const shipping = coupon?.freeShipping || discountedSubtotal >= threshold ? 0 : shippingCost;
  const tax = discountedSubtotal * taxRate;
  const finalTotal = discountedSubtotal + shipping + tax;
  const originalTotal = items.reduce((sum, item) => sum + Math.max(compareFor(item), unitPriceFor(item)) * Number(item.quantity || 0), 0);
  const productSavings = Math.max(0, originalTotal - total);

  const handleCoupon = async () => {
    if (!couponCode.trim() || couponLoading) return;
    setCouponLoading(true);
    try {
      const response = await couponAPI.validate(couponCode, total, items, { channel: 'website' });
      dispatch(applyCoupon({ coupon: response.data.coupon, discount: response.data.coupon.discount }));
      toast.success(response.data.coupon.freeShipping ? 'Coupon applied. Free shipping unlocked.' : `${response.data.coupon.code} applied! Saved ${formatPrice(response.data.coupon.discount, settings)}`);
      setCouponCode('');
    } catch (error) { toast.error(error.message || 'Could not apply coupon'); }
    finally { setCouponLoading(false); }
  };

  if (!hydrated || loading) return <div className="page-container py-16 text-center text-sm text-slate-500">Loading your secure cart…</div>;
  if (!items.length) return <><SEO title="Shopping Cart" noindex /><div className="page-container py-16 text-center"><ShoppingBag size={64} className="mx-auto mb-4 text-slate-200" /><h1 className="text-2xl font-black text-slate-800">Your cart is empty</h1><p className="mb-8 mt-2 text-slate-500">Pick a product or build a combo to get started.</p><Link to="/" className="btn-primary">Start Shopping</Link></div></>;

  return <>
    <SEO title="Shopping Cart" noindex />
    <div className="page-container min-w-0 py-6 sm:py-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-7"><div><p className="text-xs font-black uppercase tracking-[0.22em] text-indigo-600">Ready when you are</p><h1 className="mt-1 text-2xl font-black text-slate-900 sm:text-3xl">Your cart <span className="text-slate-400">({count})</span></h1></div><Link to="/bundles" className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-700"><Boxes size={16} /> Explore combos</Link></div>
      <div className="grid min-w-0 gap-5 lg:grid-cols-3 lg:gap-8">
        <section className="min-w-0 space-y-3 lg:col-span-2" data-testid="cart-items">
          {items.map(item => {
            const bundle = isBundle(item);
            const unitPrice = unitPriceFor(item);
            const comparePrice = compareFor(item);
            const savings = Math.max(0, comparePrice - unitPrice);
            const productHref = bundle ? `/bundle/${item.bundle?.slug || ''}` : `/product/${item.product?.slug || ''}`;
            return <article key={item.key} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4" data-testid={`cart-item-${item.key}`}>
              <div className="flex min-w-0 gap-3 sm:gap-4">
                <Link to={productHref} className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:h-24 sm:w-24"><img src={imageFor(item) || 'https://via.placeholder.com/120'} alt={titleFor(item)} className="h-full w-full object-cover transition-transform hover:scale-105" /></Link>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="mb-1 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-indigo-700">{bundle ? <><Boxes size={11} /> {item.bundle?.label || 'Combo'}</> : 'Product'}</p><Link to={productHref}><h2 className="line-clamp-2 break-anywhere font-bold text-slate-900 hover:text-indigo-600">{titleFor(item)}</h2></Link></div><p className="shrink-0 font-black text-slate-900">{formatPrice(unitPrice * Number(item.quantity || 0), settings)}</p></div>
                  {!bundle && <VariantPills variant={item.variant} />}
                  <BundleContents item={item} />
                  {item.availability !== 'available' && <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-2 text-xs font-semibold text-red-700">This item needs attention: {String(item.availability || 'unavailable').replaceAll('_', ' ')}</p>}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-2"><span className="font-bold text-indigo-700">{formatPrice(unitPrice, settings)} <span className="text-xs font-medium text-slate-400">/ {bundle ? 'bundle' : 'unit'}</span></span>{savings > 0 && <><span className="text-xs text-slate-400 line-through">{formatPrice(comparePrice, settings)}</span><span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-bold text-emerald-700">Save {formatPrice(savings, settings)}</span></>}</div><div className="flex items-center gap-2"><button disabled={activeMutations > 0 || Number(item.quantity) <= 1} onClick={() => dispatch(updateQuantity({ key: item.key, quantity: Number(item.quantity) - 1 }))} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40" aria-label="Decrease quantity"><Minus size={14} /></button><span className="w-7 text-center text-sm font-bold">{item.quantity}</span><button disabled={activeMutations > 0 || Number(item.quantity) >= Number(item.maxQuantity || 100)} onClick={() => dispatch(updateQuantity({ key: item.key, quantity: Number(item.quantity) + 1 }))} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40" aria-label="Increase quantity"><Plus size={14} /></button><button disabled={activeMutations > 0} onClick={() => dispatch(removeFromCart(item.key))} className="ml-1 rounded-lg p-2 text-rose-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove item"><Trash2 size={16} /></button></div></div>
                </div>
              </div>
            </article>;
          })}
          <div className="flex flex-col gap-2 pt-2 sm:flex-row"><button disabled={activeMutations > 0} onClick={() => { if (window.confirm('Clear your entire cart?')) dispatch(clearCart()); }} className="flex w-full items-center justify-center gap-1 rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-500 hover:bg-rose-50 disabled:opacity-50 sm:w-auto"><Trash2 size={14} /> Clear cart</button><Link to="/search" className="flex w-full items-center justify-center gap-1 rounded-xl border border-indigo-200 px-4 py-2.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 sm:w-auto"><ShoppingBag size={14} /> Continue shopping</Link></div>
        </section>
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:h-fit">
          <div className="rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-4 shadow-sm sm:p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-600">Cart summary</p><div className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-3 text-slate-600"><span>Items value</span><span>{formatPrice(originalTotal, settings)}</span></div>{productSavings > 0 && <div className="flex justify-between gap-3 font-semibold text-emerald-600"><span>Bundle & product savings</span><span>-{formatPrice(productSavings, settings)}</span></div>}{discount > 0 && <div className="flex justify-between gap-3 font-semibold text-emerald-600"><span>Coupon discount</span><span>-{formatPrice(discount, settings)}</span></div>}<div className="flex justify-between gap-3 text-slate-600"><span className="inline-flex items-center gap-1"><Truck size={14} /> Shipping</span><span className={shipping === 0 ? 'font-bold text-emerald-600' : ''}>{shipping === 0 ? 'FREE' : formatPrice(shipping, settings)}</span></div><div className="flex justify-between gap-3 text-slate-600"><span>GST ({settings.taxRate ?? 18}%)</span><span>{formatPrice(tax, settings)}</span></div><div className="flex justify-between gap-3 border-t border-indigo-100 pt-3 text-base font-black text-slate-900"><span>Total</span><span className="text-indigo-700">{formatPrice(finalTotal, settings)}</span></div></div>{shipping > 0 && <p className="mt-4 rounded-xl bg-white/80 p-2.5 text-center text-xs text-slate-500">Add {formatPrice(Math.max(0, threshold - discountedSubtotal), settings)} more for free shipping.</p>}</div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="mb-3 flex items-center gap-2 font-bold text-slate-900"><Tag size={16} className="text-indigo-600" /> Have a coupon?</h2>{coupon ? <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3"><div><p className="font-bold text-emerald-700">{coupon.code}</p><p className="text-xs text-emerald-600">Coupon applied</p></div><button onClick={() => dispatch(removeCoupon())} className="p-1 text-rose-500" aria-label="Remove coupon"><Trash2 size={15} /></button></div> : <div className="flex flex-col gap-2 sm:flex-row"><input value={couponCode} onChange={event => setCouponCode(event.target.value.toUpperCase())} onKeyDown={event => event.key === 'Enter' && handleCoupon()} className="input flex-1 py-2.5 text-sm" placeholder="Enter coupon code" /><button onClick={handleCoupon} disabled={couponLoading} className="btn-secondary w-full py-2.5 text-sm sm:w-auto">{couponLoading ? 'Applying…' : 'Apply'}</button></div>}</div>
          {hasUnavailableItems && <p className="rounded-xl bg-red-50 p-3 text-center text-xs font-semibold text-red-700">Resolve unavailable bundle components before checkout.</p>}
          <button disabled={hasUnavailableItems || activeMutations > 0} onClick={() => navigate('/checkout')} className="btn-primary flex w-full items-center justify-center gap-2 py-3.5 text-base font-black disabled:cursor-not-allowed disabled:opacity-50">Secure checkout <ArrowRight size={17} /></button>
        </aside>
      </div>
    </div>
  </>;
};

export default CartPage;
