import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Package, RefreshCw, ChevronDown, FileText, Truck, Loader2, Star, Tag, Filter, X, BarChart3, Search } from 'lucide-react';
import { orderAPI, shiprocketAPI, invoiceAPI, productAPI } from '../../services/api';
import Modal from '../../components/common/Modal';
import Pagination from '../../components/common/Pagination';
import Loader from '../../components/common/Loader';
import toast from 'react-hot-toast';
import { useSite } from '../../context/SiteContext';

const STATUS_OPTIONS = ['pending', 'confirmed', 'processing', 'packed', 'ready_to_ship', 'shipped', 'out_for_delivery', 'failed_delivery', 'rto', 'partially_fulfilled', 'delivered', 'return_requested', 'refund_requested', 'returned', 'partially_refunded', 'refunded', 'cancelled'];
const STATUS_LABELS = { pending: 'New', confirmed: 'Confirmed', processing: 'Processing', packed: 'Packed', ready_to_ship: 'Ready to Ship', shipped: 'Shipped', out_for_delivery: 'Out for Delivery', failed_delivery: 'Failed Delivery', rto: 'RTO', partially_fulfilled: 'Partially Fulfilled', delivered: 'Delivered', return_requested: 'Return Requested', refund_requested: 'Refund Requested', returned: 'Returned', partially_refunded: 'Partially Refunded', refunded: 'Refunded', cancelled: 'Cancelled' };
const STATUS_COLORS = { pending: 'bg-amber-100 text-amber-700', confirmed: 'bg-blue-100 text-blue-700', processing: 'bg-cyan-100 text-cyan-700', packed: 'bg-yellow-100 text-yellow-700', ready_to_ship: 'bg-indigo-100 text-indigo-700', shipped: 'bg-purple-100 text-purple-700', out_for_delivery: 'bg-orange-100 text-orange-700', failed_delivery: 'bg-rose-100 text-rose-700', rto: 'bg-red-100 text-red-700', partially_fulfilled: 'bg-violet-100 text-violet-700', delivered: 'bg-green-100 text-green-700', return_requested: 'bg-amber-100 text-amber-700', refund_requested: 'bg-orange-100 text-orange-700', returned: 'bg-gray-100 text-gray-700', partially_refunded: 'bg-fuchsia-100 text-fuchsia-700', refunded: 'bg-slate-100 text-slate-700', cancelled: 'bg-red-100 text-red-700' };
const PAYMENT_COLORS = { pending: 'bg-yellow-100 text-yellow-700', paid: 'bg-green-100 text-green-700', failed: 'bg-red-100 text-red-700', refunded: 'bg-gray-100 text-gray-700' };

const CS = '₹';
const DETAIL_ADDRESS_FIELDS = ['fullName', 'phone', 'street', 'city', 'state', 'pincode', 'country'];
const SHIPPING_STATUS_OPTIONS = ['created', 'assigned', 'in_transit', 'out_for_delivery', 'delivered', 'cancelled'];
const SHIPPING_PROVIDER_OPTIONS = ['shiprocket', 'delhivery', 'xpressbees', 'bluedart', 'dtdc'];
const PAYMENT_METHOD_OPTIONS = ['cod', 'razorpay', 'cashfree', 'stripe', 'wallet', 'loyalty', 'gift_card', 'manual', 'bank_transfer', 'upi'];

const detailsFormFor = order => ({
 shippingAddress: DETAIL_ADDRESS_FIELDS.reduce((address, field) => ({ ...address, [field]: order?.shippingAddress?.[field] || (field === 'country' ? 'India' : '') }), {}),
 customerNote: order?.customerNote || order?.notes || '',
 adminNote: order?.adminNote || '',
 discount: String(order?.discount ?? 0),
 shippingCost: String(order?.shippingCost ?? 0),
});

const itemFormFor = order => (order?.items || []).map(item => ({
 product: typeof item.product === 'object' ? item.product?._id : item.product,
 quantity: String(item.quantity || 1),
 variantText: JSON.stringify(item.variant || {}),
 title: item.title || '',
}));

const firstNonEmpty = (...values) => values.find(value => value !== undefined && value !== null && String(value).trim()) || '';

const eventAttributionFor = event => {
 const metadata = event?.metadata && typeof event.metadata === 'object' ? event.metadata : {};
 const nested = {
  ...(metadata.utm && typeof metadata.utm === 'object' ? metadata.utm : {}),
  ...(metadata.attribution && typeof metadata.attribution === 'object' ? metadata.attribution : {}),
 };
 const value = (...keys) => firstNonEmpty(...keys.flatMap(key => [nested[key], metadata[key]]));
 return {
  source: value('utm_source', 'source'),
  medium: value('utm_medium', 'medium'),
  campaign: value('utm_campaign', 'campaign'),
  term: value('utm_term', 'term'),
  content: value('utm_content', 'content'),
  landingPage: value('landingPage', 'firstPage', 'lastPage') || event?.page || '',
  referrer: value('referrer') || event?.referrer || '',
 };
};

const formatJourneyTime = value => value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

const shortDay = value => value ? new Date(value).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : '—';

const etdLabel = (courier) => {
 if (!courier) return '—';
 if (courier.etd) {
  const parsed = new Date(courier.etd);
  if (!Number.isNaN(parsed.getTime())) return shortDay(parsed);
  return String(courier.etd);
 }
 const days = String(courier.estimatedDays ?? '').match(/\d+/);
 if (days) {
  const arrival = new Date();
  arrival.setDate(arrival.getDate() + Number(days[0]));
  return shortDay(arrival);
 }
 return '—';
};

const transitLabel = (courier) => {
 if (courier?.estimatedDays !== null && courier?.estimatedDays !== undefined && String(courier.estimatedDays) !== '') return `${courier.estimatedDays} days`;
 if (courier?.etdHours !== null && courier?.etdHours !== undefined && courier?.etdHours !== '') return `~${Math.max(1, Math.round(Number(courier.etdHours) / 24))} days`;
 return '—';
};

const perfScore = (value) => {
 if (value === null || value === undefined || value === '') return null;
 const num = Number(value);
 return Number.isFinite(num) ? num : null;
};

