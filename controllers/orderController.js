const asyncHandler = require('express-async-handler');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const CommissionRule = require('../models/CommissionRule');
const Coupon = require('../models/Coupon');
const Settings = require('../models/Settings');
const { trackConversion } = require('../services/referralService');
const { sendOrderConfirmation } = require('../services/emailService');
const User = require('../models/User');
const TenantCustomer = require('../models/TenantCustomer');
const { parsePagination } = require('../utils/pagination');
const shippingManager = require('../services/shipping/shippingManager');
const inventoryReservationService = require('../services/inventoryReservationService');
const orderLifecycleService = require('../services/orderLifecycleService');
const { assertCouponEligibility, consumeCouponUsage } = require('../services/couponEligibilityService');
const walletService = require('../services/walletService');
const loyaltyService = require('../services/loyaltyService');
const giftCardService = require('../services/giftCardService');
const { calculateCouponBenefit: calculateCouponBenefitAuthoritative } = require('../services/couponService');
const { quoteBundle } = require('../services/bundleService');
const { resolveBulkOrderPrice } = require('../utils/bulkOrder');
const { calculateTax, resolveTaxProfile } = require('../services/taxService');
const { ensureInvoiceForOrder, ensureCommercialInvoicesForOrder } = require('../services/invoiceService');
const { resolveCommission } = require('../services/commissionService');
const { tenantScope } = require('../services/adminTenantScope');
const { quoteShipping } = require('../services/shipping/quoteService');
const codPolicyService = require('../services/codPolicyService');
const paymentManager = require('../services/payment/paymentManager');
const orderAdjustmentService = require('../services/orderAdjustmentService');
const orderItemAdjustmentService = require('../services/orderItemAdjustmentService');
const orderPackingSlipService = require('../services/orderPackingSlipService');
const { addApprovedProductFilter } = require('../services/productApprovalService');
const ClickEvent = require('../models/ClickEvent');

const roundMoney = value => Math.round((Number(value) || 0) * 100) / 100;
const guestTokenHash = token => crypto.createHash('sha256').update(String(token || '')).digest('hex');
const TRACKING_UTM_KEYS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'source', 'medium', 'campaign', 'term', 'content', 'landingPage',
  'firstPage', 'lastPage', 'firstSeenAt', 'lastSeenAt', 'referrer',
];
const normalizeTrackingUtm = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return TRACKING_UTM_KEYS.reduce((result, key) => {
    if (value[key] !== undefined && value[key] !== null && String(value[key]).trim()) {
      result[key] = String(value[key]).slice(0, 500);
    }
    return result;
  }, {});
};

// Allocate a parent-level money amount in cents so the child values always
// reconcile exactly to the parent. The last vendor receives the remainder
// created by currency rounding.
const allocateMoney = (amount, bases) => {
  const normalizedAmount = roundMoney(Math.max(0, Number(amount) || 0));
  if (!bases.length) return [];
  const normalizedBases = bases.map(base => Math.max(0, Number(base) || 0));
  const baseTotal = normalizedBases.reduce((sum, base) => sum + base, 0);
  if (baseTotal <= 0) {
    return normalizedBases.map((_, index) => index === normalizedBases.length - 1
      ? normalizedAmount
      : 0);
  }

  const allocations = [];
  let allocated = 0;
  normalizedBases.forEach((base, index) => {
    if (index === normalizedBases.length - 1) {
      allocations.push(roundMoney(normalizedAmount - allocated));
      return;
    }
    const allocation = roundMoney(normalizedAmount * (base / baseTotal));
    allocations.push(allocation);
    allocated = roundMoney(allocated + allocation);
  });
  return allocations;
};

const updateUserSegmentation = async (userId, orderTotal) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { $inc: { orderCount: 1, totalSpent: orderTotal }, $set: { lastOrderAt: new Date() } },
    { new: true },
  );
  if (!user) return;
  // Compute segment
  const segment = user.totalSpent >= 10000 || user.orderCount >= 10 ? 'vip' : 'active';
  if (user.segment !== segment) await User.updateOne({ _id: userId }, { $set: { segment } });
};

