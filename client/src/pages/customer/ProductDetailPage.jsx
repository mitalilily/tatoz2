import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Star, Heart, ShoppingCart, Zap, Shield, Truck, RotateCcw, Share2, ChevronLeft, ChevronRight, Minus, Plus, Check, MapPin, CreditCard, Loader2, ThumbsUp, Flag, BadgeCheck, Eye, Flame, Package, Layers, Gift, Users, Tag } from 'lucide-react';
import { productAPI, reviewAPI, referralAPI, questionAPI, stockAlertAPI, priceDropAlertAPI, shippingAPI, paymentAPI } from '../../services/api';
import { Bell, MessageCircle, Send as SendIcon } from 'lucide-react';
import { useSite } from '../../context/SiteContext';
import { useSEO } from '../../context/SEOContext';
import { PLATFORM_NAME } from '../../constants/branding';
import SEO from '../../components/common/SEO';
import { buildProductSchema, buildOrganizationSchema } from '../../utils/structuredData';
import { formatPrice } from '../../utils/formatPrice';
import { trackMetaPixel } from '../../utils/metaPixel';
import { requestAddToCart } from '../../store/slices/cartSlice';
import { toggleWishlist } from '../../store/slices/authSlice';
import ProductCard from '../../components/product/ProductCard';
import ImageZoom from '../../components/product/ImageZoom';
import Loader from '../../components/common/Loader';
import toast from 'react-hot-toast';
import Cookies from 'js-cookie';

// Live range counters for the CRO strip. Admin sets a Min–Max range per
// signal; sales signals start at a random point inside it and slowly climb
// toward Max, while stock counts down toward Min. Falls back to the legacy
// fixed value when no usable range is set, and stays static when the user
// prefers reduced motion.
const rangeOf = (config = {}, legacy = 0, direction = 'up') => {
 const min = Math.max(0, Math.floor(Number(config.min || 0)));
 const max = Math.max(0, Math.floor(Number(config.max || 0)));
 if (max > min) return { base: direction === 'down' ? max : min, min, max, live: true, direction };
 return { base: Math.max(0, Math.floor(Number(legacy || 0))), min: 0, max: 0, live: false, direction };
};

// Static stat numbers for the CRO strip — no interval re-renders, no rAF
// animations. Values paint once with the page.
const useLiveCount = range => range.base;

const AnimatedNumber = ({ value }) => <>{Number(value || 0)}</>;

// ── Delivery Check Component ──────────────────────────────────────────────────
const DeliveryCheck = () => {
  const [pincode, setPincode] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);
  const [autoDetected, setAutoDetected] = useState(false);

  // Auto-detect pincode via geolocation API
  useEffect(() => {
    // Local browser runs (including the isolated Selenium stack) do not have a
    // trustworthy public IP and third-party IP APIs commonly reject localhost
    // origins with CORS/rate-limit errors. Keep the manual pincode check fully
    // available and defer auto-detection until the storefront is public.
    if (['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)) return;
    fetch('https://ipapi.co/json/')
      .then(r => r.json())
      .then(data => {
        if (data.postal) {
          setPincode(data.postal);
          setAutoDetected(true);
          // Auto-check delivery for detected pincode
          setChecking(true);
          shippingAPI.checkDelivery(data.postal)
            .then(res => setResult(res.data))
            .catch(() => {})
            .finally(() => setChecking(false));
        }
      })
      .catch(() => {});
  }, []);

  const handleCheck = async () => {
    if (!pincode || pincode.length !== 6) return;
    setChecking(true);
    setResult(null);
    try {
      const res = await shippingAPI.checkDelivery(pincode);
      setResult(res.data);
    } catch { setResult({ deliverable: false }); }
    finally { setChecking(false); }
  };

  const getDeliveryDate = (days) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <MapPin size={20} className="text-violet-600 flex-shrink-0" />
        <input type="text" value={pincode} onChange={e => { setPincode(e.target.value.replace(/\D/g, '').slice(0, 6)); setResult(null); }}
          className="input min-w-0 flex-1 rounded-xl border-slate-200 py-2.5 text-sm" placeholder="Enter pincode" maxLength={6}
          onKeyDown={e => e.key === 'Enter' && handleCheck()} />
        <button onClick={handleCheck} disabled={checking || pincode.length !== 6}
          className="shrink-0 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap sm:px-5">
          {checking ? <Loader2 size={14} className="animate-spin" /> : 'Check'}
        </button>
      </div>
      {result && result.deliverable && result.estimatedDays && (
        <p className="mt-1.5 flex items-center gap-1 pl-7 text-xs font-semibold text-green-600">
          <Truck size={13} /> Delivery by {getDeliveryDate(result.estimatedDays)}
        </p>
      )}
      {result && !result.deliverable && (
        <p className="mt-1.5 pl-7 text-xs font-semibold text-red-500">Delivery not available for this pincode</p>
      )}
    </div>
  );
};

import { BANK_LOGOS } from '../../assets/bank-logos';

// ── Razorpay Offers Component ─────────────────────────────────────────────────