const AttributionTouchpoint = ({ label, event, testId }) => {
 const eventUtm = eventAttributionFor(event);
 const utmFields = [
  ['Source', eventUtm.source],
  ['Medium', eventUtm.medium],
  ['Campaign', eventUtm.campaign],
  ['Term', eventUtm.term],
  ['Content', eventUtm.content],
 ].filter(([, value]) => value);

 return (
  <div className="rounded-2xl border border-indigo-100 bg-white p-3" data-testid={testId}>
   <div className="flex items-center justify-between gap-2">
    <p className="min-w-0 text-xs font-bold text-indigo-950">{label}</p>
    {event?.eventType && <span className="flex-shrink-0 rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-semibold capitalize text-indigo-700">{event.eventType.replace(/_/g, ' ')}</span>}
   </div>
   {event ? (
    <div className="mt-2 space-y-1.5 text-xs">
     <p className="break-all font-semibold text-gray-800">{event.page || 'Storefront activity'}</p>
     {event.target && <p className="break-all text-gray-500">Target: {event.target}</p>}
     <p className="text-[10px] text-gray-400">{formatJourneyTime(event.createdAt)}</p>
     {eventUtm.landingPage && <p className="break-all text-[10px] text-gray-500">Landing: {eventUtm.landingPage}</p>}
     {eventUtm.referrer && <p className="break-all text-[10px] text-gray-500">Referrer: {eventUtm.referrer}</p>}
     {utmFields.length > 0 && (
      <div className="mt-2 flex flex-wrap gap-1">
       {utmFields.map(([field, value]) => <span key={field} className="min-w-0 break-all rounded-md bg-gray-50 px-1.5 py-1 text-[10px] text-gray-600"><span className="font-semibold">{field}:</span> {value}</span>)}
      </div>
     )}
    </div>
   ) : <p className="mt-2 text-xs text-gray-500">No tracked touchpoint was retained.</p>}
  </div>
 );
};

const AttributionJourney = ({ attribution, loading, error }) => {
 if (loading) return <div className="py-10 text-center text-xs text-gray-500"><Loader2 size={22} className="mx-auto mb-2 animate-spin" />Loading tracking journey...</div>;
 if (error) return <p className="mt-4 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{error}</p>;
 if (!attribution) return <p className="mt-4 text-xs text-gray-500">No attribution data available.</p>;

 const utmFields = [
  ['utm_source', attribution.utm?.utm_source || attribution.source],
  ['utm_medium', attribution.utm?.utm_medium || attribution.medium],
  ['utm_campaign', attribution.utm?.utm_campaign || attribution.campaign],
  ['utm_term', attribution.utm?.utm_term || attribution.term],
  ['utm_content', attribution.utm?.utm_content || attribution.content],
 ];

 return (
  <div className="space-y-4" data-testid="admin-order-attribution-content">
   <div className="flex items-center gap-2"><BarChart3 size={17} className="text-indigo-600" /><h3 className="font-bold text-indigo-950 text-sm">Attribution & journey</h3></div>
   <p className="text-xs text-indigo-700">First page view through order placement</p>

   <div className="grid grid-cols-2 gap-2">
    {[['Source', attribution.source], ['Medium', attribution.medium], ['Campaign', attribution.campaign], ['Session', attribution.sessionId ? attribution.sessionId.slice(0, 24) : '—']].map(([label, value]) => (
     <div key={label} className="rounded-xl border border-indigo-100 bg-white p-2">
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 break-words text-xs font-bold text-gray-800">{value || '—'}</p>
     </div>
    ))}
   </div>

   <div className="rounded-2xl border border-indigo-100 bg-white p-3">
    <p className="mb-2 text-xs font-bold text-gray-700">UTM parameters at conversion</p>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
     {utmFields.map(([label, value]) => <div key={label} className="rounded-xl bg-gray-50 p-2"><p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p><p className="mt-1 break-words text-xs font-semibold text-gray-800">{value || '—'}</p></div>)}
    </div>
   </div>

   <div className="rounded-2xl border border-indigo-100 bg-white p-3 space-y-2 text-xs">
    <p><span className="font-semibold text-gray-500">Landing page:</span> <span className="break-all text-gray-800">{attribution.landingPage || '—'}</span></p>
    <p><span className="font-semibold text-gray-500">Referrer:</span> <span className="break-all text-gray-800">{attribution.referrer || 'Direct / none'}</span></p>
    {attribution.referral?.code && <p><span className="font-semibold text-gray-500">Referral:</span> <span className="font-mono text-gray-800">{attribution.referral.code}</span></p>}
    {attribution.order?.createdAt && <p><span className="font-semibold text-gray-500">Order placed:</span> <span className="text-gray-800">{formatJourneyTime(attribution.order.createdAt)}</span></p>}
   </div>

   <div>
    <div className="mb-2 flex items-center justify-between"><p className="text-xs font-bold text-gray-700">Journey checkpoints</p><span className="text-[10px] font-semibold text-gray-400">{attribution.eventCount || 0} events</span></div>
    <div className="grid gap-3 sm:grid-cols-2">
     <AttributionTouchpoint label="First touch / starting page" event={attribution.firstTouch} testId="admin-order-attribution-first-touch" />
     <AttributionTouchpoint label="Last touch before conversion" event={attribution.lastTouch} testId="admin-order-attribution-last-touch" />
    </div>
   </div>

   <div>
    <div className="mb-2 flex items-center justify-between"><p className="text-xs font-bold text-gray-700">Complete event timeline</p><span className="text-[10px] font-semibold text-gray-400">Oldest → newest</span></div>
    <div className="space-y-2">
     {(attribution.events || []).map((event, index) => {
      const eventUtm = eventAttributionFor(event);
      const eventFields = [['source', eventUtm.source], ['medium', eventUtm.medium], ['campaign', eventUtm.campaign], ['term', eventUtm.term], ['content', eventUtm.content]].filter(([, value]) => value);
      return (
       <div key={`${event.createdAt || event.eventType || 'event'}-${index}`} data-testid="admin-order-attribution-event" className="relative rounded-xl border border-gray-100 bg-white p-3 pl-4 shadow-sm">
        <span className="absolute -left-1 top-4 h-2 w-2 rounded-full bg-indigo-500 ring-4 ring-indigo-50" />
        <div className="flex items-start justify-between gap-2">
         <p className="min-w-0 break-words text-xs font-semibold capitalize text-gray-800">{event.eventType?.replace(/_/g, ' ') || 'Storefront activity'}</p>
         <p className="flex-shrink-0 whitespace-nowrap text-[10px] text-gray-400">{formatJourneyTime(event.createdAt)}</p>
        </div>
        <p className="mt-1 break-all text-[11px] text-gray-600">{event.page || event.target || 'Storefront activity'}</p>
        {event.target && event.page && <p className="mt-1 break-all text-[10px] text-gray-400">Target: {event.target}</p>}
        {(event.device || event.sessionId) && <p className="mt-1 text-[10px] text-gray-400">{event.device || 'unknown'}{event.sessionId ? ` · ${event.sessionId.slice(0, 24)}` : ''}</p>}
        {eventFields.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{eventFields.map(([field, value]) => <span key={field} className="min-w-0 break-all rounded-md bg-indigo-50 px-1.5 py-1 text-[10px] text-indigo-700"><span className="font-semibold">{field}:</span> {value}</span>)}</div>}
       </div>
      );
     })}
     {!attribution.events?.length && <p className="rounded-xl bg-white p-3 text-xs text-gray-500">No storefront events were retained for this order.</p>}
    </div>
   </div>
  </div>
 );
};

