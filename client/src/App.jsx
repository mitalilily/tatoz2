import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { getAuthConfig, getMe } from './store/slices/authSlice';
import { fetchCategories, fetchBrands } from './store/slices/productSlice';
import Cookies from 'js-cookie';
import { setReferralCode } from './store/slices/cartSlice';
import { referralAPI } from './services/api';

// Customer Pages
// Route pages are loaded on demand so anonymous storefront visitors do not
// download admin, vendor, editor, and reporting code up front.
const SplashScreen = lazy(() => import('./pages/customer/SplashScreen'));
const WelcomePage = lazy(() => import('./pages/customer/WelcomePage'));
const LoginPage = lazy(() => import('./pages/customer/LoginPage'));
const DynamicPage = lazy(() => import('./pages/customer/DynamicPage'));
const PreviewPage = lazy(() => import('./pages/customer/PreviewPage'));
const CategoryPage = lazy(() => import('./pages/customer/CategoryPage'));
const BrandPage = lazy(() => import('./pages/customer/BrandPage'));
const CategoriesPage = lazy(() => import('./pages/customer/CategoriesPage'));
const BrandsPage = lazy(() => import('./pages/customer/BrandsPage'));
const ProductDetailPage = lazy(() => import('./pages/customer/ProductDetailPage'));
const SearchPage = lazy(() => import('./pages/customer/SearchPage'));
const BundlesPage = lazy(() => import('./pages/customer/BundlesPage'));
const CartPage = lazy(() => import('./pages/customer/CartPage'));
const CheckoutPage = lazy(() => import('./pages/customer/CheckoutPage'));
const OrderConfirmationPage = lazy(() => import('./pages/customer/OrderConfirmationPage'));
const OrderTrackingPage = lazy(() => import('./pages/customer/OrderTrackingPage'));
const WishlistPage = lazy(() => import('./pages/customer/WishlistPage'));
const ChatPage = lazy(() => import('./pages/customer/ChatPage'));
const ProfilePage = lazy(() => import('./pages/customer/ProfilePage'));
const OrdersPage = lazy(() => import('./pages/customer/OrdersPage'));
const SettingsPage = lazy(() => import('./pages/customer/SettingsPage'));
const WalletPage = lazy(() => import('./pages/customer/WalletPage'));
const LoyaltyPage = lazy(() => import('./pages/customer/LoyaltyPage'));
const GiftCardsPage = lazy(() => import('./pages/customer/GiftCardsPage'));
const AffiliateDashboardPage = lazy(() => import('./pages/customer/AffiliateDashboardPage'));
const LifecyclePage = lazy(() => import('./pages/customer/LifecyclePage'));
const BlogPage = lazy(() => import('./pages/customer/BlogPage'));
const BlogPostPage = lazy(() => import('./pages/customer/BlogPostPage'));
const NotificationsPage = lazy(() => import('./pages/customer/NotificationsPage'));

