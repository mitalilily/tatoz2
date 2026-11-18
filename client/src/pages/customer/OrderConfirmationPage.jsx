import { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Package, Truck, MapPin, CreditCard } from 'lucide-react';
import { orderAPI } from '../../services/api';
import { useSite } from '../../context/SiteContext';
import { useSEO } from '../../context/SEOContext';
import { formatPrice } from '../../utils/formatPrice';
import Loader from '../../components/common/Loader';
import SEO from '../../components/common/SEO';
import { trackGoogleAdsConversion } from '../../utils/googleAds';
import { trackMetaPixel } from '../../utils/metaPixel';

const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#f43f5e', '#8b5cf6'];
const Confetti = () => {
  const particles = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      color: COLORS[i % COLORS.length],
      left: `${Math.random() * 100}%`,
      delay: `${Math.random() * 0.5}s`,
      duration: `${1.5 + Math.random() * 1.5}s`,
      size: 6 + Math.random() * 6,
      rotation: Math.random() * 360,
      drift: (Math.random() - 0.5) * 200,
    })), []);

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden" aria-hidden="true">
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-20px) translateX(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) translateX(var(--drift)) rotate(720deg); opacity: 0; }
        }
      `}</style>
      {particles.map(p => (
        <div key={p.id} style={{
          position: 'absolute', top: 0, left: p.left,
          width: p.size, height: p.size * 0.6,
          backgroundColor: p.color,
          borderRadius: 2,
          animationName: 'confetti-fall',
          animationDuration: p.duration,
          animationDelay: p.delay,
          animationTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          animationFillMode: 'forwards',
          '--drift': `${p.drift}px`,
        }} />
      ))}
    </div>
  );
};

const AnimatedCheckmark = () => (
  <>
    <style>{`
      @keyframes check-circle { 0% { stroke-dashoffset: 166; } 100% { stroke-dashoffset: 0; } }
      @keyframes check-mark { 0% { stroke-dashoffset: 48; } 100% { stroke-dashoffset: 0; } }
      @keyframes check-scale { 0% { transform: scale(0.8); opacity: 0; } 50% { transform: scale(1.05); } 100% { transform: scale(1); opacity: 1; } }
      .check-svg { animation: check-scale 0.5s ease-out forwards; }
      .check-circle { stroke-dasharray: 166; stroke-dashoffset: 166; animation: check-circle 0.6s 0.3s ease-out forwards; }
      .check-mark { stroke-dasharray: 48; stroke-dashoffset: 48; animation: check-mark 0.3s 0.8s ease-out forwards; }
    `}</style>
    <svg className="check-svg w-24 h-24 mx-auto" viewBox="0 0 52 52">
      <circle className="check-circle" cx="26" cy="26" r="25" fill="none" stroke="#22c55e" strokeWidth="2" />
      <path className="check-mark" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
    </svg>
  </>
);

const OrderConfirmationPage = () => {
  const { id } = useParams();
  const { settings } = useSite();
  const { seoConfig } = useSEO();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showConfetti, setShowConfetti] = useState(true);

  useEffect(() => {
    orderAPI.getById(id).then(res => {
      const nextOrder = res.data.order;
      setOrder(nextOrder);
      const trackingKey = `tatoz_google_ads_purchase_${nextOrder._id || id}`;
      if (!localStorage.getItem(trackingKey)) {
        const tracked = trackGoogleAdsConversion('purchase', {
          value: nextOrder.total,
          transactionId: nextOrder.orderNumber || nextOrder._id || id,
          items: (nextOrder.items || []).map(item => ({
            item_id: item.product?._id || item.product || item.sku,
            item_name: item.title,
            price: item.price,
            quantity: item.quantity,
          })),
        });
        if (tracked) localStorage.setItem(trackingKey, '1');
      }
    }).catch(console.error).finally(() => setLoading(false));
    const timer = setTimeout(() => setShowConfetti(false), 4000);
    return () => clearTimeout(timer);
  }, [id]);

  // Wait for the public SEO config before recording the conversion. The
  // order request can resolve before SEOProvider has delivered the Pixel ID;
  // keeping this in a separate effect prevents a purchase from being marked
  // as tracked while Meta is still unconfigured.
  useEffect(() => {
    const pixelId = seoConfig?.analytics?.fbPixel;
    if (!order || !pixelId) return;

    const metaTrackingKey = `tatoz_meta_pixel_purchase_${order._id || id}`;
    if (localStorage.getItem(metaTrackingKey)) return;

    const tracked = trackMetaPixel('Purchase', {
      content_ids: (order.items || []).map(item => String(item.product?._id || item.product || item.sku || '')).filter(Boolean),
      content_type: 'product',
      contents: (order.items || []).map(item => ({
        id: String(item.product?._id || item.product || item.sku || ''),
        quantity: Number(item.quantity || 0),
        item_price: Number(item.price || 0),
      })).filter(item => item.id),
      value: Number(order.total || 0),
      currency: 'INR',
      order_id: order.orderNumber || order._id || id,
    }, { eventId: `purchase-${order._id || id}` });
    if (tracked) localStorage.setItem(metaTrackingKey, '1');
  }, [id, order, seoConfig?.analytics?.fbPixel]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader size="lg" /></div>;
  if (!order) return null;

  return (
    <>
      <SEO title="Order Confirmed" noindex={true} />
      {showConfetti && <Confetti />}
      <div className="page-container py-8 sm:py-12">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <AnimatedCheckmark />
            <h1 className="text-3xl font-black text-gray-900 mt-4 mb-2" style={{ animation: 'check-scale 0.4s 1s ease-out both' }}>
              Thank You!
            </h1>
            <p className="text-gray-500" style={{ animation: 'check-scale 0.4s 1.2s ease-out both' }}>
              Your order has been placed successfully
            </p>
          </div>

          <div className="card p-4 sm:p-6 mb-5" style={{ animation: 'check-scale 0.4s 1.4s ease-out both' }}>
            <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
              <div className="min-w-0">
                <p className="text-sm text-gray-500">Order Number</p>
                <p className="text-xl font-black text-primary-600">#{order.orderNumber}</p>
              </div>
              <div className="ml-auto text-left sm:text-right">
                <p className="text-sm text-gray-500">Order Total</p>
                <p className="text-xl font-black text-gray-900">{formatPrice(order.total, settings)}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-5">
              {[
                { icon: Package, label: 'Status', value: ({ pending: 'NEW', confirmed: 'CONFIRMED', processing: 'PROCESSING', packed: 'PACKED', ready_to_ship: 'READY TO SHIP', shipped: 'SHIPPED', out_for_delivery: 'OUT FOR DELIVERY', failed_delivery: 'FAILED DELIVERY', rto: 'RTO', partially_fulfilled: 'PARTIALLY FULFILLED', delivered: 'DELIVERED', return_requested: 'RETURN REQUESTED', refund_requested: 'REFUND REQUESTED', returned: 'RETURNED', partially_refunded: 'PARTIALLY REFUNDED', refunded: 'REFUNDED', cancelled: 'CANCELLED' }[order.orderStatus] || order.orderStatus.replace(/_/g, ' ').toUpperCase()) },
                { icon: CreditCard, label: 'Payment', value: order.paymentMethod.toUpperCase() },
                { icon: MapPin, label: 'City', value: order.shippingAddress?.city },
                { icon: Truck, label: 'Est. Delivery', value: '3-7 Business Days' },
              ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="bg-gray-50 rounded-xl p-3 flex min-w-0 items-start gap-3">
                  <Icon size={18} className="mt-0.5 shrink-0 text-primary-600" />
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className="text-sm font-semibold text-gray-800 capitalize">{value}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-100 pt-4">
              <h3 className="font-semibold text-gray-900 mb-3">Items Ordered</h3>
              <div className="space-y-2">
                {order.items?.map((item, i) => (
                  <div key={i} className="flex min-w-0 items-center gap-3" style={{ animation: `check-scale 0.3s ${1.6 + i * 0.1}s ease-out both` }}>
                    <img src={item.image || 'https://via.placeholder.com/48'} alt={item.title}
                      className="w-12 h-12 object-cover rounded-lg flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="break-anywhere text-sm font-medium text-gray-800">{item.title}</p>
                      <p className="text-xs text-gray-500">Qty: {item.quantity} x {formatPrice(item.price, settings)}</p>
                      {item.itemType === 'bundle' && <div className="mt-1 space-y-0.5 text-[11px] text-indigo-600">{(item.bundleComponents || []).slice(0, 4).map((component, componentIndex) => <p key={`${component.product}-${componentIndex}`} className="truncate">• {component.title} × {Number(component.quantity || 1) * Number(item.quantity || 1)}</p>)}{(item.bundleComponents || []).length > 4 && <p>+{item.bundleComponents.length - 4} more components</p>}</div>}
                    </div>
                    <p className="shrink-0 text-sm font-semibold">{formatPrice(item.price * item.quantity, settings)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-primary-600 to-purple-600 rounded-2xl p-6 text-white text-center mb-5"
            style={{ animation: 'check-scale 0.4s 1.8s ease-out both' }}>
            <Truck size={32} className="mx-auto mb-2 opacity-90" />
            <h3 className="font-bold text-lg mb-1">Track Your Order</h3>
            <p className="text-white/80 text-sm mb-4">Get real-time updates on your delivery status</p>
            <Link to={`/orders/${order._id}`} className="bg-white text-primary-600 font-bold px-6 py-2.5 rounded-xl inline-block hover:shadow-lg transition-all">
              Track Order
            </Link>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center" style={{ animation: 'check-scale 0.4s 2s ease-out both' }}>
            <Link to="/" className="btn-secondary flex w-full items-center justify-center gap-2 sm:w-auto">Continue Shopping</Link>
            <Link to="/orders" className="btn-primary flex w-full items-center justify-center gap-2 sm:w-auto"><Package size={16} />My Orders</Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default OrderConfirmationPage;
