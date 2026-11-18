import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { ArrowRight, BadgeCheck, Boxes, Check, ChevronDown, Gift, Minus, Plus, ShieldCheck, Sparkles, Star, Tag, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import { bundleAPI, trackingAPI } from '../../services/api';
import { requestAddBundleToCart } from '../../store/slices/cartSlice';
import { useSite } from '../../context/SiteContext';
import { formatPrice } from '../../utils/formatPrice';
import Loader from '../../components/common/Loader';
import SEO from '../../components/common/SEO';

const SELECTABLE = ['custom_bundle', 'custom_box', 'mix_match'];
const typeLabels = { fixed_combo: 'Curated combo', fixed_variant: 'Choose your variants', multipack: 'Multipack', mix_match: 'Mix & match', custom_bundle: 'Build your bundle', custom_box: 'Build your box', quantity_bundle: 'Volume offer', buy_x_get_y_free: 'Special offer', frequently_bought_together: 'Frequently bought together', add_on: 'Add-on offer' };
const typeLabel = value => typeLabels[value] || 'Bundle deal';
const isSelectable = value => SELECTABLE.includes(value);
const productImage = product => product?.thumbnail || product?.images?.[0]?.url || '';
const productTitle = product => product?.title || 'Product';
const variantDefinitions = product => Array.isArray(product?.variants) ? product.variants.filter(item => item?.name && item.options?.length) : [];
const defaultSelection = component => ({ component: component._id, product: component.product?._id || component.product, quantity: Number(component.quantity || 1), variant: { ...(component.defaultVariant || {}) } });

const money = (value, settings) => formatPrice(Number(value || 0), settings);

const SelectionProgress = ({ selected, total, required }) => {
  const percentage = required > 0 ? Math.min(100, Math.round((selected / required) * 100)) : 100;
  return <div className="mt-4 rounded-2xl border border-indigo-100 bg-white/80 p-3"><div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-600"><span>{selected} of {required} items selected</span><span className="text-indigo-600">{percentage}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-indigo-100"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all" style={{ width: `${percentage}%` }} /></div></div>;
};

const BundleVisual = ({ bundle, large = false }) => {
  const images = (bundle?.components || []).map(component => productImage(component.product || component)).filter(Boolean).slice(0, 4);
  if (bundle?.image) return <div className={`overflow-hidden rounded-[2rem] bg-slate-100 ${large ? 'aspect-square' : 'aspect-[1.2]'}`}><img src={bundle.image} alt={bundle.name} className="h-full w-full object-cover" /></div>;
  return <div className={`grid overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-100 via-violet-100 to-fuchsia-100 ${large ? 'aspect-square' : 'aspect-[1.2]'} ${images.length > 1 ? 'grid-cols-2' : ''}`}>{(images.length ? images : ['']).map((image, index) => <div key={`${image}-${index}`} className="min-h-0 overflow-hidden border border-white/40">{image ? <img src={image} alt="" className="h-full w-full object-cover transition-transform duration-500 hover:scale-105" /> : <Sparkles className="m-auto h-12 w-12 text-indigo-400/70" />}</div>)}</div>;
};

const PriceBlock = ({ bundle, quote, settings, compact = false }) => {
  const current = Number(quote?.unitPrice ?? bundle?.price ?? 0);
  const compare = Number(quote?.comparePrice ?? bundle?.comparePrice ?? 0);
  const savings = Math.max(0, compare - current);
  return <div className={compact ? '' : 'rounded-2xl border border-indigo-100 bg-white/80 p-4'}><div className="flex flex-wrap items-end gap-2"><span className={`${compact ? 'text-xl' : 'text-3xl'} font-black tracking-tight text-slate-900`}>{money(current, settings)}</span>{compare > current && <span className="pb-1 text-sm text-slate-400 line-through">{money(compare, settings)}</span>}{savings > 0 && <span className="mb-1 rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-black text-emerald-700">SAVE {money(savings, settings)}</span>}</div>{savings > 0 && <p className="mt-1 text-xs font-semibold text-emerald-700">You save {money(savings, settings)} on this {bundle?.label?.toLowerCase() || 'bundle'}.</p>}</div>;
};

const BundleCard = ({ bundle, settings }) => {
  const compare = Number(bundle.comparePrice || 0);
  const price = Number(bundle.price || 0);
  const savings = Math.max(0, compare - price);
  return <article className="group overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-xl"><Link to={`/bundle/${bundle.slug}`}><BundleVisual bundle={bundle} /><div className="p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-indigo-700"><Boxes size={11} /> {bundle.label || 'Bundle'}</span><h2 className="mt-3 line-clamp-2 break-anywhere text-lg font-black text-slate-900 group-hover:text-indigo-700">{bundle.name}</h2></div>{savings > 0 && <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">-{Math.round((savings / Math.max(compare, 1)) * 100)}%</span>}</div><p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{bundle.shortDescription || bundle.description || `${bundle.componentCount || bundle.components?.length || 0} products curated together.`}</p><div className="mt-4 flex items-end justify-between gap-3"><div><p className="text-xl font-black text-indigo-700">{money(price, settings)}</p>{compare > price && <p className="text-xs text-slate-400 line-through">{money(compare, settings)} individual value</p>}</div><span className="inline-flex items-center gap-1 text-sm font-black text-indigo-600">View combo <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" /></span></div></div></Link></article>;
};

const BundleDetail = ({ bundle }) => {
  const dispatch = useDispatch();
  const { settings } = useSite();
  const [selections, setSelections] = useState({});
  const [bundleQuantity, setBundleQuantity] = useState(1);
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const selectable = isSelectable(bundle.offerType);
  const components = bundle.components || [];
  const rules = bundle.selectionRules || {};

  useEffect(() => {
    const initial = {};
    components.forEach(component => {
      if (!selectable || component.required) initial[component._id] = defaultSelection(component);
    });
    setSelections(initial);
  }, [bundle._id]);

  const selectedItems = useMemo(() => Object.values(selections), [selections]);
  const selectedCount = selectedItems.length;
  const selectedUnits = selectedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const requiredProducts = Number(rules.requiredQuantity || (selectable ? 1 : selectedUnits || components.reduce((sum, item) => sum + Number(item.quantity || 0), 0)));
  const variantReady = selectedItems.every(item => {
    const component = components.find(candidate => String(candidate._id) === String(item.component));
    return variantDefinitions(component?.product).every(definition => item.variant?.[definition.name]);
  });
  const groupErrors = (bundle.selectionGroups || []).filter(group => {
    const count = selectedItems.filter(item => {
      const component = components.find(candidate => String(candidate._id) === String(item.component));
      return component?.group === group.key || component?.group === group.name;
    }).length;
    return (group.required && count < Number(group.minimumSelection || 0)) || count > Number(group.maximumSelection ?? 100);
  });
  const ready = variantReady && !groupErrors.length && (selectable
    ? selectedCount >= Number(rules.minProducts || 1) && selectedCount <= Number(rules.maxProducts || components.length) && selectedUnits === requiredProducts
    : selectedItems.length === components.length);
  const selectionPayload = useMemo(() => selectedItems.map(item => ({ component: item.component, product: item.product, quantity: Number(item.quantity || 1), variant: item.variant || {} })), [selectedItems]);

  useEffect(() => {
    if (!ready || !bundle._id) { setQuote(null); return undefined; }
    let cancelled = false;
    setQuoting(true);
    const timer = setTimeout(() => {
      bundleAPI.publicQuote(bundle._id, { quantity: bundleQuantity, selections: selectionPayload }).then(response => {
        if (!cancelled) setQuote(response.data?.quote || null);
      }).catch(() => { if (!cancelled) setQuote(null); }).finally(() => { if (!cancelled) setQuoting(false); });
    }, 180);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [bundle._id, bundleQuantity, JSON.stringify(selectionPayload), ready]);

  useEffect(() => {
    trackingAPI.track({ eventType: 'page_view', target: bundle.slug, targetId: bundle._id, page: `/bundle/${bundle.slug}`, metadata: { module: 'bundles' } });
  }, [bundle._id, bundle.slug]);

  const toggle = component => setSelections(current => {
    if (component.required) return current;
    const next = { ...current };
    if (next[component._id]) delete next[component._id];
    else next[component._id] = defaultSelection(component);
    return next;
  });
  const changeVariant = (component, name, value) => setSelections(current => ({ ...current, [component._id]: { ...current[component._id], variant: { ...(current[component._id]?.variant || {}), [name]: value } } }));
  const changeQuantity = (component, value) => {
    const min = Number(component.minQuantity || component.quantity || 1);
    const max = Math.min(Number(component.maxQuantity || 100), Number(rules.maxQuantityPerProduct || 100));
    const next = Math.max(min, Math.min(max, Number(value) || min));
    setSelections(current => ({ ...current, [component._id]: { ...current[component._id], quantity: next } }));
  };
  const add = async () => {
    if (!ready) { toast.error(selectable ? `Select ${Math.max(0, requiredProducts - selectedUnits)} more item${requiredProducts - selectedUnits === 1 ? '' : 's'} to continue` : 'Complete every variant selection to continue'); return; }
    const result = await dispatch(requestAddBundleToCart({ bundle, quantity: bundleQuantity, selections: selectionPayload, source: 'bundle-page' }));
    if (result.added) toast.success(`${bundle.name} added to cart`);
  };

  return <>
    <SEO title={bundle.name} description={bundle.shortDescription || bundle.description} />
    <main className="min-w-0 bg-slate-50 pb-32 lg:pb-12" data-testid="bundle-detail-page">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8"><Link to="/bundles" className="text-sm font-bold text-slate-500 hover:text-indigo-600">← All bundles</Link><div className="mt-5 grid min-w-0 gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-10"><div className="min-w-0"><BundleVisual bundle={bundle} large /><div className="mt-4 grid grid-cols-3 gap-2"><div className="rounded-2xl border border-slate-200 bg-white p-3 text-center"><ShieldCheck className="mx-auto text-indigo-600" size={18} /><p className="mt-1 text-[10px] font-bold text-slate-600">Secure checkout</p></div><div className="rounded-2xl border border-slate-200 bg-white p-3 text-center"><Truck className="mx-auto text-indigo-600" size={18} /><p className="mt-1 text-[10px] font-bold text-slate-600">Fast delivery</p></div><div className="rounded-2xl border border-slate-200 bg-white p-3 text-center"><BadgeCheck className="mx-auto text-indigo-600" size={18} /><p className="mt-1 text-[10px] font-bold text-slate-600">Verified value</p></div></div></div>
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-indigo-700"><Sparkles size={13} /> {typeLabel(bundle.offerType)}</span>{(bundle.badges || []).map(badge => <span key={badge} className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">{badge}</span>)}</div><h1 className="mt-3 break-anywhere text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{bundle.name}</h1><p className="mt-3 max-w-2xl break-anywhere text-base leading-7 text-slate-600">{bundle.description || bundle.shortDescription || 'Everything you need, thoughtfully packed together at a better value.'}</p><div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-500"><span className="inline-flex items-center gap-1 font-bold text-amber-500"><Star size={15} fill="currentColor" /> 4.8</span><span>•</span><span>{components.length} curated items</span><span>•</span><span className="font-semibold text-emerald-700">Component stock checked live</span></div><div className="mt-6"><PriceBlock bundle={bundle} quote={quote} settings={settings} /></div>
          {selectable && <div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50 p-4"><div className="flex items-start gap-3"><div className="rounded-xl bg-violet-600 p-2 text-white"><Tag size={16} /></div><div className="min-w-0"><p className="font-black text-violet-950">Make it yours</p><p className="mt-1 text-sm text-violet-800">Choose {rules.minProducts || 1} to {rules.maxProducts || components.length} products and exactly {requiredProducts} unit{requiredProducts === 1 ? '' : 's'}.</p></div></div><SelectionProgress selected={selectedUnits} total={selectedCount} required={requiredProducts} /></div>}
          <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-600">What’s inside</p><h2 className="mt-1 text-xl font-black text-slate-900">Pick your perfect set</h2></div><span className="text-xs font-semibold text-slate-400">{selectedCount}/{components.length} selected</span></div><div className="mt-4 space-y-3">{components.map((component, index) => { const product = component.product || {}; const selected = Boolean(selections[component._id]); const definitions = variantDefinitions(product); return <div key={component._id || index} className={`rounded-2xl border p-3 transition-colors sm:p-4 ${selected ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200 bg-white'}`} data-testid={`bundle-component-${index}`}><div className="flex min-w-0 gap-3"><div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:h-20 sm:w-20"><img src={productImage(product) || 'https://via.placeholder.com/100'} alt={productTitle(product)} className="h-full w-full object-cover" /></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="line-clamp-2 break-anywhere font-bold text-slate-900">{productTitle(product)}</p><p className="mt-1 text-xs text-slate-500">{component.required ? 'Required item' : component.group || 'Optional pick'}{component.quantity > 1 ? ` · ${component.quantity} units` : ''}</p></div>{selectable && <button type="button" onClick={() => toggle(component)} disabled={component.required} className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${selected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 text-transparent'} ${component.required ? 'cursor-default' : ''}`} aria-label={`${selected ? 'Remove' : 'Select'} ${productTitle(product)}`}><Check size={15} strokeWidth={3} /></button>}</div>{selected && definitions.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2">{definitions.map(definition => <label key={definition.name} className="text-[11px] font-black uppercase tracking-wide text-slate-500">{definition.name}<span className="relative mt-1 block"><select value={selections[component._id]?.variant?.[definition.name] || ''} onChange={event => changeVariant(component, definition.name, event.target.value)} className="input appearance-none py-2 pr-8 text-sm font-semibold normal-case tracking-normal" data-testid={`bundle-variant-${index}-${definition.name}`}><option value="">Choose {definition.name}</option>{definition.options.map(option => <option key={option._id || option.value} value={option.value} disabled={Number(option.stock ?? product.stock ?? 0) <= 0}>{option.value}{Number(option.stock ?? product.stock ?? 0) <= 0 ? ' · Out of stock' : ''}</option>)}</select><ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" /></span></label>)}</div>}{selected && selectable && (Number(component.minQuantity || component.quantity || 1) !== Number(component.maxQuantity || component.quantity || 1)) && <div className="mt-3 flex items-center justify-between rounded-xl border border-indigo-100 bg-white p-2"><span className="text-xs font-bold text-slate-600">Units in this pick</span><div className="flex items-center gap-2"><button type="button" onClick={() => changeQuantity(component, Number(selections[component._id]?.quantity || 1) - 1)} className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200" aria-label="Decrease component quantity"><Minus size={13} /></button><span className="w-5 text-center text-sm font-black">{selections[component._id]?.quantity || 1}</span><button type="button" onClick={() => changeQuantity(component, Number(selections[component._id]?.quantity || 1) + 1)} className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200" aria-label="Increase component quantity"><Plus size={13} /></button></div></div>}</div></div></div>; })}</div></section>
          {bundle.offerType === 'buy_x_get_y_free' && bundle.freeReward?.product && <div className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><Gift className="mt-0.5 shrink-0 text-emerald-600" size={20} /><div><p className="font-black text-emerald-900">Free with this offer</p><p className="mt-1 text-sm text-emerald-800">{productTitle(bundle.freeReward.product)} × {bundle.freeReward.quantity || 1}. Reward stock is verified before checkout.</p></div></div>}
          <div className="mt-5 hidden items-center gap-3 lg:flex"><div className="flex items-center rounded-xl border border-slate-200 bg-white"><button type="button" onClick={() => setBundleQuantity(value => Math.max(1, value - 1))} className="p-3 text-slate-500 hover:text-indigo-600" aria-label="Decrease bundle quantity"><Minus size={15} /></button><span className="w-8 text-center text-sm font-black">{bundleQuantity}</span><button type="button" onClick={() => setBundleQuantity(value => Math.min(Number(bundle.availability?.maxQuantityPerOrder || 10), value + 1))} className="p-3 text-slate-500 hover:text-indigo-600" aria-label="Increase bundle quantity"><Plus size={15} /></button></div><button type="button" onClick={add} disabled={!ready || quoting} className="btn-primary flex flex-1 items-center justify-center gap-2 py-3.5 text-base font-black disabled:cursor-not-allowed disabled:opacity-50" data-testid="bundle-add-to-cart">{quoting ? 'Checking availability…' : ready ? 'Add bundle to cart' : selectable ? `Select ${Math.max(0, requiredProducts - selectedUnits)} more` : 'Complete selections'} <ArrowRight size={17} /></button></div>
        </div></div></div>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-10px_30px_rgba(15,23,42,0.12)] backdrop-blur lg:hidden" data-testid="bundle-mobile-cta"><div className="mx-auto flex max-w-6xl items-center gap-3"><div className="min-w-0 flex-1"><PriceBlock bundle={bundle} quote={quote} settings={settings} compact /><p className="mt-0.5 truncate text-[10px] text-slate-500">{quoting ? 'Checking live stock…' : ready ? 'All selections are ready' : selectable ? `Select ${Math.max(0, requiredProducts - selectedUnits)} more item(s)` : 'Choose every required variant'}</p></div><div className="flex items-center rounded-xl border border-slate-200 bg-white"><button type="button" onClick={() => setBundleQuantity(value => Math.max(1, value - 1))} className="p-2.5 text-slate-500" aria-label="Decrease bundle quantity"><Minus size={14} /></button><span className="w-6 text-center text-sm font-black">{bundleQuantity}</span><button type="button" onClick={() => setBundleQuantity(value => Math.min(Number(bundle.availability?.maxQuantityPerOrder || 10), value + 1))} className="p-2.5 text-slate-500" aria-label="Increase bundle quantity"><Plus size={14} /></button></div><button type="button" onClick={add} disabled={!ready || quoting} className="btn-primary shrink-0 px-4 py-3 font-black disabled:opacity-50" data-testid="bundle-mobile-add">{quoting ? '…' : <><ShoppingBagIcon /> Add</>}</button></div></div>
    </main>
  </>;
};

const ShoppingBagIcon = () => <span className="inline-flex items-center"><Boxes size={16} /></span>;

export default function BundlesPage() {
  const { slug } = useParams();
  const { settings } = useSite();
  const [bundles, setBundles] = useState([]);
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const request = slug ? bundleAPI.getBySlug(slug) : bundleAPI.list({ limit: 50 });
    request.then(response => slug ? setBundle(response.data?.bundle || null) : setBundles(response.data?.bundles || [])).catch(error => toast.error(error.message || 'Could not load bundles')).finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <Loader size="lg" />;
  if (slug) return bundle ? <BundleDetail bundle={bundle} /> : <><SEO title="Bundle not found" noindex /><div className="mx-auto max-w-3xl px-4 py-20 text-center"><Boxes size={48} className="mx-auto mb-4 text-slate-300" /><h1 className="text-2xl font-black text-slate-900">Bundle not found</h1><p className="mt-2 text-slate-500">This offer may have ended or moved.</p><Link to="/bundles" className="btn-primary mt-6 inline-flex">Browse active bundles</Link></div></>;
  return <><SEO title="Bundles & Combos" description="Shop curated product bundles and combos." /><main className="min-w-0 bg-slate-50"><section className="relative overflow-hidden bg-slate-950 text-white"><div className="absolute -right-20 -top-32 h-80 w-80 rounded-full bg-indigo-500/30 blur-3xl" /><div className="absolute -bottom-40 left-10 h-80 w-80 rounded-full bg-violet-500/20 blur-3xl" /><div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16"><div className="max-w-2xl"><span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-indigo-200"><Sparkles size={14} /> Curated value, packed beautifully</span><h1 className="mt-5 text-4xl font-black tracking-tight sm:text-5xl">More together.<br /><span className="text-indigo-300">Better value.</span></h1><p className="mt-4 max-w-xl text-base leading-7 text-slate-300">Shop ready-made combos or build a set that fits your routine. Every component is validated live before it reaches your cart.</p><div className="mt-7 flex flex-wrap gap-3"><div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3"><p className="text-2xl font-black">{bundles.length}</p><p className="text-xs text-slate-300">active offers</p></div><div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3"><p className="text-2xl font-black">Live</p><p className="text-xs text-slate-300">stock validation</p></div><div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3"><p className="text-2xl font-black">1 tap</p><p className="text-xs text-slate-300">to add a combo</p></div></div></div></div></section><div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10"><div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600">Find your fit</p><h2 className="mt-1 text-2xl font-black text-slate-900 sm:text-3xl">Bundles made for you</h2></div><p className="text-sm text-slate-500">{bundles.length ? 'Limited time value picks' : 'New combos are coming soon'}</p></div>{bundles.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{bundles.map(item => <BundleCard key={item._id} bundle={item} settings={settings} />)}</div> : <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">No active bundles are available right now.</div>}</div></main></>;
}
