import { Link, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Home, LayoutGrid, ShoppingCart, MessageSquare, User } from 'lucide-react';
import { toggleCart } from '../../store/slices/uiSlice';
import { selectCartCount } from '../../store/slices/cartSlice';

// App-style bottom tab bar for mobile shoppers. Desktop keeps the Navbar.
// Always pinned to the bottom on mobile (md breakpoint se neeche).
// Chat always opens the dedicated /chat page on mobile — never the floating
// widget, which gaps with the navbar and breaks when the keyboard opens.
const MobileTabBar = () => {
 const dispatch = useDispatch();
 const location = useLocation();
 const { isAuthenticated } = useSelector((s) => s.auth);
 const cartCount = useSelector(selectCartCount);

 // Checkout gets its own full-width payment CTA. Keeping the global tab bar
 // visible there would compete with the CTA and cover the final form fields.
 // /chat is a full-screen app surface with its own input bar and back button.
 if (location.pathname.startsWith('/checkout') || location.pathname.startsWith('/chat')) return null;

 const tabs = [
 { key: 'home', label: 'Home', to: '/', icon: Home, active: location.pathname === '/' },
 { key: 'shop', label: 'Shop', to: '/search', icon: LayoutGrid, active: location.pathname.startsWith('/search') || location.pathname.startsWith('/category') || location.pathname.startsWith('/brand') },
 { key: 'cart', label: 'Cart', icon: ShoppingCart, badge: cartCount, active: location.pathname.startsWith('/cart'), action: () => dispatch(toggleCart()) },
 { key: 'chat', label: 'Chat', to: '/chat', icon: MessageSquare, active: location.pathname.startsWith('/chat') },
 { key: 'account', label: 'Account', to: isAuthenticated ? '/profile' : '/login', icon: User, active: ['/profile', '/orders', '/settings', '/wallet', '/loyalty', '/gift-cards', '/affiliate', '/lifecycle', '/notifications', '/support', '/login'].some((p) => location.pathname.startsWith(p)) },
 ];

 return (
 <>
 {/* Spacer so the tab bar never covers footer content; hidden with the bar */}
 <div className="h-[72px] md:hidden" aria-hidden="true" />
 <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
 <div className="grid grid-cols-5 px-1 pt-1.5">
 {tabs.map(({ key, label, to, icon: Icon, badge, active, action }) => {
 const content = (
 <>
 <span className={`relative flex h-7 items-center justify-center ${active ? 'text-slate-900' : 'text-slate-400'}`}>
 <Icon size={21} strokeWidth={active ? 2.5 : 1.8} />
 {badge > 0 && (
 <span className="absolute -right-0.5 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
 {badge > 99 ? '99+' : badge}
 </span>
 )}
 </span>
 <span className={`mt-0.5 text-[10px] font-semibold ${active ? 'text-slate-900' : 'text-slate-400'}`}>{label}</span>
 </>
 );
 const cls = 'flex flex-col items-center py-1.5 active:scale-95';
 return action ? (
 <button key={key} type="button" onClick={action} aria-label={label} className={cls}>{content}</button>
 ) : (
 <Link key={key} to={to} aria-label={label} aria-current={active ? 'page' : undefined} className={cls}>{content}</Link>
 );
 })}
 </div>
 </nav>
 </>
 );
};

export default MobileTabBar;
