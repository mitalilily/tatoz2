import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Heart, ShoppingCart, Star, Zap } from 'lucide-react';
import { requestAddToCart } from '../../store/slices/cartSlice';
import { toggleWishlist } from '../../store/slices/authSlice';
import { trackingAPI } from '../../services/api';
import { useSite } from '../../context/SiteContext';
import { formatPrice } from '../../utils/formatPrice';
import toast from 'react-hot-toast';
import { normalizeProductCardVariant } from '../page/componentVariants';

const ProductCard = ({ product, className = '', horizontal = false, compact = false, variant = 'classic', pageBuilderMedia = false }) => {
 const dispatch = useDispatch();
 const { settings } = useSite();
 const { user, isAuthenticated } = useSelector(state => state.auth);
 const [imageError, setImageError] = useState(false);
 const cardVariant = normalizeProductCardVariant(variant);
 const cardClassName = `product-card product-card-variant-${cardVariant}`;

 if (!product || typeof product !== 'object' || !(product._id || product.slug)) return null;

 const isWishlisted = user?.wishlist?.some(id => id === product._id || id?._id === product._id);
 const sellingPrice = Number(product.price || 0);
 const mrp = Number(product.comparePrice || 0);
 const hasDiscount = mrp > sellingPrice;
 const discountPercent = Number(product.discount || (hasDiscount ? ((mrp - sellingPrice) / mrp) * 100 : 0));
 const discountedPrice = sellingPrice;
 const inStock = Number(product.stock || 0) > 0;
 const ratingCount = Number(product.ratings?.count || 0);
 const ratingAvg = Number(product.ratings?.average || 0);

 const handleAddToCart = (e) => {
 e.preventDefault();
 e.stopPropagation();
 if (product.variants?.some(variantOption => variantOption.options?.length)) {
  toast('Choose product options before adding to cart');
  window.location.assign(`/product/${product.slug}`);
  return;
 }
 dispatch(requestAddToCart({ product, quantity: 1, source: 'product-card' }));
 };

 const handleWishlist = (e) => {
 e.preventDefault();
 e.stopPropagation();
 if (!isAuthenticated) {
 toast.error('Please login to add to wishlist');
 return;
 }
 dispatch(toggleWishlist(product._id));
 trackingAPI.track({ eventType: 'wishlist_toggle', target: product.slug, targetId: product._id, page: window.location.pathname });
 };

 const handleProductClick = () => {
 trackingAPI.track({ eventType: 'product_click', target: product.slug, targetId: product._id, page: window.location.pathname });
 };

 if (compact) {
  return (
    <Link
      to={`/product/${product.slug}`}
      onClick={handleProductClick}
      className={`${cardClassName} group flex flex-col h-full min-w-0 border border-gray-100 rounded-lg overflow-hidden ${className}`}
      data-product-card-variant={cardVariant}
    >
      {/* Image */}
      <div className="product-card-media relative bg-gray-100 aspect-square flex-shrink-0">
        <img
          data-page-builder-media={pageBuilderMedia ? 'content' : undefined}
          src={imageError ? 'https://via.placeholder.com/400' : (product.thumbnail || product.images?.[0]?.url || 'https://via.placeholder.com/400')}
          alt={product.title}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
          onError={() => setImageError(true)}
        />
        {/* Badges */}
        <div className="absolute top-1.5 left-1.5 flex flex-col gap-0.5 z-[2]">
          {hasDiscount && (
            <span className="px-1 py-0.5 rounded bg-red-500 text-white text-[9px] font-bold shadow">
              -{Math.round(discountPercent)}%
            </span>
          )}
          {product.isFlashDeal && (
            <span className="px-1 py-0.5 rounded bg-gradient-to-r from-orange-500 to-amber-500 text-white text-[9px] font-bold flex items-center gap-0.5 shadow">
              <Zap size={7} fill="currentColor" />Flash
            </span>
          )}
        </div>
      </div>
      {/* Content — fixed rows so every card is the same height */}
      <div className="product-card-content min-w-0 p-2.5 flex flex-1 flex-col">
        <p className="text-[11px] font-bold text-gray-900 uppercase truncate min-h-[15px]">{product.brand?.name || ' '}</p>
        <h3 className="text-[11px] text-gray-500 truncate mt-0.5">{product.title}</h3>
        <div className="flex items-center gap-1 mt-1 min-h-[12px]">
          {ratingCount > 0 && (
            <>
              <div className="flex items-center gap-px">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    size={8}
                    className={i < Math.round(ratingAvg) ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'}
                  />
                ))}
              </div>
              <span className="text-[9px] text-gray-400">({ratingCount})</span>
            </>
          )}
        </div>
        <div className="flex items-baseline gap-1.5 mt-1.5 whitespace-nowrap overflow-hidden">
          <span className="text-[13px] font-extrabold text-gray-900">{formatPrice(discountedPrice, settings)}</span>
          {hasDiscount && (
            <span className="text-[10px] font-semibold text-orange-600">{Math.round(discountPercent)}% off</span>
          )}
        </div>
      </div>
    </Link>
  );
 }

 return (
  <Link
    to={`/product/${product.slug}`}
    onClick={handleProductClick}
    className={`${cardClassName} group min-w-0 ${horizontal ? 'flex flex-row' : 'flex flex-col h-full'} ${className}`}
    data-product-card-variant={cardVariant}
  >
    {/* Image — static, no zoom animation so scrolling stays fast */}
    <div className={`product-card-media relative overflow-hidden bg-gray-100 flex-shrink-0 ${
      horizontal
        ? 'w-[38%] rounded-l-[14px]'
        : 'rounded-t-[14px] aspect-square'
    }`}>
      {horizontal && <div className="aspect-square" />}
      <img
        data-page-builder-media={pageBuilderMedia ? 'content' : undefined}
        src={imageError ? 'https://via.placeholder.com/400' : (product.thumbnail || product.images?.[0]?.url || 'https://via.placeholder.com/400')}
        alt={product.title}
        loading="lazy"
        decoding="async"
        className={`w-full h-full object-cover ${horizontal ? 'absolute inset-0' : ''}`}
        onError={() => setImageError(true)}
      />

      {/* Badges — pinned to the top corners, not stacked floating */}
      <div className="absolute top-2 left-2 flex flex-col items-start gap-1 z-[2]">
        {hasDiscount && (
          <span className="px-2 py-0.5 rounded-full bg-[#cc0c39] text-white text-[11px] font-bold tracking-wide shadow-md">
            -{Math.round(discountPercent)}%
          </span>
        )}
        {product.isFlashDeal && (
          <span className="px-2 py-0.5 rounded-full bg-amber-400 text-gray-900 text-[11px] font-bold flex items-center gap-1 shadow-md">
            <Zap size={10} fill="currentColor" />Flash Sale
          </span>
        )}
        {!inStock && horizontal && (
          <span className="px-2 py-0.5 rounded-full bg-gray-900/80 text-white text-[11px] font-bold shadow-md">
            Sold Out
          </span>
        )}
      </div>


      {/* Sold-out veil — vertical only (unknown stock = treat as available) */}
      {!horizontal && product.stock != null && Number(product.stock) <= 0 && (
        <div className="absolute inset-0 z-[1] flex items-center justify-center bg-white/55">
          <span className="rounded-full bg-gray-900 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-lg">
            Sold Out
          </span>
        </div>
      )}

      {/* Wishlist — horizontal layout only */}
      {horizontal && (
        <button
          onClick={handleWishlist}
          aria-label="Toggle wishlist"
          className={`absolute top-2 right-2 z-[2] w-8 h-8 rounded-full flex items-center justify-center ${
            isWishlisted
              ? 'bg-red-500 text-white shadow-md'
              : 'bg-white text-gray-400 shadow-md hover:text-red-500'
          }`}
        >
          <Heart size={14} fill={isWishlisted ? 'currentColor' : 'none'} />
        </button>
      )}
    </div>

    {/* Content — every row has a fixed height so all cards match */}
    <div className={`product-card-content ${horizontal ? 'flex-1 p-3 flex flex-col justify-between min-w-0' : 'p-3.5 flex flex-1 flex-col'}`}>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1 truncate min-h-[14px]">{product.category?.name || ' '}</p>

      <h3 className={`${horizontal ? 'text-[13px] font-semibold' : 'text-[13px] font-medium'} text-gray-900 leading-snug truncate mb-1`}>
        {product.title}
      </h3>

      {/* Reviews */}
      <div className="flex items-center gap-1.5 mb-1 min-h-[14px]">
        {ratingCount > 0 && (
          <>
            <div className="flex items-center gap-px">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  size={10}
                  className={i < Math.round(ratingAvg) ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'}
                />
              ))}
            </div>
            <span className="text-[10px] text-gray-400">({ratingCount})</span>
          </>
        )}
      </div>

      {/* Pricing + off, then MRP */}
      <div className="flex items-baseline gap-2 whitespace-nowrap overflow-hidden">
        <span className={`${horizontal ? 'text-[15px]' : 'text-base'} font-extrabold text-gray-900`}>{formatPrice(discountedPrice, settings)}</span>
        {hasDiscount && (
          <span className="text-xs font-bold text-green-700">{Math.round(discountPercent)}% off</span>
        )}
      </div>
      <p className="min-h-[16px] text-[11px] text-gray-400 truncate">
        {hasDiscount ? <span className="line-through">M.R.P.: {formatPrice(mrp, settings)}</span> : ' '}
      </p>

      {horizontal && inStock && (
        <div className="flex justify-end mt-auto pt-2">
          <button
            onClick={handleAddToCart}
            data-testid={`product-card-add-${product._id || product.slug}`}
            aria-label="Add to cart"
            className="flex-shrink-0 w-9 h-9 rounded-full bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center"
          >
            <ShoppingCart size={14} />
          </button>
        </div>
      )}
    </div>
  </Link>
);
};

export default ProductCard;
