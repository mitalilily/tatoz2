import { useState, useEffect, useMemo, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
 LayoutDashboard,
 Package,
 PackagePlus,
 PackageCheck,
 ClipboardList,
 FolderOpen,
 ShoppingCart,
 ShoppingBag,
 Users,
 Tag,
 Star,
 BarChart2,
 Share2,
 Bell,
 Settings,
 IndianRupee,
 HandCoins,
 CreditCard,
 Calculator,
 LogOut,
 Menu,
 X,
 ChevronDown,
 Palette,
 Award,
 Crown,
 FileSpreadsheet,
 Receipt,
 ReceiptText,
 FileText,
 Newspaper,
 Layers,
 Scale,
 MousePointer,
 Truck,
 Navigation,
 Bike,
 Route,
 Search,
 ChevronsLeft,
 ChevronsRight,
 MessageSquare,
 Store,
  Sparkles,
  BrainCircuit,
 Heart,
 WalletCards,
 Gift,
 BadgePercent,
 FileCheck2,
 Building2,
 Building,
 Warehouse,
 ShieldAlert,
 ShieldCheck,
 AlertTriangle,
 LifeBuoy,
  Globe2,
  Plane,
  UserCog,
  MapPinned,
  Megaphone,
  KeyRound,
 CalendarClock,
 RotateCcw,
 Undo2,
 Reply,
 Briefcase,
 Puzzle,
 Wrench,
 Bot,
  HardDrive,
} from 'lucide-react';
import { logout } from '../../store/slices/authSlice';
import { adminAPI } from '../../services/api';
import NotificationBell from '../customer/NotificationBell';
import AiCreditsPill from './AiCreditsPill';
import { useSite } from '../../context/SiteContext';
import { PLATFORM_NAME, displayPlatformName } from '../../constants/branding';

