import { useState, useRef, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { MessageSquare, Send, ShoppingBag, Package, CreditCard, AlertTriangle, ShoppingCart, Eye, ArrowLeft, RotateCcw, X } from 'lucide-react';
import { chatAPI } from '../../services/api';
import { useSite } from '../../context/SiteContext';
import { usePageFrame } from '../../context/PageFrameContext';
import { requestAddToCart } from '../../store/slices/cartSlice';
import { formatPrice } from '../../utils/formatPrice';
import DOMPurify from 'dompurify';
import toast from 'react-hot-toast';
import SEO from '../../components/common/SEO';
import useChatbotConfig from '../../hooks/useChatbotConfig';
import Loader from '../../components/common/Loader';

const FALLBACK_CATEGORIES = [
 { key: 'shop_assistant', label: 'Shop Assistant', desc: 'Find products, store info & FAQs' },
 { key: 'order_query', label: 'Order Related', desc: 'Track, status & order queries' },
 { key: 'payment_query', label: 'Payment Related', desc: 'Refunds, failures & payment status' },
];

const CATEGORY_ICON = {
 shop_assistant: { icon: ShoppingBag, bg: 'bg-indigo-50', color: 'text-indigo-600' },
 order_query: { icon: Package, bg: 'bg-amber-50', color: 'text-amber-600' },
 payment_query: { icon: CreditCard, bg: 'bg-emerald-50', color: 'text-emerald-600' },
};
const DEFAULT_ICON = { icon: MessageSquare, bg: 'bg-slate-100', color: 'text-slate-600' };

const STORAGE_KEY = 'tatoz_chat_state';

// Converts markdown to sanitized HTML — DOMPurify strips malicious content.
const formatMessage = (text) => {
 if (!text) return '';
 let html = text
 .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
 .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
 .replace(/\*(.+?)\*/g, '<em>$1</em>')
 .replace(/`(.+?)`/g, '<code style="background:#f3f4f6;padding:1px 4px;border-radius:3px;font-size:12px;">$1</code>')
 .replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>')
 .replace(/(<li>.*<\/li>)/s, '<ul style="list-style:disc;padding-left:16px;margin:4px 0;">$1</ul>')
 .replace(/\n/g, '<br>');
 return DOMPurify.sanitize(html);
};

const BotAvatar = ({ favicon, size = 'w-8 h-8' }) => (
 <div className={`${size} rounded-full bg-slate-900 flex items-center justify-center flex-shrink-0 mt-0.5 overflow-hidden ring-1 ring-slate-900/10`}>
 {favicon ? (
 <img src={favicon} alt="" className="w-full h-full object-cover" />
 ) : (
 <MessageSquare size={14} className="text-white" />
 )}
 </div>
);

const ProductCard = ({ product, onAddToCart, settings }) => {
 if (!product || typeof product !== 'object' || !(product._id || product.slug)) return null;
 const finalPrice = Number(product.finalPrice ?? product.price ?? 0);
 return (
 <div className="flex min-w-0 gap-3 p-3 bg-white border border-slate-200/80 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.06)] hover:border-slate-400 transition-colors">
 <Link to={`/product/${product.slug}`} className="flex-shrink-0">
 <img src={product.thumbnail || 'https://via.placeholder.com/80'} alt={product.title} className="w-20 h-20 object-cover rounded-lg bg-slate-100" />
 </Link>
 <div className="flex-1 min-w-0">
 <Link to={`/product/${product.slug}`} className="text-sm font-semibold text-slate-900 hover:underline line-clamp-2">{product.title}</Link>
 <div className="flex flex-wrap items-center gap-2 mt-1">
 <span className="text-sm font-bold text-gray-900">{formatPrice(finalPrice, settings)}</span>
 {Number(product.comparePrice || 0) > finalPrice && (
 <>
 <span className="text-xs text-gray-400 line-through">{formatPrice(product.comparePrice, settings)}</span>
 <span className="text-xs font-semibold text-green-600">{Math.round(((product.comparePrice - finalPrice) / product.comparePrice) * 100)}% off</span>
 </>
 )}
 </div>
 <div className="flex flex-wrap gap-2 mt-2">
 <button
 data-testid={`chat-page-add-${product._id || product.slug}`}
 onClick={() => onAddToCart(product)}
 className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors"
 >
 <ShoppingCart size={12} /> Add to Cart
 </button>
 <Link to={`/product/${product.slug}`} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:border-slate-500 text-slate-600 hover:text-slate-900 text-xs font-semibold rounded-lg transition-colors">
 <Eye size={12} /> View
 </Link>
 </div>
 </div>
 </div>
 );
};

const ChatPage = () => {
 const { isAuthenticated } = useSelector(s => s.auth);
 const { site, settings } = useSite();
 const { config, loading: configLoading } = useChatbotConfig({ enabled: isAuthenticated });
 const dispatch = useDispatch();
 const navigate = useNavigate();
 const { setPageFrame } = usePageFrame();
 const favicon = site?.favicon || '';
 const chatRootRef = useRef(null);
 const [view, setView] = useState('categories');
 const [conversationId, setConversationId] = useState(null);
 const [messages, setMessages] = useState([]);
 const [input, setInput] = useState('');
 const [loading, setLoading] = useState(false);
 const [starting, setStarting] = useState(false);
 const [escalated, setEscalated] = useState(false);
 const [category, setCategory] = useState(null);
 const messagesEndRef = useRef(null);

 const categories = (config.categories?.length ? config.categories : FALLBACK_CATEGORIES).map(c => ({
  ...c,
  ...(CATEGORY_ICON[c.key] || DEFAULT_ICON),
 }));
 const primaryColor = config.primaryColor || '#0f172a';
 const showProducts = config.showProductCards !== false;

 // Full-screen app mode: no site header/footer/tab bar, so the chat owns a
 // definite viewport box that the keyboard cannot break apart.
 useEffect(() => {
  setPageFrame({ showHeader: false, showFooter: false });
  return () => setPageFrame();
 }, [setPageFrame]);

 // Track the real visible height (visualViewport shrinks with the keyboard on
 // mobile). The root box follows it, so input + messages compress instead of
 // overflowing or zooming the page.
 useEffect(() => {
  const vv = window.visualViewport;
  if (!vv) return undefined;
  const syncHeight = () => {
   if (chatRootRef.current) chatRootRef.current.style.height = `${vv.height}px`;
  };
  syncHeight();
  vv.addEventListener('resize', syncHeight);
  return () => vv.removeEventListener('resize', syncHeight);
 }, []);

 useEffect(() => {
 messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
 }, [messages, loading]);

 // Resume the stored conversation on the full page too.
 useEffect(() => {
  if (!isAuthenticated || conversationId || configLoading) return;
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { stored = null; }
  if (!stored?.id) return;
  chatAPI.getOne(stored.id)
   .then((res) => {
    const conv = res.data?.conversation;
    if (!conv || conv.status !== 'active') {
     try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
     return;
    }
    setConversationId(conv._id);
    setMessages((conv.messages || []).map(m => ({ role: m.role, content: m.content, products: [] })));
    setCategory(categories.find(c => c.key === conv.category) || { key: conv.category, label: 'Chat' });
    if (conv.status === 'escalated') setEscalated(true);
    setView('chat');
   })
   .catch(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
   });
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [isAuthenticated, configLoading]);

 const handleSelectCategory = async (cat) => {
 setStarting(true);
 setCategory(cat);
 try {
 const res = await chatAPI.start(cat.key);
 setConversationId(res.data.conversationId);
 setMessages([{ role: 'assistant', content: res.data.greeting }]);
 try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: res.data.conversationId, categoryKey: cat.key })); } catch { /* storage unavailable */ }
 setView('chat');
 setEscalated(false);
 } catch (err) {
 toast.error(err.response?.data?.message || err.message || 'Failed to start chat');
 } finally {
 setStarting(false);
 }
 };

 const sendText = async (text) => {
 const msg = String(text || '').trim();
 if (!msg || loading || !conversationId) return;
 setInput('');
 setMessages(prev => [...prev, { role: 'user', content: msg }]);
 setLoading(true);
 try {
 const res = await chatAPI.sendMessage(conversationId, msg);
 setMessages(prev => [...prev, { role: 'assistant', content: res.data.reply, products: showProducts ? (res.data.products || []) : [] }]);
 if (res.data.escalated) setEscalated(true);
 } catch (err) {
  const status = err.status || err.response?.status;
  if (status === 429) {
   setMessages(prev => [...prev, { role: 'assistant', content: 'You are sending messages too quickly. Please wait a moment and try again.' }]);
  } else {
   setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }]);
  }
 } finally {
 setLoading(false);
 }
 };

 const handleSend = () => sendText(input);

 const handleAddToCart = (product) => {
 if (product.variants?.some(variantOption => variantOption.options?.length)) {
  toast('Choose product options before adding to cart');
  window.location.assign(`/product/${product.slug}`);
  return;
 }
 dispatch(requestAddToCart({ product, quantity: 1, source: 'chat-page' }));
 };

 const handleNewChat = () => {
  setView('categories'); setMessages([]); setConversationId(null); setEscalated(false); setCategory(null);
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
 };

 if (!isAuthenticated) {
  return (
   <>
    <SEO title="Chat" noindex={true} />
    <div className="page-container py-16 text-center">
     <MessageSquare size={36} className="mx-auto mb-3 text-gray-300" />
     <h1 className="text-xl font-bold text-gray-900">Please log in to use chat</h1>
     <p className="text-sm text-gray-500 mt-1">Chat is available for logged-in customers.</p>
     <Link to="/login?redirect=/chat" className="inline-block mt-4 px-5 py-2.5 rounded-full text-white text-sm font-semibold" style={{ background: primaryColor }}>Log in</Link>
     <div><Link to="/" className="inline-block mt-3 text-sm font-semibold text-slate-500 hover:text-slate-900">← Back to home</Link></div>
    </div>
   </>
  );
 }

 if (config.enabled === false) {
  return (
   <>
    <SEO title="Chat" noindex={true} />
    <div className="page-container py-16 text-center">
     <MessageSquare size={36} className="mx-auto mb-3 text-gray-300" />
     <h1 className="text-xl font-bold text-gray-900">Chat is currently disabled</h1>
     <p className="text-sm text-gray-500 mt-1">Please contact support for help.</p>
     <div><Link to="/" className="inline-block mt-4 text-sm font-semibold text-slate-500 hover:text-slate-900">← Back to home</Link></div>
    </div>
   </>
  );
 }

 return (
 <>
 <SEO title="Chat" noindex={true} />
 {/* WhatsApp-style app surface: definite full-viewport box. Header, message
 list and input bar are fixed rows — only messages scroll, so the mobile
 keyboard compresses the list instead of breaking the page. */}
 <div ref={chatRootRef} className="flex h-[100dvh] flex-col bg-slate-300">
 <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col bg-[#e9e1d4] sm:my-4 sm:overflow-hidden sm:rounded-2xl sm:border sm:border-slate-900/10 sm:shadow-xl">
 {/* App header */}
 <header className="flex shrink-0 items-center gap-1.5 bg-slate-950 px-2 py-2 text-white">
 <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} aria-label="Back" className="rounded-full p-2 hover:bg-white/10">
 <ArrowLeft size={20} />
 </button>
 <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10">
 {favicon ? (
 <img src={favicon} alt="" className="h-full w-full object-cover" />
 ) : (
 <MessageSquare size={18} className="text-white" />
 )}
 </div>
 <div className="min-w-0 flex-1 leading-tight">
 <h1 className="truncate text-[15px] font-semibold">{view === 'chat' && category ? category.label : (config.botName || 'AI Chat Assistant')}</h1>
 <p className="text-xs text-emerald-400">Online · replies instantly</p>
 </div>
 {view === 'chat' && (
 <button type="button" onClick={handleNewChat} aria-label="New chat" title="New chat" className="rounded-full p-2 hover:bg-white/10">
 <RotateCcw size={18} />
 </button>
 )}
 <button type="button" onClick={() => navigate('/')} aria-label="Close chat" title="Close" className="rounded-full p-2 hover:bg-white/10">
 <X size={20} />
 </button>
 </header>

 {view === 'categories' ? (
 <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
 <div className="mx-auto max-w-md">
 <p className="mb-5 text-center text-sm text-slate-600">{config.welcomeMessage || 'How can I help you today? Select a category to start.'}</p>
 <div className="flex flex-col gap-3">
 {categories.map(cat => {
 const Icon = cat.icon || MessageSquare;
 return (
 <button
 key={cat.key}
 data-testid={`chat-page-category-${cat.key}`}
 onClick={() => handleSelectCategory(cat)}
 disabled={starting}
 className="flex items-center gap-4 p-4 border border-slate-200/80 rounded-xl bg-white hover:border-slate-900 hover:shadow-md hover:shadow-slate-950/5 transition-all duration-150 text-left disabled:opacity-50"
 >
 <div className={`w-12 h-12 rounded-xl ${cat.bg || 'bg-slate-100'} flex items-center justify-center flex-shrink-0`}>
 <Icon size={22} className={cat.color || 'text-slate-600'} />
 </div>
 <div className="flex-1 min-w-0">
 <div className="font-semibold text-gray-900">{cat.label}</div>
 <div className="text-sm text-gray-400">{cat.desc}</div>
 </div>
 {starting && category?.key === cat.key && (
 <Loader size="sm" inline className="flex-shrink-0" />
 )}
 </button>
 );
 })}
 </div>
 </div>
 </div>
 ) : (
 <>
 {/* Messages — the only scrolling region */}
 <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-5">
 {messages.map((m, i) => (
 <div key={i}>
 <div className={`flex ${m.role === 'user' ? 'justify-end' : 'gap-3'}`}>
 {m.role === 'assistant' && <BotAvatar favicon={favicon} />}
 {m.role === 'user' ? (
 <div className="max-w-[75%] break-anywhere px-3 py-2 text-sm leading-relaxed text-slate-900 bg-[#d9fdd3] rounded-lg rounded-tr-none shadow-[0_1px_1px_rgba(15,23,42,0.15)]">
 {m.content}
 </div>
 ) : (
 <div className="max-w-[80%] break-anywhere px-3 py-2 text-sm leading-relaxed bg-white text-slate-800 shadow-[0_1px_1px_rgba(15,23,42,0.15)] rounded-lg rounded-tl-none chat-message"
 dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(formatMessage(m.content)) }} />
 )}
 </div>
 {m.products?.length > 0 && (
 <div className="ml-11 mt-2 space-y-2">
 {m.products.map((p, j) => (
 <ProductCard key={j} product={p} settings={settings} onAddToCart={handleAddToCart} />
 ))}
 </div>
 )}
 </div>
 ))}
 {loading && (
 <div className="flex gap-3">
 <BotAvatar favicon={favicon} />
 <div className="bg-white border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.06)] rounded-2xl rounded-tl-md px-4 py-3">
 <Loader size="sm" inline />
 </div>
 </div>
 )}
 {escalated && (
 <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
 <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
 <span className="min-w-0 break-anywhere">{config.escalationMessage || 'This conversation has been escalated to our team. They will review and respond.'}</span>
 </div>
 )}
 {!escalated && !loading && (config.quickReplies?.length > 0 || config.faqs?.length > 0) && (
 <div className="flex flex-wrap gap-1.5 pt-1">
 {[...(config.quickReplies || []), ...(config.faqs || []).slice(0, 4).map(f => f.question)].slice(0, 6).map((chip, idx) => (
 <button key={idx} onClick={() => sendText(chip)} className="px-3 py-1.5 text-xs font-semibold border border-slate-200 bg-white rounded-full text-slate-600 hover:border-slate-900 hover:text-slate-900 transition-colors">
 {String(chip).slice(0, 60)}
 </button>
 ))}
 </div>
 )}
 <div ref={messagesEndRef} />
 </div>

 {/* Input — pinned bar, safe-area aware so it rides above the keyboard zone */}
 <div className="flex shrink-0 gap-2 bg-[#f0f0f0] p-2 sm:p-3" style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}>
 <input
 data-testid="chat-page-input"
 type="text"
 value={input}
 onChange={e => setInput(e.target.value)}
 onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
 placeholder={escalated ? (config.escalationMessage || 'Conversation escalated') : (config.placeholder || 'Type a message...')}
 disabled={loading || escalated}
 aria-label="Type a message"
 className="min-w-0 flex-1 rounded-full border-0 bg-white px-4 sm:px-5 py-2.5 text-base sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
 />
 <button
 data-testid="chat-page-send"
 onClick={handleSend}
 disabled={!input.trim() || loading || escalated}
 aria-label="Send message"
 className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white disabled:opacity-30 disabled:cursor-not-allowed"
 >
 <Send size={18} />
 </button>
 </div>
 </>
 )}
 </div>
 </div>
 </>
 );
};

export default ChatPage;
