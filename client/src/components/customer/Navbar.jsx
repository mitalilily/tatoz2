import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
 ShoppingCart, Search, Heart, User, Menu, X, Package,
 LogOut, Settings, WalletCards, Award, Gift, Repeat2, ChevronDown, ChevronRight, ArrowRight, Sparkles, Loader2, MapPin,
 LocateFixed,
 Link2 as LinkIcon,
} from 'lucide-react';
import { logout } from '../../store/slices/authSlice';
import { toggleCart } from '../../store/slices/uiSlice';
import { selectCartCount } from '../../store/slices/cartSlice';
import { useSite } from '../../context/SiteContext';
import { formatPrice } from '../../utils/formatPrice';
import { productAPI, trackingAPI } from '../../services/api';
import { trackMetaPixel } from '../../utils/metaPixel';
import { lookupPincode } from '../../utils/pincode';
import NotificationBell from './NotificationBell';
import { useTranslation } from 'react-i18next';
import { PLATFORM_NAME, displayPlatformName } from '../../constants/branding';

const Navbar = () => {
 const { t } = useTranslation();
 const dispatch = useDispatch();
 const navigate = useNavigate();
 const { site, settings } = useSite();
 const { user, isAuthenticated } = useSelector((s) => s.auth);
 const { categories } = useSelector((s) => s.products);
 const cartCount = useSelector(selectCartCount);

 const [searchQuery, setSearchQuery] = useState('');
 const [searchOpen, setSearchOpen] = useState(false);
 const [scrolled, setScrolled] = useState(false);
 const [userMenuOpen, setUserMenuOpen] = useState(false);
 const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
 const [searchResults, setSearchResults] = useState([]);
 const [searchLoading, setSearchLoading] = useState(false);
 const [searchFocused, setSearchFocused] = useState(false);
 const [deliverLocation, setDeliverLocation] = useState(() => {
 try { return localStorage.getItem('deliverLocation') || ''; } catch { return ''; }
 });
 const [deliverPincode, setDeliverPincode] = useState(() => {
 try { return localStorage.getItem('deliverPincode') || ''; } catch { return ''; }
 });
 const [locationLoading, setLocationLoading] = useState(false);
 const [locationPickerOpen, setLocationPickerOpen] = useState(false);
 const [locationPincode, setLocationPincode] = useState('');
 const [locationError, setLocationError] = useState('');
 const [locationMessage, setLocationMessage] = useState('');
 const searchInputRef = useRef(null);
 const searchBarRef = useRef(null);
 const debounceRef = useRef(null);
 const locationPincodeRef = useRef(null);

 const siteLogo = site?.logo || '';
 const siteName = displayPlatformName(settings?.siteName || site?.name || PLATFORM_NAME);

 /* ── Live search as user types ──────────────────────────── */
 const fetchSearchResults = useCallback((q) => {
 if (debounceRef.current) clearTimeout(debounceRef.current);
 const trimmed = q.trim();
 if (trimmed.length < 2) {
 setSearchResults([]);
 setSearchLoading(false);
 return;
 }
 setSearchLoading(true);
 debounceRef.current = setTimeout(async () => {
 try {
 const res = await productAPI.getAll({ search: trimmed, limit: 6 });
 setSearchResults((res.data.products || []).filter(product => product && (product._id || product.slug)));
 } catch {
 setSearchResults([]);
 } finally {
 setSearchLoading(false);
 }
 }, 300);
 }, []);

 const handleSearchInput = (e) => {
 const val = e.target.value;
 setSearchQuery(val);
 fetchSearchResults(val);
 };

 /* ── Cleanup debounce on unmount ─────────────────────────── */
 useEffect(() => {
 return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
 }, []);

 /* ── Scroll shadow ───────────────────────────────────────── */
 useEffect(() => {
 const onScroll = () => setScrolled(window.scrollY > 10);
 window.addEventListener('scroll', onScroll);
 return () => window.removeEventListener('scroll', onScroll);
 }, []);

 /* ── Search overlay body lock + focus ────────────────────── */
 useEffect(() => {
 if (searchOpen) {
 document.body.style.overflow = 'hidden';
 setTimeout(() => searchInputRef.current?.focus(), 80);
 } else {
 document.body.style.overflow = '';
 setSearchResults([]);
 setSearchLoading(false);
 }
 return () => { document.body.style.overflow = ''; };
 }, [searchOpen]);

/* ── Mobile drawer body lock ─────────────────────────────── */
useEffect(() => {
 if (!mobileMenuOpen) return undefined;
 document.body.style.overflow = 'hidden';
 return () => { document.body.style.overflow = ''; };
}, [mobileMenuOpen]);

 /* ── Keyboard shortcuts ──────────────────────────────────── */
 useEffect(() => {
 const onKey = (e) => {
 if (e.key === 'Escape') { setSearchOpen(false); setUserMenuOpen(false); }
 if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(true); }
 };
 window.addEventListener('keydown', onKey);
 return () => window.removeEventListener('keydown', onKey);
 }, []);

 const handleSearch = (e) => {
 e.preventDefault();
 if (!searchQuery.trim()) return;
 trackMetaPixel('Search', { search_string: searchQuery.trim(), content_type: 'product' });
 trackingAPI.track({ eventType: 'search', target: searchQuery.trim(), page: window.location.pathname });
 navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
 setSearchQuery('');
 setSearchOpen(false);
 };

 const handleLogout = () => {
 dispatch(logout());
 navigate('/');
 setUserMenuOpen(false);
 setMobileMenuOpen(false);
 };

 const saveLocation = (label, pincode = '') => {
 const normalizedPincode = String(pincode || '').replace(/\D/g, '').slice(0, 6);
 setDeliverLocation(label);
 setDeliverPincode(normalizedPincode);
 try {
 localStorage.setItem('deliverLocation', label);
 if (normalizedPincode) localStorage.setItem('deliverPincode', normalizedPincode);
 else localStorage.removeItem('deliverPincode');
 } catch {}
 };

 const fetchJsonWithTimeout = async (url, options = {}, timeoutMs = 7000) => {
 const controller = new AbortController();
 const timer = setTimeout(() => controller.abort(), timeoutMs);
 try {
 const res = await fetch(url, { ...options, signal: controller.signal });
 if (!res.ok) throw new Error(`Location lookup failed with ${res.status}`);
 return res.json();
 } finally {
 clearTimeout(timer);
 }
 };

 const getCurrentPosition = () => new Promise((resolve, reject) => {
 if (!navigator.geolocation) return reject(new Error('Geolocation is not supported by this browser'));
 navigator.geolocation.getCurrentPosition(resolve, reject, {
 enableHighAccuracy: false,
 timeout: 8000,
 maximumAge: 300000,
 });
 });

 const detectCurrentLocation = async () => {
 if (locationLoading) return;
 setLocationLoading(true);
 setLocationError('');
 setLocationMessage('Finding your location…');
 try {
 let label = '';
 let pincode = '';

 // Prefer precise browser location. If permission is denied, continue with
 // the IP fallback so the picker still works without a browser prompt.
 try {
 const position = await getCurrentPosition();
 const params = new URLSearchParams({
 format: 'jsonv2',
 zoom: '10',
 lat: String(position.coords.latitude),
 lon: String(position.coords.longitude),
 });
 const data = await fetchJsonWithTimeout(`https://nominatim.openstreetmap.org/reverse?${params}`, {
 headers: { Accept: 'application/json' },
 });
 const address = data?.address || {};
 const city = address.city || address.town || address.village || address.municipality || address.county;
 const state = address.state || address.state_district;
 label = [city, state].filter(Boolean).join(', ');
 pincode = String(address.postcode || '').replace(/\D/g, '').slice(0, 6);
 } catch (_) { /* browser permission or reverse-geocoder can fail; use IP */ }

 if (!label) {
 const data = await fetchJsonWithTimeout('https://ipapi.co/json/');
 label = [data.city, data.region].filter(Boolean).join(', ') || data.country_name || '';
 pincode = String(data.postal || '').replace(/\D/g, '').slice(0, 6);
 }
 if (!label) throw new Error('Location could not be detected');
 saveLocation(label, pincode);
 setLocationMessage('Location saved');
 setTimeout(() => setLocationPickerOpen(false), 500);
 } catch {
 setLocationError('Could not detect your location. Enter a 6-digit pincode instead.');
 setLocationMessage('');
 } finally {
 setLocationLoading(false);
 }
 };

 const selectPincodeLocation = async (event) => {
 event.preventDefault();
 const code = locationPincode.replace(/\D/g, '');
 if (code.length !== 6) {
 setLocationError('Enter a valid 6-digit pincode.');
 return;
 }
 if (locationLoading) return;
 setLocationLoading(true);
 setLocationError('');
 setLocationMessage('Checking pincode…');
 try {
 const result = await lookupPincode(code);
 if (!result?.city && !result?.state) throw new Error('Invalid pincode');
 const label = [result.city, result.state].filter(Boolean).join(', ');
 saveLocation(label || code, code);
 setLocationMessage('Location saved');
 setTimeout(() => setLocationPickerOpen(false), 500);
 } catch {
 setLocationError('Pincode not found. Please check it and try again.');
 setLocationMessage('');
 } finally {
 setLocationLoading(false);
 }
 };

 const openLocationPicker = () => {
 setLocationPickerOpen(true);
 setLocationError('');
 setLocationMessage('');
 setLocationPincode(deliverPincode);
 setTimeout(() => locationPincodeRef.current?.focus(), 80);
 };

 useEffect(() => {
 if (!locationPickerOpen) return undefined;
 const onKey = (event) => { if (event.key === 'Escape') setLocationPickerOpen(false); };
 document.addEventListener('keydown', onKey);
 document.body.style.overflow = 'hidden';
 return () => {
 document.removeEventListener('keydown', onKey);
 document.body.style.overflow = '';
 };
 }, [locationPickerOpen]);

 const initials = user?.name?.charAt(0).toUpperCase() || 'U';
 const wishlistCount = user?.wishlist?.length || 0;

 // Header chrome is admin-configurable (Admin → Customization → Header).
 // Anything unsaved falls back to the current design so fresh installs look identical.
 const FALLBACK_MENU_LINKS = [
 { label: 'Profile', url: '/profile' },
 { label: 'My Orders', url: '/orders' },
 { label: 'Wishlist', url: '/wishlist' },
 { label: 'Wallet', url: '/wallet' },
 { label: 'Loyalty & Rewards', url: '/loyalty' },
 { label: 'Gift Cards', url: '/gift-cards' },
 { label: 'Pre-orders & Plans', url: '/lifecycle' },
 { label: 'Settings', url: '/settings' },
 ];
 const MENU_ICONS = {
 '/profile': User,
 '/orders': Package,
 '/wishlist': Heart,
 '/wallet': WalletCards,
 '/loyalty': Award,
 '/gift-cards': Gift,
 '/lifecycle': Repeat2,
 '/settings': Settings,
 };
 const savedHeader = (site && site.header) || {};
 const hd = {
 backgroundColor: '#ffffff',
 textColor: '#111827',
 accentColor: '#4f46e5',
 sticky: true,
 searchPlaceholder: 'Search for products, categories or brands...',
 deliverToLabel: 'Deliver to',
 ...savedHeader,
 show: { deliverTo: true, search: true, notifications: true, account: true, wishlist: true, cart: true, mobileMenu: true, ...(savedHeader.show || {}) },
 menuLinks: Array.isArray(savedHeader.menuLinks) ? savedHeader.menuLinks : FALLBACK_MENU_LINKS,
 };
 const menuIcon = (url) => MENU_ICONS[url] || LinkIcon;

 return (
 <>
 {/* ══ SEARCH OVERLAY ══════════════════════════════════════════════ */}
 {searchOpen && (
 <div
 className="fixed inset-0 z-[200] flex flex-col"
 onClick={(e) => e.target === e.currentTarget && setSearchOpen(false)}
 >
 <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={() => setSearchOpen(false)} />
 <div className="relative bg-white shadow-2xl border-b border-gray-100" style={{ animation: 'slideDown 0.2s ease' }}>
 <div className="page-container pt-5 pb-6">
 <form onSubmit={handleSearch} className="flex min-w-0 items-center gap-2 sm:gap-3 mb-6">
 <div className="min-w-0 flex-1 flex items-center gap-3 bg-gray-100 rounded-2xl px-4 py-3.5 sm:px-5 ring-2 ring-primary-500/30 focus-within:ring-primary-500">
 <Search size={20} className="text-primary-500 flex-shrink-0" />
 <input
 ref={searchInputRef}
 type="text"
 value={searchQuery}
 onChange={handleSearchInput}
 placeholder="Search products, brands, categories…"
 className="flex-1 bg-transparent text-gray-900 text-base placeholder:text-gray-400 focus:outline-none"
 />
 {searchQuery && (
 <button type="button" onClick={() => setSearchQuery('')} className="text-gray-400 hover:text-gray-600 transition-colors">
 <X size={16} />
 </button>
 )}
 </div>
 {searchQuery.trim() && (
 <button type="submit" className="btn-primary shrink-0 px-4 py-3 text-sm font-bold sm:px-5">
 Search
 </button>
 )}
 <button type="button" onClick={() => setSearchOpen(false)} className="p-3 rounded-2xl hover:bg-gray-100 transition-colors flex-shrink-0">
 <X size={20} className="text-gray-500" />
 </button>
 </form>

 {searchQuery.trim().length >= 2 && (
 <div className="mb-6">
 {searchLoading ? (
 <div className="flex items-center justify-center gap-2 py-6 text-gray-400">
 <Loader2 size={18} className="animate-spin" />
 <span className="text-sm">Searching…</span>
 </div>
 ) : searchResults.length > 0 ? (
 <>
 <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400 mb-3">Products</p>
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
 {searchResults.map((product) => (
 <Link
 key={product._id}
 to={`/product/${product.slug || product._id}`}
 onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
 className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group"
 >
 <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
 <img
 src={product.thumbnail || product.images?.[0]?.url || 'https://via.placeholder.com/100'}
 alt={product.title}
 loading="lazy"
 decoding="async"
 className="w-full h-full object-cover"
 onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/100'; }}
 />
 </div>
 <div className="min-w-0 flex-1">
 <p className="text-sm font-medium text-gray-900 truncate group-hover:text-primary-600 transition-colors">
 {product.title}
 </p>
 <p className="text-xs text-gray-500">
 {Number(product.comparePrice || 0) > Number(product.price || 0) ? (
 <>
 <span className="font-semibold text-primary-600">{formatPrice(product.price, settings)}</span>
 <span className="line-through ml-1.5 text-gray-400">{formatPrice(product.comparePrice, settings)}</span>
 </>
 ) : (
 <span className="font-semibold">{formatPrice(product.price, settings)}</span>
 )}
 </p>
 </div>
 </Link>
 ))}
 </div>
 <Link
 to={`/search?q=${encodeURIComponent(searchQuery.trim())}`}
 onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
 className="mt-3 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gray-50 text-sm font-semibold text-primary-600 hover:bg-primary-50 transition-colors"
 >
 View all results <ArrowRight size={14} />
 </Link>
 </>
 ) : (
 <div className="text-center py-6">
 <p className="text-sm text-gray-400">No products found for &ldquo;{searchQuery.trim()}&rdquo;</p>
 </div>
 )}
 </div>
 )}

 {/* Category grid — shown when search input is empty */}
 {!searchQuery.trim() && (
 <div>
 <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400 mb-3">Browse categories</p>
 {categories.length > 0 ? (
 <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
 {categories.slice(0, 12).map((cat) => (
 <Link
 key={cat._id}
 to={`/category/${cat.slug}`}
 onClick={() => setSearchOpen(false)}
 className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-gray-50 transition-colors group"
 >
 <div className="w-14 h-14 rounded-full bg-gray-100 overflow-hidden border border-gray-200 group-hover:border-primary-300 transition-colors flex-shrink-0">
 {cat.image ? (
 <img src={cat.image} alt={cat.name} loading="lazy" decoding="async" className="w-full h-full object-cover"
 onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/200/c4b5fd/1e1b4b?text=Category'; }} />
 ) : (
 <div className="w-full h-full flex items-center justify-center text-gray-400 text-lg font-bold">
 {cat.name?.charAt(0)}
 </div>
 )}
 </div>
 <p className="text-xs font-medium text-gray-600 group-hover:text-primary-600 text-center truncate w-full transition-colors">
 {cat.name}
 </p>
 </Link>
 ))}
 </div>
 ) : (
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
 {['Electronics', 'Fashion', 'Home & Living', 'Beauty', 'Sports', 'Books', 'Groceries', 'Toys'].map((c) => (
 <Link key={c} to={`/search?q=${c}`} onClick={() => setSearchOpen(false)}
 className="px-4 py-3 rounded-xl bg-gray-50 text-sm text-gray-600 hover:bg-primary-50 hover:text-primary-700 transition-colors font-medium text-center">
 {c}
 </Link>
 ))}
 </div>
 )}
 <div className="mt-4 flex justify-end">
 <Link to="/search" onClick={() => setSearchOpen(false)} className="text-xs font-semibold text-primary-600 hover:underline flex items-center gap-1">
 Browse all products <ArrowRight size={11} />
 </Link>
 </div>
 </div>
 )}
 </div>
 </div>
 </div>
 )}


 {/* ══ MAIN NAVBAR ═════════════════════════════════════════════════ */}
 <nav className={`${hd.sticky ? 'sticky top-0' : 'relative'} z-50 transition-shadow duration-300 border-b ${
 scrolled ? 'shadow-sm shadow-black/5' : ''
 }`}
 style={{ backgroundColor: hd.backgroundColor, color: hd.textColor, borderColor: `color-mix(in srgb, ${hd.textColor} 14%, transparent)`, '--hd-text': hd.textColor, '--hd-accent': hd.accentColor }}>
 <div className="page-container">
 <div className="flex items-center gap-2 sm:gap-5 h-[64px]">

 {/* Logo */}
 <Link to="/" className="flex min-w-0 items-center flex-shrink-0">
 {siteLogo ? (
 <img src={siteLogo} alt="Site logo" loading="eager" decoding="async" className="h-8 w-auto max-w-[112px] object-contain sm:max-w-[140px]" />
 ) : (
 <div className="h-8 w-[104px] rounded-lg bg-gray-100 border border-dashed border-gray-300 sm:w-[120px]" aria-hidden />
 )}
 </Link>

 {/* Deliver to — desktop */}
 {hd.show.deliverTo && (
 <button type="button" onClick={openLocationPicker} className="hidden lg:flex items-center gap-2 flex-shrink-0 cursor-pointer group" data-testid="location-picker-button" aria-label="Choose delivery location">
 <MapPin size={20} className={locationLoading ? 'text-[var(--hd-accent)] animate-pulse' : 'text-[var(--hd-text)]'} />
 <div className="leading-tight text-left">
 <span className="text-[11px] opacity-70">{hd.deliverToLabel}</span>
 <p className="text-xs font-semibold text-[var(--hd-text)] group-hover:text-[var(--hd-accent)] transition-colors">
 {locationLoading ? 'Detecting...' : deliverLocation || 'Pick Location'}
 </p>
 </div>
 </button>
 )}

 {/* Search bar — desktop */}
 {hd.show.search && (
 <div className="flex-1 hidden md:block relative" ref={searchBarRef}>
 <form onSubmit={handleSearch} className={`flex rounded-full border transition-all duration-200 ${
 searchFocused
 ? 'border-primary-400 shadow-[0_0_0_3px_rgba(var(--color-primary-500),0.15)]'
 : 'border-gray-300 shadow-sm hover:shadow-md hover:border-gray-400'
 } bg-white overflow-hidden`}>
 <input
 type="text"
 value={searchQuery}
 onChange={handleSearchInput}
 onFocus={() => { setSearchFocused(true); if (searchQuery.trim().length >= 2) fetchSearchResults(searchQuery); }}
 onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
 placeholder={hd.searchPlaceholder}
 className="flex-1 h-[42px] px-5 text-sm text-gray-900 bg-transparent focus:outline-none placeholder:text-gray-400"
 />
 <button
 type="submit"
 className="h-[42px] w-[46px] flex items-center justify-center hover:bg-gray-100 transition-colors flex-shrink-0"
 >
 <Search size={18} className="text-gray-500" />
 </button>
 </form>

 {/* Inline search suggestions dropdown */}
 {searchFocused && searchQuery.trim().length >= 2 && (
 <div className="absolute top-[calc(100%+6px)] left-0 right-0 bg-white rounded-2xl shadow-2xl border border-gray-200 z-50 overflow-hidden">
 {searchLoading ? (
 <div className="flex items-center justify-center gap-2 py-5 text-gray-400">
 <Loader2 size={16} className="animate-spin" />
 <span className="text-sm">Searching…</span>
 </div>
 ) : searchResults.length > 0 ? (
 <div className="py-2">
 <p className="px-4 pt-1 pb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">Products</p>
 {searchResults.map((product) => (
 <Link
 key={product._id}
 to={`/product/${product.slug || product._id}`}
 onMouseDown={(e) => e.preventDefault()}
 onClick={() => { setSearchQuery(''); setSearchFocused(false); }}
 className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors group"
 >
 <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
 <img
 src={product.thumbnail || product.images?.[0]?.url || 'https://via.placeholder.com/100'}
 alt={product.title}
 loading="lazy"
 decoding="async"
 className="w-full h-full object-cover"
 onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/100'; }}
 />
 </div>
 <div className="min-w-0 flex-1">
 <p className="text-sm font-medium text-gray-900 truncate group-hover:text-primary-600 transition-colors">
 {product.title}
 </p>
 <p className="text-xs text-gray-500">
 {Number(product.comparePrice || 0) > Number(product.price || 0) ? (
 <>
 <span className="font-semibold text-primary-600">{formatPrice(product.price, settings)}</span>
 <span className="line-through ml-1.5 text-gray-400">{formatPrice(product.comparePrice, settings)}</span>
 </>
 ) : (
 <span className="font-semibold">{formatPrice(product.price, settings)}</span>
 )}
 </p>
 </div>
 <ArrowRight size={14} className="text-gray-300 group-hover:text-primary-500 transition-colors flex-shrink-0" />
 </Link>
 ))}
 <Link
 to={`/search?q=${encodeURIComponent(searchQuery.trim())}`}
 onMouseDown={(e) => e.preventDefault()}
 onClick={() => { setSearchQuery(''); setSearchFocused(false); }}
 className="flex items-center justify-center gap-1.5 mx-3 mt-1 mb-2 py-2 rounded-xl bg-gray-50 text-xs font-semibold text-primary-600 hover:bg-primary-50 transition-colors"
 >
 View all results <ArrowRight size={12} />
 </Link>
 </div>
 ) : (
 <div className="text-center py-5">
 <p className="text-sm text-gray-400">No products found for &ldquo;{searchQuery.trim()}&rdquo;</p>
 </div>
 )}
 </div>
 )}
 </div>
 )}

 {/* Right actions */}
 <div className="ml-auto flex flex-shrink-0 items-center gap-1 sm:gap-4 md:ml-0">

 {/* Mobile search */}
 {hd.show.search && (
 <button onClick={() => setSearchOpen(true)} className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors" aria-label="Search">
 <Search size={20} className="text-[var(--hd-text)]" />
 </button>
 )}

 {/* Notifications — desktop only */}
 {isAuthenticated && hd.show.notifications && <div className="hidden md:block"><NotificationBell /></div>}

 {/* Sign In / Account */}
 {hd.show.account && (isAuthenticated ? (
 <div className="relative hidden md:block">
 <button
 onClick={() => setUserMenuOpen(!userMenuOpen)}
 className="flex items-center gap-2 hover:text-[var(--hd-accent)] transition-colors"
 >
 <User size={24} className="text-[var(--hd-text)]" strokeWidth={1.5} />
 <div className="leading-tight text-left">
 <span className="text-[11px] opacity-70 block">Welcome</span>
 <p className="text-xs font-semibold text-[var(--hd-text)] max-w-[80px] truncate">{user?.name}</p>
 </div>
 </button>

 {userMenuOpen && (
 <div className="absolute right-0 top-[calc(100%+8px)] w-56 bg-white rounded-2xl shadow-2xl border border-gray-100 py-1.5 animate-fade-in z-50">
 <div className="px-4 py-3 border-b border-gray-100">
 <p className="font-bold text-gray-900 text-sm truncate">{user?.name}</p>
 <p className="text-xs text-gray-400 mt-0.5 truncate">{user?.email}</p>
 </div>
 {hd.menuLinks.map(({ label, url: to }) => {
 const Icon = menuIcon(to);
 return (
 <Link key={to} to={to} onClick={() => setUserMenuOpen(false)}
 className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors">
 <Icon size={15} className="text-gray-400 flex-shrink-0" />
 {label}
 </Link>
 );
 })}
 {(user?.role === 'admin' || user?.role === 'superadmin') && (
 <Link to="/admin" onClick={() => setUserMenuOpen(false)}
 className="flex items-center gap-3 px-4 py-2.5 text-sm text-primary-600 hover:bg-primary-50 transition-colors">
 <Sparkles size={15} className="flex-shrink-0" />
 Admin Panel
 </Link>
 )}
 <div className="my-1 border-t border-gray-100" />
 <button onClick={handleLogout}
 className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors">
 <LogOut size={15} className="flex-shrink-0" />
 Sign Out
 </button>
 </div>
 )}
 </div>
 ) : (
 <Link to="/login" className="hidden md:flex items-center gap-2 hover:text-[var(--hd-accent)] transition-colors">
 <User size={24} className="text-[var(--hd-text)]" strokeWidth={1.5} />
 <div className="leading-tight text-left">
 <span className="text-[11px] opacity-70 block">Sign In</span>
 <p className="text-xs font-semibold text-[var(--hd-text)]">Account</p>
 </div>
 </Link>
 ))}

 {/* Wishlist */}
 {hd.show.wishlist && (
 <Link to="/wishlist" className="relative hidden md:block" aria-label="Wishlist">
 <Heart size={24} className="text-[var(--hd-text)]" strokeWidth={1.5} />
 {wishlistCount > 0 && (
 <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center font-bold px-0.5">
 {wishlistCount > 9 ? '9+' : wishlistCount}
 </span>
 )}
 </Link>
 )}

 {/* Cart */}
 {hd.show.cart && (
 <button onClick={() => dispatch(toggleCart())} className="relative" data-testid="navbar-cart-button" aria-label="Open cart">
 <ShoppingCart size={24} className="text-[var(--hd-text)]" strokeWidth={1.5} />
 {cartCount > 0 && (
 <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center font-bold px-0.5">
 {cartCount > 99 ? '99+' : cartCount}
 </span>
 )}
 </button>
 )}

 {/* Mobile hamburger */}
 {hd.show.mobileMenu && (
 <button
 onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
 className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
 aria-label="Menu"
 >
 {mobileMenuOpen
 ? <X size={22} className="text-[var(--hd-text)]" />
 : <Menu size={22} className="text-[var(--hd-text)]" />
 }
 </button>
 )}
 </div>
 </div>
 </div>

 {/* ── Mobile menu: left sidebar drawer, everything in list form ── */}
 {hd.show.mobileMenu && mobileMenuOpen && (
 <div className="fixed inset-0 z-[150] md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
 <div className="absolute inset-0 bg-black/50" onClick={() => setMobileMenuOpen(false)} />
 <aside className="absolute inset-y-0 left-0 flex w-[84%] max-w-xs flex-col bg-white shadow-xl">
 {/* Drawer header */}
 <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
 {isAuthenticated ? (
 <div className="flex min-w-0 items-center gap-3">
 <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
 {initials}
 </div>
 <div className="min-w-0">
 <p className="truncate text-sm font-bold text-gray-900">{user?.name}</p>
 <p className="truncate text-xs text-gray-400">{user?.email}</p>
 </div>
 </div>
 ) : (
 <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="rounded-lg bg-[var(--hd-accent)] px-4 py-2 text-sm font-bold text-white">
 Login / Sign Up
 </Link>
 )}
 <button
 type="button"
 onClick={() => setMobileMenuOpen(false)}
 aria-label="Close menu"
 className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
 >
 <X size={20} />
 </button>
 </div>

 {/* Drawer body */}
 <div className="flex-1 overflow-y-auto py-2">
 {/* Mobile search */}
 {hd.show.search && (
 <form onSubmit={handleSearch} className="flex px-4 pb-2">
 <input
 type="text"
 value={searchQuery}
 onChange={handleSearchInput}
 placeholder={hd.searchPlaceholder}
 aria-label="Search products"
 className="h-[40px] min-w-0 flex-1 rounded-l-md border border-r-0 border-gray-300 bg-white px-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none"
 />
 <button type="submit" aria-label="Search" className="flex h-[40px] w-[44px] flex-shrink-0 items-center justify-center rounded-r-md border border-l-0 border-gray-300 bg-white">
 <Search size={18} className="text-gray-600" />
 </button>
 </form>
 )}

 {/* Account links — list form */}
 <nav aria-label="Account menu">
 {hd.menuLinks.map(({ label, url: to }) => {
 const Icon = menuIcon(to);
 return (
 <Link key={to} to={to} onClick={() => setMobileMenuOpen(false)}
 className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-gray-800 hover:bg-gray-50">
 <Icon size={17} className="flex-shrink-0 text-gray-400" />
 <span className="min-w-0 flex-1 truncate">{label}</span>
 <ChevronRight size={16} className="flex-shrink-0 text-gray-300" />
 </Link>
 );
 })}
 </nav>

 <div className="my-2 border-t border-gray-100" />

 {/* Utility links — list form */}
 <nav aria-label="More options">
 <button type="button" onClick={() => { setMobileMenuOpen(false); openLocationPicker(); }}
 className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-gray-800 hover:bg-gray-50" data-testid="mobile-location-picker-button">
 <MapPin size={17} className="flex-shrink-0 text-gray-400" />
 <span className="min-w-0 flex-1 truncate">{deliverLocation || 'Pick delivery location'}</span>
 <ChevronRight size={16} className="flex-shrink-0 text-gray-300" />
 </button>
 <Link to="/orders" onClick={() => setMobileMenuOpen(false)}
 className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-gray-800 hover:bg-gray-50">
 <Package size={17} className="flex-shrink-0 text-gray-400" />
 <span className="min-w-0 flex-1 truncate">Order Tracking</span>
 <ChevronRight size={16} className="flex-shrink-0 text-gray-300" />
 </Link>
 </nav>
 </div>

 {/* Drawer footer */}
 {isAuthenticated && (
 <div className="border-t border-gray-100 p-3">
 <button onClick={handleLogout}
 className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 py-2.5 text-sm font-semibold text-red-500 hover:bg-red-100">
 <LogOut size={15} />
 Sign Out
 </button>
 </div>
 )}
 </aside>
 </div>
 )}
 </nav>

 {locationPickerOpen && (
 <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 px-4" role="dialog" aria-modal="true" aria-labelledby="location-picker-title" data-testid="location-picker-modal" onClick={event => { if (event.target === event.currentTarget) setLocationPickerOpen(false); }}>
 <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
 <div className="flex items-start justify-between gap-4">
 <div>
 <h2 id="location-picker-title" className="text-lg font-bold text-gray-900">Choose delivery location</h2>
 <p className="mt-1 text-sm text-gray-500">Get availability and delivery estimates for your area.</p>
 </div>
 <button type="button" onClick={() => setLocationPickerOpen(false)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close location picker">
 <X size={18} />
 </button>
 </div>

 <button type="button" onClick={detectCurrentLocation} disabled={locationLoading} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm font-semibold text-primary-700 hover:bg-primary-100 disabled:cursor-wait disabled:opacity-60" data-testid="location-use-current-button">
 {locationLoading ? <Loader2 size={17} className="animate-spin" /> : <LocateFixed size={17} />}
 {locationLoading ? 'Finding location…' : 'Use my current location'}
 </button>

 <div className="my-5 flex items-center gap-3 text-xs text-gray-400"><span className="h-px flex-1 bg-gray-200" />OR<span className="h-px flex-1 bg-gray-200" /></div>

 <form onSubmit={selectPincodeLocation} className="flex gap-2" data-testid="location-pincode-form">
 <input ref={locationPincodeRef} type="text" inputMode="numeric" maxLength={6} value={locationPincode} onChange={event => { setLocationPincode(event.target.value.replace(/\D/g, '').slice(0, 6)); setLocationError(''); }} className="input min-w-0 flex-1" placeholder="Enter 6-digit pincode" aria-label="Delivery pincode" data-testid="location-pincode-input" />
 <button type="submit" disabled={locationLoading || locationPincode.length !== 6} className="btn-primary shrink-0 px-4 disabled:cursor-not-allowed disabled:opacity-50" data-testid="location-pincode-submit">Apply</button>
 </form>

 {locationMessage && <p className="mt-3 text-sm font-medium text-emerald-600" role="status">{locationMessage}</p>}
 {locationError && <p className="mt-3 text-sm text-red-600" role="alert">{locationError}</p>}
 </div>
 </div>
 )}

 {/* Backdrop for user dropdown */}
 {userMenuOpen && (
 <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
 )}

 <style>{`
 @keyframes slideDown {
 from { opacity: 0; transform: translateY(-12px); }
 to { opacity: 1; transform: translateY(0); }
 }
 `}</style>
 </>
 );
};

export default Navbar;