// Helper: group cart items into sub-orders by vendor.
// Used by createOrder to support multivendor orders where each vendor
// gets their own sub-order with independent commission/earnings tracking.
async function buildSubOrders(items, session, tenantId, financials = {}) {
  const Vendor = require('../models/Vendor');

  const itemsByVendor = {};
  const categoryRateByItem = new Map();
  const productIds = Array.from(new Set((items || []).map(item => item?.product).filter(id => mongoose.isValidObjectId(id)).map(id => String(id))));
  const productFilter = { _id: { $in: productIds }, ...(tenantId ? { tenant: tenantId } : {}) };
  addApprovedProductFilter(productFilter);
  const productQuery = Product.find(productFilter).select('vendor category title sku hsnCode').populate('category', 'commissionRate name ancestors depth level');
  if (session) productQuery.session(session);
  const productsById = new Map((await productQuery).map(product => [String(product._id), product]));
  for (const item of items) {
    const product = productsById.get(String(item?.product));
    if (!product) continue;
    const vendorId = product.vendor?.toString();
    if (!vendorId) continue; // Skip orphan products (no vendor assigned)
    if (!itemsByVendor[vendorId]) itemsByVendor[vendorId] = [];
    itemsByVendor[vendorId].push({
      ...item,
      vendor: vendorId,
      category: product.category?._id || product.category || item.category,
      categoryAncestors: product.category?.ancestors || [],
    });
    const categoryRate = Number(product.category?.commissionRate);
    categoryRateByItem.set(itemsByVendor[vendorId][itemsByVendor[vendorId].length - 1], Number.isFinite(categoryRate) ? Math.min(100, Math.max(0, categoryRate)) : null);
  }

  const subOrders = [];
  const defaultRate = await Settings.get('defaultCommissionRate', 10, { session });
  const commissionRuleQuery = CommissionRule.find({
    ...(tenantId ? { tenant: tenantId } : {}),
    isActive: true,
    effectiveFrom: { $lte: new Date() },
  }).lean();
  if (session) commissionRuleQuery.session(session);
  const commissionRules = await commissionRuleQuery;
  const parentSubtotal = roundMoney(itemsByVendor && Object.values(itemsByVendor)
    .flat()
    .reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0));
  const parentDiscount = roundMoney(Math.min(Math.max(0, Number(financials.discount) || 0), parentSubtotal));
  const parentShipping = roundMoney(Math.max(0, Number(financials.shippingCost) || 0));
  const parentTax = roundMoney(Math.max(0, Number(financials.tax) || 0));
  const parentTaxForTotal = roundMoney(Math.max(0,
    financials.taxForTotal === undefined ? parentTax : Number(financials.taxForTotal) || 0));
  const vendorSubtotals = Object.values(itemsByVendor).map(vendorItems => roundMoney(
    vendorItems.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0),
  ));
  const discountAllocations = allocateMoney(parentDiscount, vendorSubtotals);
  const shippingAllocations = allocateMoney(parentShipping, vendorSubtotals);
  const taxAllocations = allocateMoney(parentTax, vendorSubtotals);
  const taxForTotalAllocations = allocateMoney(parentTaxForTotal, vendorSubtotals);

  for (const [vendorIndex, [vendorId, vendorItems]] of Object.entries(itemsByVendor).entries()) {
    const vendor = await Vendor.findOne({ _id: vendorId, ...(tenantId ? { tenant: tenantId } : {}) }).session(session);
    if (!vendor) continue;

    const vendorOverrideRate = Number(vendor.commissionRate || 0);
    const subtotal = roundMoney(vendorSubtotals[vendorIndex]);
    const shippingCost = roundMoney(shippingAllocations[vendorIndex]);
    const discount = roundMoney(discountAllocations[vendorIndex]);
    const tax = roundMoney(taxAllocations[vendorIndex]);
    const taxForTotal = roundMoney(taxForTotalAllocations[vendorIndex]);
    const itemDiscounts = allocateMoney(discount, vendorItems.map(item => Number(item.price || 0) * Number(item.quantity || 0)));
    const commissionableAmount = roundMoney(Math.max(0, subtotal - discount));
    const total = roundMoney(subtotal + shippingCost + taxForTotal - discount);
    const itemCommissionData = vendorItems.map((item, index) => {
      const gross = roundMoney(Number(item.price || 0) * Number(item.quantity || 0));
      const itemCommissionable = roundMoney(Math.max(0, gross - Number(itemDiscounts[index] || 0)));
      const categoryRate = categoryRateByItem.get(item);
      const resolved = resolveCommission({
        rules: commissionRules,
        productId: item.product,
        categoryId: item.category,
        categoryAncestors: item.categoryAncestors,
        vendorId,
        vendorRate: vendorOverrideRate,
        categoryRate,
        defaultRate,
      });
      item.commissionRate = resolved.rate;
      item.commissionSource = resolved.source;
      item.commissionRule = resolved.ruleId || null;
      item.commissionAmount = roundMoney((itemCommissionable * resolved.rate) / 100);
      return { item, resolved };
    });
    const appliedRuleIds = new Set();
    const commissionFlatFee = roundMoney(itemCommissionData.reduce((sum, data) => {
      const ruleId = data.resolved.ruleId ? String(data.resolved.ruleId) : '';
      if (!ruleId || appliedRuleIds.has(ruleId)) return sum;
      appliedRuleIds.add(ruleId);
      return sum + Number(data.resolved.flatFee || 0);
    }, 0));
    const commissionAmount = roundMoney(itemCommissionData.reduce((sum, data) => sum + data.item.commissionAmount, 0) + commissionFlatFee);
    const commissionRate = commissionableAmount > 0 ? roundMoney((commissionAmount / commissionableAmount) * 100) : 0;
    const vendorEarnings = roundMoney(total - commissionAmount);
    const status = financials.orderStatus || 'confirmed';
    const paymentStatus = financials.paymentStatus || 'pending';

    subOrders.push({
      vendor: vendorId,
      items: vendorItems,
      orderNumber: `SUB-${new mongoose.Types.ObjectId().toString().toUpperCase()}`,
      subtotal,
      shippingCost,
      tax,
      discount,
      total,
      coupon: financials.coupon,
      couponCode: financials.couponCode,
      commissionRate,
      commissionFlatFee,
      commissionRules: itemCommissionData.map(({ item, resolved }) => ({
        product: item.product,
        category: item.category,
        rate: resolved.rate,
        flatFee: resolved.flatFee,
        source: resolved.source,
        ruleId: resolved.ruleId || null,
        ruleName: resolved.ruleName || '',
      })),
      commissionableAmount,
      commissionAmount,
      vendorEarnings,
      status,
      statusHistory: [{ status, updatedAt: new Date() }],
      paymentStatus,
    });
  }
  return subOrders;
}

