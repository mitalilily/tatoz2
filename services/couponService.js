const { assertCouponEligibility } = require('./couponEligibilityService');

const idOf = value => String(value?._id || value || '');

const isBundleItem = item => item?.itemType === 'bundle' || Boolean(item?.bundle);

const bundleIdOf = item => idOf(item?.bundle);

const bundleDiscountsAllowed = item => {
  if (!isBundleItem(item)) return true;
  const policy = item.bundleSnapshot?.discountCombination || item.bundle?.discountCombination || item.discountCombination || {};
  return policy.allowCoupons !== false && policy.coupons !== false && policy.combineWithCoupons !== false && policy.bundlePriceIsFinal !== true;
};

const bundleComponentItems = item => {
  if (!isBundleItem(item)) return [];
  const parentQuantity = Math.max(0, Number(item.quantity || 0));
  return [
    ...(item.bundleComponents || item.components || []),
    ...(item.bundleRewards || item.freeRewards || []),
  ].map(component => ({
    itemType: 'bundle_component',
    product: component.product,
    bundle: item.bundle,
    price: Number(component.allocatedUnitPrice ?? component.unitPrice ?? 0),
    quantity: Number(component.quantity || 0) * parentQuantity,
    taxRate: component.taxRate,
    category: component.category,
  }));
};

const couponItemsForOrder = (coupon, orderItems, productCategoryIds = new Map()) => {
  const productIds = new Set((coupon.applicableProducts || []).map(idOf));
  const categoryIds = new Set((coupon.applicableCategories || []).map(idOf));
  const restricted = productIds.size > 0 || categoryIds.size > 0;
  const items = [];
  (orderItems || []).forEach(item => {
    if (!bundleDiscountsAllowed(item)) return;
    if (!restricted) {
      items.push(item);
      return;
    }
    const directProductId = idOf(item.product);
    const directBundleId = bundleIdOf(item);
    const directCategoryId = String(productCategoryIds.get(directProductId) || item.category || '');
    const directMatches = (!productIds.size || productIds.has(directProductId) || (isBundleItem(item) && productIds.has(directBundleId)))
      && (!categoryIds.size || categoryIds.has(directCategoryId));
    if (directMatches && (directProductId || directBundleId)) {
      items.push(item);
      return;
    }
    bundleComponentItems(item).forEach(component => {
      const productId = idOf(component.product);
      const categoryId = String(productCategoryIds.get(productId) || component.category || '');
      if ((!productIds.size || productIds.has(productId)) && (!categoryIds.size || categoryIds.has(categoryId))) items.push(component);
    });
  });
  if (restricted && items.length === 0) {
    const error = new Error('This coupon does not apply to the products in your cart');
    error.publicCode = 'COUPON_PRODUCTS_NOT_ELIGIBLE';
    throw error;
  }
  return items;
};

const calculateCouponBenefit = (coupon, orderItems, subtotal, productCategoryIds = new Map()) => {
  const eligibleItems = couponItemsForOrder(coupon, orderItems, productCategoryIds);
  const applicableSubtotal = eligibleItems.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
  if (Number(coupon.minOrderAmount || 0) > Number(subtotal || 0)) {
    const error = new Error(`Minimum order amount ₹${coupon.minOrderAmount} required`);
    error.publicCode = 'COUPON_MIN_ORDER_NOT_MET';
    throw error;
  }

  let discount = 0;
  let freeShippingCoupon = false;
  let description = coupon.description || '';
  if (coupon.type === 'percentage') {
    discount = (applicableSubtotal * Number(coupon.value || 0)) / 100;
    if (coupon.maxDiscount !== undefined && coupon.maxDiscount !== null) discount = Math.min(discount, Number(coupon.maxDiscount));
  } else if (coupon.type === 'fixed') {
    discount = Math.min(Number(coupon.value || 0), applicableSubtotal);
  } else if (coupon.type === 'free_shipping') {
    freeShippingCoupon = true;
  } else if (coupon.type === 'buy_x_get_y') {
    const buyQuantity = Math.max(1, Number(coupon.buyXGetY?.buyQuantity || 2));
    const getQuantity = Math.max(1, Number(coupon.buyXGetY?.getQuantity || 1));
    const getDiscount = Math.min(100, Math.max(0, Number(coupon.buyXGetY?.getDiscount ?? 100)));
    const totalQuantity = eligibleItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    if (totalQuantity < buyQuantity + getQuantity) {
      const error = new Error('Coupon conditions are not met for this cart');
      error.publicCode = 'COUPON_QUANTITY_NOT_MET';
      throw error;
    }
    const prices = eligibleItems
      .flatMap(item => Array.from({ length: Number(item.quantity || 0) }, () => Number(item.price || 0)))
      .sort((left, right) => left - right);
    discount = prices.slice(0, getQuantity).reduce((sum, price) => sum + price, 0) * (getDiscount / 100);
    description = `Buy ${buyQuantity} Get ${getQuantity} ${getDiscount === 100 ? 'Free' : `at ${getDiscount}% off`}`;
  } else if (coupon.type === 'tiered') {
    const totalQuantity = eligibleItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const matchedTier = [...(coupon.tiers || [])]
      .sort((left, right) => Number(right.minQuantity) - Number(left.minQuantity))
      .find(tier => totalQuantity >= Number(tier.minQuantity));
    if (!matchedTier) {
      const error = new Error('Coupon conditions are not met for this cart');
      error.publicCode = 'COUPON_TIER_NOT_MET';
      throw error;
    }
    discount = (applicableSubtotal * Number(matchedTier.discount || 0)) / 100;
    if (coupon.maxDiscount !== undefined && coupon.maxDiscount !== null) discount = Math.min(discount, Number(coupon.maxDiscount));
    description = `${matchedTier.discount}% off for ${matchedTier.minQuantity}+ items`;
  } else if (coupon.type === 'bundle') {
    const cartIds = new Set((orderItems || []).flatMap(item => [idOf(item.product), bundleIdOf(item), ...bundleComponentItems(item).map(component => idOf(component.product))]).filter(Boolean));
    const bundleIds = (coupon.bundleProducts || []).map(idOf);
    if (!bundleIds.length || !bundleIds.every(id => cartIds.has(id)) || !Number(coupon.bundleDiscount)) {
      const error = new Error('Coupon bundle conditions are not met for this cart');
      error.publicCode = 'COUPON_BUNDLE_NOT_MET';
      throw error;
    }
    discount = (Number(subtotal || 0) * Number(coupon.bundleDiscount || 0)) / 100;
    if (coupon.maxDiscount !== undefined && coupon.maxDiscount !== null) discount = Math.min(discount, Number(coupon.maxDiscount));
    description = `${coupon.bundleDiscount}% bundle discount`;
  } else {
    const error = new Error('Unsupported coupon type');
    error.publicCode = 'COUPON_TYPE_UNSUPPORTED';
    throw error;
  }

  return {
    discount: Math.round(Math.min(Math.max(0, discount), Number(subtotal || 0)) * 100) / 100,
    freeShippingCoupon,
    description,
  };
};

const quoteCoupon = async ({ coupon, user, tenant, orderItems, subtotal, productCategoryIds, paymentMethod, shippingAddress, channel, session }) => {
  await assertCouponEligibility({
    coupon,
    user,
    tenant,
    orderAmount: subtotal,
    paymentMethod,
    shippingAddress,
    channel,
    session,
  });
  return calculateCouponBenefit(coupon, orderItems, subtotal, productCategoryIds);
};

module.exports = { couponItemsForOrder, calculateCouponBenefit, quoteCoupon };
