// Canonical order workflow states. `pending` is the persisted legacy-compatible
// value shown to operators as "New"; payment and inventory callbacks depend on
// it while the customer/admin surface can still use the business label.
const ORDER_STATUSES = Object.freeze([
  'pending',
  'confirmed',
  'processing',
  'packed',
  'ready_to_ship',
  'shipped',
  'out_for_delivery',
  'failed_delivery',
  'rto',
  'partially_fulfilled',
  'delivered',
  'return_requested',
  'refund_requested',
  'returned',
  'partially_refunded',
  'refunded',
  'cancelled',
]);

const ORDER_STATUS_ALIASES = Object.freeze({
  new: 'pending',
  readytoship: 'ready_to_ship',
  'ready-to-ship': 'ready_to_ship',
  failed_delivery_attempt: 'failed_delivery',
  return_to_origin: 'rto',
  returned_to_origin: 'rto',
});

const normalizeOrderStatus = value => {
  const raw = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return ORDER_STATUS_ALIASES[raw] || raw;
};

const ORDER_STATUS_LABELS = Object.freeze({
  pending: 'New',
  confirmed: 'Confirmed',
  processing: 'Processing',
  packed: 'Packed',
  ready_to_ship: 'Ready to Ship',
  shipped: 'Shipped',
  out_for_delivery: 'Out for Delivery',
  failed_delivery: 'Failed Delivery',
  rto: 'RTO',
  partially_fulfilled: 'Partially Fulfilled',
  delivered: 'Delivered',
  return_requested: 'Return Requested',
  refund_requested: 'Refund Requested',
  returned: 'Returned',
  partially_refunded: 'Partially Refunded',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
});

module.exports = { ORDER_STATUSES, ORDER_STATUS_ALIASES, ORDER_STATUS_LABELS, normalizeOrderStatus };