// @desc    Create order
// @route   POST /api/orders
const createOrder = asyncHandler(async (req, res) => {
  const { items, shippingAddress, couponCode, referralCode } = req.body;
  let paymentMethod = String(req.body?.paymentMethod || '').trim().toLowerCase();
  const operationalPaymentProviders = await paymentManager.getOperationalProviders({ tenantId: req.tenant?._id });
  const codFallback = operationalPaymentProviders.length === 0;
  // The order record is created before an external payment attempt. Keep an
  // explicitly requested legacy method on that pending order so stored-tender
  // settlement/release remains recoverable; the payment-order endpoint is the
  // authoritative boundary and rejects any inactive gateway before charging.
  if (!paymentMethod && codFallback) paymentMethod = 'cod';
  const guestCheckout = !req.user;
  const requestedGuestEmail = String(req.body?.customerEmail || '').trim().toLowerCase();
  const requestedGuestToken = String(req.body?.guestAccessToken || '').trim();
  const requestedWalletAmount = req.body.walletAmount;
  const requestedLoyaltyPoints = req.body.loyaltyPoints;
  const requestedGiftCardCode = typeof req.body.giftCardCode === 'string' ? req.body.giftCardCode.trim() : '';
  const requestedGiftCardAmount = req.body.giftCardAmount === undefined || req.body.giftCardAmount === null || req.body.giftCardAmount === ''
    ? 0
    : Number(req.body.giftCardAmount);
  const checkoutIdempotencyKey = String(req.headers?.['idempotency-key'] || req.body.checkoutIdempotencyKey || '').trim();
  const trackingSessionId = String(req.headers?.['x-session-id'] || req.body?.trackingSessionId || '').trim().slice(0, 200);
  const trackingUtm = normalizeTrackingUtm(req.body?.utm);

  if (guestCheckout && !['cod', 'razorpay', 'cashfree', 'stripe', 'manual', 'bank_transfer', 'upi'].includes(paymentMethod)) {
    res.status(401);
    throw new Error('Sign in is required to use wallet, loyalty points, gift cards, or stored account balances');
  }
  if (guestCheckout && requestedGuestEmail && !/^\S+@\S+\.\S+$/.test(requestedGuestEmail)) {
    res.status(400);
    throw new Error('Guest checkout email is invalid');
  }

  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    res.status(400);
    throw new Error('Order must contain between 1 and 50 items');
  }
  if (!['cod', 'razorpay', 'cashfree', 'stripe', 'wallet', 'loyalty', 'gift_card', 'manual', 'bank_transfer', 'upi'].includes(paymentMethod)) {
    res.status(400);
    throw new Error('Invalid payment method');
  }
  const parsedWalletAmount = requestedWalletAmount === undefined || requestedWalletAmount === null || requestedWalletAmount === ''
    ? 0
    : Number(requestedWalletAmount);
  if (!Number.isFinite(parsedWalletAmount) || parsedWalletAmount < 0 || parsedWalletAmount > 100000000) {
    res.status(400);
    throw new Error('Invalid wallet amount');
  }
  const walletAmountRequested = Math.round(parsedWalletAmount * 100) / 100;
  const parsedLoyaltyPoints = requestedLoyaltyPoints === undefined || requestedLoyaltyPoints === null || requestedLoyaltyPoints === ''
    ? 0
    : Number(requestedLoyaltyPoints);
  if (!Number.isInteger(parsedLoyaltyPoints) || parsedLoyaltyPoints < 0 || parsedLoyaltyPoints > 1000000000) {
    res.status(400);
    throw new Error('Loyalty points must be a whole number between 0 and 1000000000');
  }
  const loyaltyPointsRequested = parsedLoyaltyPoints;
  if (!Number.isFinite(requestedGiftCardAmount) || requestedGiftCardAmount < 0 || requestedGiftCardAmount > 100000000) {
    res.status(400);
    throw new Error('Invalid gift card amount');
  }
  const giftCardAmountRequested = Math.round(requestedGiftCardAmount * 100) / 100;
  if ((walletAmountRequested > 0 || paymentMethod === 'wallet' || loyaltyPointsRequested > 0 || paymentMethod === 'loyalty' || requestedGiftCardCode || paymentMethod === 'gift_card') && (checkoutIdempotencyKey.length < 8 || checkoutIdempotencyKey.length > 128)) {
    res.status(400);
    const error = new Error('Stored-tender checkout requires a stable Idempotency-Key');
    error.publicCode = requestedGiftCardCode || paymentMethod === 'gift_card'
      ? 'GIFT_CARD_IDEMPOTENCY_REQUIRED'
      : loyaltyPointsRequested > 0 || paymentMethod === 'loyalty' ? 'LOYALTY_IDEMPOTENCY_REQUIRED' : 'WALLET_IDEMPOTENCY_REQUIRED';
    throw error;
  }
  if (checkoutIdempotencyKey && (checkoutIdempotencyKey.length < 8 || checkoutIdempotencyKey.length > 128)) {
    res.status(400);
    const error = new Error('Invalid checkout Idempotency-Key');
    error.publicCode = 'CHECKOUT_IDEMPOTENCY_INVALID';
    throw error;
  }

  if (checkoutIdempotencyKey) {
    const existingOrder = await Order.findOne({
      ...(req.user ? { user: req.user._id } : requestedGuestToken ? { guestAccessTokenHash: guestTokenHash(requestedGuestToken) } : {}),
      ...(req.tenant ? { tenant: req.tenant._id } : {}),
      checkoutIdempotencyKey,
    }).select('+guestAccessTokenHash');
    if (existingOrder) {
      const safeExistingOrder = existingOrder.toObject();
      delete safeExistingOrder.guestAccessTokenHash;
      return res.status(200).json({ success: true, order: safeExistingOrder, ...(guestCheckout ? { guestAccessToken: requestedGuestToken } : {}), idempotent: true });
    }
  }
  if (paymentMethod === 'wallet' && walletAmountRequested <= 0) {
    res.status(400);
    throw new Error('Wallet payment requires a positive wallet amount');
  }
  if (paymentMethod === 'loyalty' && loyaltyPointsRequested <= 0) {
    res.status(400);
    throw new Error('Loyalty payment requires positive loyalty points');
  }
  if (paymentMethod === 'gift_card' && !requestedGiftCardCode) {
    res.status(400);
    throw new Error('Gift card payment requires a gift card code');
  }
  if (giftCardAmountRequested > 0 && !requestedGiftCardCode) {
    res.status(400);
    throw new Error('Gift card amount requires a gift card code');
  }
  const codEnabled = await Settings.get('cod_enabled', true);
  if (paymentMethod === 'cod' && !codFallback && (codEnabled === false || codEnabled === 'false')) {
    res.status(400);
    throw new Error('Cash on Delivery is currently disabled');
  }
  if (!shippingAddress || typeof shippingAddress !== 'object') {
    res.status(400);
    throw new Error('Shipping address is required');
  }
  const addressFields = ['fullName', 'phone', 'street', 'city', 'state', 'pincode'];
  if (addressFields.some(field => typeof shippingAddress[field] !== 'string' || !shippingAddress[field].trim() || shippingAddress[field].length > 200)) {
    res.status(400);
    throw new Error('A complete, valid shipping address is required');
  }

  let guestAccessToken = '';
  let guestAccessTokenDigest = '';
  let guestUser = null;
  if (guestCheckout) {
    guestAccessToken = crypto.randomBytes(32).toString('hex');
    guestAccessTokenDigest = guestTokenHash(guestAccessToken);
    guestUser = await User.create({ name: shippingAddress.fullName, role: 'customer', isEmailVerified: false, isPhoneVerified: false });
    req.user = guestUser;
    if (req.tenant?._id) await TenantCustomer.create({ tenant: req.tenant._id, user: guestUser._id, source: 'commerce' });
  }

  const session = await mongoose.startSession();
  let order;
  let subtotal = 0;
  let total = 0;
  let walletAmount = 0;
  let loyaltyPoints = 0;
  let loyaltyAmount = 0;
  let giftCardAmount = 0;
  let giftCardId = null;
  let giftCardLast4 = '';
  let externalPaymentAmount = 0;
  let taxQuote = null;
  let shippingQuote = null;
  let shippingWeight = 0;
  let committed = false;
  const productCategoryIds = new Map();

  try {
    await session.withTransaction(async () => {
      // MongoDB may retry a transaction callback after a transient conflict.
      // These accumulators live outside the callback because the committed
      // values are used after the transaction, so reset them on every retry.
      subtotal = 0;
      total = 0;
      walletAmount = 0;
      loyaltyPoints = 0;
      loyaltyAmount = 0;
      giftCardAmount = 0;
      giftCardId = null;
      giftCardLast4 = '';
      externalPaymentAmount = 0;
      taxQuote = null;
      shippingQuote = null;
      shippingWeight = 0;
      productCategoryIds.clear();
      // Calculate prices from the database and reserve inventory in the same
      // transaction. Client-provided prices are never trusted.
      const orderItems = [];
      const seenItems = new Set();

      for (const item of items) {
        const quantity = Number(item.quantity);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
          res.status(400);
          throw new Error('Each quantity must be an integer between 1 and 100');
        }
        if (item.itemType === 'bundle' || item.bundle) {
          if (!mongoose.isValidObjectId(item.bundle)) {
            res.status(400);
            throw new Error('Invalid bundle id');
          }
          const bundleQuote = await quoteBundle({
            tenantId: req.tenant?._id,
            bundleId: item.bundle,
            quantity,
            selections: item.bundleSelections || item.selections || {},
            session,
          });
          orderItems.push({
            itemType: 'bundle',
            bundle: bundleQuote.bundle._id,
            bundleVersion: bundleQuote.bundleVersion,
            bundleName: bundleQuote.bundle.name,
            bundleSku: bundleQuote.bundle.sku,
            bundleComponents: bundleQuote.components,
            bundleRewards: bundleQuote.freeRewards,
            bundleSnapshot: {
              name: bundleQuote.bundle.name,
              sku: bundleQuote.bundle.sku,
              offerType: bundleQuote.offerType,
              version: bundleQuote.bundleVersion,
              returnPolicy: bundleQuote.bundle.returnPolicy || 'entire_bundle',
              discountCombination: bundleQuote.bundle.discountCombination || {},
              comparePrice: bundleQuote.comparePrice,
              componentSubtotal: bundleQuote.componentSubtotal,
              price: bundleQuote.unitPrice,
              savingsAmount: bundleQuote.savingsAmount,
              components: bundleQuote.components,
              freeRewards: bundleQuote.freeRewards,
            },
            title: bundleQuote.bundle.name,
            image: bundleQuote.bundle.image || bundleQuote.components[0]?.image,
            price: bundleQuote.unitPrice,
            costPrice: bundleQuote.costPrice,
            costPriceCaptured: true,
            quantity,
            sku: bundleQuote.bundle.sku,
            hsnCode: bundleQuote.hsnCode,
            taxRate: bundleQuote.taxRate === null || bundleQuote.taxRate === undefined ? undefined : Number(bundleQuote.taxRate),
          });
          shippingWeight += Number(bundleQuote.shippingWeight || 0) * quantity;
          productCategoryIds.set(String(bundleQuote.bundle._id), bundleQuote.bundle.category ? String(bundleQuote.bundle.category) : '');
          bundleQuote.components.forEach(component => productCategoryIds.set(String(component.product), String(component.category || '')));
          bundleQuote.freeRewards.forEach(component => productCategoryIds.set(String(component.product), String(component.category || '')));
          subtotal += bundleQuote.lineTotal;
          continue;
        }
        if (!mongoose.isValidObjectId(item.product)) {
          res.status(400);
          throw new Error('Invalid product id');
        }

        const variantKey = item.variant && typeof item.variant === 'object' ? JSON.stringify(item.variant) : '';
        const itemKey = `${item.product}:${variantKey}`;
        if (seenItems.has(itemKey)) {
          res.status(400);
          throw new Error('Duplicate product/variant in cart');
        }
        seenItems.add(itemKey);

        const productQuery = { _id: item.product, isActive: true, ...(req.tenant ? { tenant: req.tenant._id } : {}) };
        addApprovedProductFilter(productQuery);
        const product = await Product.findOne(productQuery)
          .populate('vendor', 'taxProfile storeName')
          .session(session);
        if (!product) { res.status(404); throw new Error(`Product ${item.product} not found`); }

        const selectedOptions = item.variant && product.variants?.length
          ? product.variants.map(variant => variant.options.find(option => option.value === item.variant[variant.name])).filter(Boolean)
          : [];
        if (product.variants?.length && selectedOptions.length !== product.variants.length) {
          res.status(400);
          throw new Error(`Select all variants for ${product.title}`);
        }

        const variantStock = selectedOptions.length
          ? Math.min(...selectedOptions.map(option => Number(option.stock ?? product.stock)))
          : product.stock;
        if (variantStock < quantity || product.stock < quantity) {
          res.status(409);
          throw new Error(`Insufficient stock for ${product.title}`);
        }

        const pricedOption = [...selectedOptions].reverse().find(option => option.price !== undefined && option.price !== null);
        const basePrice = pricedOption
          ? Number(pricedOption.price)
          : Number(product.price || 0) + selectedOptions.reduce((sum, option) => sum + Number(option.priceModifier || 0), 0);
        if (!Number.isFinite(basePrice) || basePrice < 0) {
          res.status(400);
          throw new Error(`Invalid price for ${product.title}`);
        }
        const price = resolveBulkOrderPrice(product, quantity, basePrice);
        const variantImage = [...selectedOptions].reverse().find(option => option.images?.length)?.images?.[0]?.url;

        const vendorTaxProfile = product.vendor?.taxProfile
          ? {
            ...(product.vendor.taxProfile.toObject?.() || product.vendor.taxProfile),
            businessName: product.vendor.taxProfile.businessName || product.vendor.storeName || '',
          }
          : undefined;
        orderItems.push({
          product: product._id,
          title: product.title,
          image: variantImage || product.thumbnail || product.images[0]?.url,
          price,
          costPrice: Math.max(0, Number(product.costPrice || 0)),
          costPriceCaptured: true,
          quantity,
          sku: product.sku,
          hsnCode: product.hsnCode || '',
          taxRate: product.gstRate === null || product.gstRate === undefined ? undefined : Number(product.gstRate),
          taxProfile: vendorTaxProfile,
          variant: item.variant,
        });
        const productWeight = Number(product.weight);
        shippingWeight += (Number.isFinite(productWeight) && productWeight > 0 ? productWeight : 0.5) * quantity;
        productCategoryIds.set(String(product._id), product.category ? String(product.category) : '');
        subtotal += price * quantity;
      }

      const inventoryItems = orderItems.flatMap(item => {
        if (item.itemType !== 'bundle') return [{ ...item, itemType: 'product' }];
        const componentItems = (item.bundleComponents || []).map(component => ({
          itemType: 'product',
          product: component.product,
          title: component.title,
          image: component.image,
          price: Number(component.allocatedUnitPrice ?? component.unitPrice ?? 0),
          costPrice: Number(component.costPrice || 0) / Math.max(1, Number(component.quantity || 1)),
          costPriceCaptured: true,
          quantity: Number(component.quantity || 0) * Number(item.quantity || 0),
          variant: component.variant || {},
          sku: component.sku || '',
          hsnCode: component.hsnCode || '',
          taxRate: component.taxRate,
        }));
        const rewardItems = (item.bundleRewards || []).map(reward => ({
          itemType: 'product',
          product: reward.product,
          title: reward.title,
          image: reward.image,
          price: 0,
          costPrice: Number(reward.costPrice || 0) / Math.max(1, Number(reward.quantity || 1)),
          costPriceCaptured: true,
          quantity: Number(reward.quantity || 0) * Number(item.quantity || 0),
          variant: reward.variant || {},
          sku: reward.sku || '',
          hsnCode: reward.hsnCode || '',
          taxRate: reward.taxRate,
          freeReward: true,
        }));
        return [...componentItems, ...rewardItems];
      });

      // Coupon validation and usage are part of the transaction so two
      // concurrent checkouts cannot both consume the last coupon slot.
      let discount = 0;
      let freeShippingCoupon = false;
      let couponDoc = null;
      if (couponCode) {
        const now = new Date();
        couponDoc = await Coupon.findOne({
          code: String(couponCode).toUpperCase(),
          ...(req.tenant ? { tenant: req.tenant._id } : {}),
          isActive: true,
          expiresAt: { $gt: now },
          $or: [{ startDate: null }, { startDate: { $exists: false } }, { startDate: { $lte: now } }],
        }).session(session);
        if (!couponDoc) {
          res.status(400);
          throw new Error('Invalid, expired, or not-yet-active coupon');
        }
        try {
          await assertCouponEligibility({
            coupon: couponDoc,
            user: req.user,
            tenant: req.tenant?._id,
            orderAmount: subtotal,
            paymentMethod,
            shippingAddress,
            channel: req.body.channel || req.headers['x-client-platform'] || 'website',
            session,
          });
          ({ discount, freeShippingCoupon } = calculateCouponBenefitAuthoritative(couponDoc, orderItems, subtotal, productCategoryIds));
        } catch (error) {
          res.status(error.statusCode || 400);
          throw error;
        }
      }

      discount = Math.min(Math.max(0, discount), subtotal);
      shippingQuote = await quoteShipping({
        tenantId: req.tenant?._id,
        shippingAddress,
        subtotal,
        discount,
        weight: shippingWeight,
        paymentMethod,
        couponFreeShipping: freeShippingCoupon,
        session,
      });
      const shippingCost = shippingQuote.shippingCost;
      const taxProfile = await resolveTaxProfile({ tenant: req.tenant, session });
      const profileForItem = item => taxProfile.gstInvoiceOwner === 'seller' ? (item.taxProfile || taxProfile) : taxProfile;
      taxQuote = calculateTax({ items: orderItems, discount, shippingCost, shippingAddress, profile: taxProfile, profileForItem });
      const tax = taxQuote.tax;
      const itemTaxLines = taxQuote.lines.filter(line => line.lineType === 'item').reduce((map, line) => {
        const current = map.get(line.itemIndex) || { taxableAmount: 0, tax: 0, rates: new Set(), profile: line };
        current.taxableAmount = Math.round((current.taxableAmount + Number(line.taxableAmount || 0)) * 100) / 100;
        current.tax = Math.round((current.tax + Number(line.tax || 0)) * 100) / 100;
        current.rates.add(Number(line.rate));
        if (!current.profile) current.profile = line;
        map.set(line.itemIndex, current);
        return map;
      }, new Map());
      orderItems.forEach((item, index) => {
        const line = itemTaxLines.get(index);
        if (!line) return;
        item.taxProfile = profileForItem(item);
        item.taxableAmount = line.taxableAmount;
        item.taxAmount = line.tax;
        item.taxRate = line.rates.size === 1 ? [...line.rates][0] : undefined;
      });
      const taxOnTop = taxQuote.taxIncluded ? 0 : tax;
      total = Math.round((subtotal - discount + shippingCost + taxOnTop) * 100) / 100;

      const isCod = paymentMethod === 'cod';
      if (isCod) {
        await codPolicyService.assertEligible({
          tenantId: req.tenant?._id,
          userId: req.user._id,
          paymentMethod,
          total,
          address: shippingAddress,
          session,
        });
      }
      walletAmount = Math.round(walletAmountRequested * 100) / 100;
      if (walletAmount > total) {
        res.status(400);
        throw new Error('Wallet amount cannot exceed the order total');
      }
      if (loyaltyPointsRequested > 0) {
        const quote = await loyaltyService.quoteRedemption({
          tenant: req.tenant?._id,
          user: req.user._id,
          orderTotal: total,
          requestedPoints: loyaltyPointsRequested,
          session,
        });
        loyaltyPoints = quote.points;
        loyaltyAmount = quote.amount;
      }
      if (requestedGiftCardCode) {
        const quote = await giftCardService.quoteRedemption({
          tenant: req.tenant?._id,
          code: requestedGiftCardCode,
          orderTotal: Math.max(0.01, total - walletAmount - loyaltyAmount),
          requestedAmount: giftCardAmountRequested > 0 ? giftCardAmountRequested : undefined,
          session,
        });
        giftCardAmount = quote.amount;
        giftCardId = quote.card._id;
        giftCardLast4 = quote.codeLast4;
      }
      const tenderedAmount = Math.round((walletAmount + loyaltyAmount + giftCardAmount) * 100) / 100;
      if (tenderedAmount > total + 0.01) {
        res.status(400);
        throw new Error('Stored tender cannot exceed the order total');
      }
      externalPaymentAmount = Math.round(Math.max(0, total - tenderedAmount) * 100) / 100;
      if (paymentMethod === 'wallet' && externalPaymentAmount > 0.01) {
        res.status(400);
        throw new Error('Wallet payment must cover the complete order total');
      }
      if (paymentMethod === 'loyalty' && externalPaymentAmount > 0.01) {
        res.status(400);
        throw new Error('Loyalty payment must cover the complete order total');
      }
      if (paymentMethod === 'gift_card' && externalPaymentAmount > 0.01) {
        res.status(400);
        throw new Error('Gift card payment must cover the complete order total');
      }
      const fullySettled = externalPaymentAmount <= 0.01;
      const isWalletOnly = paymentMethod === 'wallet' && fullySettled;
      const isLoyaltyOnly = paymentMethod === 'loyalty' && fullySettled;
      const isGiftCardOnly = paymentMethod === 'gift_card' && fullySettled;
      const isImmediate = isCod || fullySettled;
      const initialOrderStatus = isImmediate ? 'confirmed' : 'pending';
      const initialPaymentStatus = fullySettled ? 'paid' : 'pending';
      const settlementProvider = [
        walletAmount > 0 ? 'wallet' : '',
        loyaltyPoints > 0 ? 'loyalty' : '',
        giftCardAmount > 0 ? 'gift_card' : '',
      ].filter(Boolean).join('+');
      const statusNote = fullySettled
        ? `Order placed and paid from ${settlementProvider || 'prepaid balance'}`
        : isCod
          ? 'Order placed successfully'
          : 'Order created; awaiting payment';

      const created = await Order.create([{
        user: req.user._id,
        ...(guestCheckout ? { guestEmail: requestedGuestEmail, guestAccessTokenHash: guestAccessTokenDigest, guestAccessTokenExpiresAt: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)) } : {}),
        items: orderItems,
        inventoryItems,
        shippingAddress,
        billingAddress: req.body.billingAddress || shippingAddress,
        paymentMethod,
        paymentStatus: initialPaymentStatus,
        paymentProvider: fullySettled ? settlementProvider : '',
        paymentVerifiedAt: fullySettled ? new Date() : undefined,
        orderStatus: initialOrderStatus,
        subtotal: Math.round(subtotal * 100) / 100,
        shippingCost,
        tax: Math.round(tax * 100) / 100,
        taxableAmount: taxQuote.taxableAmount,
        cgst: taxQuote.cgst,
        sgst: taxQuote.sgst,
        igst: taxQuote.igst,
        otherTax: taxQuote.otherTax,
        taxMode: taxQuote.pricingMode,
        taxRegistrationType: taxQuote.registrationType,
        gstInvoiceOwner: taxQuote.gstInvoiceOwner,
        taxProfile: taxQuote.profileId || undefined,
        taxBreakdown: taxQuote.lines,
        sellerGstin: taxQuote.sellerGstin || undefined,
        sellerState: taxQuote.originState || undefined,
        taxBusinessName: taxQuote.businessName || undefined,
        taxBusinessAddress: taxQuote.businessAddress || {},
        invoiceNote: taxQuote.invoiceNote || '',
        discount: Math.round(discount * 100) / 100,
        total: Math.round(total * 100) / 100,
        amountPaid: tenderedAmount,
        amountDue: externalPaymentAmount,
        coupon: couponDoc?._id,
        couponCode: couponDoc?.code,
        referralCode: referralCode?.toUpperCase(),
        referralSource: String(req.body.referralSource || trackingUtm.utm_source || trackingUtm.source || '').slice(0, 200),
        utm: trackingUtm,
        trackingSessionId,
        inventoryStatus: isImmediate ? 'sold' : 'reserved',
        walletAmount,
        externalPaymentAmount,
        walletSettlementStatus: walletAmount > 0 ? (fullySettled ? 'captured' : 'debited') : 'none',
        walletDebitedAt: walletAmount > 0 ? new Date() : undefined,
        loyaltyPoints,
        loyaltyAmount,
        loyaltySettlementStatus: loyaltyPoints > 0 ? (fullySettled ? 'captured' : 'debited') : 'none',
        loyaltyRedeemedAt: loyaltyPoints > 0 ? new Date() : undefined,
        giftCard: giftCardId || undefined,
        giftCardLast4: giftCardLast4 || undefined,
        giftCardAmount,
        giftCardSettlementStatus: giftCardAmount > 0 ? ((fullySettled || isCod) ? 'captured' : 'debited') : 'none',
        checkoutIdempotencyKey: checkoutIdempotencyKey || undefined,
        shippingMethod: shippingQuote.shippingMethod || 'standard',
        shippingQuote,
        estimatedDelivery: new Date(Date.now() + Number(shippingQuote.estimatedMaxDays || 7) * 24 * 60 * 60 * 1000),
        statusHistory: [{ status: initialOrderStatus, note: statusNote }],
        tenant: req.tenant?._id,
        subOrders: await buildSubOrders(inventoryItems, session, req.tenant?._id, {
          discount,
          shippingCost,
          tax,
          taxForTotal: taxOnTop,
          paymentStatus: initialPaymentStatus,
          orderStatus: initialOrderStatus,
          coupon: couponDoc?._id,
          couponCode: couponDoc?.code,
        }),
      }], { session });
      order = created[0];
      if (walletAmount > 0) {
        await walletService.debitWalletTotal({
          tenant: req.tenant?._id,
          user: req.user._id,
          amount: walletAmount,
          source: 'order_payment',
          referenceType: 'order',
          referenceId: order._id,
          idempotencyKey: `wallet-order-payment:${order._id}`,
          note: `Wallet applied to order ${order.orderNumber}`,
          createdBy: req.user._id,
          session,
        });
      }
      if (loyaltyPoints > 0) {
        await loyaltyService.redeemPoints({
          tenant: req.tenant?._id,
          user: req.user._id,
          points: loyaltyPoints,
          source: 'checkout_redeem',
          referenceType: 'order',
          referenceId: order._id,
          idempotencyKey: `loyalty-order-redeem:${order._id}`,
          note: `Loyalty points applied to order ${order.orderNumber}`,
          createdBy: req.user._id,
          session,
        });
      }
      if (giftCardAmount > 0) {
        await giftCardService.redeemGiftCard({
          tenant: req.tenant?._id,
          user: req.user._id,
          code: requestedGiftCardCode,
          amount: giftCardAmount,
          order: order._id,
          referenceType: 'order',
          referenceId: order._id,
          idempotencyKey: 'gift-card-order-redeem:' + order._id,
          note: 'Gift card ending ' + giftCardLast4 + ' applied to order ' + order.orderNumber,
          createdBy: req.user._id,
          session,
        });
      }
      const inventory = await inventoryReservationService.allocationForOrder({
        order,
        mode: isImmediate ? 'sale' : 'reserve',
        reason: isWalletOnly ? 'wallet_order_created' : isLoyaltyOnly ? 'loyalty_order_created' : isGiftCardOnly ? 'gift_card_order_created' : isCod ? 'cod_order_created' : 'payment_pending_order_created',
        session,
      });
      order.inventoryStatus = isImmediate ? 'sold' : 'reserved';
      if (inventory.reservation?._id) order.inventoryReservation = inventory.reservation._id;

      if (couponDoc) {
        await consumeCouponUsage({
          coupon: couponDoc,
          userId: req.user._id,
          orderId: order._id,
          tenant: order.tenant,
          discountAmount: discount,
          status: fullySettled || isCod ? 'captured' : 'reserved',
          session,
        });
      }
      if (!isCod && fullySettled && req.tenant?._id) {
        await loyaltyService.earnPurchasePoints({ tenant: req.tenant._id, user: req.user._id, order, session });
      }
      committed = true;
    });
  } catch (error) {
    if (error?.code === 20 || /Transaction numbers are only allowed|replica set/i.test(error?.message || '')) {
      res.status(503);
      throw new Error('Checkout is temporarily unavailable because transactional MongoDB is not enabled');
    }
    if (guestUser && !committed) {
      await TenantCustomer.deleteMany({ user: guestUser._id }).catch(() => {});
      await User.deleteOne({ _id: guestUser._id }).catch(() => {});
    }
    throw error;
  } finally {
    await session.endSession();
  }

  if (!committed || !order) throw new Error('Order transaction did not commit');

  // The invoice is generated from the committed order/tax snapshot. A
  // provider outage must not erase a successful checkout, so a later invoice
  // GET can deterministically repair a transient generation failure.
  try {
    await ensureInvoiceForOrder({ order, tenant: req.tenant?._id, source: 'automatic' });
  } catch (invoiceError) {
    console.error('[Invoice] automatic generation deferred', invoiceError.message);
  }

  // Tie the committed order to the same browser session used by storefront
  // page views so the admin order panel can show the complete journey.
  setImmediate(() => ClickEvent.create({
    tenant: order.tenant || req.tenant?._id,
    eventType: 'order_placed',
    page: `/order-confirmation/${order._id}`,
    target: order.orderNumber,
    targetId: String(order._id),
    metadata: { orderId: String(order._id), orderNumber: order.orderNumber, total: order.total, utm: trackingUtm },
    userId: order.user,
    sessionId: trackingSessionId || null,
    userAgent: req.headers['user-agent'],
    referrer: req.headers.referer || req.headers.referrer || null,
    ip: req.ip,
  }).catch(error => console.warn('[click-tracking] order event write failed:', error.message)));

  // Track referral conversion
  if (referralCode) {
    await trackConversion({
      code: referralCode,
      orderId: order._id,
      orderValue: total,
      userId: req.user?._id,
      tenant: req.tenant,
    }).catch(e => console.log('Referral tracking error:', e.message));
  }

  // Send confirmation email
  if (req.user && !guestCheckout) {
    await sendOrderConfirmation(order, req.user).catch(() => {});
    // Update user segmentation
    updateUserSegmentation(req.user._id, order.total).catch(() => {});
  } else if (guestCheckout && requestedGuestEmail) {
    await sendOrderConfirmation(order, { ...req.user.toObject(), email: requestedGuestEmail }).catch(() => {});
  }
  require('../services/orderNotificationService').sendOrderPlaced(order).catch(error => console.error('[TrustSignal] order SMS hook failed:', error.message));

  const responseOrder = order.toObject ? order.toObject() : order;
  delete responseOrder.guestAccessTokenHash;
  res.status(201).json({ success: true, order: responseOrder, ...(guestCheckout ? { guestAccessToken } : {}) });
});

