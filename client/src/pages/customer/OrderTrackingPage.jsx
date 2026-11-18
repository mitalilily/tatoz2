import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Package, Truck, MapPin, CheckCircle, Clock, XCircle, ChevronLeft, Phone, AlertTriangle, Upload, X, Loader2, Download } from 'lucide-react';
import { orderAPI, cancellationAPI, invoiceAPI, invoiceNoteAPI, shipmentAPI, returnAPI } from '../../services/api';
import { useSite } from '../../context/SiteContext';
import { formatPrice } from '../../utils/formatPrice';
import Loader from '../../components/common/Loader';
import toast from 'react-hot-toast';
import SEO from '../../components/common/SEO';

const ORDER_STAGES = [
 { key: 'pending', label: 'New', icon: Clock, desc: 'Order received' },
 { key: 'confirmed', label: 'Confirmed', icon: CheckCircle, desc: 'Your order has been placed' },
 { key: 'processing', label: 'Processing', icon: Clock, desc: 'Your order is being prepared' },
 { key: 'packed', label: 'Packed', icon: Package, desc: 'Your items are being packed' },
 { key: 'ready_to_ship', label: 'Ready to Ship', icon: Package, desc: 'Ready for courier pickup' },
 { key: 'shipped', label: 'Shipped', icon: Truck, desc: 'Order shipped via courier' },
 { key: 'out_for_delivery', label: 'Out for Delivery', icon: MapPin, desc: 'Arriving today' },
 { key: 'failed_delivery', label: 'Failed Delivery', icon: AlertTriangle, desc: 'Courier reported a delivery issue' },
 { key: 'rto', label: 'RTO', icon: AlertTriangle, desc: 'Returning to origin' },
 { key: 'partially_fulfilled', label: 'Partially Fulfilled', icon: Package, desc: 'Some items have been fulfilled' },
 { key: 'delivered', label: 'Delivered', icon: CheckCircle, desc: 'Package delivered!' },
];

const STATUS_ORDER = ['pending', 'confirmed', 'processing', 'packed', 'ready_to_ship', 'shipped', 'out_for_delivery', 'failed_delivery', 'rto', 'partially_fulfilled', 'delivered'];