const RazorpayOffers = ({ price }) => {
  const [offers, setOffers] = useState(null);
  const [rzpKey, setRzpKey] = useState(null);
  const [emiMonths, setEmiMonths] = useState(3);

  useEffect(() => {
    paymentAPI.getActiveGateways()
      .then(res => {
        const gw = res.data.gateways?.find(g => g.id === 'razorpay');
        if (gw?.key_id) setRzpKey(gw.key_id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!rzpKey || !price) return;

    const bankOffers = [
      { bank: 'HDFC Bank', discount: '10% Instant Discount', desc: 'Credit cards', min: 1000 },
      { bank: 'ICICI Bank', discount: '5% Cashback', desc: 'Debit & credit cards', min: 500 },
      { bank: 'Axis Bank', discount: 'No Cost EMI', desc: 'Credit cards', min: 300 },
      { bank: 'SBI', discount: '₹100 Off', desc: 'Credit cards', min: 1500 },
      { bank: 'Kotak', discount: '7.5% Cashback', desc: 'Debit cards', min: 800 },
    ].filter(o => price >= o.min);

    const walletOffers = [
      { name: 'Paytm', offer: 'Flat ₹50 cashback', min: 500 },
      { name: 'PhonePe', offer: 'Up to ₹100 cashback', min: 300 },
      { name: 'Amazon Pay', offer: '10% back up to ₹75', min: 400 },
    ].filter(o => price >= o.min);

    setOffers({ bank: bankOffers, wallets: walletOffers });
  }, [rzpKey, price]);

  const emiAmount = Math.ceil(price / emiMonths);

  if (!rzpKey || !price) return null;
  const hasOffers = offers && (offers.bank.length > 0 || offers.wallets?.length > 0);

  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
        <CreditCard size={16} className="text-primary-600" />Payment Offers
      </h3>

      {/* EMI Slider */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-gray-500">EMI Options</p>
          <p className="text-sm font-bold text-indigo-700">₹{emiAmount.toLocaleString('en-IN')}<span className="text-xs font-normal text-indigo-500">/mo</span></p>
        </div>
        <style>{`
          .emi-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 6px; border-radius: 3px; background: linear-gradient(to right, #818cf8 0%, #818cf8 var(--val), #e0e7ff var(--val), #e0e7ff 100%); outline: none; }
          .emi-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%; background: #6366f1; border: 3px solid white; cursor: grab; }
          .emi-slider::-moz-range-thumb { width: 20px; height: 20px; border-radius: 50%; background: #6366f1; border: 3px solid white; cursor: grab; }
        `}</style>
        <input type="range" min={3} max={24} step={3} value={emiMonths}
          onChange={e => setEmiMonths(Number(e.target.value))}
          className="emi-slider"
          style={{ '--val': `${((emiMonths - 3) / 21) * 100}%` }} />
        <div className="flex justify-between mt-1">
          {[3, 6, 9, 12, 15, 18, 21, 24].map(m => (
            <span key={m} className={`text-xs cursor-pointer ${emiMonths === m ? 'text-indigo-600 font-bold' : 'text-gray-400'}`}
              onClick={() => setEmiMonths(m)}>{m}</span>
          ))}
        </div>
      </div>

      {/* Bank Offers Grid */}
      {hasOffers && offers.bank.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Bank Offers</p>
          <div className="grid grid-cols-2 gap-2">
            {offers.bank.map(offer => (
              <div key={offer.bank} className="flex items-center gap-2.5 p-2.5 bg-gray-50 border border-gray-100 rounded-lg">
                <img src={BANK_LOGOS[offer.bank]} alt={offer.bank}
                  className="w-9 h-9 rounded-lg object-contain bg-white p-1 border border-gray-200 flex-shrink-0"
                  onError={e => { e.target.style.display = 'none'; }} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-800 leading-tight">{offer.discount}</p>
                  <p className="text-xs text-gray-400">{offer.bank}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Wallet & UPI Grid */}
      {offers?.wallets?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Wallet & UPI</p>
          <div className="grid grid-cols-3 gap-2">
            {offers.wallets.map(w => (
              <div key={w.name} className="flex flex-col items-center text-center p-2.5 bg-gray-50 border border-gray-100 rounded-lg">
                <img src={BANK_LOGOS[w.name]} alt={w.name}
                  className="w-8 h-8 rounded-lg object-contain bg-white p-0.5 border border-gray-200 mb-1"
                  onError={e => { e.target.style.display = 'none'; }} />
                <p className="text-xs font-semibold text-gray-700 leading-tight">{w.offer}</p>
                <p className="text-xs text-gray-400">{w.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Renders product description — plain HTML or full AI-generated HTML/CSS/JS landing page.
// Uses postMessage to auto-size the iframe without needing allow-same-origin.
const DescriptionFrame = ({ html }) => {
  const iframeRef = useRef(null);
  const [height, setHeight] = useState(300);

  // Listen for height reports from inside the iframe
  useEffect(() => {
    const onMessage = (e) => {
      if (e.data?.type === 'pc-height' && typeof e.data.height === 'number') {
        setHeight(Math.min(8000, Math.max(200, e.data.height)));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const isFullDoc = html && (html.trimStart().startsWith('<!DOCTYPE') || html.trimStart().startsWith('<html'));
  const isRichHTML = html && (html.includes('<style') || html.includes('<script') || html.includes('<div') || html.includes('<section'));

  // Replace vh units with fixed px so 100vh doesn't scale with iframe height (feedback loop).
  // 1vh = 6px → 100vh = 600px (sensible hero height, no loop possible).
  const freezeVh = (s) => s ? s.replace(/(\d*\.?\d+)\s*vh/gi, (_, n) => `${Math.round(parseFloat(n) * 6)}px`) : s;

  // Reports height at fixed intervals after load — no ResizeObserver to avoid feedback loops.
  // (ResizeObserver caused: iframe grows → 100vh grows → body grows → observer fires → repeat)
  const heightReporter = `<script>
    function reportHeight(){
      var b=document.body,d=document.documentElement;
      var h=Math.min(8000,Math.max(b.scrollHeight,b.offsetHeight,d.scrollHeight,d.offsetHeight,d.clientHeight));
      window.parent.postMessage({type:'pc-height',height:h},'*');
    }
    window.addEventListener('load',function(){
      [300,700,1300,2200,4000].forEach(function(d){setTimeout(reportHeight,d);});
    });
  <\/script>`;

  // Viewport meta ensures content scales to iframe width, not 980px virtual desktop.
  const viewportMeta = '<meta name="viewport" content="width=device-width,initial-scale=1.0">';
  // Neutralise vh/vw units and prevent horizontal overflow.
  // height:auto on html+body breaks the 100vh feedback loop (iframe height = content height = vh → grows forever).
  const layoutFix = `<style>
    html{height:auto!important;overflow-x:hidden!important;}
    body{height:auto!important;overflow-x:hidden!important;max-width:100%!important;}
    *{box-sizing:border-box;}
    img,video,canvas,iframe{max-width:100%!important;}
  </style>`;

  let srcDoc;
  if (isFullDoc) {
    let doc = freezeVh(html);
    if (!/<meta[^>]*viewport/i.test(doc)) {
      doc = doc.replace(/(<head[^>]*>)/i, `$1${viewportMeta}`);
    }
    doc = doc.replace(/(<\/head>)/i, `${layoutFix}$1`);
    srcDoc = doc.replace(/<\/body>/i, heightReporter + '</body>');
  } else if (isRichHTML) {
    srcDoc = `<!DOCTYPE html><html><head><meta charset="utf-8">${viewportMeta}${layoutFix}</head><body style="margin:0;padding:0">${html}${heightReporter}</body></html>`;
  } else {
    srcDoc = `<!DOCTYPE html><html><head><meta charset="utf-8">${viewportMeta}<style>
      html,body{height:auto;overflow-x:hidden;max-width:100%;}
      body{font-family:system-ui,-apple-system,sans-serif;color:#374151;line-height:1.8;padding:16px 0;margin:0;font-size:15px}
      p{margin:0 0 .85em}h2,h3{font-weight:700;margin:1.2em 0 .4em}
      ul{padding-left:1.4em}li{margin:.3em 0}img{max-width:100%}
    </style></head><body>${html || '<p>No description provided.</p>'}${heightReporter}</body></html>`;
  }

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcDoc}
      title="Product description"
      sandbox="allow-scripts"
      style={{ width: '100%', border: 'none', display: 'block', height }}
    />
  );
};

const ProductDetailPage = () => {
 const { slug } = useParams();
 const dispatch = useDispatch();
 const navigate = useNavigate();
 const { settings } = useSite();
 const { seoConfig } = useSEO();
 const { user, isAuthenticated } = useSelector(state => state.auth);
 const { referralCode } = useSelector(state => state.cart);

 const [product, setProduct] = useState(null);
 const [reviews, setReviews] = useState([]);
 const [reviewStats, setReviewStats] = useState(null);
 const [reviewForm, setReviewForm] = useState({ rating: 5, title: '', comment: '', images: '', videos: '' });
 const [reviewSubmitting, setReviewSubmitting] = useState(false);
 const [reviewActionId, setReviewActionId] = useState(null);
 const [loading, setLoading] = useState(true);
 const [selectedImage, setSelectedImage] = useState(0);
 const [quantity, setQuantity] = useState(1);
 const [openFaq, setOpenFaq] = useState(null);
 const productOverviewRef = useRef(null);
 const [showFloatingActions, setShowFloatingActions] = useState(false);
 const [related, setRelated] = useState([]);
 const [selectedVariants, setSelectedVariants] = useState({});

 const isWishlisted = user?.wishlist?.some(id => id === product?._id || id?._id === product?._id);

 useEffect(() => {
 const fetchProduct = async () => {
 setLoading(true);
 try {
 const res = await productAPI.getBySlug(slug);
 const p = res.data.product;
 setProduct(p);

 // Track referral visit if ref param present
 const urlRef = new URLSearchParams(window.location.search).get('ref');
 if (urlRef) {
 referralAPI.trackClick(urlRef, `/product/${slug}`).catch(() => {});
 }

 // Fetch reviews
 const revRes = await reviewAPI.getByProduct(p._id, { limit: 5 });
 setReviews(revRes.data.reviews);
 setReviewStats(revRes.data.stats);

 // Recommendations are server-managed. The API keeps a category fallback so
 // storefronts still render useful discovery before an admin creates rules.
 const relRes = await productAPI.getRecommendations(slug, { type: 'related', limit: 4 });
 setRelated((relRes.data.products || []).filter(rp => rp._id !== p._id).slice(0, 4));
 } catch (err) {
 toast.error(err.message || 'Product not found');
 } finally {
 setLoading(false);
 }
 };
 fetchProduct();
 }, [slug]);

 useEffect(() => {
  if (!product?._id) return;
 trackMetaPixel('ViewContent', {
   content_ids: [String(product._id)],
   content_type: 'product',
   content_name: product.title,
   value: Number(product.price || 0),
  currency: 'INR',
 });
 }, [product]);

 // Save to recently viewed
 useEffect(() => {
 if (!product) return;
 try {
 const key = 'tatoz_recently_viewed';
 const stored = JSON.parse(localStorage.getItem(key) || '[]');
 const entry = { _id: product._id, title: product.title, slug: product.slug, thumbnail: product.thumbnail || product.images?.[0]?.url, price: product.price, comparePrice: product.comparePrice, discount: product.discount, stock: product.stock, brand: product.brand?.name ? { name: product.brand.name } : undefined, category: product.category?.name ? { name: product.category.name } : undefined, ratings: product.ratings?.count ? { average: product.ratings.average, count: product.ratings.count } : undefined };
 const updated = [entry, ...stored.filter(p => p._id !== product._id)].slice(0, 12);
 localStorage.setItem(key, JSON.stringify(updated));
 } catch {}
 }, [product]);

 const [recentlyViewed] = useState(() => {
 try { return JSON.parse(localStorage.getItem('tatoz_recently_viewed') || '[]'); } catch { return []; }
 });

 // Q&A state
 const [questions, setQuestions] = useState([]);
 const [questionInput, setQuestionInput] = useState('');
 const [answerInputs, setAnswerInputs] = useState({});
 const [questionsLoading, setQuestionsLoading] = useState(false);

 // Stock alert state
 const [stockAlertSubscribed, setStockAlertSubscribed] = useState(false);
 const [stockAlertEmail, setStockAlertEmail] = useState('');
 const [stockAlertLoading, setStockAlertLoading] = useState(false);
 const [priceDropSubscribed, setPriceDropSubscribed] = useState(false);
 const [priceDropLoading, setPriceDropLoading] = useState(false);

 // Fetch Q&A when product loads
 useEffect(() => {
 if (!product?.slug) return;
 setQuestionsLoading(true);
 questionAPI.getQuestions(product.slug, { limit: 10 }).then(r => setQuestions(r.data.questions || [])).catch(() => {}).finally(() => setQuestionsLoading(false));
 }, [product?.slug]);

 // Check stock alert status
 useEffect(() => {
 if (!product?.slug || product.stock > 0) return;
 stockAlertAPI.check(product.slug).then(r => setStockAlertSubscribed(r.data.subscribed)).catch(() => {});
 }, [product?.slug, product?.stock]);

 useEffect(() => {
  if (!product?.slug || !isAuthenticated) {
   setPriceDropSubscribed(false);
   return;
  }
  priceDropAlertAPI.check(product.slug).then(r => setPriceDropSubscribed(Boolean(r.data.subscribed))).catch(() => {});
 }, [product?.slug, isAuthenticated]);

 useEffect(() => {
  setSelectedImage(0);
 }, [selectedVariants]);

 // Keep the mobile pricing bar out of the opening product/CRO experience.
 // It becomes useful only after the complete overview has been scrolled past.
 useEffect(() => {
  const overview = productOverviewRef.current;
  if (!overview) return undefined;
  let lastPassed;
  setShowFloatingActions(false);
  const updateFloatingVisibility = () => {
   const passed = overview.getBoundingClientRect().bottom <= 0;
   const actions = document.querySelector('[data-testid="product-floating-actions"]');
   if (actions) {
    if (passed) {
     actions.classList.remove('hidden');
     actions.classList.remove('lg:block');
    } else {
     actions.classList.add('hidden');
     actions.classList.add('lg:block');
    }
    if (window.matchMedia?.('(max-width: 767px)').matches) {
     actions.style.setProperty('display', passed ? 'block' : 'none', 'important');
    } else {
     actions.style.removeProperty('display');
    }
   }
   if (passed !== lastPassed) {
    lastPassed = passed;
    setShowFloatingActions(passed);
   }
  };
  // No rAF loop: passive scroll/resize listeners are enough and cost nothing at rest.
  updateFloatingVisibility();
  window.addEventListener('scroll', updateFloatingVisibility, { passive: true });
  document.addEventListener('scroll', updateFloatingVisibility, { passive: true });
  window.addEventListener('resize', updateFloatingVisibility);
  return () => {
   window.removeEventListener('scroll', updateFloatingVisibility);
   document.removeEventListener('scroll', updateFloatingVisibility);
   window.removeEventListener('resize', updateFloatingVisibility);
  };
 }, [product, loading]);

 const handleAskQuestion = async () => {
 if (!questionInput.trim() || !isAuthenticated) return;
 try {
 await questionAPI.ask(product.slug, questionInput.trim());
 setQuestionInput('');
 const r = await questionAPI.getQuestions(product.slug, { limit: 10 });
 setQuestions(r.data.questions || []);
 toast.success('Question posted!');
 } catch (err) { toast.error(err.response?.data?.message || 'Failed to post question'); }
 };

 const handleAnswerQuestion = async (qId) => {
 const text = answerInputs[qId]?.trim();
 if (!text || !isAuthenticated) return;
 try {
 await questionAPI.answer(product.slug, qId, text);
 setAnswerInputs(prev => ({ ...prev, [qId]: '' }));
 const r = await questionAPI.getQuestions(product.slug, { limit: 10 });
 setQuestions(r.data.questions || []);
 toast.success('Answer posted!');
 } catch (err) { toast.error(err.response?.data?.message || 'Failed to post answer'); }
 };

 const reloadReviews = async () => {
  if (!product?._id) return;
  const response = await reviewAPI.getByProduct(product._id, { limit: 5 });
  setReviews(response.data.reviews || []);
  setReviewStats(response.data.stats || null);
 };

const handleReviewSubmit = async () => {
  if (!product?._id) return;
  if (!reviewForm.comment.trim()) { toast.error('Review comment is required'); return; }
  setReviewSubmitting(true);
  try {
   await reviewAPI.create({
    product: product._id,
    rating: Number(reviewForm.rating),
    title: reviewForm.title,
    comment: reviewForm.comment,
    images: reviewForm.images.split(',').map(value => value.trim()).filter(Boolean),
    videos: reviewForm.videos.split(',').map(value => value.trim()).filter(Boolean),
   });
   setReviewForm({ rating: 5, title: '', comment: '', images: '', videos: '' });
   toast.success('Review submitted for moderation');
   await reloadReviews();
  } catch (err) { toast.error(err.response?.data?.message || 'Failed to submit review'); }
  finally { setReviewSubmitting(false); }
 };

 const handleReviewHelpful = async (reviewId) => {
  setReviewActionId(reviewId);
  try { await reviewAPI.helpful(reviewId); await reloadReviews(); }
  catch (err) { toast.error(err.response?.data?.message || 'Failed to update helpful vote'); }
  finally { setReviewActionId(null); }
 };

 const handleReviewReport = async (reviewId) => {
  setReviewActionId(reviewId);
  try { await reviewAPI.report(reviewId, { reason: 'shopper_reported' }); toast.success('Review reported to the store team'); }
  catch (err) { toast.error(err.response?.data?.message || 'Failed to report review'); }
  finally { setReviewActionId(null); }
 };

 const handleStockAlert = async () => {
 const email = isAuthenticated ? user.email : stockAlertEmail;
 if (!email && !(isAuthenticated && user.phone)) return toast.error('Email or a verified phone account is required');
 setStockAlertLoading(true);
 try {
 await stockAlertAPI.subscribe(product.slug, email);
 setStockAlertSubscribed(true);
 toast.success('You\'ll be notified when this product is back in stock!');
 } catch (err) { toast.error(err.response?.data?.message || 'Failed to subscribe'); }
 finally { setStockAlertLoading(false); }
 };

 const handlePriceDropAlert = async () => {
  if (!isAuthenticated) {
   navigate(`/login?redirect=${encodeURIComponent(`/product/${product.slug}`)}`);
   return;
  }
  setPriceDropLoading(true);
  try {
   if (priceDropSubscribed) {
    await priceDropAlertAPI.unsubscribe(product.slug);
    setPriceDropSubscribed(false);
    toast.success('Price-drop alert removed');
   } else {
    await priceDropAlertAPI.subscribe(product.slug);
    setPriceDropSubscribed(true);
    toast.success('We\'ll notify you when the price drops');
   }
  } catch (err) { toast.error(err.response?.data?.message || 'Failed to update price-drop alert'); }
  finally { setPriceDropLoading(false); }
 };

 // Live CRO counters must hook before the early returns below. Ranges read
 // from the still-null product resolve to a static zero until it loads.
 const liveCRO = product?.cro || {};
 const liveSocial = useLiveCount(rangeOf(liveCRO.socialProof, liveCRO.socialProof?.count));
 const liveStockLeft = useLiveCount(rangeOf(liveCRO.stockDisplay, liveCRO.stockDisplay?.value, 'down'));
 const liveSold = useLiveCount(rangeOf(liveCRO.soldDisplay, liveCRO.soldDisplay?.count));
 const liveVisitors = useLiveCount(rangeOf(liveCRO.visitorDisplay, liveCRO.visitorDisplay?.count));

 // Product starts as null. Guard before evaluating variant pricing so the
 // initial render cannot read product.price before the request completes.
 if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader size="lg" /></div>;
 if (!product) return <div className="page-container py-16 text-center"><h2 className="text-2xl font-bold text-gray-600">Product not found</h2></div>;

 const hasVariants = product?.variants?.length > 0;
 const allVariantsSelected = !hasVariants || product.variants.every(v => selectedVariants[v.name]);

 // A selected option can override both selling price and images. Keep the old
 // priceModifier behavior as a fallback for products created before variant pricing.
 const selectedVariantOptions = hasVariants
  ? product.variants.map(v => v.options.find(o => o.value === selectedVariants[v.name])).filter(Boolean)
  : [];
 const pricedVariant = [...selectedVariantOptions].reverse().find(option => option.price !== undefined && option.price !== null && option.price !== '');
 const variantPriceModifier = selectedVariantOptions.reduce((sum, option) => sum + Number(option.priceModifier || 0), 0);
 const variantSellingPrice = pricedVariant ? Number(pricedVariant.price) : Number(product.price || 0) + variantPriceModifier;
 const variantMrp = pricedVariant?.comparePrice ? Number(pricedVariant.comparePrice) : Number(product.comparePrice || 0);
 const variantDiscount = pricedVariant?.discount !== undefined && pricedVariant?.discount !== null
  ? Number(pricedVariant.discount)
  : (variantMrp > variantSellingPrice ? Math.round(((variantMrp - variantSellingPrice) / variantMrp) * 100) : Number(product.discount || 0));
 const variantImages = pricedVariant?.images?.length > 0 ? pricedVariant.images : null;
 const bulkTiers = product.bulkOrderEnabled
  ? [...(product.bulkOrderTiers || [])].sort((left, right) => Number(left.minQuantity) - Number(right.minQuantity))
  : [];

 const buildVariantPayload = () => {
 if (!hasVariants) return undefined;
 return Object.entries(selectedVariants).reduce((acc, [name, value]) => {
 acc[name] = value;
 return acc;
 }, {});
 };

 const handleAddToCart = () => {
 if (hasVariants && !allVariantsSelected) {
 toast.error('Please select all options');
 return;
 }
 dispatch(requestAddToCart({ product, quantity, variant: buildVariantPayload(), source: 'product-detail' }));
 };

 const handleBuyNow = async () => {
 if (hasVariants && !allVariantsSelected) {
 toast.error('Please select all options');
 return;
 }
 const result = await dispatch(requestAddToCart({
  product,
  quantity,
  variant: buildVariantPayload(),
  source: 'buy-now',
  afterSuccessPath: '/checkout',
  openCart: false,
 }));
 if (result?.added) navigate('/checkout');
 };

 const handleWishlist = () => {
 if (!isAuthenticated) { toast.error('Please login first'); return; }
 dispatch(toggleWishlist(product._id));
 };

 const handleShare = () => {
 const refCode = referralCode || Cookies.get('ref_code');
 const url = `${window.location.href}${refCode ? `?ref=${refCode}` : ''}`;
 navigator.clipboard.writeText(url);
 toast.success('Link copied to clipboard!');
 };

 const activeBulkTier = bulkTiers.filter(tier => Number(tier.minQuantity) <= quantity).at(-1);
 const nextBulkTier = bulkTiers.find(tier => Number(tier.minQuantity) > quantity);
 const sellingPrice = activeBulkTier ? Number(activeBulkTier.price) : variantSellingPrice;
 const mrp = variantMrp || sellingPrice;
 const discountedPrice = sellingPrice;
 const cro = product.cro || {};
 const displayRating = cro.customRating?.enabled ? Number(cro.customRating.value || 0) : Number(product.ratings?.average || 0);
 const displayReviewCount = cro.customRating?.enabled ? Number(cro.customRating.reviewCount || 0) : Number(product.ratings?.count || 0);
 const displayStock = cro.stockDisplay?.enabled ? liveStockLeft : Number(product.stock || 0);
 const displaySold = cro.soldDisplay?.enabled ? liveSold : Number(product.soldStock || product.totalSales || 0);
 const displayReasons = (cro.reasonsToBuy || []).filter(Boolean).slice(0, 4);
 const reasonsTitle = String(cro.reasonsTitle || '').trim() || 'Why you’ll love it';
 const displayBenefits = (cro.benefits || []).filter(Boolean).length ? cro.benefits.filter(Boolean) : (product.attributes?.features || []).filter(Boolean);
 const socialProofLabels = { '24h': 'in the last 24 hours', '48h': 'in the last 48 hours', '7d': 'in the last week' };
 const socialProofLabel = cro.socialProof?.period === 'custom'
  ? (cro.socialProof.customLabel || 'recently')
  : (socialProofLabels[cro.socialProof?.period] || socialProofLabels['24h']);
 const images = (variantImages || (product.images?.length > 0 ? product.images : [{ url: product.thumbnail || 'https://via.placeholder.com/600', alt: product.title }]))
  .map(image => typeof image === 'string' ? { url: image, alt: product.title } : image)
  .filter(image => image?.url);

 const productSchema = buildProductSchema(product, settings, seoConfig.canonicalBase, reviewStats);
 const organizationSchema = buildOrganizationSchema(seoConfig.schemas?.organization || { name: settings?.siteName || PLATFORM_NAME, url: seoConfig.canonicalBase || window.location.origin });
 const productUrl = product.seo?.canonical || (seoConfig.canonicalBase ? `${seoConfig.canonicalBase}/product/${product.slug}` : `${window.location.origin}/product/${product.slug}`);
 const webPageSchema = { '@context': 'https://schema.org', '@type': 'WebPage', name: product.seo?.metaTitle || product.title, url: productUrl, isPartOf: { '@type': 'WebSite', url: seoConfig.canonicalBase || window.location.origin } };
 const breadcrumbItems = [
 { name: 'Home', url: '/' },
 ...(product.category ? [{ name: product.category.name, url: `/category/${product.category.slug}` }] : []),
 { name: product.title, url: `/product/${product.slug}` },
 ];

 return (
 <div className="min-h-screen bg-slate-100 pb-36 md:pb-0">
 <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
 <SEO
 title={product.seo?.metaTitle || product.title}
 description={product.seo?.metaDescription || product.shortDescription || product.description?.replace(/<[^>]+>/g, '').substring(0, 160)}
 keywords={product.seo?.keywords}
 ogImage={product.seo?.ogImage || images[0]?.url}
 ogTitle={product.seo?.ogTitle}
 ogDescription={product.seo?.ogDescription}
 ogType="product"
 canonical={product.seo?.canonical || undefined}
 robots={product.seo?.robots || 'index, follow'}
 breadcrumbs={breadcrumbItems}
 jsonLd={[productSchema, organizationSchema, webPageSchema].filter(Boolean)}
 />
 <div ref={productOverviewRef} id="pdp-overview" className="grid scroll-mt-28 items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,6fr)]">
 {/* Gallery */}
 <div className="min-w-0 lg:sticky lg:top-20 lg:self-start">
 <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3">
 <div className="relative aspect-square overflow-hidden rounded-xl bg-slate-50">
 <ImageZoom
 src={images[selectedImage]?.url || 'https://via.placeholder.com/600'}
 alt={images[selectedImage]?.alt || product.title}
 className="w-full h-full"
 />
 {images.length > 1 && (
 <>
 <button onClick={() => setSelectedImage(i => (i - 1 + images.length) % images.length)}
 className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white border border-gray-200 rounded-full flex items-center justify-center hover:bg-gray-50">
 <ChevronLeft size={18} />
 </button>
 <button onClick={() => setSelectedImage(i => (i + 1) % images.length)}
 className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white border border-gray-200 rounded-full flex items-center justify-center hover:bg-gray-50">
 <ChevronRight size={18} />
 </button>
 </>
 )}
 {variantDiscount > 0 && (
 <div className="absolute top-4 left-4 badge bg-red-500 text-white text-sm px-3 py-1">
 -{variantDiscount}%
 </div>
 )}
 <div className="absolute top-4 right-4 flex gap-2">
 <button onClick={handleWishlist} aria-label="Toggle wishlist"
 className={`flex h-10 w-10 items-center justify-center rounded-full border bg-white ${isWishlisted ? 'border-red-200 text-red-500' : 'border-slate-200 text-slate-500 hover:text-red-500'}`}>
 <Heart size={17} fill={isWishlisted ? 'currentColor' : 'none'} />
 </button>
 <button onClick={handleShare} aria-label="Share product"
 className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:text-slate-800">
 <Share2 size={17} />
 </button>
 </div>
 </div>
 {/* Thumbnails stay below the main image. */}
 {images.length > 1 && (
 <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1">
 {images.map((img, i) => (
 <button key={i} onClick={() => setSelectedImage(i)} aria-label={`View product image ${i + 1}`}
 className={`h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl border-2 ${selectedImage === i ? 'border-slate-900' : 'border-transparent opacity-70 hover:opacity-100'}`}>
 <img src={img.url} alt={img.alt} loading="lazy" decoding="async" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = 'https://via.placeholder.com/80/f3f4f6/9ca3af?text=No+img'; }} className="h-full w-full object-cover" />
 </button>
 ))}
 </div>
 )}
 </div>
 {/* Trust strip */}
 <div className="mt-3 grid grid-cols-3 divide-x divide-slate-100 rounded-2xl border border-slate-200 bg-white">
 {[
 { icon: Truck, text: 'Free Delivery', sub: `Orders ${settings?.currencySymbol || '₹'}${settings?.freeShippingThreshold ?? 999}+` },
 { icon: RotateCcw, text: 'Easy Returns', sub: '7-day return' },
 { icon: Shield, text: 'Secure Pay', sub: '100% safe' },
 ].map(({ icon: Icon, text, sub }) => (
 <div key={text} className="flex flex-col items-center px-2 py-3.5 text-center">
 <Icon size={19} className="mb-1.5 text-slate-700" />
 <span className="text-xs font-bold text-slate-800">{text}</span>
 <span className="text-[11px] text-slate-500">{sub}</span>
 </div>
 ))}
 </div>
 </div>

 {/* Buy panel */}
 <div className="min-w-0">
 <div className="space-y-3">
 {cro.promotionalMessage && (
 <div className="flex items-center gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2.5">
  <Gift size={18} className="flex-shrink-0 text-amber-600" />
  <p className="min-w-0 flex-1 truncate text-sm font-bold text-amber-900">{cro.promotionalMessage}</p>
  <ChevronRight size={16} className="flex-shrink-0 text-amber-700" />
 </div>
 )}
 {product.brand && <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-500">{product.brand}</p>}
 <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-slate-900 md:text-3xl">{product.title}</h1>
 {product.shortDescription && <p className="-mt-1.5 text-[15px] leading-relaxed text-slate-500">{product.shortDescription}</p>}

 {/* Rating */}
 {(cro.customRating?.enabled || displayReviewCount > 0) && (
 <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
 <div className="flex items-center gap-0.5">
 {[...Array(5)].map((_, i) => (
 <Star key={i} size={18} className={i < Math.round(displayRating) ? 'text-amber-400 fill-amber-400' : 'text-slate-200 fill-slate-200'} />
 ))}
 </div>
 <span className="text-[15px] font-extrabold text-slate-900">{displayRating.toFixed(1)}</span>
 <a href="#pdp-reviews" className="text-sm text-slate-500 hover:text-primary-600">({displayReviewCount} reviews)</a>
 {displaySold > 0 && (<><span className="h-1 w-1 rounded-full bg-slate-300" /><span className="text-sm text-slate-500"><b className="font-extrabold text-slate-900">{displaySold}</b> sold</span></>)}
 {cro.customRating?.enabled && cro.customRating.summary && (
 <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100/70 px-3 py-1 text-xs font-bold text-violet-700">
  <Heart size={13} className="fill-violet-600 text-violet-600" />{cro.customRating.summary}
 </span>
 )}
 </div>
 )}

 {/* Price */}
 <div className="relative overflow-hidden rounded-2xl border border-violet-100 bg-[#f3f0ff] p-4">
 <div className="pointer-events-none absolute inset-0" aria-hidden="true" style={{ background: 'linear-gradient(115deg, transparent 42%, rgba(255,255,255,0.75) 56%, transparent 70%)' }} />
 <div className="relative flex items-center justify-between gap-3">
 <div className="min-w-0">
 <div className="flex flex-wrap items-end gap-x-2.5 gap-y-1">
 <span className="text-4xl font-black leading-none tracking-tight text-slate-900">{formatPrice(discountedPrice, settings)}</span>
 {mrp > sellingPrice && (
 <span className="pb-0.5 text-[15px] text-slate-400 line-through">{formatPrice(mrp, settings)}</span>
 )}
 {variantDiscount > 0 && (
 <span className="mb-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-extrabold text-emerald-700">-{variantDiscount}%</span>
 )}
 </div>
 {mrp > sellingPrice && (
 <p className="mt-1.5 text-[15px] font-bold text-emerald-700">You save {formatPrice(mrp - sellingPrice, settings)} on MRP</p>
 )}
 <p className="mt-0.5 text-xs text-slate-500">Inclusive of all taxes</p>
 </div>
 <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-white/70 shadow-sm" aria-hidden="true">
 <Tag size={22} className="text-violet-600" />
 </span>
 </div>
 </div>

 {/* Quantity + CTA */}
 {product.stock > 0 && (
 <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
 <div className="flex items-center gap-4">
 <span className="text-[15px] font-medium text-slate-700">Quantity</span>
 <div className="flex items-center gap-3">
 <button onClick={() => setQuantity(q => Math.max(1, q - 1))} aria-label="Decrease quantity"
 className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50">
 <Minus size={16} />
 </button>
 <input
 type="number" min={1} max={product.stock} value={quantity} aria-label="Quantity"
 onChange={event => {
 const next = parseInt(event.target.value, 10);
 if (Number.isNaN(next)) return;
 setQuantity(Math.min(product.stock || next, Math.max(1, next)));
 }}
 className="quantity-input w-12 border-0 bg-transparent p-0 text-center text-lg font-extrabold tabular-nums text-slate-900 outline-none"
 />
 <button onClick={() => setQuantity(q => Math.min(product.stock, q + 1))} aria-label="Increase quantity"
 className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50">
 <Plus size={16} />
 </button>
 </div>
 </div>
 <div className="grid grid-cols-2 gap-3">
 <button onClick={handleAddToCart} className="flex items-center justify-center gap-2 rounded-2xl border-[1.5px] border-slate-300 bg-white py-3 text-[15px] font-bold text-slate-800 transition-colors hover:bg-slate-50">
 <ShoppingCart size={19} />Add to Cart
 </button>
 <button onClick={handleBuyNow} className="flex items-center justify-center gap-2 rounded-2xl bg-violet-600 py-3 text-[15px] font-bold text-white shadow-md shadow-violet-200 transition-colors hover:bg-violet-700">
 <Zap size={18} className="fill-white" />Buy Now
 </button>
 </div>
 {quantity > 1 && (
 <p className="border-t border-slate-100 pt-2.5 text-[13px] font-semibold tabular-nums text-slate-500">
 {quantity} × {formatPrice(sellingPrice, settings)} = <span className="text-[15px] font-extrabold text-slate-900">{formatPrice(sellingPrice * quantity, settings)}</span>
 </p>
 )}
 </div>
 )}

 {/* Variant Selection */}
 {hasVariants && (
 <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
 {product.variants.map(variant => {
 const isColor = variant.name.toLowerCase() === 'color' || variant.name.toLowerCase() === 'colour';
 return (
 <div key={variant.name}>
 <div className="flex items-center gap-2 mb-2">
 <span className="text-sm font-medium text-gray-700">{variant.name}:</span>
 {selectedVariants[variant.name] && (
 <span className="text-sm text-primary-600 font-semibold">{selectedVariants[variant.name]}</span>
 )}
 </div>
 <div className="flex flex-wrap gap-2">
 {variant.options.map(opt => {
 const isSelected = selectedVariants[variant.name] === opt.value;
 const isOutOfStock = opt.stock !== undefined && opt.stock <= 0;

 if (isColor) {
 return (
 <button
 key={opt.value}
 onClick={() => !isOutOfStock && setSelectedVariants(s => ({ ...s, [variant.name]: opt.value }))}
 disabled={isOutOfStock}
 title={`${opt.value}${isOutOfStock ? ' (Out of stock)' : ''}${opt.price ? ` · ₹${opt.price}` : opt.priceModifier ? ` (+₹${opt.priceModifier})` : ''}`}
 className={`relative w-10 h-10 rounded-full border-2 transition-colors ${
 isSelected
 ? 'border-primary-500 ring-2 ring-primary-200 scale-110'
 : 'border-gray-200 hover:border-gray-400'
 } ${isOutOfStock ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
 >
 {opt.images?.[0]?.url ? (
  <img src={opt.images[0].url} alt={opt.value} loading="lazy" decoding="async" className="absolute inset-1 h-8 w-8 rounded-full object-cover" />
 ) : (
  <span className="absolute inset-1 rounded-full" style={{ backgroundColor: opt.value.toLowerCase() }} />
 )}
 {isSelected && (
 <Check size={14} className="absolute inset-0 m-auto text-white" />
 )}
 {isOutOfStock && (
 <span className="absolute inset-0 flex items-center justify-center">
 <span className="w-8 h-[2px] bg-red-500 rotate-45 absolute" />
 </span>
 )}
 </button>
 );
 }

 return (
 <button
 key={opt.value}
 onClick={() => !isOutOfStock && setSelectedVariants(s => ({ ...s, [variant.name]: opt.value }))}
 disabled={isOutOfStock}
 className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
 isSelected
 ? 'border-primary-500 bg-primary-50 text-primary-700 ring-1 ring-primary-200'
 : 'border-gray-200 text-gray-700 hover:border-gray-400 hover:bg-gray-50'
 } ${isOutOfStock ? 'opacity-40 cursor-not-allowed line-through' : 'cursor-pointer'}`}
 >
 {opt.value}
 {opt.price ? <span className="text-xs text-gray-400 ml-1">₹{opt.price}</span> : opt.priceModifier > 0 && <span className="text-xs text-gray-400 ml-1">(+₹{opt.priceModifier})</span>}
 </button>
 );
 })}
 </div>
 </div>
 );
 })}
 </div>
 )}


 {displayReasons.length > 0 && (
 <section className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3.5" aria-label={reasonsTitle}>
  <h2 className="text-[15px] font-extrabold tracking-tight text-slate-900">{reasonsTitle}</h2>
  <ul className="mt-2.5 grid grid-cols-2 divide-x divide-y divide-emerald-100 sm:grid-cols-4 sm:divide-y-0">
   {displayReasons.map((reason, index) => (
    <li key={`${reason}-${index}`} className="flex min-w-0 items-start gap-1.5 px-2.5 first:pl-0 last:pr-0">
     <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
     <span className="min-w-0 flex-1 text-xs font-medium leading-4 text-slate-700">{reason}</span>
    </li>
   ))}
  </ul>
 </section>
 )}

 {(cro.socialProof?.enabled || cro.stockDisplay?.enabled || cro.soldDisplay?.enabled || cro.visitorDisplay?.enabled) && (
 <div className="rounded-2xl border border-slate-200/70 bg-white p-2 shadow-sm">
 <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 sm:grid-cols-4 sm:divide-y-0">
  {cro.socialProof?.enabled && (
   <div className="min-w-0 px-2.5 py-1.5">
    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-orange-600"><Flame size={16} /></span>
    <p className="mt-1.5 text-lg font-extrabold tabular-nums leading-none text-orange-600"><AnimatedNumber value={liveSocial} /></p>
    <p className="mt-1 text-[10px] font-medium leading-[1.35] text-slate-500">sold {socialProofLabel}</p>
   </div>
  )}
  {cro.stockDisplay?.enabled && (
   <div className="min-w-0 px-2.5 py-1.5">
    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-orange-500"><Package size={16} /></span>
    <p className="mt-1.5 text-lg font-extrabold tabular-nums leading-none text-orange-500"><AnimatedNumber value={displayStock} /></p>
    <p className="mt-1 text-[10px] font-medium leading-[1.35] text-slate-500">stock left — hurry</p>
   </div>
  )}
  {cro.soldDisplay?.enabled && (
   <div className="min-w-0 px-2.5 py-1.5">
    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-600"><Users size={16} /></span>
    <p className="mt-1.5 text-lg font-extrabold tabular-nums leading-none text-violet-600"><AnimatedNumber value={displaySold} /></p>
    <p className="mt-1 text-[10px] font-medium leading-[1.35] text-slate-500">{cro.soldDisplay.label || 'sold recently'}</p>
   </div>
  )}
  {cro.visitorDisplay?.enabled && (
   <div className="min-w-0 px-2.5 py-1.5">
    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600"><Eye size={16} /></span>
    <p className="mt-1.5 flex items-center gap-1 text-lg font-extrabold tabular-nums leading-none text-emerald-600">
     <AnimatedNumber value={liveVisitors} />
     <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />
    </p>
    <p className="mt-1 text-[10px] font-medium leading-[1.35] text-slate-500">people viewing now</p>
   </div>
  )}
 </div>
 </div>
 )}

 {bulkTiers.length > 0 && (
 <section className="overflow-hidden rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3.5" aria-label="Bulk-order pricing">
  <div className="flex items-center gap-2.5">
   <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><Layers size={19} /></span>
   <div>
    <h2 className="text-[15px] font-extrabold tracking-tight text-emerald-800">Bulk-order pricing</h2>
    <p className="text-xs text-slate-500">Tap a tier to set that quantity.</p>
   </div>
  </div>
  <div className="mt-3 grid gap-2">
   {bulkTiers.map(tier => {
    const tierQty = Number(tier.minQuantity);
    const isActive = activeBulkTier?.minQuantity === tier.minQuantity;
    const saving = Math.max(0, variantSellingPrice - Number(tier.price));
    return (
     <button
      key={tier.minQuantity}
      type="button"
      onClick={() => setQuantity(Math.max(1, Math.min(tierQty, product.stock || tierQty)))}
      aria-pressed={isActive}
      className={`flex items-center gap-3 rounded-xl border bg-white px-3.5 py-2.5 text-left shadow-sm transition ${isActive ? 'border-emerald-500' : 'border-slate-200/80 hover:border-emerald-300'}`}
     >
      <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${isActive ? 'border-emerald-600' : 'border-slate-300'}`} aria-hidden="true">
       {isActive && <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />}
      </span>
      <span className="min-w-0 flex-1">
       <span className="block text-[15px] font-extrabold text-slate-900">{tierQty}+ units</span>
       <span className="block text-xs text-slate-500">{formatPrice(tier.price, settings)} per unit</span>
      </span>
      <span className="flex-shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-extrabold text-emerald-700">
       {saving > 0 ? `SAVE ${formatPrice(saving, settings)}` : (tier.label || 'BEST PRICE')}
      </span>
     </button>
    );
   })}
  </div>
  {nextBulkTier && (
   <div className="mt-3">
    <p className="text-xs font-bold text-emerald-800">Add {Number(nextBulkTier.minQuantity) - quantity} more to unlock {formatPrice(nextBulkTier.price, settings)} per unit.</p>
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-emerald-100" role="progressbar" aria-valuenow={quantity} aria-valuemin={0} aria-valuemax={Number(nextBulkTier.minQuantity)}>
     <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, Math.round((quantity / Number(nextBulkTier.minQuantity)) * 100))}%` }} />
    </div>
   </div>
  )}
 </section>
 )}

 {cro.etaText && (
 <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-emerald-50" aria-hidden="true">
   <Truck size={19} className="flex-shrink-0 text-emerald-600" />
  </span>
  <span className="min-w-0 flex-1 text-[15px] font-bold text-slate-800">{cro.etaText}</span>
  <ChevronRight size={18} className="flex-shrink-0 text-slate-400" />
 </div>
 )}

 {/* Price-drop + stock */}
 <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
 <button
  type="button"
  onClick={handlePriceDropAlert}
  disabled={priceDropLoading}
  data-testid="price-drop-alert"
  className={`inline-flex w-full items-center justify-center gap-1.5 rounded-full border bg-white px-3.5 py-2 text-[13px] font-bold transition-colors sm:w-auto ${priceDropSubscribed ? 'border-green-300 text-green-700' : 'border-violet-300 text-violet-700 hover:bg-violet-50'}`}
 >
  <Bell size={15} />
  {priceDropLoading ? 'Saving…' : priceDropSubscribed ? 'Price-drop alert active' : 'Notify me if price drops'}
 </button>
 {product.stock > 0 ? (
 <span className="inline-flex flex-shrink-0 items-center gap-1.5 self-start rounded-full bg-green-50 px-3 py-2 text-[13px] font-bold text-green-700 sm:self-auto">
 <span className="h-2 w-2 rounded-full bg-green-600" />In stock
 </span>
 ) : (
 <span className="inline-flex flex-shrink-0 items-center gap-1.5 self-start rounded-full bg-red-50 px-3 py-2 text-[13px] font-bold text-red-600 sm:self-auto">
 <span className="h-2 w-2 rounded-full bg-red-500" />Out of stock
 </span>
 )}
 </div>

 {/* Notify Me — when out of stock */}
 {product.stock <= 0 && (
 <div className="border border-amber-200 bg-amber-50/50 rounded-xl p-4">
 {stockAlertSubscribed ? (
 <div className="flex items-center gap-2 text-sm text-amber-800">
 <Bell size={16} className="text-amber-500" />
 <span>You’ll be notified when this product is back in stock!</span>
 </div>
 ) : (
 <div>
 <p className="text-sm font-medium text-amber-800 mb-2 flex items-center gap-2"><Bell size={16} /> Get notified when available</p>
 <div className="flex flex-col gap-2 sm:flex-row">
 {!isAuthenticated && (
 <input type="email" value={stockAlertEmail} onChange={e => setStockAlertEmail(e.target.value)} placeholder="Your email" className="input py-2 text-sm flex-1" />
 )}
 <button onClick={handleStockAlert} disabled={stockAlertLoading} data-testid="stock-alert-subscribe" className="btn-primary flex w-full items-center justify-center gap-1.5 px-4 py-2 text-sm sm:w-auto">
 {stockAlertLoading ? <span className="animate-spin">⏳</span> : <Bell size={14} />}
 Notify Me
 </button>
 </div>
 </div>
 )}
 </div>
 )}

 {/* Delivery Check */}
 <DeliveryCheck />

 {/* Razorpay Payment Offers */}
 <RazorpayOffers price={sellingPrice} />

 {/* Highlights + Specifications — compact cards merged into the buy column */}
 {(displayBenefits.length > 0 || (product.specifications || []).filter(s => s?.key && s?.value).length > 0) && (
 <div className="space-y-3">
 {displayBenefits.length > 0 && (
 <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Product benefits">
  <h2 className="text-sm font-extrabold tracking-tight text-slate-900">Highlights</h2>
  <ul className="mt-2 max-h-44 space-y-1.5 overflow-y-auto">
   {displayBenefits.map((benefit, index) => <li key={`${benefit}-${index}`} className="flex items-start gap-2 text-[13px] leading-snug text-slate-700"><span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green-100"><Check size={10} className="text-green-700" /></span>{benefit}</li>)}
  </ul>
 </section>
 )}
 {(product.specifications || []).filter(s => s?.key && s?.value).length > 0 && (
 <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Product specifications">
  <h2 className="text-sm font-extrabold tracking-tight text-slate-900">Specifications</h2>
  <dl className="mt-2 max-h-52 divide-y divide-slate-100 overflow-y-auto">
  {(product.specifications || []).filter(s => s?.key && s?.value).map((spec, index) => (
  <div key={`${spec.key}-${index}`} className="grid grid-cols-[110px_minmax(0,1fr)] gap-2 py-1 text-[13px]">
  <dt className="font-semibold text-slate-500">{spec.key}</dt>
  <dd className="text-slate-800">{spec.value}</dd>
  </div>
  ))}
  </dl>
 </section>
 )}
 </div>
 )}

 </div>
 </div>
 </div>

 <div className="mt-6 space-y-6" data-testid="product-cro-scroll-content">
 <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6" aria-label="Product description">
  <h2 className="text-lg font-extrabold tracking-tight text-slate-900">Product description</h2>
  <p className="mb-3 mt-0.5 text-sm text-slate-500">Everything you need to know, in detail.</p>
  <div className="overflow-hidden rounded-xl border border-slate-100"><DescriptionFrame html={product.description} /></div>
 </section>

 <section id="pdp-reviews" aria-label="Ratings and reviews" className="scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
  <div className="flex flex-wrap items-center justify-between gap-2">
  <div><h2 className="text-lg font-extrabold tracking-tight text-slate-900">Ratings & reviews</h2><p className="mt-0.5 text-sm text-slate-500">Only approved, genuine reviews appear here.</p></div>
  {displayReviewCount > 0 && <span className="badge bg-slate-100 text-slate-700">{displayReviewCount} reviews</span>}
  </div>
  {(reviews.length > 0 || reviewStats) && (
  <div className="mt-5 grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
  <div className="h-fit rounded-xl bg-slate-50 p-4 text-center">
  <p className="text-4xl font-black tracking-tight text-slate-900">{Number(reviewStats?.average || displayRating || 0).toFixed(1)}</p>
  <div className="mt-1.5 flex items-center justify-center gap-0.5">
  {[...Array(5)].map((_, i) => (
  <Star key={i} size={15} className={i < Math.round(Number(reviewStats?.average || displayRating || 0)) ? 'text-amber-400 fill-amber-400' : 'text-slate-200 fill-slate-200'} />
  ))}
  </div>
  <p className="mt-1 text-xs text-slate-500">{Number(reviewStats?.total ?? displayReviewCount ?? 0)} verified ratings</p>
  <div className="mt-3 space-y-1.5">
  {[['five', 5], ['four', 4], ['three', 3], ['two', 2], ['one', 1]].map(([key, star]) => {
  const count = Number(reviewStats?.[key] || 0);
  const total = Number(reviewStats?.total || 0);
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
  <div key={key} className="flex items-center gap-2 text-xs">
  <span className="w-3 text-right font-bold text-slate-600">{star}</span>
  <Star size={11} className="shrink-0 text-amber-400 fill-amber-400" />
  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} /></div>
  <span className="w-8 text-slate-500">{pct}%</span>
  </div>
  );
  })}
  </div>
  </div>
  <div className="space-y-4">
  {reviews.length === 0 && <p className="text-sm text-slate-500">No written reviews yet — be the first to share your experience below.</p>}
  {reviews.map(review => (
  <article key={review._id} className="rounded-xl border border-slate-200 p-4">
  <div className="flex items-start justify-between gap-3">
  <div className="flex min-w-0 items-center gap-2.5">
  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">{String(review.user?.name || 'S').charAt(0).toUpperCase()}</span>
  <div className="min-w-0">
  <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-slate-900">{review.user?.name || 'Verified customer'}
  {review.isVerifiedPurchase && <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-bold text-green-700"><BadgeCheck size={11} />Verified</span>}
  </p>
  <p className="text-xs text-slate-500">{review.createdAt ? new Date(review.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</p>
  </div>
  </div>
  <div className="flex shrink-0 items-center gap-0.5">
  {[...Array(5)].map((_, i) => (
  <Star key={i} size={13} className={i < Math.round(Number(review.rating || 0)) ? 'text-amber-400 fill-amber-400' : 'text-slate-200 fill-slate-200'} />
  ))}
  </div>
  </div>
  {review.title && <p className="mt-2.5 text-sm font-bold text-slate-900">{review.title}</p>}
  <p className="mt-1 text-sm leading-relaxed text-slate-600">{review.comment}</p>
  <div className="mt-3 flex items-center gap-4 border-t border-slate-100 pt-2.5">
  <button onClick={() => handleReviewHelpful(review._id)} disabled={reviewActionId === review._id} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 disabled:opacity-50">
  <ThumbsUp size={13} />Helpful{review.helpful ? ` (${review.helpful})` : ''}
  </button>
  <button onClick={() => handleReviewReport(review._id)} disabled={reviewActionId === review._id} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-700 disabled:opacity-50">
  <Flag size={13} />Report
  </button>
  </div>
  </article>
  ))}
  </div>
  </div>
  )}
  <div className="mt-6 rounded-xl bg-slate-50 p-4 md:p-5">
  <h3 className="text-sm font-extrabold text-slate-900">Write a review</h3>
  <p className="mt-0.5 text-xs text-slate-500">Reviews are published after moderation.</p>
  <div className="mt-3 flex items-center gap-1.5">
  {[1, 2, 3, 4, 5].map(value => (
  <button key={value} type="button" onClick={() => setReviewForm(form => ({ ...form, rating: value }))} aria-label={`Rate ${value} star${value > 1 ? 's' : ''}`}>
  <Star size={22} className={value <= Number(reviewForm.rating) ? 'text-amber-400 fill-amber-400' : 'text-slate-300 fill-slate-200'} />
  </button>
  ))}
  <span className="ml-1 text-sm font-bold text-slate-700">{reviewForm.rating}/5</span>
  </div>
  <input value={reviewForm.title} onChange={e => setReviewForm(form => ({ ...form, title: e.target.value }))} placeholder="Review headline (optional)" className="input mt-3 bg-white" />
  <textarea value={reviewForm.comment} onChange={e => setReviewForm(form => ({ ...form, comment: e.target.value }))} placeholder="What did you like? How is the quality, fit, packaging?" rows={3} className="input mt-2.5 bg-white" />
  <button onClick={handleReviewSubmit} disabled={reviewSubmitting || !reviewForm.comment.trim()} className="btn-primary mt-3">
  {reviewSubmitting ? 'Submitting…' : 'Submit review'}
  </button>
  </div>
 </section>

 <section id="pdp-qa" aria-label="Product questions and answers" className="scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
  <div className="flex flex-wrap items-center justify-between gap-2">
  <div><h2 className="text-lg font-extrabold tracking-tight text-slate-900">Questions & answers</h2><p className="mt-0.5 text-sm text-slate-500">Ask about size, fit, usage — the store team replies here.</p></div>
  {questions.length > 0 && <span className="badge bg-slate-100 text-slate-700">{questions.length} questions</span>}
  </div>
  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
  <input value={questionInput} onChange={e => setQuestionInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAskQuestion()} placeholder={isAuthenticated ? 'Ask a question about this product…' : 'Login to ask a question…'} disabled={!isAuthenticated} className="input flex-1 bg-slate-50" />
  <button onClick={handleAskQuestion} disabled={!isAuthenticated || !questionInput.trim()} className="btn-primary flex w-full shrink-0 items-center justify-center gap-1.5 sm:w-auto">
  <SendIcon size={14} />Ask
  </button>
  </div>
  {!isAuthenticated && <p className="mt-2 text-xs text-slate-500">Please <Link to={`/login?redirect=${encodeURIComponent(`/product/${product.slug}`)}`} className="font-semibold text-primary-600 hover:underline">login</Link> to ask or answer questions.</p>}
  <div className="mt-4 space-y-3">
  {questionsLoading && <p className="text-sm text-slate-500">Loading questions…</p>}
  {!questionsLoading && questions.length === 0 && <p className="text-sm text-slate-500">No questions yet — be the first to ask.</p>}
  {questions.map(q => (
  <div key={q._id} className="rounded-xl border border-slate-200 p-4">
  <div className="flex items-start gap-2.5">
  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-bold text-primary-700">Q</span>
  <div className="min-w-0">
  <p className="text-sm font-bold text-slate-900">{q.question}</p>
  <p className="mt-0.5 text-xs text-slate-500">{q.user?.name || 'Shopper'}{q.createdAt ? ` · ${new Date(q.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}</p>
  </div>
  </div>
  {(q.answers || []).length > 0 && (
  <div className="mt-3 space-y-2 border-l-2 border-slate-100 pl-3">
  {q.answers.map((answer, answerIndex) => (
  <div key={answer._id || answerIndex} className="flex items-start gap-2">
  <MessageCircle size={13} className="mt-0.5 shrink-0 text-slate-400" />
  <div>
  <p className="text-sm text-slate-700">{answer.text}</p>
  <p className="mt-0.5 text-xs text-slate-500">{answer.isAdmin ? <span className="font-bold text-primary-600">Store team</span> : 'Seller'} · {answer.createdAt ? new Date(answer.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</p>
  </div>
  </div>
  ))}
  </div>
  )}
  {isAuthenticated && (
  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
  <input value={answerInputs[q._id] || ''} onChange={e => setAnswerInputs(prev => ({ ...prev, [q._id]: e.target.value }))} onKeyDown={e => e.key === 'Enter' && handleAnswerQuestion(q._id)} placeholder="Write an answer…" className="input flex-1 bg-slate-50 py-2 text-[13px]" />
  <button onClick={() => handleAnswerQuestion(q._id)} disabled={!(answerInputs[q._id] || '').trim()} className="btn-secondary w-full shrink-0 px-3 py-2 text-[13px] sm:w-auto">Reply</button>
  </div>
  )}
  </div>
  ))}
  </div>
 </section>

 {cro.faqs?.filter(faq => faq?.question && faq?.answer).length > 0 && (
 <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6" aria-label="Frequently asked questions" data-testid="product-faq">
  <h2 className="text-lg font-extrabold tracking-tight text-slate-900">Frequently asked questions</h2>
  <p className="mb-1 mt-0.5 text-sm text-slate-500">Quick answers from the product team.</p>
  <div className="divide-y divide-slate-200">
   {cro.faqs.filter(faq => faq?.question && faq?.answer).map((faq, index) => <details key={`${faq.question}-${index}`} open={openFaq === index} onClick={event => { event.preventDefault(); setOpenFaq(openFaq === index ? null : index); }} className="group py-3"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold text-slate-800">{faq.question}<Plus size={16} className={`flex-shrink-0 transition-transform ${openFaq === index ? 'rotate-45' : ''}`} /></summary>{openFaq === index && <p className="pt-2 text-sm leading-6 text-slate-600">{faq.answer}</p>}</details>)}
  </div>
 </section>
 )}

 {related.length > 0 && (
 <section id="pdp-related" aria-label="Related products" className="scroll-mt-28">
  <div className="mb-4 flex items-end justify-between gap-3">
  <div><h2 className="text-lg font-extrabold tracking-tight text-slate-900">You may also like</h2><p className="mt-0.5 text-sm text-slate-500">Handpicked companions to this product.</p></div>
  {product.category && <Link to={`/category/${product.category.slug}`} className="shrink-0 text-sm font-bold text-primary-600 hover:underline">View all</Link>}
  </div>
  <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
  {related.map(item => <ProductCard key={item._id} product={item} />)}
  </div>
 </section>
 )}

 {recentlyViewed.filter(item => item._id !== product._id).length > 0 && (
 <section aria-label="Recently viewed products">
  <div className="mb-4"><h2 className="text-lg font-extrabold tracking-tight text-slate-900">Recently viewed</h2><p className="mt-0.5 text-sm text-slate-500">Pick up where you left off.</p></div>
  <div className="flex gap-4 overflow-x-auto pb-2">
  {recentlyViewed.filter(item => item._id !== product._id).slice(0, 8).map(item => (
  <div key={item._id} className="w-44 shrink-0 sm:w-52"><ProductCard product={item} /></div>
  ))}
  </div>
 </section>
 )}

 <div className={`${showFloatingActions ? '' : 'hidden lg:block'} fixed inset-x-3 bottom-[84px] z-30 md:sticky md:inset-x-auto md:bottom-3 md:mt-1`} data-testid="product-floating-actions">
  <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg">
   <img src={images[0]?.url} alt="" aria-hidden="true" className="h-11 w-11 shrink-0 rounded-xl border border-slate-100 object-cover sm:h-12 sm:w-12" />
   <div className="min-w-0 flex-1 basis-32">
   <p className="truncate text-[13px] font-semibold text-slate-600">{product.title}</p>
   <p className="flex flex-wrap items-baseline gap-x-2"><span className="text-lg font-black tracking-tight text-slate-900">{formatPrice(discountedPrice, settings)}</span>{mrp > sellingPrice && <span className="text-xs text-slate-400 line-through">{formatPrice(mrp, settings)}</span>}</p>
   </div>
   <div className="flex w-full gap-2 sm:w-auto sm:shrink-0">
   <button onClick={handleAddToCart} disabled={product.stock === 0} data-testid="product-detail-add-to-cart" className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none sm:px-4"><ShoppingCart size={15} />Add to Cart</button>
   <button onClick={handleBuyNow} disabled={product.stock === 0} data-testid="product-detail-buy-now" className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-bold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none sm:px-4"><Zap size={15} />Buy Now</button>
   </div>
  </div>
 </div>
 </div>

 </div>
 </div>
 );
};

export default ProductDetailPage;
