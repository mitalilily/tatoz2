import { lazy, Suspense, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import Navbar from './Navbar';
import MobileTabBar from './MobileTabBar';
import Footer from './Footer';
import CartDrawer from './CartDrawer';
import ChatWidget from './ChatWidget';
import { useSite } from '../../context/SiteContext';
import { useSEO } from '../../context/SEOContext';
import AnalyticsHead from '../common/AnalyticsHead';
import { trackingAPI, cartSyncAPI } from '../../services/api';
import { selectCartItems } from '../../store/slices/cartSlice';
import { PLATFORM_NAME, displayPlatformName } from '../../constants/branding';
import { captureAttribution } from '../../utils/attribution';
import { PageFrameProvider, usePageFrame } from '../../context/PageFrameContext';

const ChromeRenderer = lazy(() => import('../page/ChromeRenderer'));

const CustomerLayout = () => {
 const { site, settings } = useSite();
 const { seoConfig } = useSEO();
 const location = useLocation();
 const cartItems = useSelector(selectCartItems);
 const syncTimeout = useRef(null);
 const { pageFrame } = usePageFrame();

 // Set default document title from site settings
 useEffect(() => {
 const siteName = displayPlatformName(settings?.siteName || PLATFORM_NAME);
 const tagline = settings?.siteTagline;
 document.title = tagline ? `${siteName} — ${tagline}` : siteName;
 }, [settings?.siteName, settings?.siteTagline]);

 useEffect(() => {
 const favicon = site?.favicon || seoConfig?.faviconUrl;
 if (favicon) {
 let link = document.querySelector('link[rel="icon"]');
 if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
 link.href = favicon;
 }
 }, [site?.favicon, seoConfig?.faviconUrl]);

 // Track every page view
 useEffect(() => {
 const attribution = captureAttribution(location.search, location.pathname);
 trackingAPI.track({ eventType: 'page_view', page: location.pathname, metadata: { attribution } });
 }, [location.pathname, location.search]);

 // Sync cart to server for abandoned cart tracking (debounced)
 useEffect(() => {
 if (syncTimeout.current) clearTimeout(syncTimeout.current);
 syncTimeout.current = setTimeout(() => {
 cartSyncAPI.sync({ items: cartItems });
 }, 2000);
 return () => { if (syncTimeout.current) clearTimeout(syncTimeout.current); };
 }, [cartItems]);

 // Keep focused purchase flows distraction-free. The checkout CTA also owns
 // the mobile bottom edge, so the floating chat affordance stays out of its way.
 // Mobile never gets the floating widget at all — the tab bar routes to the
 // dedicated /chat page (no navbar gap, no keyboard resize breakage).
 // The widget is also hidden on /chat itself since that page IS the chat.
 const hideChatWidget = location.pathname.startsWith('/product/') || location.pathname.startsWith('/checkout') || location.pathname.startsWith('/chat');

 return (
 <div className="min-h-screen flex flex-col">
 <AnalyticsHead />
 {pageFrame.showHeader && <Suspense fallback={null}><ChromeRenderer kind="header" /></Suspense>}
 {pageFrame.showHeader && <Navbar />}
 <main className="customer-main flex-1 p-0">
 <Outlet />
 </main>
 {pageFrame.showFooter && <Suspense fallback={null}><ChromeRenderer kind="footer" /></Suspense>}
 {pageFrame.showFooter && <Footer />}
 {pageFrame.showHeader && <MobileTabBar />}
 <CartDrawer />
 {!hideChatWidget && <div className="hidden md:block"><ChatWidget /></div>}
 </div>
 );
};

export default function CustomerLayoutWithFrame() {
 return (
  <PageFrameProvider>
   <CustomerLayout />
  </PageFrameProvider>
 );
}