const OrderTrackingPage = () => {
 const { id } = useParams();
 const { settings } = useSite();
 const [order, setOrder] = useState(null);
 const [loading, setLoading] = useState(true);
 const [invoiceLoading, setInvoiceLoading] = useState(false);
 const [invoiceNotes, setInvoiceNotes] = useState([]);
 const [noteLoading, setNoteLoading] = useState(false);
 const [shipment, setShipment] = useState(null);
 const [shipmentEvents, setShipmentEvents] = useState([]);

 // Cancellation state
 const [cancelEligible, setCancelEligible] = useState(false);
 const [cancelTimeRemaining, setCancelTimeRemaining] = useState(0);
 const [cancelReasons, setCancelReasons] = useState([]);
 const [refundDays, setRefundDays] = useState({ min: 5, max: 7 });
 const [showCancelModal, setShowCancelModal] = useState(false);
 const [selectedReason, setSelectedReason] = useState('');
 const [cancelling, setCancelling] = useState(false);

 // Refund request state
 const [showRefundModal, setShowRefundModal] = useState(false);
 const [refundType, setRefundType] = useState('return');
 const [refundReason, setRefundReason] = useState('');
 const [refundDesc, setRefundDesc] = useState('');
 const [refundAmount, setRefundAmount] = useState('');
 const [refundImages, setRefundImages] = useState([]);
 const [submittingRefund, setSubmittingRefund] = useState(false);

 // Return / replacement request state
 const [returnRequests, setReturnRequests] = useState([]);
 const [showReturnModal, setShowReturnModal] = useState(false);
 const [returnType, setReturnType] = useState('return');
 const [returnReason, setReturnReason] = useState('');
 const [returnDescription, setReturnDescription] = useState('');
 const [returnItems, setReturnItems] = useState([]);
 const [returnImages, setReturnImages] = useState([]);
 const [submittingReturn, setSubmittingReturn] = useState(false);

 const fetchOrder = useCallback(() => {
 setShipment(null);
 setShipmentEvents([]);
 orderAPI.getById(id).then(res => setOrder(res.data.order)).catch(console.error).finally(() => setLoading(false));
 invoiceNoteAPI.getForOrder(id).then(res => setInvoiceNotes(res.data.notes || [])).catch(() => setInvoiceNotes([]));
 shipmentAPI.getForOrder(id).then(res => {
  setShipment(res.data.shipment || null);
  setShipmentEvents(res.data.events || []);
 }).catch(() => {
  setShipment(null);
  setShipmentEvents([]);
 });
 returnAPI.getForOrder(id).then(res => setReturnRequests(res.data.returns || [])).catch(() => setReturnRequests([]));
 }, [id]);

 useEffect(() => { fetchOrder(); }, [fetchOrder]);

 const downloadAuthoritativeInvoice = async () => {
  if (!order || invoiceLoading) return;
  setInvoiceLoading(true);
  try {
   const response = await invoiceAPI.getForOrder(order._id);
   const { generateInvoice } = await import('../../utils/generateInvoice');
   generateInvoice(response.data.invoice, settings);
  } catch (error) {
   toast.error(error.response?.data?.message || error.message || 'Could not generate invoice');
 } finally { setInvoiceLoading(false); }
 };

 const downloadAuthoritativeNote = async note => {
  if (!note || noteLoading) return;
  setNoteLoading(true);
  try {
   const response = await invoiceNoteAPI.getForOrder(order._id);
   const fresh = (response.data.notes || []).find(item => String(item._id) === String(note._id)) || note;
   const { generateInvoice } = await import('../../utils/generateInvoice');
   generateInvoice({ ...fresh, invoiceNumber: fresh.noteNumber, documentType: `${fresh.type}_note`, items: (fresh.items || []).map(item => ({ ...item, price: item.total, grossAmount: item.total })) }, settings);
  } catch (error) { toast.error(error.response?.data?.message || error.message || 'Could not generate note'); }
  finally { setNoteLoading(false); }
 };

 // Check cancellation eligibility
 useEffect(() => {
 if (!order || ['cancelled', 'delivered', 'returned'].includes(order.orderStatus)) return;
 cancellationAPI.checkEligibility(id).then(res => {
 setCancelEligible(res.data.eligible);
 setCancelTimeRemaining(res.data.timeRemaining || 0);
 }).catch(() => {});
 cancellationAPI.getPolicy().then(res => {
 setCancelReasons(res.data.policy?.reasons || []);
 setRefundDays({ min: res.data.policy?.refundDaysMin || 5, max: res.data.policy?.refundDaysMax || 7 });
 }).catch(() => {});
 }, [order, id]);

 // Countdown timer
 useEffect(() => {
 if (cancelTimeRemaining <= 0) return;
 const interval = setInterval(() => {
 setCancelTimeRemaining(prev => {
 if (prev <= 1000) { setCancelEligible(false); return 0; }
 return prev - 1000;
 });
 }, 1000);
 return () => clearInterval(interval);
 }, [cancelTimeRemaining]);

 const openReturnModal = useCallback(() => {
  if (!order) return;
  setReturnType('return');
  setReturnReason('');
  setReturnDescription('');
  setReturnImages([]);
  setReturnItems((order.items || []).map(item => ({ orderItemId: item._id, title: item.title, quantity: item.quantity, selected: true })));
  setShowReturnModal(true);
 }, [order]);

 useEffect(() => {
  const openFromHash = () => {
   if (window.location.hash === '#return-request') openReturnModal();
  };
  openFromHash();
  window.addEventListener('hashchange', openFromHash);
  return () => window.removeEventListener('hashchange', openFromHash);
 }, [id, openReturnModal]);

 if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader size="lg" /></div>;
 if (!order) return null;

 const currentStageIndex = STATUS_ORDER.indexOf(order.orderStatus);
 const isCancelled = order.orderStatus === 'cancelled';
 const isDelivered = order.orderStatus === 'delivered' || order.orderStatus === 'returned';

 const formatTime = (ms) => {
 const h = Math.floor(ms / 3600000);
 const m = Math.floor((ms % 3600000) / 60000);
 return h > 0 ? `${h}h ${m}m` : `${m}m`;
 };

 const handleCancel = async () => {
 if (!selectedReason) return toast.error('Please select a reason');
 setCancelling(true);
 try {
 const res = await cancellationAPI.cancel(id, selectedReason);
 toast.success(res.data.message || 'Order cancelled');
 setShowCancelModal(false);
 fetchOrder();
 } catch (err) {
 toast.error(err.response?.data?.message || 'Failed to cancel order');
 } finally {
 setCancelling(false);
 }
 };

 const handleRefundSubmit = async () => {
 if (!refundReason) return toast.error('Please select a reason');
 setSubmittingRefund(true);
 try {
 const formData = new FormData();
 formData.append('type', refundType);
 formData.append('reason', refundReason);
 formData.append('description', refundDesc);
 if (refundType === 'partial' && refundAmount) formData.append('amount', refundAmount);
 refundImages.forEach(f => formData.append('images', f));
 const res = await cancellationAPI.requestRefund(id, formData);
 toast.success(res.data.message || 'Refund request submitted');
 setShowRefundModal(false);
 fetchOrder();
 } catch (err) {
 toast.error(err.response?.data?.message || 'Failed to submit refund request');
 } finally {
 setSubmittingRefund(false);
 }
 };

 const handleImageAdd = (e) => {
 const files = Array.from(e.target.files || []);
 setRefundImages(prev => [...prev, ...files].slice(0, 3));
 };

 const handleReturnSubmit = async () => {
  const selectedItems = returnItems.filter(item => item.selected && Number(item.quantity) > 0).map(item => ({ orderItemId: item.orderItemId, quantity: Number(item.quantity) }));
  if (!returnReason) return toast.error('Please select a return reason');
  if (!selectedItems.length) return toast.error('Select at least one item');
  setSubmittingReturn(true);
  try {
   const formData = new FormData();
   formData.append('type', returnType);
   formData.append('reason', returnReason);
   formData.append('description', returnDescription);
   formData.append('items', JSON.stringify(selectedItems));
   returnImages.forEach(file => formData.append('images', file));
   const response = await returnAPI.create(id, formData);
   setReturnRequests(current => [response.data.returnRequest, ...current]);
   setShowReturnModal(false);
   toast.success(response.data.message || 'Return request submitted');
   fetchOrder();
  } catch (error) {
   toast.error(error.response?.data?.message || 'Failed to submit return request');
  } finally { setSubmittingReturn(false); }
 };

 return (
 <>
 <SEO title="Order Details" noindex={true} />
 <div className="page-container pb-28 pt-6 sm:py-8 animate-fade-in">
 <div className="min-w-0 max-w-2xl mx-auto">
 {/* Header */}
 <Link to="/orders" className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-6 transition-colors">
 <ChevronLeft size={18} />Back to Orders
 </Link>

 <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
 <div className="min-w-0">
 <h1 className="text-xl sm:text-2xl font-bold text-gray-900 break-anywhere">Order #{order.orderNumber}</h1>
 <p className="text-gray-500 text-sm mt-1">Placed on {new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
 </div>
 <span className={`badge text-sm px-3 py-1.5 font-semibold capitalize ${
 isCancelled ? 'bg-red-100 text-red-700' :
 order.orderStatus === 'delivered' ? 'bg-green-100 text-green-700' : 'bg-primary-100 text-primary-700'
 }`}>
 {({ pending: 'New', confirmed: 'Confirmed', processing: 'Processing', packed: 'Packed', ready_to_ship: 'Ready to Ship', shipped: 'Shipped', out_for_delivery: 'Out for Delivery', failed_delivery: 'Failed Delivery', rto: 'RTO', partially_fulfilled: 'Partially Fulfilled', delivered: 'Delivered', return_requested: 'Return Requested', refund_requested: 'Refund Requested', returned: 'Returned', partially_refunded: 'Partially Refunded', refunded: 'Refunded', cancelled: 'Cancelled' }[order.orderStatus] || order.orderStatus.replace(/_/g, ' '))}
 </span>
 </div>

 {/* Tracking Timeline */}
 <div className="card p-4 sm:p-6 mb-5">
 <h2 className="font-bold text-gray-900 mb-6">Tracking Status</h2>

 {isCancelled ? (
 <div className="flex items-center gap-4 p-4 bg-red-50 rounded-2xl text-red-700">
 <XCircle size={32} className="flex-shrink-0" />
 <div>
 <p className="font-bold">Order Cancelled</p>
 <p className="text-sm text-red-600">{order.cancellationReason || 'This order has been cancelled'}</p>
 </div>
 </div>
 ) : (
 <div className="space-y-0">
 {ORDER_STAGES.map((stage, index) => {
 const isCompleted = index <= currentStageIndex;
 const isCurrent = index === currentStageIndex;
 const Icon = stage.icon;
 return (
 <div key={stage.key} className="flex gap-4">
 <div className="flex flex-col items-center">
 <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
 isCompleted ? 'bg-primary-600' : 'bg-gray-200'
 } ${isCurrent ? 'ring-4 ring-primary-200 scale-110' : ''}`}>
 <Icon size={18} className={isCompleted ? 'text-white' : 'text-gray-400'} />
 </div>
 {index < ORDER_STAGES.length - 1 && (
 <div className={`w-0.5 h-10 mt-1 ${isCompleted && index < currentStageIndex ? 'bg-primary-600' : 'bg-gray-200'}`} />
 )}
 </div>
 <div className="pb-8 flex-1">
 <p className={`font-semibold ${isCompleted ? 'text-gray-900' : 'text-gray-400'}`}>{stage.label}</p>
 <p className={`text-sm ${isCompleted ? 'text-gray-500' : 'text-gray-300'}`}>{stage.desc}</p>
 {isCurrent && order.statusHistory?.find(h => h.status === stage.key)?.updatedAt && (
 <p className="text-xs text-primary-600 mt-1 flex items-center gap-1">
 <Clock size={10} />
 {new Date(order.statusHistory.find(h => h.status === stage.key).updatedAt).toLocaleString()}
 </p>
 )}
 </div>
 </div>
 );
 })}
 </div>
 )}
 </div>

 {shipment && (
 <div className="card p-4 sm:p-6 mb-5" data-testid="customer-shipment-timeline">
  <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
   <div>
    <h2 className="font-bold text-gray-900 flex items-center gap-2"><Truck size={18} className="text-primary-600" />Shipment tracking</h2>
    <p className="text-xs text-gray-500 mt-1">{shipment.courierName || shipment.provider || 'Shipping partner'}{shipment.trackingNumber ? ` · ${shipment.trackingNumber}` : ''}</p>
   </div>
   {shipment.trackingUrl && <a href={shipment.trackingUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-primary-600">Open carrier tracking</a>}
  </div>
  {shipmentEvents.length ? (
   <div className="space-y-0">
    {shipmentEvents.map((event, index) => (
     <div key={event._id || `${event.status}-${index}`} className="flex gap-3" data-testid={`customer-shipment-event-${event._id || index}`}>
      <div className="flex flex-col items-center">
       <div className={`w-8 h-8 rounded-full flex items-center justify-center ${index === 0 ? 'bg-primary-600' : 'bg-gray-200'}`}><CheckCircle size={15} className={index === 0 ? 'text-white' : 'text-gray-500'} /></div>
       {index < shipmentEvents.length - 1 && <div className="w-0.5 flex-1 min-h-7 bg-gray-200" />}
      </div>
      <div className="pb-5 flex-1">
       <p className={`text-sm font-semibold capitalize ${index === 0 ? 'text-gray-900' : 'text-gray-600'}`}>{String(event.status || '').replace(/_/g, ' ')}</p>
       {event.description && <p className="text-xs text-gray-500 mt-0.5">{event.description}</p>}
       <p className="text-[11px] text-gray-400 mt-1 flex flex-wrap items-center gap-2"><span>{event.eventAt ? new Date(event.eventAt).toLocaleString() : 'Time unavailable'}</span>{event.location && <span>· {event.location}</span>}</p>
      </div>
     </div>
    ))}
   </div>
  ) : <p className="text-sm text-gray-500">Shipment created; carrier events will appear here after the first sync.</p>}
 </div>
 )}

 {/* Cancel Order Section */}
 {!isCancelled && !isDelivered && cancelEligible && (
 <div className="border border-red-200 rounded-xl p-4 mb-5 bg-red-50/50">
 <div className="flex flex-wrap items-center justify-between gap-3">
 <div>
 <p className="text-sm font-semibold text-red-800">Need to cancel?</p>
 {cancelTimeRemaining > 0 && (
 <p className="text-xs text-red-600 mt-0.5">Cancellation available for {formatTime(cancelTimeRemaining)}</p>
 )}
 </div>
 <button onClick={() => setShowCancelModal(true)} className="w-full bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors sm:w-auto">
 Cancel Order
 </button>
 </div>
 </div>
 )}

 {/* Cancellation not available message */}
 {!isCancelled && !isDelivered && !cancelEligible && !loading && (
 <div className="border border-gray-200 rounded-xl p-4 mb-5 bg-gray-50">
 <p className="text-xs text-gray-500">Cancellation window has expired or order has progressed. Contact support for assistance.</p>
 </div>
 )}

 {/* Request Refund Section */}
 {isDelivered && (
 <div className="border border-indigo-200 rounded-xl p-4 mb-5 bg-indigo-50/50">
 <div className="flex flex-wrap items-center justify-between gap-3">
 <div>
 <p className="text-sm font-semibold text-indigo-800">Issue with your order?</p>
 <p className="text-xs text-indigo-600 mt-0.5">Request a refund if something isn't right</p>
 </div>
 <button onClick={() => setShowRefundModal(true)} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors sm:w-auto">
 Request Refund
 </button>
 </div>
 </div>
 )}

 {isDelivered && (
 <>
  <div className="border border-emerald-200 rounded-xl p-4 mb-5 bg-emerald-50/50" data-testid="customer-return-panel">
   <div className="flex flex-wrap items-center justify-between gap-3">
    <div>
     <p className="text-sm font-semibold text-emerald-800">Return, replacement, or exchange</p>
     <p className="text-xs text-emerald-700 mt-0.5">Choose the affected items and track the controlled RMA workflow.</p>
    </div>
    <a href="#return-request" onClick={openReturnModal} data-testid="customer-start-return" className="w-full bg-emerald-600 hover:bg-emerald-700 text-center text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors sm:w-auto">Start request</a>
   </div>
  </div>
  {returnRequests.length > 0 && <div className="card p-4 sm:p-5 mb-5" data-testid="customer-return-timeline">
   <div className="flex flex-wrap items-start justify-between gap-3 mb-4"><div className="min-w-0"><h2 className="font-bold text-gray-900">Return requests</h2><p className="mt-1 break-anywhere text-xs text-gray-500">Each update is recorded against this order.</p></div><span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">{returnRequests.length}</span></div>
   <div className="space-y-4">{returnRequests.map(request => <div key={request._id} className="rounded-xl border border-gray-100 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-mono text-xs font-bold text-gray-800">{request.requestNumber}</p><p className="text-xs capitalize text-gray-500">{request.type} · {new Date(request.createdAt).toLocaleDateString('en-IN')}</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold capitalize text-emerald-700">{String(request.status || '').replace(/_/g, ' ')}</span></div>
    <div className="mt-3 space-y-2 border-l-2 border-emerald-100 pl-3">{(request.statusHistory || []).map((entry, index) => <div key={`${entry.to}-${index}`} className="text-xs"><p className="font-semibold capitalize text-gray-700">{String(entry.to || '').replace(/_/g, ' ')}</p>{entry.note && <p className="text-gray-500">{entry.note}</p>}<p className="text-gray-400">{entry.updatedAt ? new Date(entry.updatedAt).toLocaleString('en-IN') : 'Time unavailable'}</p></div>)}</div>
   </div>)}</div>
  </div>}
 </>
 )}

 {/* Delivery Address */}
 <div className="card p-4 sm:p-5 mb-5">
 <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2"><MapPin size={18} className="text-primary-600" />Delivery Address</h3>
 <p className="break-anywhere font-semibold text-gray-800">{order.shippingAddress?.fullName}</p>
 <p className="break-anywhere text-sm text-gray-600">{order.shippingAddress?.street}</p>
 <p className="break-anywhere text-sm text-gray-600">{order.shippingAddress?.city}, {order.shippingAddress?.state} {order.shippingAddress?.pincode}</p>
 <p className="text-sm text-gray-600 flex items-center gap-1 mt-1"><Phone size={12} />{order.shippingAddress?.phone}</p>
 </div>

 {/* Items */}
 <div className="card p-4 sm:p-5">
 <h3 className="font-bold text-gray-900 mb-4">Ordered Items</h3>
 <div className="space-y-3">
 {order.items?.map((item, i) => (
 <div key={i} className="flex min-w-0 items-center gap-3 p-3 bg-gray-50 rounded-xl">
 <img src={item.image || 'https://via.placeholder.com/60'} alt={item.title} className="h-14 w-14 shrink-0 object-cover rounded-lg" />
 <div className="min-w-0 flex-1">
 <p className="break-anywhere text-sm font-semibold text-gray-800">{item.title}</p>
 <p className="text-xs text-gray-500">Qty: {item.quantity} × {formatPrice(item.price, settings)}</p>
 {item.itemType === 'bundle' && <div className="mt-1 space-y-0.5 text-[11px] text-indigo-600">{(item.bundleComponents || []).map((component, componentIndex) => <p key={`${component.product}-${componentIndex}`} className="truncate">• {component.title} × {Number(component.quantity || 1) * Number(item.quantity || 1)} · {component.fulfillmentStatus || 'component tracked'}</p>)}</div>}
 </div>
 <p className="shrink-0 font-bold text-gray-900">{formatPrice(item.price * item.quantity, settings)}</p>
 </div>
 ))}
 </div>
 <div className="border-t border-gray-100 mt-4 pt-4 flex justify-between font-bold text-gray-900">
 <span>Total Paid</span>
 <span className="text-primary-600">{formatPrice(order.total, settings)}</span>
 </div>
 {order.orderStatus !== 'pending' && (
 <button
 onClick={downloadAuthoritativeInvoice}
 disabled={invoiceLoading}
 data-testid="customer-download-invoice"
 className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
 >
 <Download size={16} /> {invoiceLoading ? 'Preparing invoice…' : 'Download Invoice'}
 </button>
 )}
 {invoiceNotes.length > 0 && <div data-testid="customer-invoice-notes" className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
  <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-indigo-900">Credit / Debit Notes</h3><p className="text-xs text-indigo-700">Official adjustments linked to this invoice</p></div><span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-indigo-700">{invoiceNotes.length}</span></div>
  <div className="mt-3 space-y-2">{invoiceNotes.map(note => <div key={note._id} data-testid={`customer-invoice-note-${note._id}`} className="flex min-w-0 flex-wrap items-center gap-3 rounded-lg bg-white px-3 py-2"><div className="min-w-0 flex-1"><p className="font-mono text-xs font-bold text-gray-800">{note.noteNumber}</p><p className="break-anywhere text-xs capitalize text-gray-500">{note.type} · {note.reason}</p></div><span className="shrink-0 text-sm font-bold text-gray-800">{formatPrice(note.total, settings)}</span><button type="button" onClick={() => downloadAuthoritativeNote(note)} className="shrink-0 rounded-lg p-2 text-indigo-600 hover:bg-indigo-50" title="Download note"><Download size={14} /></button></div>)}</div>
 </div>}
 </div>
 </div>

 {/* Cancel Modal */}
 {showCancelModal && (
 <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setShowCancelModal(false)}>
 <div className="my-3 max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:my-0 sm:max-h-[calc(100dvh-2rem)] sm:p-6" onClick={e => e.stopPropagation()}>
 <div className="text-center mb-5">
 <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
 <AlertTriangle size={24} className="text-red-500" />
 </div>
 <h3 className="font-bold text-lg text-gray-900">Cancel Order #{order.orderNumber}?</h3>
 <p className="text-xs text-gray-500 mt-1">This action cannot be undone</p>
 </div>

 <div className="mb-4">
 <p className="text-sm font-semibold text-gray-700 mb-2">Reason for cancellation</p>
 <div className="space-y-2">
 {cancelReasons.map(r => (
 <label key={r} className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition-all ${selectedReason === r ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}>
 <input type="radio" name="cancelReason" checked={selectedReason === r} onChange={() => setSelectedReason(r)} className="accent-indigo-600" />
 <span className="text-sm text-gray-700">{r}</span>
 </label>
 ))}
 </div>
 </div>

 {order.paymentStatus === 'paid' && order.paymentMethod === 'razorpay' && (
 <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4">
 <p className="text-xs font-semibold text-green-700">Refund Information</p>
 <p className="text-xs text-green-600 mt-1">✓ {formatPrice(order.total, settings)} will be refunded within {refundDays.min}-{refundDays.max} business days</p>
 </div>
 )}

 <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
 <button onClick={() => setShowCancelModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
 Keep Order
 </button>
 <button onClick={handleCancel} disabled={!selectedReason || cancelling} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
 {cancelling && <Loader2 size={14} className="animate-spin" />}
 Confirm Cancellation
 </button>
 </div>
 </div>
 </div>
 )}

 {/* Refund Request Modal */}
 {showRefundModal && (
 <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setShowRefundModal(false)}>
 <div className="my-3 max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:my-0 sm:max-h-[calc(100dvh-2rem)] sm:p-6" onClick={e => e.stopPropagation()}>
 <div className="text-center mb-5">
 <h3 className="font-bold text-lg text-gray-900">Request Refund</h3>
 <p className="text-xs text-gray-500">Order #{order.orderNumber}</p>
 </div>

 {/* Refund Type */}
 <div className="mb-4">
 <p className="text-sm font-semibold text-gray-700 mb-2">Refund Type</p>
 <div className="flex gap-2">
 {['return', 'partial'].map(t => (
 <button key={t} onClick={() => setRefundType(t)} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${refundType === t ? 'bg-indigo-50 border-2 border-indigo-500 text-indigo-700' : 'border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
 {t === 'return' ? 'Full Refund' : 'Partial Refund'}
 </button>
 ))}
 </div>
 </div>

 {/* Partial amount */}
 {refundType === 'partial' && (
 <div className="mb-4">
 <p className="text-sm font-semibold text-gray-700 mb-2">Refund Amount</p>
 <div className="flex items-center gap-2">
 <span className="text-gray-500">{settings?.currencySymbol || '₹'}</span>
 <input type="number" value={refundAmount} onChange={e => setRefundAmount(e.target.value)} max={order.total} className="input py-2 text-sm w-32" placeholder={`Max ${order.total}`} />
 </div>
 </div>
 )}

 {/* Reason */}
 <div className="mb-4">
 <p className="text-sm font-semibold text-gray-700 mb-2">Reason</p>
 <select value={refundReason} onChange={e => setRefundReason(e.target.value)} className="input py-2 text-sm w-full">
 <option value="">Select reason</option>
 <option value="Product defective / damaged">Product defective / damaged</option>
 <option value="Wrong item received">Wrong item received</option>
 <option value="Item not as described">Item not as described</option>
 <option value="Quality not satisfactory">Quality not satisfactory</option>
 <option value="Other">Other</option>
 </select>
 </div>

 {/* Description */}
 <div className="mb-4">
 <p className="text-sm font-semibold text-gray-700 mb-2">Description</p>
 <textarea value={refundDesc} onChange={e => setRefundDesc(e.target.value)} rows={3} className="input py-2 text-sm w-full resize-none" placeholder="Describe the issue..." />
 </div>

 {/* Photo Upload */}
 <div className="mb-5">
 <p className="text-sm font-semibold text-gray-700 mb-2">Attach Photos (optional)</p>
 <div className="flex gap-2 flex-wrap">
 {refundImages.map((f, i) => (
 <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
 <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
 <button onClick={() => setRefundImages(prev => prev.filter((_, idx) => idx !== i))} className="absolute top-0 right-0 bg-red-500 text-white rounded-bl-lg p-0.5">
 <X size={10} />
 </button>
 </div>
 ))}
 {refundImages.length < 3 && (
 <label className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-indigo-400 transition-colors">
 <Upload size={18} className="text-gray-400" />
 <input type="file" accept="image/*" className="hidden" onChange={handleImageAdd} />
 </label>
 )}

 </div>
 <p className="text-[10px] text-gray-400 mt-1">Max 3 photos, 5MB each</p>
 </div>

 <button onClick={handleRefundSubmit} disabled={!refundReason || submittingRefund} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
 {submittingRefund && <Loader2 size={14} className="animate-spin" />}
 Submit Refund Request
 </button>
 <p className="text-center text-[10px] text-gray-400 mt-2">Your request will be reviewed within 24 hours</p>
 </div>
 </div>
 )}

 {/* Return / Replacement Modal */}
 {showReturnModal && (
 <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => !submittingReturn && setShowReturnModal(false)}>
  <div className="my-3 max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:my-0 sm:max-h-[calc(100dvh-2rem)] sm:p-6" onClick={e => e.stopPropagation()} data-testid="customer-return-modal">
   <div className="mb-5"><h3 className="font-bold text-lg text-gray-900">Start return request</h3><p className="text-xs text-gray-500">Order #{order.orderNumber} · return window is checked by the server</p></div>
   <div className="mb-4"><p className="text-sm font-semibold text-gray-700 mb-2">Request type</p><div className="grid grid-cols-3 gap-2">{['return', 'replacement', 'exchange'].map(type => <button type="button" key={type} onClick={() => setReturnType(type)} className={`rounded-xl border px-2 py-2.5 text-xs font-semibold capitalize ${returnType === type ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-600'}`}>{type}</button>)}</div></div>
   <div className="mb-4"><p className="text-sm font-semibold text-gray-700 mb-2">Items</p><div className="space-y-2">{returnItems.map((item, index) => <label key={item.orderItemId || index} className="flex items-center gap-3 rounded-xl border border-gray-100 p-3"><input type="checkbox" checked={item.selected} onChange={event => setReturnItems(current => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, selected: event.target.checked } : entry))} className="h-4 w-4 shrink-0 accent-emerald-600" /><span className="min-w-0 flex-1 break-anywhere text-sm text-gray-700">{item.title || 'Product'}</span><input type="number" min="1" max={item.quantity} value={item.quantity} disabled={!item.selected} onChange={event => setReturnItems(current => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, quantity: Math.max(1, Math.min(entry.quantity, Number(event.target.value) || 1)) } : entry))} className="input w-16 shrink-0 py-1 text-center text-sm" /></label>)}</div></div>
   <div className="mb-4"><label className="text-sm font-semibold text-gray-700 mb-2 block">Reason<select value={returnReason} onChange={event => setReturnReason(event.target.value)} className="input mt-1 w-full"><option value="">Select reason</option><option value="Product defective / damaged">Product defective / damaged</option><option value="Wrong item received">Wrong item received</option><option value="Size or variant issue">Size or variant issue</option><option value="Item not as described">Item not as described</option><option value="Other">Other</option></select></label></div>
   <div className="mb-4"><label className="text-sm font-semibold text-gray-700 mb-2 block">Description<textarea value={returnDescription} onChange={event => setReturnDescription(event.target.value)} rows={3} className="input mt-1 w-full resize-none" placeholder="Tell us what went wrong" /></label></div>
   <div className="mb-5"><label className="text-sm font-semibold text-gray-700 mb-2 block">Photos (optional)<input type="file" accept="image/*" multiple onChange={event => setReturnImages(Array.from(event.target.files || []).slice(0, 3))} className="mt-1 block w-full text-xs text-gray-500" /></label><p className="text-[10px] text-gray-400">Up to 3 photos, 5MB each</p></div>
   <div className="flex flex-col gap-2 sm:flex-row sm:gap-3"><button type="button" onClick={() => setShowReturnModal(false)} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700">Cancel</button><button type="button" onClick={handleReturnSubmit} disabled={submittingReturn} className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{submittingReturn ? 'Submitting…' : 'Submit request'}</button></div>
  </div>
 </div>
 )}
 </div>
 </>
 );
};

export default OrderTrackingPage;