// @desc    Get my orders
// @route   GET /api/orders/my
const getMyOrders = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 10, maxLimit: 100 });
  const orderQuery = { user: req.user._id, ...(req.tenant ? { tenant: req.tenant._id } : {}) };
  const total = await Order.countDocuments(orderQuery);
  const orders = await Order.find(orderQuery)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('items.product', 'title thumbnail slug');

  const safeOrders = orders.map(order => {
    const payload = order.toObject();
    delete payload.adminNote;
    return payload;
  });
  res.json({ success: true, orders: safeOrders, pagination: { page, limit, total } });
});

// @desc    Get single order
// @route   GET /api/orders/:id
const getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, ...(req.tenant ? { tenant: req.tenant._id } : {}) })
    .select('+guestAccessTokenHash')
    .populate('items.product', 'title thumbnail slug')
    .populate('user', 'name email phone');

  if (!order) { res.status(404); throw new Error('Order not found'); }

  const suppliedGuestToken = String(req.query?.guestToken || req.headers['x-guest-order-token'] || '').trim();
  const suppliedGuestHash = suppliedGuestToken ? guestTokenHash(suppliedGuestToken) : '';
  const guestAuthorized = Boolean(order.guestAccessTokenHash && order.guestAccessTokenExpiresAt > new Date() && suppliedGuestHash === order.guestAccessTokenHash);
  if (!req.user && !guestAuthorized) {
    res.status(401);
    throw new Error('Order access token is required');
  }
  if (req.user?.role === 'customer' && !guestAuthorized && order.user?._id.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to view this order');
  }

  const payload = order.toObject();
  if (req.user?.role === 'customer' || guestAuthorized) {
    delete payload.adminNote;
    delete payload.guestAccessTokenHash;
  }
  res.json({ success: true, order: payload });
});

