import { useState, useRef, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { MessageSquare, X, ArrowUpRight, ArrowLeft, ChevronRight, Send, Sparkles, ShoppingBag, Package, CreditCard, AlertTriangle, ShoppingCart, Eye } from 'lucide-react';
import { chatAPI } from '../../services/api';
import { useSite } from '../../context/SiteContext';
import { requestAddToCart } from '../../store/slices/cartSlice';
import { setChatOpen } from '../../store/slices/uiSlice';
import { formatPrice } from '../../utils/formatPrice';
import DOMPurify from 'dompurify';
import toast from 'react-hot-toast';
import useChatbotConfig from '../../hooks/useChatbotConfig';
import Loader from '../common/Loader';

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

// Converts markdown to sanitized HTML.
// DOMPurify.sanitize is called on the final output to prevent XSS.
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

const BotAvatar = ({ favicon }) => (
 <div className="w-7 h-7 rounded-full bg-slate-900 flex items-center justify-center flex-shrink-0 mt-0.5 overflow-hidden ring-1 ring-slate-900/10">
 {favicon ? (
 <img src={favicon} alt="" className="w-full h-full object-cover" />
 ) : (
 <MessageSquare size={12} className="text-white" />
 )}
 </div>
);

const ProductCard = ({ product, onAddToCart, settings }) => {
 if (!product || typeof product !== 'object' || !(product._id || product.slug)) return null;

 const finalPrice = Number(product.finalPrice ?? product.price ?? 0);

 return (
 <div className="flex min-w-0 gap-2.5 p-2.5 bg-white border border-slate-200/80 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.06)] hover:border-slate-400 transition-colors">
 <Link to={`/product/${product.slug}`} className="flex-shrink-0">
 <img
 src={product.thumbnail || product.images?.[0]?.url || 'https://via.placeholder.com/80'}
 alt={product.title}
 className="w-16 h-16 object-cover rounded-lg bg-slate-100"
 />
 </Link>
 <div className="flex-1 min-w-0">
 <Link to={`/product/${product.slug}`} className="text-xs font-semibold text-slate-900 hover:underline line-clamp-2 leading-tight">
 {product.title}
 </Link>
 <div className="flex flex-wrap items-center gap-1.5 mt-1">
 <span className="text-xs font-bold text-gray-900">{formatPrice(finalPrice, settings)}</span>
 {Number(product.comparePrice || 0) > finalPrice && (
 <>
 <span className="text-[10px] text-gray-400 line-through">{formatPrice(product.comparePrice, settings)}</span>
 <span className="text-[10px] font-semibold text-green-600">{Math.round(((product.comparePrice - finalPrice) / product.comparePrice) * 100)}% off</span>
 </>
 )}
 </div>
 <div className="flex flex-wrap gap-1.5 mt-1.5">
 <button
 onClick={() => onAddToCart(product)}
 data-testid={`chat-widget-add-${product._id || product.slug}`}
 className="flex items-center gap-1 px-2 py-1 bg-slate-950 hover:bg-slate-800 text-white text-[10px] font-semibold rounded-lg transition-colors"
 >
 <ShoppingCart size={10} /> Add to Cart
 </button>
 <Link
 to={`/product/${product.slug}`}
 className="flex items-center gap-1 px-2 py-1 border border-slate-200 hover:border-slate-500 text-slate-600 hover:text-slate-900 text-[10px] font-semibold rounded-lg transition-colors"
 >
 <Eye size={10} /> View
 </Link>
 </div>
 </div>
 </div>
 );
};

const ChatWidget = () => {
 const { isAuthenticated } = useSelector(s => s.auth);
 const { site, settings } = useSite();
 const { config } = useChatbotConfig({ enabled: isAuthenticated });
 const dispatch = useDispatch();
 const favicon = site?.favicon || '';
 const navigate = useNavigate();
 const location = useLocation();
 const open = useSelector(s => s.ui.chatOpen);
 const [view, setView] = useState('categories');
 const [conversationId, setConversationId] = useState(null);
 const [messages, setMessages] = useState([]);
 const [input, setInput] = useState('');
 const [loading, setLoading] = useState(false);
 const [starting, setStarting] = useState(false);
 const [restoring, setRestoring] = useState(false);
 const [escalated, setEscalated] = useState(false);
 const [category, setCategory] = useState(null);
 const messagesEndRef = useRef(null);

 const categories = (config.categories?.length ? config.categories : FALLBACK_CATEGORIES).map(c => ({
  ...c,
  ...(CATEGORY_ICON[c.key] || DEFAULT_ICON),
 }));
 const primaryColor = config.primaryColor || '#0f172a';
 const showProducts = config.showProductCards !== false;

 useEffect(() => {
 messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
 }, [messages, loading]);

 // Resume the last conversation after reload (login-only, own history).
 useEffect(() => {
  if (!isAuthenticated || conversationId) return;
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { stored = null; }
  if (!stored?.id) return;
  setRestoring(true);
  chatAPI.getOne(stored.id)
   .then((res) => {
    const conv = res.data?.conversation;
    if (!conv || conv.status !== 'active') {
     try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
     return;
    }
    setConversationId(conv._id);
    setMessages((conv.messages || []).map(m => ({ role: m.role, content: m.content })));
    setCategory(categories.find(c => c.key === conv.category) || { key: conv.category, label: 'Chat' });
    if (conv.status === 'escalated') setEscalated(true);
    setView('chat');
    dispatch(setChatOpen(false));
   })
   .catch(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
   })
   .finally(() => setRestoring(false));
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [isAuthenticated]);

 // Close the panel on navigation (e.g. switching bottom-nav tabs) and on
 // unmount (e.g. product pages hide the widget) so it never reopens stale.
 useEffect(() => {
  dispatch(setChatOpen(false));
 }, [location.pathname, dispatch]);
 useEffect(() => () => { dispatch(setChatOpen(false)); }, [dispatch]);

 if (!isAuthenticated || config.enabled === false) return null;

 const persistState = (id, cat) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ id, categoryKey: cat?.key || null })); } catch { /* storage unavailable */ }
 };
 const clearState = () => {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
 };

 const handleAddToCart = (product) => {
 if (product.variants?.some(variantOption => variantOption.options?.length)) {
  toast('Choose product options before adding to cart');
  dispatch(setChatOpen(false));
  navigate(`/product/${product.slug}`);
  return;
 }
 dispatch(requestAddToCart({ product, quantity: 1, source: 'chat-widget' }));
 };

 const handleSelectCategory = async (cat) => {
 setStarting(true);
 setCategory(cat);
 try {
 const res = await chatAPI.start(cat.key);
 setConversationId(res.data.conversationId);
 setMessages([{ role: 'assistant', content: res.data.greeting }]);
 persistState(res.data.conversationId, cat);
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
 setMessages(prev => [...prev, {
 role: 'assistant',
 content: res.data.reply,
 products: showProducts ? (res.data.products || []) : [],
 }]);
 if (res.data.escalated) setEscalated(true);
 } catch (err) {
  const status = err.status || err.response?.status;
  if (status === 429) {
   setMessages(prev => [...prev, { role: 'assistant', content: 'You are sending messages too quickly. Please wait a moment and try again.' }]);
  } else if (status === 403) {
   setMessages(prev => [...prev, { role: 'assistant', content: 'Chat is currently disabled. Please try again later.' }]);
  } else {
   setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }]);
  }
 } finally {
 setLoading(false);
 }
 };

 const handleSend = () => sendText(input);

 const handleBack = () => { setView('categories'); setMessages([]); setConversationId(null); setEscalated(false); setCategory(null); clearState(); };
 const handleExpand = () => { dispatch(setChatOpen(false)); navigate('/chat'); };
 const handleClose = () => { dispatch(setChatOpen(false)); };

 return (
 <>
 {!open && (
 <button
 onClick={() => dispatch(setChatOpen(true))}
 data-testid="chat-widget-open"
 aria-label="Open chat"
 className="fixed bottom-6 right-6 z-50 w-[52px] h-[52px] rounded-full overflow-hidden bg-slate-950 text-white border-2 border-white shadow-lg shadow-slate-950/30 hidden md:flex items-center justify-center hover:bg-slate-800 active:scale-95 transition-all duration-150"
 >
 {favicon ? (
 <img src={favicon} alt="Chat" className="w-full h-full object-cover" />
 ) : (
 <Sparkles size={22} strokeWidth={2.2} />
 )}
 </button>
 )}

 {open && (
 <div className="fixed inset-x-0 top-0 bottom-[calc(72px+env(safe-area-inset-bottom))] z-50 flex flex-col overflow-hidden bg-white animate-slide-up sm:left-auto sm:top-auto sm:bottom-6 sm:right-6 sm:h-auto sm:max-h-[540px] sm:w-[384px] sm:rounded-2xl sm:border sm:border-slate-900/10 sm:shadow-2xl sm:shadow-slate-950/25">
 <div className="px-3.5 py-3 flex items-center justify-between flex-shrink-0 bg-slate-950">
 <div className="flex items-center gap-2.5">
 {view === 'chat' && (
 <button onClick={handleBack} aria-label="Back" className="flex h-7 w-7 items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors">
 <ArrowLeft size={16} />
 </button>
 )}
 <div className="relative w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center overflow-hidden ring-1 ring-white/20">
 {favicon ? <img src={favicon} alt="" className="w-full h-full object-cover" /> : <MessageSquare size={16} className="text-white" />}
 <span className="absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-slate-950" />
 </div>
 <div>
 <div className="text-white font-bold text-[13px] leading-tight tracking-tight">{view === 'chat' && category ? category.label : (config.botName || 'AI Assistant')}</div>
 <div className="text-white/55 text-[11px] flex items-center gap-1">
 {view === 'chat' ? 'Typically replies instantly' : 'Online · replies instantly'}
 </div>
 </div>
 </div>
 <div className="flex items-center gap-1">
 <button onClick={handleExpand} className="flex h-7 w-7 items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors" title="Open full page">
 <ArrowUpRight size={15} />
 </button>
 <button onClick={handleClose} aria-label="Close chat" className="flex h-7 w-7 items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors">
 <X size={15} />
 </button>
 </div>
 </div>

 {view === 'categories' ? (
 <div className="p-5 flex-1 overflow-y-auto">
 {restoring ? (
 <div className="flex justify-center py-10"><Loader size="sm" /></div>
 ) : (
 <>
 <div className="text-center mb-4">
 <div className="w-12 h-12 rounded-2xl bg-slate-950 flex items-center justify-center mx-auto mb-2.5 overflow-hidden shadow-lg shadow-slate-950/20">
 {favicon ? <img src={favicon} alt="" className="w-full h-full object-cover" /> : <MessageSquare size={20} className="text-white" />}
 </div>
 <p className="text-[15px] font-extrabold tracking-tight text-slate-900">{config.botName || 'AI Assistant'}</p>
 <p className="text-xs text-slate-400 mt-0.5">{config.welcomeMessage || 'How can I help you today? Select a category to start.'}</p>
 </div>
 <div className="flex flex-col gap-2">
 {categories.map(cat => {
 const Icon = cat.icon || MessageSquare;
 return (
 <button key={cat.key} data-testid={`chat-widget-category-${cat.key}`} onClick={() => handleSelectCategory(cat)} disabled={starting}
 className="group flex items-center gap-3 p-3 border border-slate-200/80 rounded-xl hover:border-slate-900 hover:shadow-md hover:shadow-slate-950/5 transition-all duration-150 text-left disabled:opacity-50 bg-white">
 <div className={`w-10 h-10 rounded-lg ${cat.bg || 'bg-slate-100'} flex items-center justify-center flex-shrink-0`}>
 <Icon size={19} className={cat.color || 'text-slate-600'} />
 </div>
 <div className="flex-1 min-w-0">
 <div className="font-bold text-[13px] text-slate-900">{cat.label}</div>
 <div className="text-[11px] text-slate-400 truncate">{cat.desc}</div>
 </div>
 {starting && category?.key === cat.key
 ? <Loader size="sm" inline className="flex-shrink-0" />
 : <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-900 group-hover:translate-x-0.5 transition-all flex-shrink-0" />}
 </button>
 );
 })}
 </div>
 {(config.faqs?.length > 0 || config.quickReplies?.length > 0) && (
 <p className="text-[11px] text-gray-400 text-center mt-4">Tip: you can ask a question directly after starting a chat.</p>
 )}
 </>
 )}
 </div>
 ) : (
 <>
 <div className="flex-1 overflow-y-auto p-3.5 space-y-3 min-h-0 bg-slate-100/70">
 {messages.map((m, i) => (
 <div key={i}>
 <div className={`flex ${m.role === 'user' ? 'justify-end' : 'gap-2'}`}>
 {m.role === 'assistant' && <BotAvatar favicon={favicon} />}
 {m.role === 'user' ? (
 <div className="max-w-[80%] break-anywhere px-3.5 py-2.5 text-[13px] leading-relaxed text-white rounded-2xl rounded-tr-sm" style={{ background: primaryColor }}>
 {m.content}
 </div>
 ) : (
 <div className="max-w-[85%] break-anywhere px-3.5 py-2.5 text-[13px] leading-relaxed bg-white text-slate-800 border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.06)] rounded-2xl rounded-tl-md chat-message"
 dangerouslySetInnerHTML={{ __html: formatMessage(m.content) }} />
 )}
 </div>
 {m.products?.length > 0 && (
 <div className="ml-9 mt-2 space-y-2">
 {m.products.map((p, j) => (
 <ProductCard key={j} product={p} settings={settings} onAddToCart={handleAddToCart} />
 ))}
 </div>
 )}
 </div>
 ))}
 {loading && (
 <div className="flex gap-2">
 <BotAvatar favicon={favicon} />
 <div className="bg-white border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.06)] rounded-2xl rounded-tl-md px-4 py-3">
 <Loader size="sm" inline />
 </div>
 </div>
 )}
 {escalated && (
 <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-800">
 <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />
 <span className="min-w-0 break-anywhere">{config.escalationMessage || 'This conversation has been escalated to our team.'}</span>
 </div>
 )}
 {/* Quick replies + FAQ shortcuts */}
 {!escalated && !loading && (config.quickReplies?.length > 0 || config.faqs?.length > 0) && (
 <div className="flex flex-wrap gap-1.5 pt-1">
 {[...(config.quickReplies || []), ...(config.faqs || []).slice(0, 4).map(f => f.question)].slice(0, 6).map((chip, idx) => (
 <button key={idx} onClick={() => sendText(chip)} className="px-2.5 py-1 text-[11px] font-semibold border border-slate-200 bg-white rounded-full text-slate-600 hover:border-slate-900 hover:text-slate-900 transition-colors">
 {String(chip).slice(0, 60)}
 </button>
 ))}
 </div>
 )}
 <div ref={messagesEndRef} />
 </div>

 <div className="p-3 border-t border-gray-100 flex gap-2 flex-shrink-0 bg-white">
 <input data-testid="chat-widget-input" type="text" value={input} onChange={e => setInput(e.target.value)}
 onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
 placeholder={escalated ? (config.escalationMessage || 'Conversation escalated') : (config.placeholder || 'Type a message...')}
 disabled={loading || escalated}
 className="flex-1 border border-slate-200 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-500 disabled:bg-slate-50 disabled:text-slate-400 transition-all" />
 <button data-testid="chat-widget-send" onClick={handleSend} disabled={!input.trim() || loading || escalated}
 className="w-9 h-9 rounded-full text-white flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95 flex-shrink-0"
 style={{ background: primaryColor }}>
 <Send size={15} />
 </button>
 </div>
 </>
 )}
 </div>
 )}
 </>
 );
};

export default ChatWidget;
