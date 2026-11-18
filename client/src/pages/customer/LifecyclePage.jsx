import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, Clock3, Pause, Play, RefreshCcw, Repeat2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { lifecycleAPI, productAPI } from '../../services/api';
import { useSite } from '../../context/SiteContext';
import { formatPrice } from '../../utils/formatPrice';
import Loader from '../../components/common/Loader';
import EmptyState from '../../components/common/EmptyState';
import AccountHeader from '../../components/customer/AccountHeader';
import SEO from '../../components/common/SEO';

const requestKey = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
const errorMessage = error => error.response?.data?.message || error.message || 'Something went wrong';
const titleCase = value => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const dateLabel = value => value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not scheduled';

function StatusPill({ status }) {
  const tone = ['active', 'confirmed', 'fulfilled'].includes(status) ? 'bg-emerald-50 text-emerald-700' : ['cancelled', 'refunded', 'expired'].includes(status) ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700';
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${tone}`}>{titleCase(status)}</span>;
}

function Timeline({ history = [] }) {
  if (!history.length) return <p className="text-xs text-slate-400">No status history yet.</p>;
  return <div className="mt-3 space-y-2 border-l border-slate-200 pl-4">
    {history.slice().reverse().map((event, index) => <div key={`${event.status}-${event.at || index}`} className="relative text-xs">
      <span className="absolute -left-[21px] top-0.5 h-2.5 w-2.5 rounded-full bg-indigo-500 ring-4 ring-white" />
      <p className="font-semibold text-slate-700">{titleCase(event.status)}</p>
      <p className="text-slate-400">{event.note || 'Status updated'} · {dateLabel(event.at)}</p>
    </div>)}
  </div>;
}

export default function LifecyclePage() {
  const { settings } = useSite();
  const [plans, setPlans] = useState([]);
  const [products, setProducts] = useState([]);
  const [preorders, setPreorders] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [preorderForm, setPreorderForm] = useState({ product: '', quantity: 1, customerNote: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingKey, setSavingKey] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [plansResponse, productResponse, preorderResponse, subscriptionResponse] = await Promise.all([
        lifecycleAPI.customerPlans({ activeOnly: 'true' }),
        productAPI.getAll({ limit: 100 }),
        lifecycleAPI.customerPreorders({ limit: 50 }),
        lifecycleAPI.customerSubscriptions({ limit: 50 }),
      ]);
      const lifecycleProducts = (productResponse.data?.products || []).filter(product => product.preorderEnabled || product.backorderEnabled);
      setPlans(plansResponse.data?.plans || []);
      setProducts(lifecycleProducts);
      setPreorders(preorderResponse.data?.items || []);
      setSubscriptions(subscriptionResponse.data?.items || []);
      setPreorderForm(previous => ({ ...previous, product: previous.product || lifecycleProducts[0]?._id || '' }));
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submitPreorder = async event => {
    event.preventDefault();
    if (!preorderForm.product) return toast.error('Choose a pre-order or back-order product');
    const key = 'preorder';
    setSavingKey(key);
    try {
      await lifecycleAPI.createPreorder({ ...preorderForm, quantity: Number(preorderForm.quantity), idempotencyKey: requestKey('customer-preorder') });
      toast.success('Request created; payment confirmation is still required');
      setPreorderForm(previous => ({ ...previous, quantity: 1, customerNote: '' }));
      await load();
    } catch (requestError) {
      toast.error(errorMessage(requestError));
    } finally {
      setSavingKey('');
    }
  };

  const subscribe = async plan => {
    const key = `plan-${plan._id}`;
    setSavingKey(key);
    try {
      await lifecycleAPI.subscribe({ plan: plan._id, quantity: 1, idempotencyKey: requestKey('customer-subscription') });
      toast.success('Subscription request created; activate it after payment confirmation');
      await load();
    } catch (requestError) {
      toast.error(errorMessage(requestError));
    } finally {
      setSavingKey('');
    }
  };

  const updateSubscription = async (subscription, status) => {
    const key = `subscription-${subscription._id}-${status}`;
    setSavingKey(key);
    try {
      await lifecycleAPI.updateSubscriptionStatus(subscription._id, { status });
      toast.success(`Subscription ${status}`);
      await load();
    } catch (requestError) {
      toast.error(errorMessage(requestError));
    } finally {
      setSavingKey('');
    }
  };

  return <>
    <SEO title="Pre-orders & subscriptions" noindex />
    <div className="page-container account-wrap py-6 sm:py-8" data-testid="customer-lifecycle-page">
      <AccountHeader
        kicker="Customer lifecycle"
        title="Pre-orders & subscriptions"
        sub="Reserve upcoming stock and manage recurring plans in one place."
        icon={<Repeat2 size={20} />}
        accent="indigo"
        actions={(
          <button type="button" onClick={load} disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 sm:w-auto"><RefreshCcw size={15} className={loading ? 'animate-spin' : ''} /> Refresh</button>
        )}
      />

      {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" data-testid="customer-lifecycle-error">{error}</div>}
      {loading && !plans.length && !preorders.length && !subscriptions.length ? <div className="flex justify-center py-16"><Loader size="lg" /></div> : <>
        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" data-testid="customer-lifecycle-plans">
          <div className="mb-4 flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="font-black text-slate-900">Available subscription plans</h2><p className="mt-1 text-xs text-slate-500">Plans are loaded from this storefront and priced by the server.</p></div><CalendarClock size={20} className="shrink-0 text-indigo-500" /></div>
          {plans.length ? <div className="grid gap-3 md:grid-cols-2">{plans.map(plan => <div key={plan._id} className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="font-bold text-slate-900">{plan.name}</p><p className="mt-1 text-xs text-slate-500 break-anywhere">{plan.product?.title || 'Product'} · {titleCase(plan.frequency)} every {plan.interval}</p></div><strong className="shrink-0 text-indigo-700">{formatPrice(plan.price, settings)}</strong></div><button type="button" disabled={savingKey === `plan-${plan._id}`} onClick={() => subscribe(plan)} className="btn-primary mt-4 w-full text-sm" data-testid={`customer-subscribe-${plan._id}`}>{savingKey === `plan-${plan._id}` ? 'Starting…' : 'Subscribe'}</button></div>)}</div> : <EmptyState icon={CalendarClock} title="No plans available" description="The store has not published an active subscription plan yet." />}
        </section>

        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" data-testid="customer-preorder-form">
          <div className="mb-4"><h2 className="font-black text-slate-900">Reserve upcoming stock</h2><p className="mt-1 text-xs text-slate-500">Pre-order and back-order eligibility comes from the live product configuration.</p></div>
          {products.length ? <form onSubmit={submitPreorder} className="grid gap-3 md:grid-cols-[1.4fr_120px_1fr_auto] md:items-end"><label className="text-xs font-semibold text-slate-600">Product<select className="input mt-1 w-full" value={preorderForm.product} onChange={event => setPreorderForm({ ...preorderForm, product: event.target.value })} required><option value="">Choose product</option>{products.map(product => <option key={product._id} value={product._id}>{product.title} · {product.preorderEnabled ? 'Pre-order' : 'Back-order'}</option>)}</select></label><label className="text-xs font-semibold text-slate-600">Quantity<input className="input mt-1 w-full" type="number" min="1" max="100000" value={preorderForm.quantity} onChange={event => setPreorderForm({ ...preorderForm, quantity: event.target.value })} /></label><label className="text-xs font-semibold text-slate-600">Note<input className="input mt-1 w-full" maxLength="500" placeholder="Optional note" value={preorderForm.customerNote} onChange={event => setPreorderForm({ ...preorderForm, customerNote: event.target.value })} /></label><button type="submit" disabled={savingKey === 'preorder'} className="btn-primary h-11">{savingKey === 'preorder' ? 'Submitting…' : 'Create request'}</button></form> : <EmptyState icon={Clock3} title="No reservable products" description="Products enabled for pre-order or back-order will appear here." />}
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white" data-testid="customer-preorders">
            <div className="border-b border-slate-100 p-4 sm:p-5"><h2 className="break-anywhere font-black text-slate-900">My pre-order requests ({preorders.length})</h2></div>
            {preorders.length ? <div className="divide-y divide-slate-100">{preorders.map(item => <div className="p-4 sm:p-5" key={item._id}><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="break-anywhere font-bold text-slate-900">{item.product?.title || 'Product'}</p><p className="mt-1 break-anywhere text-xs text-slate-500">{titleCase(item.kind)} · Qty {item.quantity} · {formatPrice(item.unitPrice, settings)}</p></div><StatusPill status={item.status} /></div><p className="mt-2 break-anywhere text-xs text-slate-500">Estimated shipping: {dateLabel(item.estimatedShipDate)}</p><Timeline history={item.statusHistory} />{['pending_payment', 'confirmed'].includes(item.status) && <button type="button" disabled={savingKey === `preorder-cancel-${item._id}`} onClick={async () => { setSavingKey(`preorder-cancel-${item._id}`); try { await lifecycleAPI.cancelPreorder(item._id); toast.success('Pre-order cancelled'); await load(); } catch (requestError) { toast.error(errorMessage(requestError)); } finally { setSavingKey(''); } }} className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 hover:text-rose-700"><XCircle size={14} /> Cancel request</button>}</div>)}</div> : <EmptyState icon={Clock3} title="No requests yet" description="Your pre-order and back-order requests will be tracked here." />}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white" data-testid="customer-subscriptions">
            <div className="border-b border-slate-100 p-4 sm:p-5"><h2 className="break-anywhere font-black text-slate-900">My subscriptions ({subscriptions.length})</h2></div>
            {subscriptions.length ? <div className="divide-y divide-slate-100">{subscriptions.map(item => <div className="p-4 sm:p-5" key={item._id}><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="break-anywhere font-bold text-slate-900">{item.plan?.name || 'Subscription plan'}</p><p className="mt-1 break-anywhere text-xs text-slate-500">{item.product?.title || 'Product'} · Qty {item.quantity} · {formatPrice(item.price, settings)}</p></div><StatusPill status={item.status} /></div>{item.nextBillingAt && <p className="mt-2 break-anywhere text-xs text-slate-500">Next billing: {dateLabel(item.nextBillingAt)}</p>}<Timeline history={item.statusHistory} /><div className="mt-3 flex flex-wrap gap-2">{item.status === 'pending_payment' && <button type="button" disabled={savingKey === `subscription-${item._id}-active`} onClick={() => updateSubscription(item, 'active')} className="btn-primary inline-flex items-center gap-1.5 text-xs"><CheckCircle2 size={14} /> Activate</button>}{item.status === 'active' && <button type="button" disabled={savingKey === `subscription-${item._id}-paused`} onClick={() => updateSubscription(item, 'paused')} className="btn-secondary inline-flex items-center gap-1.5 text-xs"><Pause size={14} /> Pause</button>}{item.status === 'paused' && <button type="button" disabled={savingKey === `subscription-${item._id}-active`} onClick={() => updateSubscription(item, 'active')} className="btn-secondary inline-flex items-center gap-1.5 text-xs"><Play size={14} /> Resume</button>}{['pending_payment', 'active', 'paused'].includes(item.status) && <button type="button" disabled={savingKey === `subscription-${item._id}-cancelled`} onClick={() => updateSubscription(item, 'cancelled')} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-600"><XCircle size={14} /> Cancel</button>}</div></div>)}</div> : <EmptyState icon={Repeat2} title="No subscriptions yet" description="Choose an active plan above to start a recurring request." />}
          </section>
        </div>
      </>}
    </div>
  </>;
}