// @desc    Update bounded admin order details
// @route   PUT /api/admin/orders/:id/details
const updateOrderDetails = asyncHandler(async (req, res) => {
  const result = await orderAdjustmentService.updateOrderDetails({
    orderId: req.params.id,
    tenant: req.tenant?._id,
    actorId: req.user._id,
    data: req.body || {},
    idempotencyKey: String(req.headers['idempotency-key'] || '').trim(),
  });
  res.json({ success: true, order: result.order, adjustment: result.adjustment, idempotent: result.idempotent });
});

// @desc    Add, remove, or change quantities for pre-fulfillment order items
// @route   PUT /api/admin/orders/:id/items
const updateOrderItems = asyncHandler(async (req, res) => {
  const result = await orderItemAdjustmentService.updateOrderItems({
    orderId: req.params.id,
    tenant: req.tenant?._id,
    actorId: req.user._id,
    data: req.body || {},
    idempotencyKey: String(req.headers['idempotency-key'] || '').trim(),
  });
  res.json({ success: true, order: result.order, adjustment: result.adjustment, idempotent: result.idempotent });
});

// @desc    Return a tenant-scoped, price-free warehouse packing-slip snapshot
// @route   GET /api/admin/orders/:id/packing-slip
const getPackingSlip = asyncHandler(async (req, res) => {
  const packingSlip = await orderPackingSlipService.getPackingSlip({
    orderId: req.params.id,
    tenant: req.tenant?._id,
  });
  res.json({ success: true, packingSlip, tenantScoped: Boolean(req.tenant?._id) });
});