const AdminOrdersPage = () => {
 const [searchParams] = useSearchParams();
 const [orders, setOrders] = useState([]);
 const [pagination, setPagination] = useState(null);
 const [loading, setLoading] = useState(true);
 const [page, setPage] = useState(1);
 const [filters, setFilters] = useState(() => ({
  status: searchParams.get('status') || '',
  paymentStatus: searchParams.get('paymentStatus') || '',
  search: searchParams.get('search') || '',
  paymentMethod: searchParams.get('paymentMethod') || '',
  shippingStatus: searchParams.get('shippingStatus') || '',
  shippingProvider: searchParams.get('shippingProvider') || '',
  courierName: searchParams.get('courierName') || '',
  source: searchParams.get('source') || '',
  utmSource: searchParams.get('utmSource') || '',
  utmMedium: searchParams.get('utmMedium') || '',
  utmCampaign: searchParams.get('utmCampaign') || '',
  utmTerm: searchParams.get('utmTerm') || '',
  utmContent: searchParams.get('utmContent') || '',
  landingPage: searchParams.get('landingPage') || '',
  referrer: searchParams.get('referrer') || '',
  referralCode: searchParams.get('referralCode') || '',
  dateFrom: searchParams.get('dateFrom') || '',
  dateTo: searchParams.get('dateTo') || '',
  minTotal: searchParams.get('minTotal') || '',
  maxTotal: searchParams.get('maxTotal') || '',
  hasTracking: searchParams.get('hasTracking') || '',
 }));
 const ADVANCED_FILTER_FIELDS = ['paymentMethod', 'shippingStatus', 'shippingProvider', 'courierName', 'hasTracking', 'source', 'utmSource', 'utmMedium', 'utmCampaign', 'utmTerm', 'utmContent', 'landingPage', 'referrer', 'referralCode', 'dateFrom', 'dateTo', 'minTotal', 'maxTotal'];
 const [filtersOpen, setFiltersOpen] = useState(() => ADVANCED_FILTER_FIELDS.some(field => searchParams.get(field)));
 const advancedActiveCount = ADVANCED_FILTER_FIELDS.filter(field => filters[field]).length;
 const activeFilterCount = Object.values(filters).filter(value => value !== '' && value !== null && value !== undefined).length;
 const [selectedOrder, setSelectedOrder] = useState(null);
 const [attribution, setAttribution] = useState(null);
 const [attributionLoading, setAttributionLoading] = useState(false);
 const [attributionError, setAttributionError] = useState('');
 const attributionRequestRef = useRef(0);
 const [detailsForm, setDetailsForm] = useState(detailsFormFor());
 const [detailsUpdating, setDetailsUpdating] = useState(false);
 const [itemForm, setItemForm] = useState([]);
 const [catalogProducts, setCatalogProducts] = useState([]);
 const [catalogLoading, setCatalogLoading] = useState(false);
 const [itemsUpdating, setItemsUpdating] = useState(false);
 const [statusModal, setStatusModal] = useState(null);
 const [statusForm, setStatusForm] = useState({ status: '', note: '', trackingNumber: '' });
 const [updating, setUpdating] = useState(false);
 const { settings } = useSite();
 const [invoiceLoadingId, setInvoiceLoadingId] = useState(null);
 const [packingSlipLoadingId, setPackingSlipLoadingId] = useState(null);

 // Ship Now state
 const [shipModal, setShipModal] = useState(null);
 const [courierRates, setCourierRates] = useState([]);
 const [shippingMeta, setShippingMeta] = useState(null);
 const [ratesLoading, setRatesLoading] = useState(false);
 const [shipping, setShipping] = useState(null);
 const [shipError, setShipError] = useState('');

 useEffect(() => { fetchOrders(); }, [page, filters]);

 const fetchOrders = async () => {
 setLoading(true);
 try {
 const res = await orderAPI.adminGetAll({ page, limit: 20, ...filters });
 setOrders(res.data.orders);
 setPagination(res.data.pagination);
 } catch { } finally { setLoading(false); }
 };

 const changeFilter = (field, value) => {
  setPage(1);
  setFilters(current => ({ ...current, [field]: value }));
 };

 const clearFilters = () => {
  setPage(1);
  setFilters({ status: '', paymentStatus: '', search: '', paymentMethod: '', shippingStatus: '', shippingProvider: '', courierName: '', source: '', utmSource: '', utmMedium: '', utmCampaign: '', utmTerm: '', utmContent: '', landingPage: '', referrer: '', referralCode: '', dateFrom: '', dateTo: '', minTotal: '', maxTotal: '', hasTracking: '' });
 };

 const handleUpdateStatus = async () => {
 setUpdating(true);
 try {
 await orderAPI.updateStatus(statusModal._id, statusForm);
 toast.success('Order status updated!');
 setStatusModal(null);
 fetchOrders();
 } catch (err) { toast.error(err.message); }
 finally { setUpdating(false); }
 };

 const loadAttribution = order => {
  const requestId = attributionRequestRef.current + 1;
  attributionRequestRef.current = requestId;
  setAttribution(null);
  setAttributionError('');
  setAttributionLoading(true);
  orderAPI.getAttribution(order._id)
   .then(response => {
    if (requestId === attributionRequestRef.current) setAttribution(response.data.attribution || null);
   })
   .catch(error => {
    if (requestId === attributionRequestRef.current) setAttributionError(error.response?.data?.message || 'Attribution data could not be loaded');
   })
   .finally(() => {
    if (requestId === attributionRequestRef.current) setAttributionLoading(false);
   });
 };

 const openOrderDetails = (order) => {
  setSelectedOrder(order);
  setDetailsForm(detailsFormFor(order));
  setItemForm(itemFormFor(order));
  loadAttribution(order);
  if (!catalogProducts.length && !catalogLoading) {
   setCatalogLoading(true);
   productAPI.adminGetAll({ page: 1, limit: 100, status: 'active' })
    .then(response => setCatalogProducts(response.data.products || []))
    .catch(() => {})
    .finally(() => setCatalogLoading(false));
  }
 };

 const updateDetailsField = (field, value) => setDetailsForm(current => ({ ...current, [field]: value }));
 const updateAddressField = (field, value) => setDetailsForm(current => ({
  ...current,
  shippingAddress: { ...current.shippingAddress, [field]: value },
 }));

 const handleUpdateDetails = async () => {
  if (!selectedOrder) return;
  setDetailsUpdating(true);
  try {
   const key = `admin-order-details-${selectedOrder._id}-${Date.now()}`;
   const response = await orderAPI.updateDetails(selectedOrder._id, {
    shippingAddress: detailsForm.shippingAddress,
    customerNote: detailsForm.customerNote,
    adminNote: detailsForm.adminNote,
    discount: Number(detailsForm.discount || 0),
    shippingCost: Number(detailsForm.shippingCost || 0),
   }, key);
   setSelectedOrder(current => ({ ...current, ...response.data.order }));
   toast.success(response.data.idempotent ? 'Order details already applied' : 'Order details updated');
   fetchOrders();
  } catch (err) {
   toast.error(err.response?.data?.message || err.message || 'Could not update order details');
  } finally { setDetailsUpdating(false); }
 };

 const updateItemField = (index, field, value) => setItemForm(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
 const addItemRow = () => setItemForm(current => [...current, { product: '', quantity: '1', variantText: '{}', title: '' }]);
 const removeItemRow = index => setItemForm(current => current.filter((_, itemIndex) => itemIndex !== index));
 const handleUpdateItems = async () => {
  if (!selectedOrder) return;
  if (!itemForm.length) { toast.error('An order must keep at least one item'); return; }
  let items;
  try {
   items = itemForm.map(item => ({
    product: item.product,
    quantity: Number(item.quantity),
    variant: item.variantText?.trim() ? JSON.parse(item.variantText) : {},
   }));
  } catch {
   toast.error('Variant JSON must be valid');
   return;
  }
  setItemsUpdating(true);
  try {
   const key = `admin-order-items-${selectedOrder._id}-${Date.now()}`;
   const response = await orderAPI.updateItems(selectedOrder._id, { items }, key);
   setSelectedOrder(current => ({ ...current, ...response.data.order }));
   setItemForm(itemFormFor(response.data.order));
   toast.success(response.data.idempotent ? 'Order items already applied' : 'Order items updated');
   fetchOrders();
  } catch (err) {
   toast.error(err.response?.data?.message || err.message || 'Could not update order items');
  } finally { setItemsUpdating(false); }
 };

 const downloadAuthoritativeInvoice = async (order) => {
  if (!order || invoiceLoadingId) return;
  setInvoiceLoadingId(order._id);
  try {
   const response = await invoiceAPI.getForOrder(order._id);
   const { generateInvoice } = await import('../../utils/generateInvoice');
   generateInvoice(response.data.invoice, settings);
  } catch (error) { toast.error(error.response?.data?.message || error.message || 'Could not generate invoice'); }
  finally { setInvoiceLoadingId(null); }
 };

 const downloadPackingSlip = async (order) => {
  if (!order || packingSlipLoadingId) return;
  setPackingSlipLoadingId(order._id);
  try {
   const response = await orderAPI.getPackingSlip(order._id);
   const { generatePackingSlip } = await import('../../utils/generatePackingSlip');
   generatePackingSlip(response.data.packingSlip, settings);
   toast.success('Packing slip generated');
  } catch (error) { toast.error(error.response?.data?.message || error.message || 'Could not generate packing slip'); }
  finally { setPackingSlipLoadingId(null); }
 };

 // Ship Now — fetch courier rates
 const openShipModal = async (order) => {
 setShipModal(order);
 setCourierRates([]);
 setShippingMeta(null);
 setShipError('');
 setRatesLoading(true);
 try {
 const res = await orderAPI.getShippingOptions(order._id);
 setCourierRates(res.data.couriers || res.data.rates || []);
 setShippingMeta(res.data);
 } catch (err) {
  const message = err.response?.data?.message || err.message || 'Failed to fetch courier rates';
  setShipError(message);
  toast.error(message);
 }
 finally { setRatesLoading(false); }
 };

 // Ship Now — assign courier
 const handleShipNow = async (courier) => {
 setShipping(courier.courierId);
 try {
 const res = await orderAPI.shipWithCourier(shipModal._id, { courierId: Number(courier.courierId) });
 const awb = res.data?.courier?.awbCode || res.data?.order?.awbCode;
 const courierName = res.data?.courier?.name || courier.name;
 toast.success(`Shipping started via ${courierName}${awb ? ` — AWB: ${awb}` : ''}`);
 setShipModal(null);
 fetchOrders();
 } catch (err) { toast.error(err.message || 'Failed to assign courier'); }
 finally { setShipping(null); }
 };

 // Can show Ship Now?
 const canShip = (order) => ['confirmed', 'processing', 'packed', 'ready_to_ship'].includes(order.orderStatus) && !order.awbCode;

 return (
 <div className="space-y-5">
 <div className="flex items-center justify-between">
 <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Package className="text-primary-600" size={26} />Orders</h1>
 <button onClick={fetchOrders} className="btn-secondary text-sm py-2.5 flex items-center gap-2"><RefreshCw size={14} />Refresh</button>
 </div>

 {/* Filters — compact single row with collapsible advanced panel */}
 <div className="rounded-xl border border-gray-100 bg-white p-2 shadow-sm" data-testid="admin-order-filters">
 <div className="flex flex-wrap items-center gap-2">
  <div className="relative min-w-[150px] flex-1">
   <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
   <input value={filters.search} onChange={e => changeFilter('search', e.target.value)} aria-label="Search orders"
   className="input py-1.5 pl-8 text-xs" placeholder="Order, customer, phone, AWB..." />
  </div>
  <select value={filters.status} onChange={e => changeFilter('status', e.target.value)} aria-label="Order status" className="input w-auto py-1.5 text-xs bg-white capitalize">
  <option value="">All Statuses</option>
  {STATUS_OPTIONS.map(s => <option key={s} value={s} className="capitalize">{s.replace(/_/g, ' ')}</option>)}
  </select>
  <select value={filters.paymentStatus} onChange={e => changeFilter('paymentStatus', e.target.value)} aria-label="Payment status" className="input w-auto py-1.5 text-xs bg-white">
  <option value="">All Payments</option>
  {['pending', 'paid', 'failed', 'refunded'].map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
  </select>
  <button type="button" onClick={() => setFiltersOpen(open => !open)} aria-expanded={filtersOpen}
  className={`inline-flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold transition-colors ${filtersOpen || advancedActiveCount > 0 ? 'border-primary-200 bg-primary-50 text-primary-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>
  <Filter size={13} />Filters
  {advancedActiveCount > 0 && <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-600 px-1 text-[10px] font-bold text-white">{advancedActiveCount}</span>}
  <ChevronDown size={13} className={`transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
  </button>
  {activeFilterCount > 0 && <button type="button" onClick={clearFilters} className="inline-flex h-8 items-center gap-1 rounded-xl px-2 text-xs font-semibold text-gray-500 hover:bg-gray-50 hover:text-primary-600"><X size={13} />Clear ({activeFilterCount})</button>}
 </div>
 {filtersOpen && (
 <div className="mt-2 grid grid-cols-2 gap-2 border-t border-gray-50 pt-2 md:grid-cols-4 xl:grid-cols-6">
  <select value={filters.paymentMethod} onChange={e => changeFilter('paymentMethod', e.target.value)} className="input py-1.5 text-xs bg-white">
   <option value="">All Methods</option>
   {PAYMENT_METHOD_OPTIONS.map(method => <option key={method} value={method} className="capitalize">{method.replace(/_/g, ' ')}</option>)}
  </select>
  <select value={filters.shippingStatus} onChange={e => changeFilter('shippingStatus', e.target.value)} className="input py-1.5 text-xs bg-white">
   <option value="">All Shipping States</option>
   {SHIPPING_STATUS_OPTIONS.map(status => <option key={status} value={status} className="capitalize">{status.replace(/_/g, ' ')}</option>)}
  </select>
  <select value={filters.shippingProvider} onChange={e => changeFilter('shippingProvider', e.target.value)} className="input py-1.5 text-xs bg-white">
   <option value="">All Providers</option>
   {SHIPPING_PROVIDER_OPTIONS.map(provider => <option key={provider} value={provider} className="capitalize">{provider}</option>)}
  </select>
  <input value={filters.courierName} onChange={e => changeFilter('courierName', e.target.value)} className="input py-1.5 text-xs" placeholder="Courier partner" />
  <select value={filters.hasTracking} onChange={e => changeFilter('hasTracking', e.target.value)} className="input py-1.5 text-xs bg-white">
   <option value="">Tracking: All</option>
   <option value="yes">With AWB</option>
   <option value="no">Without AWB</option>
  </select>
  <input value={filters.source} onChange={e => changeFilter('source', e.target.value)} className="input py-1.5 text-xs" placeholder="Source / referral" />
  <input value={filters.utmSource} onChange={e => changeFilter('utmSource', e.target.value)} className="input py-1.5 text-xs" placeholder="UTM source" />
  <input value={filters.utmMedium} onChange={e => changeFilter('utmMedium', e.target.value)} className="input py-1.5 text-xs" placeholder="UTM medium" />
  <input value={filters.utmCampaign} onChange={e => changeFilter('utmCampaign', e.target.value)} className="input py-1.5 text-xs" placeholder="UTM campaign" />
  <input value={filters.utmTerm} onChange={e => changeFilter('utmTerm', e.target.value)} className="input py-1.5 text-xs" placeholder="UTM term" />
  <input value={filters.utmContent} onChange={e => changeFilter('utmContent', e.target.value)} className="input py-1.5 text-xs" placeholder="UTM content" />
  <input value={filters.landingPage} onChange={e => changeFilter('landingPage', e.target.value)} className="input py-1.5 text-xs" placeholder="Landing page" />
  <input value={filters.referrer} onChange={e => changeFilter('referrer', e.target.value)} className="input py-1.5 text-xs" placeholder="Referrer" />
  <input value={filters.referralCode} onChange={e => changeFilter('referralCode', e.target.value)} className="input py-1.5 text-xs" placeholder="Referral code" />
  <label className="text-[11px] font-semibold text-gray-500">From<input type="date" value={filters.dateFrom} onChange={e => changeFilter('dateFrom', e.target.value)} className="input mt-0.5 py-1.5 text-xs" /></label>
  <label className="text-[11px] font-semibold text-gray-500">To<input type="date" value={filters.dateTo} onChange={e => changeFilter('dateTo', e.target.value)} className="input mt-0.5 py-1.5 text-xs" /></label>
  <input type="number" min="0" value={filters.minTotal} onChange={e => changeFilter('minTotal', e.target.value)} className="input py-1.5 text-xs" placeholder="Min total" />
  <input type="number" min="0" value={filters.maxTotal} onChange={e => changeFilter('maxTotal', e.target.value)} className="input py-1.5 text-xs" placeholder="Max total" />
 </div>
 )}
 </div>

 <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
 {loading ? <div className="flex justify-center py-10"><Loader size="md" /></div> : (
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead className="bg-gray-50 border-b border-gray-100">
 <tr>
 {['Order #', 'Customer', 'Items', 'Total', 'Payment', 'Status', 'Date', 'Actions'].map(h => (
 <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>
 ))}
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-50">
 {orders.length === 0 ? (
 <tr><td colSpan={8} className="text-center py-10 text-gray-400">No orders found</td></tr>
 ) : orders.map(order => (
 <tr key={order._id} data-testid={`admin-order-row-${order._id}`} className="hover:bg-gray-50">
 <td className="px-4 py-3 font-mono font-bold text-primary-600 text-xs">
  <button type="button" onClick={() => openOrderDetails(order)} data-testid={`admin-order-attribution-trigger-${order._id}`} className="rounded-md text-left transition-colors hover:text-primary-800 hover:underline focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1" title="View order details">
   {order.orderNumber}
  </button>
 </td>
 <td className="px-4 py-3">
 <p className="font-medium text-gray-800">{order.user?.name || 'Guest'}</p>
 <p className="text-xs text-gray-500">{order.user?.email || order.user?.phone}</p>
 </td>
 <td className="px-4 py-3 text-gray-600">{order.items?.length} items</td>
 <td className="px-4 py-3 font-bold text-gray-900">{CS}{order.total.toFixed(2)}</td>
 <td className="px-4 py-3">
 <span className={`badge text-xs ${PAYMENT_COLORS[order.paymentStatus] || 'bg-gray-100 text-gray-700'}`}>
 {order.paymentStatus}
 </span>
 </td>
 <td className="px-4 py-3">
 <span className={`badge text-xs capitalize ${STATUS_COLORS[order.orderStatus] || 'bg-gray-100 text-gray-700'}`}>
 {STATUS_LABELS[order.orderStatus] || order.orderStatus.replace(/_/g, ' ')}
 </span>
 </td>
 <td className="px-4 py-3 text-gray-500 text-xs">{new Date(order.createdAt).toLocaleDateString('en-IN')}</td>
 <td className="px-4 py-3">
 <div className="flex gap-1">
 <button onClick={() => downloadAuthoritativeInvoice(order)} disabled={invoiceLoadingId === order._id} className="p-1.5 hover:bg-green-50 text-green-600 rounded-lg disabled:opacity-50" title="Download Invoice"><FileText size={14} /></button>
 <button onClick={() => downloadPackingSlip(order)} disabled={packingSlipLoadingId === order._id} data-testid={`admin-order-packing-slip-${order._id}`} className="p-1.5 hover:bg-amber-50 text-amber-600 rounded-lg disabled:opacity-50" title="Generate Packing Slip"><Package size={14} /></button>
 <button onClick={() => { setStatusModal(order); setStatusForm({ status: order.orderStatus, note: '', trackingNumber: order.trackingNumber || '' }); }} data-testid={`admin-order-status-${order._id}`}
 className="p-1.5 hover:bg-gray-100 text-gray-600 rounded-lg" title="Update Status"><ChevronDown size={14} /></button>
 {canShip(order) && (
 <button onClick={() => openShipModal(order)}
 className="flex items-center gap-1 px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors">
 <Truck size={12} /> Ship Now
 </button>
 )}
 {order.awbCode && (
 <span className="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded-lg text-xs font-medium">
 <Truck size={12} /> {order.awbCode}
 </span>
 )}
 </div>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 )}
 </div>
 <Pagination currentPage={page} totalPages={pagination?.pages || 1} onPageChange={setPage} />

 {/* Order Detail side panel — opened from the order number; carries the
     attribution-drawer test id so the order-journey e2e flow keeps working,
     since the journey timeline now lives inside this panel. */}
 <Modal isOpen={!!selectedOrder} onClose={() => setSelectedOrder(null)} title={`Order #${selectedOrder?.orderNumber}`} drawer wide testId="admin-order-attribution-drawer">
 {selectedOrder && (
 <div className="max-w-full space-y-5" data-testid="admin-order-details">
 <div className="space-y-4 min-w-0">
 <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-3 text-sm">
 {[
 { label: 'Customer', value: selectedOrder.user?.name || '' },
 { label: 'Email / Phone', value: selectedOrder.user?.email || selectedOrder.user?.phone || '' },
 { label: 'Status', value: <span className={`badge text-xs ${STATUS_COLORS[selectedOrder.orderStatus]}`}>{selectedOrder.orderStatus.replace(/_/g, ' ')}</span> },
 { label: 'Payment', value: <span className={`badge text-xs ${PAYMENT_COLORS[selectedOrder.paymentStatus]}`}>{selectedOrder.paymentStatus}</span> },
 { label: 'Method', value: selectedOrder.paymentMethod },
 { label: 'Tracking #', value: selectedOrder.trackingNumber || '—' },
 { label: 'Courier', value: selectedOrder.courierName || '—' },
 { label: 'AWB', value: selectedOrder.awbCode || '—' },
 ].map(({ label, value }) => (
 <div key={label} className="bg-gray-50 rounded-xl p-3 min-w-0">
 <p className="text-xs text-gray-500">{label}</p>
 <p className="font-medium text-gray-800 mt-0.5 break-words">{value}</p>
 </div>
 ))}
 </div>

 {/* Ship Now inside detail modal */}
 {canShip(selectedOrder) && (
 <div className="border-t pt-3">
 <button onClick={() => { setSelectedOrder(null); openShipModal(selectedOrder); }}
 className="btn-primary w-full text-sm flex items-center justify-center gap-2">
 <Truck size={15} /> Ship This Order
 </button>
 </div>
 )}

 {/* Post-ship actions */}
 {selectedOrder.awbCode && (
 <div className="border-t pt-3 flex gap-2">
 <button onClick={async () => { try { const r = await shiprocketAPI.generateLabel({ shipmentIds: [Number(selectedOrder.shiprocketShipmentId)] }); if (r.data.label_url) window.open(r.data.label_url, '_blank'); toast.success('Label generated'); } catch (e) { toast.error(e.message); }}}
 className="btn-secondary flex-1 text-sm flex items-center justify-center gap-1"><Tag size={14} /> Label</button>
 <button onClick={async () => { try { await shiprocketAPI.generateManifest({ shipmentIds: [Number(selectedOrder.shiprocketShipmentId)] }); toast.success('Manifest generated'); } catch (e) { toast.error(e.message); }}}
 className="btn-secondary flex-1 text-sm flex items-center justify-center gap-1"><FileText size={14} /> Manifest</button>
 <button onClick={async () => { try { await shiprocketAPI.requestPickup({ shipmentId: Number(selectedOrder.shiprocketShipmentId) }); toast.success('Pickup requested'); } catch (e) { toast.error(e.message); }}}
 className="btn-secondary flex-1 text-sm flex items-center justify-center gap-1"><Package size={14} /> Pickup</button>
 </div>
 )}

 <div className="border-t pt-3 space-y-3">
 <div>
 <h4 className="font-semibold text-gray-800 text-sm">Order adjustments</h4>
 <p className="text-xs text-gray-500 mt-1">Notes remain auditable; address and financial changes are locked after fulfilment starts or payment is captured.</p>
 </div>
 <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-3">
 {DETAIL_ADDRESS_FIELDS.map(field => (
 <label key={field} className="text-xs font-medium text-gray-600 capitalize">
  {field === 'pincode' ? 'Pincode' : field.replace(/([A-Z])/g, ' $1')}
  <input data-testid={`admin-order-address-${field}`} value={detailsForm.shippingAddress?.[field] || ''} onChange={event => updateAddressField(field, event.target.value)} className="input mt-1" maxLength={field === 'country' ? 80 : 200} />
 </label>
 ))}
 </div>
 <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-3">
 <label className="text-xs font-medium text-gray-600">Discount
  <input data-testid="admin-order-discount" type="number" min="0" step="0.01" value={detailsForm.discount} onChange={event => updateDetailsField('discount', event.target.value)} className="input mt-1" />
 </label>
 <label className="text-xs font-medium text-gray-600">Shipping charge
  <input data-testid="admin-order-shipping" type="number" min="0" step="0.01" value={detailsForm.shippingCost} onChange={event => updateDetailsField('shippingCost', event.target.value)} className="input mt-1" />
 </label>
 </div>
 <div className="grid gap-3 md:grid-cols-2">
 <label className="text-xs font-medium text-gray-600">Customer note
  <textarea data-testid="admin-order-customer-note" rows={3} maxLength={2000} value={detailsForm.customerNote} onChange={event => updateDetailsField('customerNote', event.target.value)} className="input mt-1 resize-none" placeholder="Visible to the customer" />
 </label>
 <label className="text-xs font-medium text-gray-600">Internal admin note
  <textarea data-testid="admin-order-admin-note" rows={3} maxLength={2000} value={detailsForm.adminNote} onChange={event => updateDetailsField('adminNote', event.target.value)} className="input mt-1 resize-none" placeholder="Visible only to staff" />
 </label>
 </div>
 <button type="button" data-testid="admin-order-save-details" onClick={handleUpdateDetails} disabled={detailsUpdating} className="btn-primary w-full text-sm disabled:opacity-50">
  {detailsUpdating ? 'Saving order details...' : 'Save order details'}
 </button>
 </div>

 <div className="border-t pt-3 space-y-3" data-testid="admin-order-items-editor">
  <div className="flex items-start justify-between gap-3">
   <div>
    <h4 className="font-semibold text-gray-800 text-sm">Order items</h4>
    <p className="text-xs text-gray-500 mt-1">Add, remove, or change quantity before fulfilment. Prices, stock, tax, shipping, settlement, and invoice revisions are recalculated by the server.</p>
   </div>
   <button type="button" data-testid="admin-order-add-item" onClick={addItemRow} className="btn-secondary text-xs whitespace-nowrap">Add product</button>
  </div>
  {catalogLoading && <p className="text-xs text-gray-500">Loading active catalog...</p>}
  <div className="space-y-2">
   {itemForm.map((item, index) => {
    const currentProduct = catalogProducts.find(product => String(product._id) === String(item.product));
    const hasCurrentOption = item.product && !currentProduct;
    return (
     <div key={`${item.product || 'new'}-${index}`} data-testid={`admin-order-item-row-${index}`} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_7rem_minmax(0,1fr)_auto] gap-2 items-end border border-gray-100 rounded-xl p-2">
      <label className="text-xs font-medium text-gray-600">Product
       <select data-testid={`admin-order-item-product-${index}`} value={item.product || ''} onChange={event => updateItemField(index, 'product', event.target.value)} className="input mt-1 bg-white">
        <option value="">Select product</option>
        {hasCurrentOption && <option value={item.product}>{item.title || 'Current order product'}</option>}
        {catalogProducts.map(product => <option key={product._id} value={product._id}>{product.title} · {product.sku || 'No SKU'}</option>)}
       </select>
      </label>
      <label className="text-xs font-medium text-gray-600">Quantity
       <input data-testid={`admin-order-item-quantity-${index}`} type="number" min="1" max="100" step="1" value={item.quantity} onChange={event => updateItemField(index, 'quantity', event.target.value)} className="input mt-1" />
      </label>
      <label className="text-xs font-medium text-gray-600">Variant JSON
       <input data-testid={`admin-order-item-variant-${index}`} value={item.variantText} onChange={event => updateItemField(index, 'variantText', event.target.value)} className="input mt-1 font-mono text-xs" placeholder="{}" />
      </label>
      <button type="button" data-testid={`admin-order-remove-item-${index}`} onClick={() => removeItemRow(index)} className="btn-secondary text-xs text-red-600">Remove</button>
     </div>
    );
   })}
  </div>
  <button type="button" data-testid="admin-order-save-items" onClick={handleUpdateItems} disabled={itemsUpdating || !itemForm.length} className="btn-primary w-full text-sm disabled:opacity-50">
   {itemsUpdating ? 'Saving order items...' : 'Save order items'}
  </button>
 </div>

 <div className="border-t pt-3">
 <h4 className="font-semibold text-gray-800 mb-2 text-sm">Shipping Address</h4>
 <p className="text-sm text-gray-600 break-words">{selectedOrder.shippingAddress?.fullName} • {selectedOrder.shippingAddress?.phone}</p>
 <p className="text-sm text-gray-600 break-words">{selectedOrder.shippingAddress?.street}, {selectedOrder.shippingAddress?.city}, {selectedOrder.shippingAddress?.state} {selectedOrder.shippingAddress?.pincode}</p>
 </div>
 <div className="border-t pt-3">
 <h4 className="font-semibold text-gray-800 mb-2 text-sm">Items</h4>
 {selectedOrder.items?.map((item, i) => (
 <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
 <img src={item.image} alt={item.title} className="w-10 h-10 flex-shrink-0 object-cover rounded-lg" />
 <div className="flex-1 min-w-0">
 <p className="text-sm font-medium break-words">{item.title}</p>
 <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
 </div>
 <p className="font-semibold text-sm flex-shrink-0">{CS}{(item.price * item.quantity).toFixed(2)}</p>
 </div>
 ))}
 <div className="flex justify-between font-bold pt-2"><span>Total</span><span className="text-primary-600">{CS}{selectedOrder.total?.toFixed(2)}</span></div>
 </div>
 <div className="border-t pt-3">
 <button onClick={() => downloadAuthoritativeInvoice(selectedOrder)} disabled={invoiceLoadingId === selectedOrder._id} className="btn-primary w-full text-sm flex items-center justify-center gap-2 disabled:opacity-50">
 <FileText size={15} /> Download Invoice
 </button>
 <button onClick={() => downloadPackingSlip(selectedOrder)} disabled={packingSlipLoadingId === selectedOrder._id} data-testid="admin-order-packing-slip-detail" className="btn-secondary w-full text-sm flex items-center justify-center gap-2 disabled:opacity-50">
  <Package size={15} /> Generate Packing Slip
 </button>
 </div>
 </div>
 <aside className="rounded-2xl border border-indigo-100 bg-gradient-to-b from-indigo-50 to-white p-4 min-w-0" data-testid="admin-order-attribution">
  <AttributionJourney attribution={attribution} loading={attributionLoading} error={attributionError} />
 </aside>
 </div>
 )}
 </Modal>

 {/* Update Status Modal */}
 <Modal isOpen={!!statusModal} onClose={() => setStatusModal(null)} title="Update Order Status" size="sm">
 {statusModal && (
 <div className="space-y-4">
 <div>
 <label className="text-sm font-medium text-gray-700 mb-1 block">New Status</label>
 <select data-testid="admin-order-status-select" value={statusForm.status} onChange={e => setStatusForm(f => ({ ...f, status: e.target.value }))} className="input bg-white capitalize">
 {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
 </select>
 </div>
 <div>
 <label className="text-sm font-medium text-gray-700 mb-1 block">Tracking Number</label>
 <input value={statusForm.trackingNumber} onChange={e => setStatusForm(f => ({ ...f, trackingNumber: e.target.value }))} className="input" placeholder="Optional tracking number" />
 </div>
 <div>
 <label className="text-sm font-medium text-gray-700 mb-1 block">Note</label>
 <textarea value={statusForm.note} onChange={e => setStatusForm(f => ({ ...f, note: e.target.value }))} className="input resize-none" rows={2} placeholder="Optional note" />
 </div>
 <div className="flex gap-3">
 <button data-testid="admin-order-status-modal-cancel" onClick={() => setStatusModal(null)} className="btn-secondary flex-1 text-sm">Cancel</button>
 <button onClick={handleUpdateStatus} disabled={updating} className="btn-primary flex-1 text-sm flex items-center justify-center gap-2">
 {updating ? <Loader size="sm" /> : 'Update Status'}
 </button>
 </div>
 </div>
 )}
 </Modal>

 {/* Ship Now side panel — Courier Selection */}
 <Modal isOpen={!!shipModal} onClose={() => setShipModal(null)} title={`Ship Order #${shipModal?.orderNumber}`} drawer>
 {shipModal && (
 <div className="max-w-full space-y-4">
 <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3 text-sm">
 <p className="text-gray-600 break-words"><strong>Customer:</strong> {shipModal.shippingAddress?.fullName} • {shipModal.shippingAddress?.phone}</p>
 <p className="text-gray-600 break-words"><strong>Deliver to:</strong> {shipModal.shippingAddress?.city}, {shipModal.shippingAddress?.state} — {shipModal.shippingAddress?.pincode}</p>
 <p className="text-gray-600"><strong>Total:</strong> {CS}{shipModal.total?.toFixed(2)} • {shipModal.paymentMethod?.toUpperCase()}</p>
 {shippingMeta?.pickupPincode && <p className="text-xs text-gray-500 mt-1">Pickup {shippingMeta.pickupPincode} · {shippingMeta.package?.weight || '—'} kg</p>}
 </div>

 {ratesLoading ? (
 <div className="flex flex-col items-center justify-center py-12 text-gray-400">
 <Loader2 size={28} className="animate-spin mb-3" />
 <p className="text-sm">Fetching available couriers...</p>
 </div>
 ) : shipError ? (
 <div className="rounded-2xl border border-rose-100 bg-rose-50 p-6 text-center text-rose-700">
  <Truck size={32} className="mx-auto mb-2 opacity-60" />
  <p className="font-semibold">Could not load Shiprocket couriers</p>
  <p className="text-xs mt-1 break-words">{shipError}</p>
 </div>
 ) : courierRates.length === 0 ? (
 <div className="text-center py-12 text-gray-400">
 <Truck size={32} className="mx-auto mb-2 opacity-50" />
 <p className="text-sm">No couriers available for this pincode</p>
 </div>
 ) : (
 <div>
 <div className="mb-3 flex items-center justify-between gap-2">
  <p className="text-sm font-bold text-gray-800">Choose a courier</p>
  <span className="text-[11px] font-semibold text-gray-400">{courierRates.length} live options · sorted by price</span>
 </div>
 <div className="grid gap-3">
 {([...courierRates].sort((a, b) => Number(a.freight || 0) - Number(b.freight || 0))).map((c, i) => {
  const busy = !!shipping;
  const active = shipping === c.courierId;
  const pickupScore = perfScore(c.pickupPerformance);
  const deliveryScore = perfScore(c.deliveryPerformance);
  return (
 <div key={c.courierId || i} className={`relative overflow-hidden rounded-2xl border bg-white p-4 shadow-sm transition-all ${i === 0 ? 'border-indigo-300 bg-indigo-50/40 ring-1 ring-indigo-200' : 'border-gray-100 hover:border-indigo-200 hover:shadow-md'}`}>
  {i === 0 && <span className="absolute right-0 top-0 rounded-bl-xl bg-indigo-600 px-2.5 py-1 text-[10px] font-bold text-white">Best price</span>}
  <div className="flex items-center gap-3">
   <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${i === 0 ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-600'}`}><Truck size={18} /></span>
   <div className="min-w-0 flex-1">
    <p className="truncate font-bold text-gray-900">{c.name || 'Courier partner'}</p>
    <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-amber-600">{c.rating ? <><Star size={13} className="fill-amber-400 text-amber-400" />{Number(c.rating).toFixed(1)}</> : <span className="font-normal text-gray-400">No rating</span>}</p>
   </div>
  </div>
  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
   <div className="rounded-xl bg-gray-50 p-2"><p className="text-gray-400">Arriving by</p><p className="mt-1 font-semibold text-gray-700">{etdLabel(c)}</p></div>
   <div className="rounded-xl bg-gray-50 p-2"><p className="text-gray-400">Transit time</p><p className="mt-1 font-semibold text-gray-700">{transitLabel(c)}</p></div>
   {pickupScore !== null && (
   <div className="rounded-xl bg-gray-50 p-2"><p className="text-gray-400">Pickup score</p><p className="mt-1 font-semibold text-gray-700">{pickupScore.toFixed(1)}<span className="font-normal text-gray-400">/5</span></p><div className="mt-1.5 h-1 overflow-hidden rounded-full bg-gray-200"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, (pickupScore / 5) * 100))}%` }} /></div></div>
   )}
   {deliveryScore !== null && (
   <div className="rounded-xl bg-gray-50 p-2"><p className="text-gray-400">Delivery score</p><p className="mt-1 font-semibold text-gray-700">{deliveryScore.toFixed(1)}<span className="font-normal text-gray-400">/5</span></p><div className="mt-1.5 h-1 overflow-hidden rounded-full bg-gray-200"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, (deliveryScore / 5) * 100))}%` }} /></div></div>
   )}
   {c.mode !== null && c.mode !== undefined && String(c.mode) !== '' && (
   <div className="rounded-xl bg-gray-50 p-2"><p className="text-gray-400">Mode</p><p className="mt-1 font-semibold capitalize text-gray-700">{String(c.mode).replace(/_/g, ' ')}</p></div>
   )}
   {c.pickupCutoff !== null && c.pickupCutoff !== undefined && String(c.pickupCutoff) !== '' && (
   <div className="rounded-xl bg-gray-50 p-2"><p className="text-gray-400">Pickup cutoff</p><p className="mt-1 font-semibold text-gray-700">{String(c.pickupCutoff)}</p></div>
   )}
   <div className="rounded-xl bg-gray-50 p-2"><p className="text-gray-400">COD fee</p><p className="mt-1 font-semibold text-gray-700">{Number(c.cod || 0) > 0 ? `${CS}${Number(c.cod).toFixed(0)}` : 'Free'}</p></div>
   {c.zone !== null && c.zone !== undefined && String(c.zone) !== '' && (
   <div className="rounded-xl bg-gray-50 p-2"><p className="text-gray-400">Zone</p><p className="mt-1 font-semibold uppercase text-gray-700">{String(c.zone)}</p></div>
   )}
  </div>
  <div className="mt-3 flex items-end justify-between gap-2 border-t border-gray-100 pt-3">
   <div className="min-w-0"><p className="text-[11px] text-gray-400">Shipping charge</p><p className="text-xl font-black tracking-tight text-gray-900">{CS}{(Number(c.freight || 0) + Number(c.cod || 0)).toFixed(0)}</p></div>
   <button onClick={() => handleShipNow(c)} disabled={busy} className={active ? 'inline-flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-gray-200 px-4 py-2.5 text-xs font-bold text-gray-500' : 'inline-flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-indigo-700'}>{active ? <Loader2 size={14} className="animate-spin" /> : <><Truck size={14} />Ship Now</>}</button>
  </div>
 </div>
  );
 })}
 </div>
 </div>
 )}
 </div>
 )}
 </Modal>
 </div>
 );
};

export default AdminOrdersPage;
