const mongoose = require('mongoose');
const crypto = require('crypto');
const { ORDER_STATUSES } = require('../constants/orderStatuses');

const orderItemSchema = new mongoose.Schema({
  itemType: { type: String, enum: ['product', 'bundle'], default: 'product' },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  bundle: { type: mongoose.Schema.Types.ObjectId, ref: 'Bundle' },
  bundleVersion: { type: Number, min: 1 },
  bundleName: String,
  bundleSku: String,
  bundleSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  bundleComponents: { type: mongoose.Schema.Types.Mixed, default: [] },
  bundleRewards: { type: mongoose.Schema.Types.Mixed, default: [] },
  freeReward: { type: Boolean, default: false },
  title: String,
  image: String,
  price: { type: Number, required: true },
  // Captured at checkout so profit reports remain historically meaningful even
  // after the catalog cost changes. Legacy orders keep costPriceCaptured=false
  // and analytics may fall back to the current tenant product cost explicitly.
  costPrice: { type: Number, min: 0, default: null },
  costPriceCaptured: { type: Boolean, default: false },
  quantity: { type: Number, required: true, min: 1 },
  variant: mongoose.Schema.Types.Mixed,
  sku: String,
  hsnCode: String,
  taxRate: { type: Number, min: 0, max: 100 },
  taxableAmount: { type: Number, min: 0 },
  taxAmount: { type: Number, min: 0 },
  commissionRate: { type: Number, min: 0, max: 100, default: null },
  commissionAmount: { type: Number, min: 0, default: 0 },
  commissionSource: { type: String, default: '' },
  commissionRule: { type: mongoose.Schema.Types.ObjectId, ref: 'CommissionRule', default: null },
  // Immutable tax identity used when an order is adjusted or its invoice is
  // regenerated after the tenant policy changes.
  taxProfile: { type: mongoose.Schema.Types.Mixed, default: null },
});

const subOrderSchema = new mongoose.Schema({
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  orderNumber: { type: String, required: true },
  items: [orderItemSchema],
  subtotal: { type: Number, default: 0 },
  shippingCost: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  coupon: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon' },
  couponCode: String,
  commissionRate: { type: Number, default: 0 },
  commissionFlatFee: { type: Number, default: 0, min: 0 },
  commissionRules: { type: [mongoose.Schema.Types.Mixed], default: [] },
  // Commission is calculated on the vendor's net merchandise amount after
  // the parent-order discount allocation. Shipping/tax remain visible in the
  // vendor settlement total but are not commissionable.
  commissionableAmount: { type: Number, default: 0, min: 0 },
  commissionAmount: { type: Number, default: 0 },
  vendorEarnings: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ORDER_STATUSES,
    default: 'confirmed',
  },
  statusHistory: [{
    status: String,
    note: String,
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedAt: { type: Date, default: Date.now },
  }],
  trackingNumber: String,
  courierName: String,
  shiprocketOrderId: Number,
  shiprocketShipmentId: Number,
  awbCode: String,
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed', 'refunded', 'partially_refunded'], default: 'pending' },
  deliveredAt: Date,
  cancelledAt: Date,
}, { _id: false });

const orderSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  orderNumber: { type: String, required: true, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  guestEmail: { type: String, default: '', trim: true, maxlength: 200 },
  guestAccessTokenHash: { type: String, default: '', select: false, index: true },
  guestAccessTokenExpiresAt: { type: Date, default: null, index: true },
  items: [orderItemSchema],
  shippingAddress: {
    fullName: String,
    phone: String,
    street: String,
    city: String,
    state: String,
    pincode: String,
    country: String,
  },
  billingAddress: { type: mongoose.Schema.Types.Mixed, default: {} },
  paymentMethod: {
    type: String,
    enum: ['cod', 'razorpay', 'cashfree', 'stripe', 'wallet', 'loyalty', 'gift_card', 'manual', 'bank_transfer', 'upi'],
    required: true,
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded', 'partially_refunded'],
    default: 'pending',
  },
  paymentId: String,
  transactionId: { type: String, default: '' },
  paymentProviderOrderId: { type: String, index: true, unique: true, sparse: true },
  paymentProvider: { type: String, default: '' },
  paymentCurrency: { type: String, default: 'INR' },
  paymentVerifiedAt: Date,
  // Wallet/store-credit settlement is recorded separately from the external
  // gateway status. A partial wallet checkout can therefore remain pending
  // while only the external remainder is awaiting capture.
  walletAmount: { type: Number, default: 0, min: 0 },
  externalPaymentAmount: { type: Number, default: 0, min: 0 },
  walletSettlementStatus: {
    type: String,
    enum: ['none', 'debited', 'captured', 'reversed', 'refunded', 'partially_refunded'],
    default: 'none',
    index: true,
  },
  walletDebitedAt: Date,
  walletReversedAt: Date,
  // Loyalty points are a separate tender from wallet/store credit. Keeping
  // the amount and settlement state on the order makes combined checkout,
  // gateway capture, cancellation, and audit trails deterministic.
  loyaltyPoints: { type: Number, default: 0, min: 0 },
  loyaltyAmount: { type: Number, default: 0, min: 0 },
  loyaltySettlementStatus: {
    type: String,
    enum: ['none', 'debited', 'captured', 'reversed', 'refunded', 'partially_refunded'],
    default: 'none',
    index: true,
  },
  loyaltyRedeemedAt: Date,
  loyaltyReversedAt: Date,
  // Gift-card redemption is a bearer-card tender. The full code is never
  // persisted on an order; only the card reference and last four characters
  // are retained for audit and customer support.
  giftCard: { type: mongoose.Schema.Types.ObjectId, ref: 'GiftCard', index: true },
  giftCardLast4: { type: String, trim: true, uppercase: true, maxlength: 4 },
  giftCardAmount: { type: Number, default: 0, min: 0 },
  giftCardSettlementStatus: {
    type: String,
    enum: ['none', 'debited', 'captured', 'reversed', 'refunded', 'partially_refunded'],
    default: 'none',
    index: true,
  },
  giftCardRefundedAmount: { type: Number, default: 0, min: 0 },
  giftCardReversedAt: Date,
  checkoutIdempotencyKey: { type: String, index: true, sparse: true },
  orderStatus: {
    type: String,
    enum: ORDER_STATUSES,
    default: 'confirmed',
  },
  returnStatus: {
    type: String,
    enum: ['none', 'requested', 'approved', 'rejected', 'pickup_scheduled', 'picked_up', 'received', 'inspection_pending', 'approved_for_refund', 'replacement_queued', 'refunded', 'replaced', 'closed', 'cancelled'],
    default: 'none',
    index: true,
  },
  returnRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'ReturnRequest', index: true },
  returnWindowEndsAt: Date,
  returnedAt: Date,
  refundTotal: { type: Number, default: 0, min: 0 },
  statusHistory: [{
    status: String,
    note: String,
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedAt: { type: Date, default: Date.now },
  }],
  subtotal: { type: Number, required: true },
  shippingCost: { type: Number, default: 0 },
  codCharge: { type: Number, default: 0, min: 0 },
  tax: { type: Number, default: 0 },
  taxableAmount: { type: Number, default: 0, min: 0 },
  cgst: { type: Number, default: 0, min: 0 },
  sgst: { type: Number, default: 0, min: 0 },
  igst: { type: Number, default: 0, min: 0 },
  otherTax: { type: Number, default: 0, min: 0 },
  taxMode: { type: String, enum: ['exclusive', 'inclusive'], default: 'exclusive' },
  taxRegistrationType: { type: String, enum: ['unregistered', 'gstin'], default: 'unregistered' },
  gstInvoiceOwner: { type: String, enum: ['admin', 'seller'], default: 'seller' },
  taxProfile: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxProfile' },
  taxBreakdown: [{
    lineType: String,
    itemIndex: Number,
    title: String,
    hsnCode: String,
    quantity: Number,
    rate: Number,
    grossAmount: Number,
    discountAmount: Number,
    taxableAmount: Number,
    cgst: Number,
    sgst: Number,
    igst: Number,
    otherTax: Number,
    tax: Number,
    sellerGstin: String,
    sellerState: String,
    businessName: String,
    invoicePrefix: String,
    invoiceNote: String,
  }],
  sellerGstin: String,
  sellerState: String,
  taxBusinessName: String,
  taxBusinessAddress: { type: mongoose.Schema.Types.Mixed, default: {} },
  invoiceNote: { type: String, default: '', maxlength: 500 },
  invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', index: true },
  invoiceNumber: { type: String, default: '', maxlength: 100 },
  invoiceIssuedAt: Date,
  discount: { type: Number, default: 0 },
  total: { type: Number, required: true },
  amountPaid: { type: Number, default: 0, min: 0 },
  amountDue: { type: Number, default: 0, min: 0 },
  inventoryStatus: {
    type: String,
    enum: ['legacy', 'reserved', 'converted', 'sold', 'released'],
    default: 'legacy',
    index: true,
  },
  inventoryReservation: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryReservation', index: true },
  coupon: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon' },
  couponCode: String,
  // Referral tracking
  referralCode: String,
  referralSource: { type: String, default: '' },
  utm: { type: mongoose.Schema.Types.Mixed, default: {} },
  // Browser session that connects the first storefront page view to this
  // order. It is separate from marketing values for reliable attribution.
  trackingSessionId: { type: String, default: '', index: true },
  referralTracking: { type: mongoose.Schema.Types.ObjectId, ref: 'ReferralTracking' },
  // Shipping
  shippingMethod: { type: String, default: 'standard' },
  // Server-authoritative shipping rule/provider snapshot. This preserves the
  // exact zone, rate, calculation input, and delivery promise used at checkout
  // so later rule edits cannot rewrite an existing order.
  shippingQuote: { type: mongoose.Schema.Types.Mixed, default: {} },
  subOrders: [subOrderSchema],
  trackingNumber: String,
  shippingProvider: { type: String, default: '', index: true },
  shippingExternalOrderId: String,
  shippingExternalShipmentId: String,
  shippingStatus: String,
  shippingLastSync: Date,
  shippingCreationLock: { type: Boolean, default: false },
  shippingCreationLockedAt: Date,
  estimatedDelivery: Date,
  deliveredAt: Date,
  cancelledAt: Date,
  cancellationReason: String,
  notes: String,
  // Customer-facing and internal annotations are intentionally separate. The
  // customer endpoint strips adminNote so operational context never leaks.
  customerNote: { type: String, default: '', trim: true, maxlength: 2000 },
  adminNote: { type: String, default: '', trim: true, maxlength: 2000 },
  invoiceUrl: String,
  // ShipRocket integration
  shiprocketOrderId: { type: Number, index: true },
  shiprocketShipmentId: { type: Number, index: true },
  awbCode: { type: String, index: true },
  courierName: String,
  courierCompanyId: Number,
  shiprocketStatus: String,
  labelGenerated: { type: Boolean, default: false },
  manifestGenerated: { type: Boolean, default: false },
  pickupScheduled: { type: Boolean, default: false },
  isReturn: { type: Boolean, default: false },
  shiprocketLastSync: Date,
  // Courier auto-assignment concurrency lock
  courierAssignmentLock: { type: Boolean, default: false },
  courierAssignmentLockedAt: Date,
  // Webhook event dedupe for metrics
  shiprocketProcessedEvents: [{
    status: String,
    at: { type: Date, default: Date.now },
  }],
  // For bundles the customer-facing order line is the bundle, while this
  // immutable snapshot is the exact component allocation used for inventory.
  // Legacy orders fall back to `items` in the reservation service.
  inventoryItems: [orderItemSchema],
}, { timestamps: true });