const NAV_GROUPS = [
 {
 label: 'Overview',
 items: [
 { label: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
 { label: 'Analytics', path: '/admin/analytics', icon: BarChart2 },
 { label: 'Reports', path: '/admin/reports', icon: FileSpreadsheet },
 ],
 },
 {
 label: 'Orders & Fulfillment',
 items: [
 { label: 'Orders', path: '/admin/orders', icon: ShoppingCart },
 { label: 'Abandoned Carts', path: '/admin/abandoned-carts', icon: ShoppingBag },
 { label: 'Subscriptions', path: '/admin/lifecycle', icon: CalendarClock },
 { label: 'Invoices', path: '/admin/invoices', icon: FileCheck2 },
 { label: 'Credit / Debit Notes', path: '/admin/invoice-notes', icon: FileText },
 { label: 'Returns / RMA', path: '/admin/returns', icon: Undo2 },
 { label: 'Refunds', path: '/admin/refunds', icon: RotateCcw },
 { label: 'Shipping Rules', path: '/admin/shipping-rules', icon: Route },
 { label: 'Serviceable Pincodes', path: '/admin/pincodes', icon: MapPinned },
 ],
 },
 {
 label: 'Catalog',
 items: [
 { label: 'Products', path: '/admin/products', icon: Package },
 { label: 'Categories', path: '/admin/categories', icon: FolderOpen },
 { label: 'Brands', path: '/admin/brands', icon: Award },
 { label: 'Bundles & Combos', path: '/admin/bundles', icon: PackagePlus },
 { label: 'Inventory', path: '/admin/inventory', icon: ClipboardList },
 { label: 'Warehouses', path: '/admin/warehouses', icon: Warehouse },
 { label: 'Recommendations', path: '/admin/recommendations', icon: Sparkles },
 { label: 'Product Intent', path: '/admin/product-intents', icon: Heart },
 ],
 },
 {
 label: 'Customers & Support',
 items: [
 { label: 'Customers', path: '/admin/customers', icon: Users },
 { label: 'Reviews', path: '/admin/reviews', icon: Star },
 { label: 'Support Tickets', path: '/admin/support', icon: LifeBuoy },
 { label: 'AI Conversations', path: '/admin/conversations', icon: MessageSquare },
 { label: 'Chatbot Settings', path: '/admin/chatbot', icon: Bot },
 ],
 },
 {
 label: 'Marketing & Growth',
 items: [
 { label: 'Campaigns', path: '/admin/campaigns', icon: Megaphone },
 { label: 'Notifications', path: '/admin/notifications', icon: Bell },
 { label: 'Coupons', path: '/admin/coupons', icon: Tag },
 { label: 'Referral', path: '/admin/referral', icon: Share2 },
 { label: 'Affiliate Payouts', path: '/admin/affiliates', icon: HandCoins },
 { label: 'Loyalty & Rewards', path: '/admin/loyalty', icon: Crown },
 { label: 'Gift Cards', path: '/admin/gift-cards', icon: Gift },
 { label: 'Wallets & Credit', path: '/admin/wallets', icon: WalletCards },
 { label: 'Click Tracking', path: '/admin/click-tracking', icon: MousePointer },
 ],
 },
 {
 label: 'Content & Storefront',
 items: [
 { label: 'Pages', path: '/admin/pages', icon: Layers },
 { label: 'Blog', path: '/admin/blog', icon: Newspaper },
 { label: 'Legal Pages', path: '/admin/legal-pages', icon: Scale },
 { label: 'SEO', path: '/admin/seo', icon: Search },
 { label: 'Customization', path: '/admin/customization', icon: Palette },
 { label: 'Storage', path: '/admin/storage', icon: HardDrive },
 ],
 },
 {
 label: 'Sales Channels',
 items: [
 { label: 'Amazon & Flipkart', path: '/admin/marketplace', icon: Store },
 { label: 'Vendors', path: '/admin/vendors', icon: Briefcase },
 { label: 'B2B / Wholesale', path: '/admin/b2b', icon: Building2 },
 { label: 'Payouts', path: '/admin/payouts', icon: IndianRupee },
 ],
 },
 {
 label: 'Finance & Risk',
 items: [
 { label: 'Tax & GST', path: '/admin/tax', icon: BadgePercent },
 { label: 'Product Tax', path: '/admin/product-tax', icon: Receipt },
 { label: 'COD & Fraud Controls', path: '/admin/cod-policy', icon: ShieldCheck },
 ],
 },
 {
 label: 'Integrations',
 items: [],
 },
 {
 label: 'Administration',
 items: [
 { label: 'Modules', path: '/admin/modules', icon: Puzzle },
 { label: 'Staff & Permissions', path: '/admin/staff', icon: UserCog },
 { label: 'Security Events', path: '/admin/security', icon: ShieldAlert },
 { label: 'Language & Currency', path: '/admin/locale-currency', icon: Globe2 },
 { label: 'API Keys', path: '/admin/api-keys', icon: KeyRound },
 { label: 'AI Usage', path: '/admin/ai-usage', icon: BrainCircuit },
 { label: 'Settings', path: '/admin/settings', icon: Settings },
 ],
 },
];

const PROVIDER_LABELS = { shiprocket: 'ShipRocket', delhivery: 'Delhivery', xpressbees: 'XpressBees', bluedart: 'Blue Dart', dtdc: 'DTDC', razorpay: 'Razorpay', cashfree: 'Cashfree', stripe: 'Stripe' };
const SHIPPING_PROVIDERS = new Set(['shiprocket', 'delhivery', 'xpressbees', 'bluedart', 'dtdc']);
const PAYMENT_PROVIDERS = new Set(['razorpay', 'cashfree', 'stripe']);
const providerLabel = provider => PROVIDER_LABELS[provider] || String(provider || '').replace(/[-_]/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
const normalizeActiveProvider = (value, supported) => {
 const provider = String(value || '').trim().toLowerCase();
 return supported.has(provider) ? provider : null;
};

const dynamicPartnerItems = (activeShippingProvider, activePaymentProviders) => {
 const shipping = activeShippingProvider ? [
  { label: providerLabel(activeShippingProvider), path: activeShippingProvider === 'shiprocket' ? '/admin/shiprocket' : `/admin/shipping/${activeShippingProvider}`, icon: Truck },
  ...(activeShippingProvider === 'shiprocket' ? [
   { label: 'Shipment Lifecycle', path: '/admin/shipping-operations/shiprocket', icon: Navigation },
   { label: 'Couriers', path: '/admin/couriers', icon: Bike },
 ] : []),
 ] : [];
 const payments = (Array.isArray(activePaymentProviders) ? activePaymentProviders : []).map(provider => ({
  label: providerLabel(provider), path: provider === 'razorpay' ? '/admin/razorpay' : `/admin/payments/${provider}`, icon: CreditCard,
 }));
 return [...shipping, ...payments];
};

const getNavGroups = (activeShippingProvider, activePaymentProviders) => NAV_GROUPS
 .map((group) => ({
  ...group,
  items: group.label === 'Integrations'
   ? dynamicPartnerItems(activeShippingProvider, activePaymentProviders)
   : group.items,
 }))
 .filter((group) => group.items.length);

const permissionForNavPath = path => {
 if (path.includes('/staff')) return 'staff.read';
 if (path.includes('/security')) return 'security.read';
 if (path.includes('/shipping') || path.includes('/shiprocket') || path.includes('/couriers') || path.includes('/pincodes')) return 'shipping.read';
 if (path.includes('/invoice') || path.includes('/refund') || path.includes('/payout') || path.includes('/tax') || path.includes('/wallet') || path.includes('/loyalty') || path.includes('/gift-card') || path.includes('/affiliate')) return 'finance.read';
 if (path.includes('/vendor') || path.includes('/marketplace') || path.includes('/b2b')) return 'marketplace.read';
 if (path.includes('/customer')) return 'customers.read';
 if (path.includes('/support') || path.includes('/conversation') || path.includes('/chatbot')) return 'support.read';
 if (path.includes('/page') || path.includes('/blog') || path.includes('/legal') || path.includes('/seo') || path.includes('/customization') || path.includes('/storage')) return 'content.read';
 if (path.includes('/coupon') || path.includes('/referral') || path.includes('/campaign') || path.includes('/notification') || path.includes('/click-tracking')) return 'marketing.read';
 if (path.includes('/inventory') || path.includes('/warehouse')) return 'inventory.read';
 if (path.includes('/product') || path.includes('/categor') || path.includes('/brand') || path.includes('/bundle') || path.includes('/recommendation')) return 'catalog.read';
 if (path.includes('/setting') || path.includes('/module') || path.includes('/locale') || path.includes('/api-key') || path.includes('/cod-policy')) return 'settings.read';
 if (path.includes('/order') || path.includes('/return') || path.includes('/lifecycle')) return 'orders.read';
 return 'dashboard.read';
};

const canSeeNav = (user, path) => {
 if (!user || ['admin', 'superadmin'].includes(user.role)) return true;
 const permissions = user.tenantMembership?.effectivePermissions || user.tenantMembership?.permissions || [];
 if (permissions.includes('*')) return true;
 const permission = permissionForNavPath(path);
 return permissions.includes(permission) || permissions.includes(permission.replace('.read', '.write'));
};

const AdminLayout = () => {
 const dispatch = useDispatch();
 const navigate = useNavigate();
 const location = useLocation();
 const { user } = useSelector((state) => state.auth);
 const { settings } = useSite();
 const [sidebarOpen, setSidebarOpen] = useState(false);
 const [collapsed, setCollapsed] = useState(() => {
 try { return window.localStorage.getItem('tatoz_admin_sidebar_collapsed') === '1'; } catch { return false; }
 });
 const [userMenuOpen, setUserMenuOpen] = useState(false);
 const [logo, setLogo] = useState('');
 const [favicon, setFavicon] = useState('');
 const [searchOpen, setSearchOpen] = useState(false);
 const [searchQuery, setSearchQuery] = useState('');
 const [activeSearchIndex, setActiveSearchIndex] = useState(0);
 const [activeShippingProvider, setActiveShippingProvider] = useState(null);
 const [activePaymentProviders, setActivePaymentProviders] = useState(null);
 const searchInputRef = useRef(null);

 const navGroups = useMemo(() => getNavGroups(activeShippingProvider, activePaymentProviders)
  .map(group => ({ ...group, items: group.items.filter(item => canSeeNav(user, item.path)) }))
  .filter(group => group.items.length), [activeShippingProvider, activePaymentProviders, user]);
 const allNavItems = useMemo(() => navGroups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label }))), [navGroups]);

 useEffect(() => {
 const loadActiveProviders = () => {
   adminAPI.getSettings().then((response) => {
    const settings = response.data?.settings || {};
    setActiveShippingProvider(normalizeActiveProvider(settings.active_shipping_provider, SHIPPING_PROVIDERS));
    const configured = Array.isArray(settings.active_payment_providers)
     ? settings.active_payment_providers
     : settings.active_payment_provider ? [settings.active_payment_provider] : [];
    setActivePaymentProviders([...new Set(configured.map(provider => normalizeActiveProvider(provider, PAYMENT_PROVIDERS)).filter(Boolean))]);
   }).catch(() => {
    setActiveShippingProvider(null);
    setActivePaymentProviders([]);
   });
  };
  const handleShippingProviderUpdate = (event) => setActiveShippingProvider(normalizeActiveProvider(event.detail?.provider, SHIPPING_PROVIDERS));
  const handlePaymentProviderUpdate = (event) => setActivePaymentProviders([...new Set((Array.isArray(event.detail?.providers) ? event.detail.providers : []).map(provider => normalizeActiveProvider(provider, PAYMENT_PROVIDERS)).filter(Boolean))]);
  loadActiveProviders();
  window.addEventListener('active-shipping-provider-updated', handleShippingProviderUpdate);
  window.addEventListener('active-payment-providers-updated', handlePaymentProviderUpdate);
  return () => {
   window.removeEventListener('active-shipping-provider-updated', handleShippingProviderUpdate);
   window.removeEventListener('active-payment-providers-updated', handlePaymentProviderUpdate);
  };
 }, []);

 const searchResults = useMemo(() => {
 const query = searchQuery.trim().toLowerCase();
 const matchingItems = query
 ? allNavItems.filter((item) =>
 `${item.label} ${item.group} ${item.path}`.toLowerCase().includes(query)
 )
 : allNavItems;

 return matchingItems.slice(0, 12);
 }, [searchQuery, allNavItems]);

 // Set document title based on current admin page
 useEffect(() => {
 const pageLabel = allNavItems.find((item) => location.pathname.startsWith(item.path))?.label || 'Admin';
 const siteName = displayPlatformName(settings?.siteName || PLATFORM_NAME);
 document.title = `${pageLabel} | ${siteName} Admin`;
 }, [allNavItems, location.pathname, settings?.siteName]);

 useEffect(() => {
 adminAPI.getCustomization().then((r) => {
 const c = r.data?.customization;
 const siteLogo = c?.logo || c?.logoDark;
 if (siteLogo) setLogo(siteLogo);
 if (c?.favicon) setFavicon(c.favicon);
 if (c?.favicon) {
 let link = document.querySelector("link[rel~='icon']");
 if (!link) {
 link = document.createElement('link');
 link.rel = 'icon';
 document.head.appendChild(link);
 }
 link.href = c.favicon;
 }
 }).catch(() => {});
 }, []);

 useEffect(() => {
 setSidebarOpen(false);
 setSearchOpen(false);
 }, [location.pathname]);

 useEffect(() => {
 if (!searchOpen) return undefined;

 const focusTimer = window.setTimeout(() => searchInputRef.current?.focus(), 0);
 return () => window.clearTimeout(focusTimer);
 }, [searchOpen]);

 useEffect(() => {
 const handleShortcut = (event) => {
 if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
 event.preventDefault();
 setSearchOpen((isOpen) => {
 setSearchQuery('');
 setActiveSearchIndex(0);
 return !isOpen;
 });
 setUserMenuOpen(false);
 }
 };

 document.addEventListener('keydown', handleShortcut);
 return () => document.removeEventListener('keydown', handleShortcut);
 }, []);

 useEffect(() => {
 setActiveSearchIndex((currentIndex) =>
 Math.min(currentIndex, Math.max(0, searchResults.length - 1))
 );
 }, [searchResults.length]);

 useEffect(() => {
 try { window.localStorage.setItem('tatoz_admin_sidebar_collapsed', collapsed ? '1' : '0'); } catch {}
 }, [collapsed]);

 const handleLogout = async () => {
 await dispatch(logout());
 navigate('/admin/login');
 };

 const openAdminSearch = () => {
 setSearchOpen(true);
 setSearchQuery('');
 setActiveSearchIndex(0);
 setUserMenuOpen(false);
 };

 const closeAdminSearch = () => {
 setSearchOpen(false);
 setSearchQuery('');
 setActiveSearchIndex(0);
 };

 const openSearchResult = (item) => {
 navigate(item.path);
 closeAdminSearch();
 };

 const handleSearchKeyDown = (event) => {
 if (event.key === 'Escape') {
 event.preventDefault();
 closeAdminSearch();
 return;
 }

 if (event.key === 'ArrowDown' && searchResults.length > 0) {
 event.preventDefault();
 setActiveSearchIndex((currentIndex) => (currentIndex + 1) % searchResults.length);
 return;
 }

 if (event.key === 'ArrowUp' && searchResults.length > 0) {
 event.preventDefault();
 setActiveSearchIndex((currentIndex) =>
 currentIndex === 0 ? searchResults.length - 1 : currentIndex - 1
 );
 return;
 }

 if (event.key === 'Enter' && searchResults[activeSearchIndex]) {
 event.preventDefault();
 openSearchResult(searchResults[activeSearchIndex]);
 }
 };

 const sidebarWidth = collapsed ? 'w-[56px]' : 'w-[208px]';
 const mainMargin = collapsed ? 'lg:ml-[56px]' : 'lg:ml-[208px]';

 const renderSidebarContent = (mobile = false) => {
 const isCollapsed = !mobile && collapsed;
 const siteName = displayPlatformName(settings?.siteName || PLATFORM_NAME);

 return (
 <div className="relative flex h-full flex-col overflow-hidden bg-white text-slate-800">

 {/* Brand header */}
 <div className={`relative flex flex-shrink-0 items-center border-b border-slate-200/80 ${isCollapsed ? 'h-20 flex-col justify-center gap-1 px-1.5' : 'h-14 justify-between px-2.5'}`}>
  <div className={`flex min-w-0 items-center ${isCollapsed ? '' : 'flex-1'}`}>
   <div className={`flex h-9 flex-shrink-0 items-center overflow-hidden ${isCollapsed ? 'w-9 justify-center rounded-lg border border-slate-200 bg-white' : 'w-full max-w-[142px] justify-start'}`}>
    {(isCollapsed ? (favicon || logo) : logo) ? (
     <img src={isCollapsed ? (favicon || logo) : logo} alt={`${siteName} logo`} className={isCollapsed ? 'h-7 w-7 object-contain' : 'h-8 w-full object-contain object-left'} />
    ) : (
     <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-500">
      <Store size={14} />
     </div>
    )}
   </div>
  </div>
  {!mobile && (
   <button
    onClick={() => setCollapsed((c) => !c)}
    className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700"
    title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
    aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
   >
    {isCollapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
   </button>
  )}
 </div>

 {/* Navigation */}
 <nav className="relative flex-1 overflow-y-auto scrollbar-hide px-1.5 py-2.5">
 {navGroups.map((group) => (
 <div key={group.label} className="mb-3 last:mb-0">
 {!isCollapsed && (
  <div className="mb-1.5 px-2">
   <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-950">{group.label}</p>
  </div>
 )}
 {isCollapsed && <div className="mb-2 h-px bg-slate-200/80" />}
 <div className="space-y-0.5">
 {group.items.map(({ label, path, icon: Icon }) => (
 <NavLink
 key={path}
 to={path}
 title={isCollapsed ? label : undefined}
 className={({ isActive }) =>
 [
 'group relative flex items-center gap-2 rounded-lg border text-[12px] font-medium transition-colors',
 isCollapsed ? 'justify-center border-transparent px-0 py-1.5' : 'px-1.5 py-1.5',
 isActive
 ? 'border-slate-200 bg-slate-100 font-semibold text-slate-900'
 : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800',
 ].join(' ')
 }
 >
 {({ isActive }) => (
  <>
   <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md ${isActive ? 'bg-white text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'}`}>
    <Icon size={16} />
   </span>
   {!isCollapsed && <span className="truncate">{label}</span>}
  </>
 )}
 </NavLink>
 ))}
 </div>
 </div>
 ))}
 {/* AI Credits Card */}
 {!isCollapsed && (
 <div className="px-1 pb-2 pt-3">
 <AiCreditsPill variant="sidebar" />
 </div>
 )}
 {isCollapsed && (
 <div className="mt-3 flex justify-center" title="AI Credits">
   <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-indigo-500">
    <Sparkles size={16} />
   </div>
  </div>
 )}
 </nav>

 {/* Sidebar footer */}
 <div className={`relative flex-shrink-0 border-t border-slate-200/80 p-2 ${isCollapsed ? 'flex justify-center' : ''}`}>
  {isCollapsed ? (
   <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600" title={user?.name || 'Admin'}>
    {user?.name?.charAt(0)?.toUpperCase() || 'A'}
   </div>
  ) : (
   <div className="flex items-center gap-2 rounded-lg border border-slate-200/80 bg-white px-1.5 py-1.5">
    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
     {user?.name?.charAt(0)?.toUpperCase() || 'A'}
    </div>
    <div className="min-w-0 flex-1">
     <p className="truncate text-[11px] font-semibold text-slate-700">{user?.name || 'Administrator'}</p>
     <p className="truncate text-[9px] text-slate-400">{user?.email || 'Control center access'}</p>
    </div>
    <button onClick={handleLogout} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500" title="Logout" aria-label="Logout">
     <LogOut size={15} />
    </button>
   </div>
  )}
 </div>
 </div>
 );
 };

 return (
 <div className="admin-shell min-h-screen bg-gray-50 flex">
 {/* Desktop Sidebar */}
 <aside className={`hidden lg:flex flex-col ${sidebarWidth} flex-shrink-0 fixed inset-y-0 left-0 z-30 overflow-hidden border-r border-slate-200/80 bg-white transition-[width] duration-200`}>
 {renderSidebarContent()}
 </aside>

 {/* Mobile Sidebar Overlay */}
 {sidebarOpen && (
 <div
 className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden"
 onClick={() => setSidebarOpen(false)}
 />
 )}

 {/* Mobile Sidebar Drawer */}
 <aside
 className={[
 'fixed inset-y-0 left-0 z-50 w-[240px] overflow-hidden border-r border-slate-200/80 bg-white shadow-xl shadow-slate-300/40 lg:hidden transition-transform duration-300 ease-in-out',
 sidebarOpen ? 'translate-x-0' : '-translate-x-full',
 ].join(' ')}
 >
 <button
 onClick={() => setSidebarOpen(false)}
 aria-label="Close admin navigation"
 title="Close admin navigation"
 className="absolute right-3 top-4 z-10 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
 >
 <X size={16} />
 </button>
 {renderSidebarContent(true)}
 </aside>

 {/* Main Content Area */}
 <div className={`min-w-0 flex-1 ${mainMargin} flex flex-col min-h-screen transition-[margin] duration-200`}>
 {/* Top Header */}
 <header className="sticky top-0 z-20 bg-white border-b border-gray-200 h-14 flex items-center px-4 lg:px-6 gap-4">
 {/* Mobile menu toggle */}
 <button
 onClick={() => setSidebarOpen(true)}
 aria-label="Open admin navigation"
 title="Open admin navigation"
 className="lg:hidden p-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
 >
 <Menu size={20} />
 </button>

 {/* Page Title */}
 <div className="flex-1 min-w-0">
 <h1 className="text-lg font-semibold text-gray-900">
 {allNavItems.find((item) => location.pathname.startsWith(item.path))?.label || 'Admin Panel'}
 </h1>
 <p className="text-xs text-gray-400 hidden sm:block">
 {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
 </p>
 </div>

 {/* Global admin option search */}
 <button
 type="button"
 onClick={openAdminSearch}
 aria-label="Search admin options"
 className="hidden md:flex w-52 lg:w-72 xl:w-80 flex-shrink-0 items-center gap-2.5 rounded-xl border border-gray-200 bg-gray-50/80 px-3 py-2 text-left transition-colors hover:border-gray-300 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-100"
 >
 <Search size={17} className="flex-shrink-0 text-gray-400" />
 <span className="min-w-0 flex-1 truncate text-sm text-gray-400">Search admin options...</span>
 <kbd className="hidden lg:inline-flex flex-shrink-0 items-center rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-400">⌘ K</kbd>
 </button>

 <button
 type="button"
 onClick={openAdminSearch}
 aria-label="Search admin options"
 className="md:hidden rounded-xl p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
 >
 <Search size={19} />
 </button>

 {/* Notification Bell */}
 <NotificationBell />

 {/* User Menu */}
 <div className="relative">
 <button
 onClick={() => setUserMenuOpen((o) => !o)}
 className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-xl hover:bg-gray-50 transition-colors"
 >
 <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center">
 <span className="text-white font-bold text-xs">
 {user?.name?.charAt(0)?.toUpperCase() || 'A'}
 </span>
 </div>
 <span className="hidden sm:block text-sm font-medium text-gray-700">
 {user?.name?.split(' ')[0] || 'Admin'}
 </span>
 <ChevronDown size={14} className="text-gray-400" />
 </button>

 {userMenuOpen && (
 <>
 <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
 <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-20">
 <div className="px-4 py-2 border-b border-gray-100 mb-1">
 <p className="text-sm font-semibold text-gray-900">{user?.name}</p>
 <p className="text-xs text-gray-400">{user?.email}</p>
 </div>
 <button
 onClick={handleLogout}
 className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
 >
 <LogOut size={15} />
 Logout
 </button>
 </div>
 </>
 )}
 </div>
 </header>

 {/* Admin command palette */}
 {searchOpen && (
 <div className="fixed inset-0 z-[70] bg-slate-950/35 p-4 sm:p-8">
 <button
 type="button"
 aria-label="Close admin search"
 onClick={closeAdminSearch}
 className="absolute inset-0 h-full w-full cursor-default"
 />
 <div
 role="dialog"
 aria-modal="true"
 aria-label="Search admin options"
 className="relative mx-auto mt-4 w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl sm:mt-12"
 >
 <div className="flex items-center gap-3 border-b border-gray-100 px-4">
 <Search size={20} className="flex-shrink-0 text-indigo-500" />
 <input
 ref={searchInputRef}
 type="search"
 value={searchQuery}
 onChange={(event) => {
 setSearchQuery(event.target.value);
 setActiveSearchIndex(0);
 }}
 onKeyDown={handleSearchKeyDown}
 placeholder="Search Dashboard, Products, Orders, Pages..."
 aria-label="Search admin options"
 className="h-14 min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
 />
 <kbd className="hidden rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[10px] font-semibold text-gray-400 sm:inline-flex">ESC</kbd>
 <button
 type="button"
 onClick={closeAdminSearch}
 aria-label="Close admin search"
 className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
 >
 <X size={17} />
 </button>
 </div>

 <div className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
 {searchResults.length > 0 ? (
 searchResults.map((item, index) => {
 const Icon = item.icon;
 const isActive = index === activeSearchIndex;

 return (
 <button
 key={item.path}
 type="button"
 onMouseEnter={() => setActiveSearchIndex(index)}
 onClick={() => openSearchResult(item)}
 className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-50'}`}
 >
 <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${isActive ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'}`}>
 <Icon size={17} />
 </span>
 <span className="min-w-0 flex-1">
 <span className="block truncate text-sm font-semibold">{item.label}</span>
 <span className="mt-0.5 block truncate text-xs text-gray-400">{item.group} · {item.path}</span>
 </span>
 {isActive && <span className="hidden text-[11px] font-semibold text-indigo-500 sm:inline">Open ↵</span>}
 </button>
 );
 })
 ) : (
 <div className="px-4 py-10 text-center">
 <Search size={22} className="mx-auto mb-2 text-gray-300" />
 <p className="text-sm font-medium text-gray-700">No admin option found</p>
 <p className="mt-1 text-xs text-gray-400">Try a page name like Products, Orders, or Settings.</p>
 </div>
 )}
 </div>

 <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 bg-gray-50/70 px-4 py-2.5 text-[11px] text-gray-400">
 <span><b className="font-semibold text-gray-500">↑↓</b> Navigate</span>
 <span><b className="font-semibold text-gray-500">Enter</b> Open</span>
 <span><b className="font-semibold text-gray-500">Esc</b> Close</span>
 <span className="ml-auto hidden sm:inline"><b className="font-semibold text-gray-500">⌘ K</b> Quick search</span>
 </div>
 </div>
 </div>
 )}

 {/* Page Content */}
 <main className="min-w-0 flex-1 p-4 lg:p-6">
 <Outlet />
 </main>
 </div>
</div>
 );
};

export default AdminLayout;