// Admin Pages
const AdminLoginPage = lazy(() => import('./pages/admin/AdminLoginPage'));
const AdminLayout = lazy(() => import('./components/admin/AdminLayout'));
import ActiveShippingProviderRoute from './components/admin/ActiveShippingProviderRoute';
import ActivePaymentProviderRoute from './components/admin/ActivePaymentProviderRoute';
const DashboardPage = lazy(() => import('./pages/admin/DashboardPage'));
const AdminProductsPage = lazy(() => import('./pages/admin/AdminProductsPage'));
const AdminBundlesPage = lazy(() => import('./pages/admin/AdminBundlesPage'));
const AddEditProductPage = lazy(() => import('./pages/admin/AddEditProductPage'));
const AdminInventoryPage = lazy(() => import('./pages/admin/AdminInventoryPage'));
const AdminWarehousesPage = lazy(() => import('./pages/admin/AdminWarehousesPage'));
const AdminProductIntentPage = lazy(() => import('./pages/admin/AdminProductIntentPage'));
const AdminCategoriesPage = lazy(() => import('./pages/admin/AdminCategoriesPage'));
const AdminBrandsPage = lazy(() => import('./pages/admin/AdminBrandsPage'));
const AdminReportsPage = lazy(() => import('./pages/admin/AdminReportsPage'));
const AdminOrdersPage = lazy(() => import('./pages/admin/AdminOrdersPage'));
const AdminCustomersPage = lazy(() => import('./pages/admin/AdminCustomersPage'));
const AdminCouponsPage = lazy(() => import('./pages/admin/AdminCouponsPage'));
const AdminReviewsPage = lazy(() => import('./pages/admin/AdminReviewsPage'));
const AdminAnalyticsPage = lazy(() => import('./pages/admin/AdminAnalyticsPage'));
const AIUsagePage = lazy(() => import('./pages/admin/AIUsagePage'));
const ReferralDashboardPage = lazy(() => import('./pages/admin/ReferralDashboardPage'));
const AdminNotificationsPage = lazy(() => import('./pages/admin/AdminNotificationsPage'));
const AdminCampaignsPage = lazy(() => import('./pages/admin/AdminCampaignsPage'));
const AdminApiKeysPage = lazy(() => import('./pages/admin/AdminApiKeysPage'));
const AdminWalletsPage = lazy(() => import('./pages/admin/AdminWalletsPage'));
const AdminLoyaltyPage = lazy(() => import('./pages/admin/AdminLoyaltyPage'));
const AdminGiftCardsPage = lazy(() => import('./pages/admin/AdminGiftCardsPage'));
const AdminTaxPage = lazy(() => import('./pages/admin/AdminTaxPage'));
const AdminProductTaxPage = lazy(() => import('./pages/admin/AdminProductTaxPage'));
const AdminInvoicesPage = lazy(() => import('./pages/admin/AdminInvoicesPage'));
const AdminInvoiceNotesPage = lazy(() => import('./pages/admin/AdminInvoiceNotesPage'));
const AdminShippingRulesPage = lazy(() => import('./pages/admin/AdminShippingRulesPage'));
const AdminPincodesPage = lazy(() => import('./pages/admin/AdminPincodesPage'));
const AdminSettingsPage = lazy(() => import('./pages/admin/AdminSettingsPage'));
const RazorpayDashboardPage = lazy(() => import('./pages/admin/RazorpayDashboardPage'));
const PaymentPartnerDashboardPage = lazy(() => import('./pages/admin/PaymentPartnerDashboardPage'));
const ShippingPartnerDashboardPage = lazy(() => import('./pages/admin/ShippingPartnerDashboardPage'));
const CustomizationPage = lazy(() => import('./pages/admin/CustomizationPage'));
const AdminStoragePage = lazy(() => import('./pages/admin/AdminStoragePage'));
const AdminPagesPage = lazy(() => import('./pages/admin/AdminPagesPage'));
const PageBuilderPage = lazy(() => import('./pages/admin/PageBuilderPage'));
const PageBuilderLayout = lazy(() => import('./components/admin/PageBuilderLayout'));
const AdminBlogPage = lazy(() => import('./pages/admin/AdminBlogPage'));
const AddEditBlogPostPage = lazy(() => import('./pages/admin/AddEditBlogPostPage'));
const LegalPagesAdmin = lazy(() => import('./pages/admin/LegalPagesAdmin'));
const ClickTrackingPage = lazy(() => import('./pages/admin/ClickTrackingPage'));
const AbandonedCartsPage = lazy(() => import('./pages/admin/AbandonedCartsPage'));
const ShiprocketDashboardPage = lazy(() => import('./pages/admin/ShiprocketDashboardPage'));
const CourierManagementPage = lazy(() => import('./pages/admin/CourierManagementPage'));
const SEODashboardPage = lazy(() => import('./pages/admin/SEODashboardPage'));
const ConversationsPage = lazy(() => import('./pages/admin/ConversationsPage'));
const ChatbotSettingsPage = lazy(() => import('./pages/admin/ChatbotSettingsPage'));
const RefundDashboardPage = lazy(() => import('./pages/admin/RefundDashboardPage'));
const AdminReturnsPage = lazy(() => import('./pages/admin/AdminReturnsPage'));
const AdminVendorsPage = lazy(() => import('./pages/admin/AdminVendorsPage'));
const AdminVendorDetailPage = lazy(() => import('./pages/admin/AdminVendorDetailPage'));
const AdminPayoutsPage = lazy(() => import('./pages/admin/AdminPayoutsPage'));
const AdminB2BPage = lazy(() => import('./pages/admin/AdminB2BPage'));
const AdminLifecyclePage = lazy(() => import('./pages/admin/AdminLifecyclePage'));
const AdminSecurityPage = lazy(() => import('./pages/admin/AdminSecurityPage'));
const AdminStaffPage = lazy(() => import('./pages/admin/AdminStaffPage'));
const AdminRecommendationsPage = lazy(() => import('./pages/admin/AdminRecommendationsPage'));
const AdminSupportPage = lazy(() => import('./pages/admin/AdminSupportPage'));
const AdminCodPolicyPage = lazy(() => import('./pages/admin/AdminCodPolicyPage'));
const AdminLocaleCurrencyPage = lazy(() => import('./pages/admin/AdminLocaleCurrencyPage'));
const AdminAffiliatesPage = lazy(() => import('./pages/admin/AdminAffiliatesPage'));
const SupportPage = lazy(() => import('./pages/customer/SupportPage'));
const MarketplacePage = lazy(() => import('./pages/admin/MarketplacePage'));
const ModulesPage = lazy(() => import('./pages/admin/ModulesPage'));