orderItemSchema.pre('validate', function (next) {
  if (this.itemType === 'bundle' && !this.bundle) return next(new Error('Bundle order lines require a bundle reference'));
  if (this.itemType !== 'bundle' && !this.product) return next(new Error('Product order lines require a product reference'));
  next();
});

orderSchema.pre('validate', function (next) {
  if (!this.orderNumber) {
    const date = new Date();
    const prefix = `TAT${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
    const random = crypto.randomBytes(6).toString('hex').toUpperCase();
    this.orderNumber = `${prefix}${random}`;
  }
  next();
});

orderSchema.index({ user: 1 });
orderSchema.index({ tenant: 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1 });
orderSchema.index({ paymentStatus: 1 });
// Only checkout requests carrying a real idempotency key participate in the
// uniqueness constraint. A sparse compound index still indexes `{ key: null }`
// when legacy orders contain the field, so use a partial index to keep all
// pre-idempotency orders insertable.
orderSchema.index(
  { tenant: 1, user: 1, checkoutIdempotencyKey: 1 },
  { unique: true, partialFilterExpression: { checkoutIdempotencyKey: { $type: 'string' } } },
);
orderSchema.index({ referralCode: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ 'subOrders.vendor': 1 });
orderSchema.index({ shiprocketStatus: 1 });

module.exports = mongoose.model('Order', orderSchema);
