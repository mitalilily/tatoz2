import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  BarChart3, TrendingUp, Package, FolderOpen, Award, Boxes,
  ShoppingBag, Wallet, Store, LogOut, PanelsTopLeft, Search, BadgePercent, FileBarChart, MessageSquare, CalendarClock, WalletCards, Users, ReceiptText, ClipboardCheck,
} from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { useEffect, useState } from 'react';
import { authAPI, vendorAPI } from '../../services/api';

const navGroups = [
  {
    label: 'Insights', items: [
      { to: '/vendor/dashboard', icon: BarChart3, label: 'Dashboard' },
      { to: '/vendor/analytics', icon: TrendingUp, label: 'Analytics', feature: 'analytics' },
      { to: '/vendor/reports', icon: FileBarChart, label: 'Reports', feature: 'reports' },
      { to: '/vendor/commission', icon: BadgePercent, label: 'Commission', feature: 'commissions' },
      { to: '/vendor/seo', icon: Search, label: 'SEO', feature: 'seo' },
    ],
  },
    {
    label: 'Catalog', items: [
      { to: '/vendor/products', icon: Package, label: 'Products', feature: 'catalog' },
      { to: '/vendor/pages', icon: PanelsTopLeft, label: 'Store pages', feature: 'pageBuilder' },
      { to: '/vendor/categories', icon: FolderOpen, label: 'Categories', feature: 'catalog' },
      { to: '/vendor/brands', icon: Award, label: 'Brands', feature: 'catalog' },
      { to: '/vendor/inventory', icon: Boxes, label: 'Inventory', feature: 'inventory' },
      { to: '/vendor/marketplace', icon: Store, label: 'Amazon & Flipkart', feature: 'catalog' },
    ],
  },
  {
    label: 'Sales', items: [
      { to: '/vendor/orders', icon: ShoppingBag, label: 'Orders', feature: 'orders' },
      { to: '/vendor/payouts', icon: Wallet, label: 'Payouts', feature: 'payouts' },
      { to: '/vendor/wallet', icon: WalletCards, label: 'Wallet', feature: 'payouts' },
      { to: '/vendor/ledger', icon: ReceiptText, label: 'Ledger', feature: 'payouts' },
      { to: '/vendor/reviews', icon: MessageSquare, label: 'Reviews', feature: 'reviews' },
      { to: '/vendor/subscription-plans', icon: CalendarClock, label: 'Subscription plans', feature: 'subscriptions' },
    ],
  },
  {
    label: 'Account', items: [
      { to: '/vendor/store', icon: Store, label: 'Store Settings', feature: 'customStorefront' },
      { to: '/vendor/team', icon: Users, label: 'Team' },
      { to: '/vendor/onboarding', icon: ClipboardCheck, label: 'Application status' },
    ],
  },
];

export default function VendorLayout() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((s) => s.auth);
  const [vendor, setVendor] = useState(null);

  useEffect(() => {
    vendorAPI.getStore().then(response => setVendor(response.data?.data || null)).catch(() => {});
  }, []);

  const canUse = (feature) => !feature || vendor?.features?.[feature] !== false;

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-lg font-bold text-indigo-600">Vendor Panel</h1>
          <p className="text-xs text-gray-500 mt-0.5">{user?.name || 'Vendor'}</p>
        </div>
        <nav className="flex-1 p-3 space-y-5 overflow-y-auto">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-1">{group.label}</p>
              <div className="space-y-0.5">
                {group.items.filter(item => canUse(item.feature)).map(({ to, icon: Icon, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isActive ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'
                      }`
                    }
                  >
                    <Icon size={18} />
                    {label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-200">
          <button
            onClick={async () => { await authAPI.logout().catch(() => {}); navigate('/login'); }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 w-full transition-colors"
          >
            <LogOut size={18} /> Logout
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="p-6"><Outlet /></div>
      </main>
    </div>
  );
}