// @desc    Update order status (admin)
// @route   PUT /api/admin/orders/:id/status
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, note, trackingNumber } = req.body;
  const result = await orderLifecycleService.transitionOrderStatus({
    orderId: req.params.id,
    status,
    note,
    trackingNumber,
    tenant: req.tenant?._id,
    actorId: req.user._id,
  });
  const order = result.order;

  // Cancel on Shiprocket after the local transaction commits. A provider
  // outage must not roll back the authoritative local order/inventory state.
  if (result.status === 'cancelled' && !result.idempotent && (order.shiprocketOrderId || order.awbCode)) {
    try {
      const shiprocket = require('../services/shipping/providers/shiprocket');
      const srConfig = await shippingManager.getConfig('shiprocket', req.tenant?._id || order.tenant);
      if (srConfig.enabled && srConfig.email && srConfig.password) {
        if (order.awbCode) await shiprocket.cancelShipment(order.awbCode, srConfig);
        if (order.shiprocketOrderId) await shiprocket.cancelOrders(order.shiprocketOrderId, srConfig);
        order.shiprocketStatus = 'CANCELLED';
        await order.save();
      }
    } catch (err) {
      console.error('[Shiprocket] Admin cancel failed for order', order._id.toString(), err.message);
    }
  }

  // Existing orders retain ownership of the provider that created them. This
  // keeps legacy (and future) provider shipments cancellable after the active
  // platform provider is changed.
  if (result.status === 'cancelled' && !result.idempotent && order.shippingProvider && order.shippingProvider !== 'shiprocket'
    && (order.shippingExternalOrderId || order.trackingNumber || order.awbCode)) {
    try {
      await shippingManager.cancelShipment(order.trackingNumber || order.awbCode, {
        tenantId: req.tenant?._id,
        provider: order.shippingProvider,
        externalOrderId: order.shippingExternalOrderId,
      });
      order.shippingStatus = 'cancelled';
      order.shippingLastSync = new Date();
      await order.save();
    } catch (error) {
      console.error(`[${order.shippingProvider}] Admin cancel failed for order`, order._id.toString(), error.message);
    }
  }

  const orderNotifications = require('../services/orderNotificationService');
  if (!result.idempotent && result.status === 'cancelled') orderNotifications.sendOrderLifecycleEvent(order, 'order_cancelled').catch(error => console.error('[TrustSignal] cancellation SMS hook failed:', error.message));
  if (!result.idempotent && ['shipped', 'delivered'].includes(result.status)) orderNotifications.sendOrderStatus(order, result.status).catch(error => console.error('[TrustSignal] status SMS hook failed:', error.message));

  res.json({ success: true, order, idempotent: result.idempotent });
});

