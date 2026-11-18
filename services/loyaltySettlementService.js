const loyaltyService = require('./loyaltyService');

const activeStates = new Set(['debited', 'captured']);

const reverseLoyaltyForOrder = async ({ order, source = 'order_reversal', reason = 'Loyalty points restored', createdBy, session } = {}) => {
  const points = Number(order?.loyaltyPoints || 0);
  if (!points || !order?.tenant || !order?.user) return { reversed: false, idempotent: true };
  if (!activeStates.has(order.loyaltySettlementStatus)) return { reversed: false, idempotent: true };

  const result = await loyaltyService.reverseRedeemedPoints({
    tenant: order.tenant,
    user: order.user,
    points,
    referenceType: 'order',
    referenceId: order._id,
    idempotencyKey: `loyalty-order-reversal:${source}:${order._id}`,
    note: `${reason} for ${order.orderNumber || order._id}`,
    createdBy,
    session,
  });
  order.loyaltySettlementStatus = source === 'refund' ? 'refunded' : 'reversed';
  order.loyaltyReversedAt = new Date();
  return { ...result, reversed: !result.idempotent };
};

module.exports = { reverseLoyaltyForOrder };