// Vendor Pages
const VendorLayout = lazy(() => import('./components/vendor/VendorLayout'));
import VendorRoute from './components/vendor/VendorRoute';
const VendorRegisterPage = lazy(() => import('./pages/vendor/VendorRegisterPage'));
const VendorDashboardPage = lazy(() => import('./pages/vendor/VendorDashboardPage'));
const VendorProductsPage = lazy(() => import('./pages/vendor/VendorProductsPage'));
const VendorProductFormPage = lazy(() => import('./pages/vendor/VendorProductFormPage'));
const VendorOrdersPage = lazy(() => import('./pages/vendor/VendorOrdersPage'));
const VendorPayoutsPage = lazy(() => import('./pages/vendor/VendorPayoutsPage'));
const VendorStoreSettingsPage = lazy(() => import('./pages/vendor/VendorStoreSettingsPage'));
const VendorAnalyticsPage = lazy(() => import('./pages/vendor/VendorAnalyticsPage'));
const VendorCategoriesPage = lazy(() => import('./pages/vendor/VendorCategoriesPage'));
const VendorBrandsPage = lazy(() => import('./pages/vendor/VendorBrandsPage'));
const VendorInventoryPage = lazy(() => import('./pages/vendor/VendorInventoryPage'));
const VendorPagesPage = lazy(() => import('./pages/vendor/VendorPagesPage'));
const VendorSEOPage = lazy(() => import('./pages/vendor/VendorSEOPage'));
const VendorMarketplacePage = lazy(() => import('./pages/vendor/VendorMarketplacePage'));
const VendorCommissionPage = lazy(() => import('./pages/vendor/VendorCommissionPage'));
const VendorWalletPage = lazy(() => import('./pages/vendor/VendorWalletPage'));
const VendorReportsPage = lazy(() => import('./pages/vendor/VendorReportsPage'));
const VendorReviewsPage = lazy(() => import('./pages/vendor/VendorReviewsPage'));
const VendorSubscriptionPlansPage = lazy(() => import('./pages/vendor/VendorSubscriptionPlansPage'));
const VendorOnboardingStatusPage = lazy(() => import('./pages/vendor/VendorOnboardingStatusPage'));
const VendorTeamPage = lazy(() => import('./pages/vendor/VendorTeamPage'));
const VendorLedgerPage = lazy(() => import('./pages/vendor/VendorLedgerPage'));

// Customer Legal Page
const LegalPage = lazy(() => import('./pages/customer/LegalPage'));
const StorefrontPage = lazy(() => import('./pages/customer/StorefrontPage'));

// Layout
import CustomerLayout from './components/customer/CustomerLayout';
import { SiteProvider } from './context/SiteContext';
import { SEOProvider } from './context/SEOContext';
import ProtectedRoute from './components/common/ProtectedRoute';
import AdminRoute from './components/common/AdminRoute';
import Loader from './components/common/Loader';
import ScrollToTop from './components/common/ScrollToTop';
import CartRuntime from './components/customer/CartRuntime';
import OtpCartGate from './components/customer/OtpCartGate';

const RouteRuntime = () => {
 const location = useLocation();
 const backoffice = location.pathname === '/admin' || location.pathname.startsWith('/admin/') || location.pathname === '/vendor' || location.pathname.startsWith('/vendor/');
 return <><ScrollToTop />{!backoffice && <><CartRuntime /><OtpCartGate /></>}</>;
};

