import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Heart, ShoppingCart, Star } from 'lucide-react';
import { requestAddToCart } from '../../store/slices/cartSlice';
import { toggleWishlist } from '../../store/slices/authSlice';
import { trackingAPI } from '../../services/api';
import { useSite } from '../../context/SiteContext';
import { formatPrice } from '../../utils/formatPrice';
import toast from 'react-hot-toast';

function RatingStars({ average = 0, count = 0 }) {
  if (!count) return null;
  return (
    <div className="flex items-center gap-1 min-h-[17px]">
      <span className="inline-flex items-center gap-px" aria-label={`Rated ${average} out of 5`}>
        {[...Array(5)].map((_, i) => (
          <Star
            key={i}
            size={13}
            className={i < Math.round(average) ? 'fill-amber-500 text-amber-500' : 'fill-gray-200 text-gray-200'}
          />
        ))}
      </span>
      <span className="text-[13px] text-cyan-800">{count}</span>
    </div>
  );
}

/**
 * Amazon-style product card — dense commerce card with
 * deal badges, star ratings, MRP + % off, stock line and
 * a yellow Add to Cart pill. Supports `layout="grid" | "list"`.
 */
const AmazonProductCard = ({ product, layout = 'grid' }) => {
  const dispatch = useDispatch();
  const { settings } = useSite();
  const { user, isAuthenticated } = useSelector(state => state.auth);
  const [imageError, setImageError] = useState(false);

  if (!product || typeof product !== 'object' || !(product._id || product.slug)) return null;

  const isWishlisted = user?.wishlist?.some(id => id === product._id || id?._id === product._id);
  const sellingPrice = Number(product.price || 0);
  const mrp = Number(product.comparePrice || 0);
  const hasDiscount = mrp > sellingPrice;
  const discountPercent = Math.round(
    Number(product.discount || (hasDiscount ? ((mrp - sellingPrice) / mrp) * 100 : 0))
  );
  const inStock = Number(product.stock || 0) > 0;
  const image =
    imageError
      ? 'https://via.placeholder.com/400'
      : (product.thumbnail || product.images?.[0]?.url || 'https://via.placeholder.com/400');

  const handleAddToCart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (product.variants?.some(v => v.options?.length)) {
      toast('Choose product options before adding to cart');
      window.location.assign(`/product/${product.slug}`);
      return;
    }
    dispatch(requestAddToCart({ product, quantity: 1, source: 'amazon-product-card' }));
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

  const dealBadge = product.isFlashDeal ? (
    <span className="inline-block rounded-sm bg-red-700 px-1.5 py-0.5 text-[11px] font-bold text-white">
      Limited time deal
    </span>
  ) : product.isFeatured ? (
    <span className="inline-block rounded-sm bg-orange-700 px-1.5 py-0.5 text-[11px] font-bold text-white">
      Best Seller
    </span>
  ) : hasDiscount && discountPercent >= 10 ? (
    <span className="inline-block rounded-sm bg-red-700 px-1.5 py-0.5 text-[11px] font-bold text-white">
      {discountPercent}% off
    </span>
  ) : null;

  const priceBlock = (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <span className="text-[19px] font-medium text-gray-900">
        <span className="align-top text-[11px]">{settings?.currencySymbol || '₹'}</span>
        {formatPrice(sellingPrice, settings).replace(/[^\d,.\s]/g, '').trim()}
      </span>
      {hasDiscount && (
        <span className="text-xs text-gray-500">
          M.R.P.: <span className="line-through">{formatPrice(mrp, settings)}</span>
        </span>
      )}
    </div>
  );

  const deliveryBlock = (
    <div className="mt-1 space-y-0.5 text-[13px]">
      {inStock ? (
        <>
          <p className="font-bold text-gray-900">FREE delivery</p>
          <p className="font-medium text-green-700">In stock</p>
        </>
      ) : (
        <p className="font-medium text-red-700">Currently unavailable</p>
      )}
    </div>
  );

  const cartButton = inStock ? (
    <button
      type="button"
      onClick={handleAddToCart}
      data-testid={`product-card-add-${product._id || product.slug}`}
      className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-full border border-amber-300 bg-amber-300 px-4 py-1.5 text-[13px] font-medium text-gray-900 shadow-sm transition-colors hover:bg-amber-400"
    >
      <ShoppingCart size={13} /> Add to Cart
    </button>
  ) : null;

  if (layout === 'list') {
    return (
      <div className="group flex gap-4 rounded-lg border border-gray-200 bg-white p-3 transition-shadow hover:shadow-[0_2px_12px_rgba(15,23,42,0.12)] sm:p-4">
        <Link
          to={`/product/${product.slug}`}
          onClick={handleProductClick}
          className="relative block h-40 w-36 shrink-0 overflow-hidden rounded bg-gray-50 sm:h-48 sm:w-48"
        >
          <img
            src={image}
            alt={product.title}
            loading="lazy"
            decoding="async"
            onError={() => setImageError(true)}
            className="h-full w-full object-cover"
          />
          {!inStock && (
            <span className="absolute left-1.5 top-1.5 rounded-sm bg-gray-900/80 px-1.5 py-0.5 text-[11px] font-bold text-white">
              Sold Out
            </span>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            to={`/product/${product.slug}`}
            onClick={handleProductClick}
            className="line-clamp-2 text-[15px] font-medium leading-snug text-gray-900 hover:text-orange-700 hover:underline"
          >
            {product.title}
          </Link>
          <div className="mt-1">
            <RatingStars average={product.ratings?.average} count={product.ratings?.count} />
          </div>
          <div className="mt-1">{dealBadge}</div>
          <div className="mt-1">{priceBlock}</div>
          {deliveryBlock}
          <div className="flex items-center gap-2">
            {cartButton}
            <button
              type="button"
              onClick={handleWishlist}
              aria-label="Add to wishlist"
              className={`mt-2 inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${
                isWishlisted
                  ? 'border-red-200 bg-red-50 text-red-500'
                  : 'border-gray-300 bg-white text-gray-400 hover:text-red-500'
              }`}
            >
              <Heart size={14} fill={isWishlisted ? 'currentColor' : 'none'} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex h-full flex-col rounded-lg border border-gray-200 bg-white transition-shadow hover:shadow-[0_2px_12px_rgba(15,23,42,0.12)]">
      <Link
        to={`/product/${product.slug}`}
        onClick={handleProductClick}
        className="relative block aspect-square overflow-hidden rounded-t-lg bg-gray-50"
      >
        <img
          src={image}
          alt={product.title}
          loading="lazy"
          decoding="async"
          onError={() => setImageError(true)}
          className="h-full w-full object-cover"
        />
        <button
          type="button"
          onClick={handleWishlist}
          aria-label="Add to wishlist"
          className={`absolute right-2 top-2 z-[2] flex h-7 w-7 items-center justify-center rounded-full shadow-sm ${
            isWishlisted
              ? 'bg-red-500 text-white'
              : 'bg-white/95 text-gray-400 hover:text-red-500'
          }`}
        >
          <Heart size={13} fill={isWishlisted ? 'currentColor' : 'none'} />
        </button>
        {!inStock && (
          <span className="absolute left-2 top-2 rounded-sm bg-gray-900/80 px-1.5 py-0.5 text-[11px] font-bold text-white">
            Sold Out
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col p-3">
        <Link
          to={`/product/${product.slug}`}
          onClick={handleProductClick}
          className="line-clamp-2 min-h-[2.6em] text-[13px] font-medium leading-snug text-gray-900 hover:text-orange-700 hover:underline"
        >
          {product.title}
        </Link>
        <div className="mt-1 min-h-[17px]">
          <RatingStars average={product.ratings?.average} count={product.ratings?.count} />
        </div>
        <div className="mt-1 min-h-[22px]">{dealBadge}</div>
        <div className="mt-0.5">{priceBlock}</div>
        <div className="min-h-[38px] text-[13px]">
          {inStock ? (
            <>
              <p className="mt-0.5 text-gray-700">FREE delivery</p>
              <p className="font-medium text-green-700">In stock</p>
            </>
          ) : (
            <p className="mt-0.5 font-medium text-red-700">Currently unavailable</p>
          )}
        </div>
        <div className="mt-auto w-full pt-2">
          {inStock ? cartButton : (
            <span className="mt-2 inline-flex items-center justify-center rounded-full border border-gray-200 bg-gray-100 px-4 py-1.5 text-[13px] font-medium text-gray-400">
              Out of Stock
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default AmazonProductCard;