// @desc    Update payment status (admin/webhook)
// @route   PUT /api/admin/orders/:id/payment
const updatePaymentStatus = asyncHandler(async (req, res) => {
  const { status, paymentId, transactionId, note } = req.body;
  const allowedStatuses = ['pending', 'paid', 'failed', 'refunded', 'partially_refunded'];
  if (!allowedStatuses.includes(status)) {
    res.status(400);
    throw new Error('Invalid payment status');
  }
  const existing = await Order.findOne({ _id: req.params.id, ...(req.tenant ? { tenant: req.tenant._id } : {}) });
  if (!existing) { res.status(404); throw new Error('Order not found'); }
  if (['manual', 'bank_transfer', 'upi'].includes(existing.paymentMethod) && status === 'paid' && existing.paymentStatus !== 'paid') {
    const session = await mongoose.startSession();
    let order;
    try {
      await session.withTransaction(async () => {
        order = await Order.findOne({ _id: existing._id, ...(req.tenant ? { tenant: req.tenant._id } : {}), paymentStatus: { $ne: 'paid' } }).session(session);
        if (!order) return;
        order.paymentStatus = 'paid';
        order.orderStatus = order.orderStatus === 'pending' ? 'confirmed' : order.orderStatus;
        order.paymentId = String(paymentId || order.paymentId || '').slice(0, 200);
        order.transactionId = String(transactionId || order.transactionId || '').slice(0, 200);
        order.amountPaid = Number(order.total || 0);
        order.amountDue = 0;
        order.paymentVerifiedAt = new Date();
        if (note !== undefined) order.adminNote = String(note || '').slice(0, 2000);
        order.statusHistory.push({ status: order.orderStatus, note: 'Manual payment verified by admin', updatedBy: req.user._id });
        await order.save({ session });
        if (order.inventoryStatus === 'reserved') {
          await require('../services/inventoryReservationService').convertReservation({ orderId: order._id, reservationId: order.inventoryReservation, session, reason: 'manual_payment_verified' });
        }
        await require('../services/couponSettlementService').captureCouponForOrder({ order, session });
        if (order.tenant) await require('../services/loyaltyService').earnPurchasePoints({ tenant: order.tenant, user: order.user, order, session });
      });
    } finally { await session.endSession(); }
    if (!order) order = await Order.findById(existing._id);
    return res.json({ success: true, order });
  }
  const order = await Order.findOneAndUpdate(
    { _id: existing._id, ...(req.tenant ? { tenant: req.tenant._id } : {}) },
    { paymentStatus: status, ...(paymentId !== undefined ? { paymentId } : {}), ...(transactionId !== undefined ? { transactionId } : {}) },
    { new: true }
  );
  res.json({ success: true, order });
});