function App() {
 const dispatch = useDispatch();

 useEffect(() => {
 // Initialize auth
 // Probe the HttpOnly session cookie on every boot. The API interceptor does
 // not redirect for this probe when the visitor is anonymous.
 dispatch(getMe());
 dispatch(getAuthConfig());

 // Catalog prefetch is useful on storefront routes but wasteful on the
 // admin/vendor control plane, where pages load their own scoped data.
 const initialPath = window.location.pathname;
 const isBackoffice = initialPath === '/admin' || initialPath.startsWith('/admin/') || initialPath === '/vendor' || initialPath.startsWith('/vendor/');
 let catalogIdleId;
 if (!isBackoffice) {
  // Keep the first public render focused on the page itself. Navbar filters
  // can hydrate during idle time without competing with the page/API boot.
  const loadCatalogChrome = () => {
   dispatch(fetchCategories());
   dispatch(fetchBrands());
  };
  if (typeof window.requestIdleCallback === 'function') {
   catalogIdleId = window.requestIdleCallback(loadCatalogChrome, { timeout: 1500 });
  } else {
   catalogIdleId = window.setTimeout(loadCatalogChrome, 0);
  }
 }

 // Handle referral code from URL
 const urlParams = new URLSearchParams(window.location.search);
 const refCode = urlParams.get('ref');
 if (refCode) {
 dispatch(setReferralCode(refCode));
 Cookies.set('ref_code', refCode, { expires: 30 });
 referralAPI.trackClick(refCode, window.location.pathname).catch(() => {});
 } else {
 const cookieRef = Cookies.get('ref_code');
 if (cookieRef) dispatch(setReferralCode(cookieRef));
 }
 return () => {
  if (isBackoffice || catalogIdleId === undefined) return;
  if (typeof window.cancelIdleCallback === 'function' && typeof window.requestIdleCallback === 'function') window.cancelIdleCallback(catalogIdleId);
  else window.clearTimeout(catalogIdleId);
 };
 }, [dispatch]);

 return (
 <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
 <RouteRuntime />
 <Suspense fallback={<Loader size="lg" fullScreen />}>
 <Routes>
 {/* Splash */}
 <Route path="/splash" element={<SplashScreen />} />
 <Route path="/welcome" element={<WelcomePage />} />

 {/* Auth */}
 <Route path="/login" element={<SiteProvider><SEOProvider><LoginPage /></SEOProvider></SiteProvider>} />
 <Route path="/register" element={<SiteProvider><SEOProvider><LoginPage /></SEOProvider></SiteProvider>} />

 {/* Customer Routes */}
 <Route element={<SiteProvider><SEOProvider><CustomerLayout /></SEOProvider></SiteProvider>}>
 <Route path="/" element={<DynamicPage slug="/" />} />
 <Route path="/categories" element={<CategoriesPage />} />
 <Route path="/category" element={<CategoriesPage />} />
 <Route path="/brands" element={<BrandsPage />} />
 <Route path="/brand" element={<BrandsPage />} />
 <Route path="/category/:slug" element={<CategoryPage />} />
 <Route path="/brand/:slug" element={<BrandPage />} />
 <Route path="/product/:slug" element={<ProductDetailPage />} />
 <Route path="/search" element={<SearchPage />} />
 <Route path="/bundles" element={<BundlesPage />} />
 <Route path="/bundle/:slug" element={<BundlesPage />} />
 <Route path="/cart" element={<CartPage />} />
 <Route path="/wishlist" element={<ProtectedRoute><WishlistPage /></ProtectedRoute>} />
 <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
 <Route path="/orders" element={<ProtectedRoute><OrdersPage /></ProtectedRoute>} />
 <Route path="/orders/:id" element={<ProtectedRoute><OrderTrackingPage /></ProtectedRoute>} />
 <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
 <Route path="/wallet" element={<ProtectedRoute><WalletPage /></ProtectedRoute>} />
 <Route path="/loyalty" element={<ProtectedRoute><LoyaltyPage /></ProtectedRoute>} />
 <Route path="/gift-cards" element={<ProtectedRoute><GiftCardsPage /></ProtectedRoute>} />
 <Route path="/affiliate" element={<ProtectedRoute><AffiliateDashboardPage /></ProtectedRoute>} />
 <Route path="/lifecycle" element={<ProtectedRoute><LifecyclePage /></ProtectedRoute>} />
 <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
 <Route path="/chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
 <Route path="/support" element={<ProtectedRoute><SupportPage /></ProtectedRoute>} />
 <Route path="/checkout" element={<CheckoutPage />} />
 <Route path="/order-confirmation/:id" element={<OrderConfirmationPage />} />
 <Route path="/store/:slug" element={<StorefrontPage />} />
<Route path="/blog" element={<BlogPage />} />
 <Route path="/blog/:slug" element={<BlogPostPage />} />
 <Route path="/legal/:slug" element={<LegalPage />} />
 <Route path="/:slug" element={<DynamicPage />} />
 </Route>

 {/* Admin Routes */}
 <Route path="/admin/login" element={<SiteProvider><AdminLoginPage /></SiteProvider>} />
 <Route path="/admin" element={<SiteProvider><AdminRoute><AdminLayout /></AdminRoute></SiteProvider>}>
 <Route index element={<Navigate to="/admin/dashboard" replace />} />
 <Route path="dashboard" element={<DashboardPage />} />
 <Route path="products" element={<AdminProductsPage />} />
 <Route path="bundles" element={<AdminBundlesPage />} />
 <Route path="products/new" element={<AddEditProductPage />} />
 <Route path="inventory" element={<AdminInventoryPage />} />
 <Route path="warehouses" element={<AdminWarehousesPage />} />
 <Route path="product-intents" element={<AdminProductIntentPage />} />
 <Route path="products/edit/:id" element={<AddEditProductPage />} />
 <Route path="categories" element={<AdminCategoriesPage />} />
 <Route path="brands" element={<AdminBrandsPage />} />
 <Route path="reports" element={<AdminReportsPage />} />
 <Route path="orders" element={<AdminOrdersPage />} />
 <Route path="customers" element={<AdminCustomersPage />} />
 <Route path="coupons" element={<AdminCouponsPage />} />
 <Route path="reviews" element={<AdminReviewsPage />} />
 <Route path="analytics" element={<AdminAnalyticsPage />} />
 <Route path="ai-usage" element={<AIUsagePage />} />
 <Route path="referral" element={<ReferralDashboardPage />} />
 <Route path="notifications" element={<AdminNotificationsPage />} />
 <Route path="campaigns" element={<AdminCampaignsPage />} />
 <Route path="api-keys" element={<AdminApiKeysPage />} />
 <Route path="wallets" element={<AdminWalletsPage />} />
 <Route path="loyalty" element={<AdminLoyaltyPage />} />
 <Route path="gift-cards" element={<AdminGiftCardsPage />} />
 <Route path="tax" element={<AdminTaxPage />} />
 <Route path="product-tax" element={<AdminProductTaxPage />} />
<Route path="invoices" element={<AdminInvoicesPage />} />
<Route path="invoice-notes" element={<AdminInvoiceNotesPage />} />
 <Route path="shipping-rules" element={<AdminShippingRulesPage />} />
 <Route path="pincodes" element={<AdminPincodesPage />} />
 <Route path="settings" element={<AdminSettingsPage />} />
 <Route path="razorpay" element={<ActivePaymentProviderRoute provider="razorpay"><RazorpayDashboardPage /></ActivePaymentProviderRoute>} />
 <Route path="payments/:provider" element={<ActivePaymentProviderRoute><PaymentPartnerDashboardPage /></ActivePaymentProviderRoute>} />
 <Route path="customization" element={<CustomizationPage />} />
 <Route path="storage" element={<AdminStoragePage />} />
 <Route path="pages" element={<AdminPagesPage />} />
 <Route path="blog" element={<AdminBlogPage />} />
 <Route path="blog/new" element={<AddEditBlogPostPage />} />
 <Route path="blog/edit/:id" element={<AddEditBlogPostPage />} />
 <Route path="legal-pages" element={<LegalPagesAdmin />} />
 <Route path="click-tracking" element={<ClickTrackingPage />} />
 <Route path="abandoned-carts" element={<AbandonedCartsPage />} />
 <Route path="shiprocket" element={<ActiveShippingProviderRoute provider="shiprocket"><ShiprocketDashboardPage /></ActiveShippingProviderRoute>} />
 <Route path="shipping/:provider" element={<ActiveShippingProviderRoute><ShippingPartnerDashboardPage /></ActiveShippingProviderRoute>} />
 <Route path="shipping-operations/:provider" element={<ActiveShippingProviderRoute><ShippingPartnerDashboardPage /></ActiveShippingProviderRoute>} />
 <Route path="couriers" element={<ActiveShippingProviderRoute provider="shiprocket"><CourierManagementPage /></ActiveShippingProviderRoute>} />
 <Route path="seo" element={<SEODashboardPage />} />
 <Route path="conversations" element={<ConversationsPage />} />
 <Route path="chatbot" element={<ChatbotSettingsPage />} />
 <Route path="refunds" element={<RefundDashboardPage />} />
 <Route path="returns" element={<AdminReturnsPage />} />
 <Route path="vendors" element={<AdminVendorsPage />} />
 <Route path="vendors/:id" element={<AdminVendorDetailPage />} />
 <Route path="payouts" element={<AdminPayoutsPage />} />
 <Route path="b2b" element={<AdminB2BPage />} />
 <Route path="lifecycle" element={<AdminLifecyclePage />} />
 <Route path="security" element={<AdminSecurityPage />} />
 <Route path="staff" element={<AdminStaffPage />} />
 <Route path="recommendations" element={<AdminRecommendationsPage />} />
 <Route path="support" element={<AdminSupportPage />} />
 <Route path="cod-policy" element={<AdminCodPolicyPage />} />
 <Route path="locale-currency" element={<AdminLocaleCurrencyPage />} />
 <Route path="affiliates" element={<AdminAffiliatesPage />} />
 <Route path="marketplace" element={<MarketplacePage />} />
 <Route path="modules" element={<ModulesPage />} />
 <Route path="integrations" element={<Navigate to="/admin/modules" replace />} />
 </Route>

 {/* Vendor Routes */}
 <Route path="/vendor/register" element={<VendorRegisterPage />} />
 <Route path="/vendor/onboarding" element={<VendorOnboardingStatusPage />} />
 <Route path="/vendor" element={<SiteProvider><VendorRoute><VendorLayout /></VendorRoute></SiteProvider>}>
 <Route index element={<Navigate to="/vendor/dashboard" replace />} />
 <Route path="dashboard" element={<VendorDashboardPage />} />
 <Route path="products" element={<VendorProductsPage />} />
 <Route path="products/new" element={<VendorProductFormPage />} />
 <Route path="products/edit/:id" element={<VendorProductFormPage />} />
 <Route path="orders" element={<VendorOrdersPage />} />
 <Route path="payouts" element={<VendorPayoutsPage />} />
 <Route path="wallet" element={<VendorWalletPage />} />
 <Route path="ledger" element={<VendorLedgerPage />} />
 <Route path="team" element={<VendorTeamPage />} />
 <Route path="reviews" element={<VendorReviewsPage />} />
 <Route path="subscription-plans" element={<VendorSubscriptionPlansPage />} />
 <Route path="store" element={<VendorStoreSettingsPage />} />
 <Route path="analytics" element={<VendorAnalyticsPage />} />
 <Route path="reports" element={<VendorReportsPage />} />
 <Route path="commission" element={<VendorCommissionPage />} />
 <Route path="categories" element={<VendorCategoriesPage />} />
 <Route path="brands" element={<VendorBrandsPage />} />
 <Route path="inventory" element={<VendorInventoryPage />} />
 <Route path="marketplace" element={<VendorMarketplacePage />} />
 <Route path="pages" element={<VendorPagesPage />} />
 <Route path="seo" element={<VendorSEOPage />} />
 </Route>

 {/* Page-builder live preview — wrapped in SiteProvider so the in-context
     Navbar/Footer render correctly when previewing chrome pages */}
 <Route path="/preview/:id" element={<SiteProvider><PreviewPage /></SiteProvider>} />

 {/* Page builder editor — opens in its own tab via window.open, no admin sidebar */}
 <Route path="/admin/page-builder" element={<SiteProvider><AdminRoute><PageBuilderLayout /></AdminRoute></SiteProvider>}>
 <Route path=":id" element={<PageBuilderPage />} />
 </Route>

 {/* Vendor page-builder — same visual editor, vendor-scoped API */}
 <Route path="/vendor/page-builder" element={<SiteProvider><VendorRoute><PageBuilderLayout /></VendorRoute></SiteProvider>}>
 <Route path=":id" element={<PageBuilderPage />} />
 </Route>

 {/* Catch all */}
 <Route path="*" element={<Navigate to="/" replace />} />
 </Routes>
 </Suspense>
 </BrowserRouter>
 );
}

export default App;
