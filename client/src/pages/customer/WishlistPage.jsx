import { useDispatch, useSelector } from 'react-redux';
import { Heart, ShoppingCart } from 'lucide-react';
import { toggleWishlist } from '../../store/slices/authSlice';
import { requestAddToCart } from '../../store/slices/cartSlice';
import { Link } from 'react-router-dom';
import { useSite } from '../../context/SiteContext';
import { formatPrice } from '../../utils/formatPrice';
import EmptyState from '../../components/common/EmptyState';
import SEO from '../../components/common/SEO';
import AccountHeader from '../../components/customer/AccountHeader';

const WishlistPage = () => {
 const dispatch = useDispatch();
 const { user } = useSelector(state => state.auth);
 const { settings } = useSite();
 const wishlist = user?.wishlist || [];

 return (
 <>
 <SEO title="My Wishlist" noindex={true} />
 <div className="page-container account-wrap py-6 sm:py-8">
 <AccountHeader kicker="Saved items" title={`Wishlist (${wishlist.length})`} sub="Everything you loved, in one place." icon={<Heart size={20} />} accent="rose" />

 {wishlist.length === 0 ? (
 <EmptyState icon={Heart} title="Your wishlist is empty" description="Save items you love by clicking the heart icon"
 actionLabel="Start Shopping" onAction={() => window.location.href = '/'} />
 ) : (
 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
 {wishlist.map(product => {
 const p = typeof product === 'object' ? product : { _id: product };
 if (!p.title) return null;
 const discountedPrice = Number(p.price || 0);

 return (
 <div key={p._id} className="card min-w-0">
 <div className="relative aspect-square bg-gray-100 overflow-hidden">
 <img src={p.thumbnail || 'https://via.placeholder.com/300'} alt={p.title}
 className="w-full h-full object-cover" />
 <button onClick={() => dispatch(toggleWishlist(p._id))}
 className="absolute top-2 right-2 w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors shadow-md">
 <Heart size={14} fill="currentColor" />
 </button>
 </div>
 <div className="p-3">
 <Link to={`/product/${p.slug}`} className="block truncate text-sm font-medium text-gray-800 hover:text-primary-600">{p.title}</Link>
 <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
 <span className="flex min-w-0 items-baseline gap-1.5">
 <span className="break-anywhere font-bold text-gray-900">{formatPrice(discountedPrice, settings)}</span>
 {Number(p.comparePrice) > Number(p.price) && (
 <span className="text-[11px] text-gray-400 line-through">{formatPrice(p.comparePrice, settings)}</span>
 )}
 </span>
 <button onClick={() => {
  if (p.variants?.some(variantOption => variantOption.options?.length)) {
   window.location.assign(`/product/${p.slug}`);
   return;
  }
 dispatch(requestAddToCart({ product: p, quantity: 1, source: 'wishlist' }));
 }}
 data-testid={`wishlist-add-${p._id}`}
 className="h-9 w-9 shrink-0 rounded-xl bg-primary-600 text-white flex items-center justify-center hover:bg-primary-700 transition-colors">
 <ShoppingCart size={16} />
 </button>
 </div>
 </div>
 </div>
 );
 })}
 </div>
 )}
 </div>
 </>
 );
};

export default WishlistPage;