// @desc    Get all orders (admin)
// @route   GET /api/admin/orders
const getAllOrders = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const {
    status, paymentStatus, paymentMethod, shippingStatus, shippingProvider,
    courierCompanyId, courierName, search, source, utmSource, utmMedium,
    utmCampaign, utmTerm, utmContent, landingPage, referrer, referralCode,
    startDate, endDate, dateFrom, dateTo, minTotal, maxTotal, hasTracking,
  } = req.query;
  const query = tenantScope(req);
  const and = [];

  if (status) {
    const { normalizeOrderStatus } = require('../constants/orderStatuses');
    query.orderStatus = normalizeOrderStatus(status);
  }
  if (paymentStatus) query.paymentStatus = paymentStatus;
  if (paymentMethod) query.paymentMethod = paymentMethod;
  if (shippingStatus) {
    query.shippingStatus = { $regex: String(shippingStatus).slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  }
  if (shippingProvider) query.shippingProvider = shippingProvider;
  if (courierCompanyId && Number.isFinite(Number(courierCompanyId))) query.courierCompanyId = Number(courierCompanyId);
  if (courierName) {
    query.courierName = { $regex: String(courierName).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  }
  if (search) {
    const safeSearch = String(search).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matchingUsers = await User.find({
      $or: [
        { name: { $regex: safeSearch, $options: 'i' } },
        { email: { $regex: safeSearch, $options: 'i' } },
        { phone: { $regex: safeSearch, $options: 'i' } },
      ],
    }).select('_id').limit(1000).lean();
    and.push({ $or: [
      { orderNumber: { $regex: safeSearch, $options: 'i' } },
      { 'shippingAddress.fullName': { $regex: safeSearch, $options: 'i' } },
      { 'shippingAddress.phone': { $regex: safeSearch, $options: 'i' } },
      { guestEmail: { $regex: safeSearch, $options: 'i' } },
      { referralCode: { $regex: safeSearch, $options: 'i' } },
      { trackingNumber: { $regex: safeSearch, $options: 'i' } },
      { awbCode: { $regex: safeSearch, $options: 'i' } },
      ...(matchingUsers.length ? [{ user: { $in: matchingUsers.map(user => user._id) } }] : []),
    ] });
  }
  if (source) {
    const safeSource = String(source).slice(0, 200).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    and.push({ $or: [
      { referralSource: { $regex: safeSource, $options: 'i' } },
      { 'utm.utm_source': { $regex: safeSource, $options: 'i' } },
      { 'utm.source': { $regex: safeSource, $options: 'i' } },
    ] });
  }
  const addUtmFilter = (value, keys) => {
    if (!value) return;
    const safeValue = String(value).slice(0, 200).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    and.push({ $or: keys.map(key => ({ [key]: { $regex: safeValue, $options: 'i' } })) });
  };
  addUtmFilter(utmSource, ['utm.utm_source', 'utm.source']);
  addUtmFilter(utmMedium, ['utm.utm_medium', 'utm.medium']);
  addUtmFilter(utmCampaign, ['utm.utm_campaign', 'utm.campaign']);
  addUtmFilter(utmTerm, ['utm.utm_term', 'utm.term']);
  addUtmFilter(utmContent, ['utm.utm_content', 'utm.content']);
  addUtmFilter(landingPage, ['utm.landingPage', 'utm.firstPage']);
  addUtmFilter(referrer, ['utm.referrer']);
  if (referralCode) {
    const safeReferralCode = String(referralCode).slice(0, 200).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.referralCode = { $regex: safeReferralCode, $options: 'i' };
  }

  const from = dateFrom || startDate;
  const to = dateTo || endDate;
  if (from || to) {
    const createdAt = {};
    if (from) createdAt.$gte = new Date(String(from).slice(0, 10) + 'T00:00:00.000Z');
    if (to) createdAt.$lt = new Date(String(to).slice(0, 10) + 'T00:00:00.000Z');
    if (to && createdAt.$lt && !Number.isNaN(createdAt.$lt.getTime())) {
      createdAt.$lt = new Date(createdAt.$lt.getTime() + 24 * 60 * 60 * 1000);
    }
    if ((createdAt.$gte && !Number.isNaN(createdAt.$gte.getTime())) || (createdAt.$lt && !Number.isNaN(createdAt.$lt.getTime()))) {
      query.createdAt = createdAt;
    }
  }
  if (String(minTotal ?? '').trim() !== '' && Number.isFinite(Number(minTotal))) {
    query.total = { ...(query.total || {}), $gte: Number(minTotal) };
  }
  if (String(maxTotal ?? '').trim() !== '' && Number.isFinite(Number(maxTotal))) {
    query.total = { ...(query.total || {}), $lte: Number(maxTotal) };
  }
  if (hasTracking === 'yes') query.awbCode = { $nin: [null, ''] };
  if (hasTracking === 'no') query.awbCode = { $in: [null, ''] };
  if (and.length) query.$and = and;

  const total = await Order.countDocuments(query);
  const orders = await Order.find(query)
    .populate('user', 'name email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.json({ success: true, orders, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

module.exports = { createOrder, getMyOrders, getOrder, updateOrderDetails, updateOrderItems, getPackingSlip, updateOrderStatus, updatePaymentStatus, getAllOrders, buildSubOrders };
