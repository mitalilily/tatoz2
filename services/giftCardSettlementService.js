const mongoose = require('mongoose');
const GiftCard = require('../models/GiftCard');
const GiftCardTransaction = require('../models/GiftCardTransaction');
const giftCardService = require('./giftCardService');

const round = value => Math.round(Number(value || 0) * 100) / 100;
const id = value => String(value?._id || value || '');
const activeStates = new Set(['debited', 'captured', 'partially_refunded']);

const reverseGiftCardForOrder = async ({ order, source = 'order_reversal', reason = 'Gift card amount restored', createdBy, session, amount } = {}) => {
  const total = round(order?.giftCardAmount);
  if (!total || !order?.tenant || !order?.user) return { amount: 0, reversed: false, idempotent: true };
  if (!activeStates.has(order.giftCardSettlementStatus)) return { amount: 0, reversed: false, idempotent: true };
  const alreadyRestored = round(order.giftCardRefundedAmount);
  const requested = amount === undefined || amount === null ? total : Math.min(total, Math.max(0, Number(amount)));
  const remaining = round(Math.max(0, requested - alreadyRestored));
  if (remaining <= 0) return { amount: 0, reversed: false, idempotent: true };

  const tenant = order.tenant?._id || order.tenant;
  const orderId = id(order);
  const redemptionQuery = GiftCardTransaction.find({ tenant, order: orderId, direction: 'redeem' }).sort({ createdAt: 1 });
  if (session) redemptionQuery.session(session);
  const redemptions = await redemptionQuery;
  if (!redemptions.length) {
    const error = new Error('Gift card redemption ledger entry is missing for this order');
    error.statusCode = 409;
    error.publicCode = 'GIFT_CARD_LEDGER_CONFLICT';
    throw error;
  }
  const redemption = redemptions[0];
  const cardQuery = GiftCard.findOne({ _id: redemption.giftCard, tenant });
  if (session) cardQuery.session(session);
  const card = await cardQuery;
  if (!card) {
    const error = new Error('Gift card for this order no longer exists');
    error.statusCode = 409;
    error.publicCode = 'GIFT_CARD_LEDGER_CONFLICT';
    throw error;
  }
  const key = `gift-card-order-${source}:${orderId}:${round(alreadyRestored + remaining)}`;
  const existingQuery = GiftCardTransaction.findOne({ tenant, idempotencyKey: key });
  if (session) existingQuery.session(session);
  const existing = await existingQuery;
  if (existing) {
    order.giftCardRefundedAmount = round(Math.max(alreadyRestored, alreadyRestored + Number(existing.amount || 0)));
    order.giftCardSettlementStatus = order.giftCardRefundedAmount >= total ? (source === 'refund' ? 'refunded' : 'reversed') : 'partially_refunded';
    return { amount: Number(existing.amount || 0), transaction: existing, reversed: false, idempotent: true };
  }

  const now = new Date();
  const updatedCard = await GiftCard.findOneAndUpdate(
    { _id: card._id, tenant },
    { $inc: { balance: remaining }, $set: { lastUsedAt: now } },
    { new: true, session },
  );
  if (!updatedCard) {
    const error = new Error('Gift card could not be restored');
    error.statusCode = 409;
    error.publicCode = 'GIFT_CARD_CONCURRENT_UPDATE';
    throw error;
  }
  if (updatedCard.expiresAt && updatedCard.expiresAt <= now) updatedCard.status = 'expired';
  else if (updatedCard.status !== 'disabled') updatedCard.status = 'active';
  await updatedCard.save(session ? { session } : undefined);
  const transaction = (await GiftCardTransaction.create([{
    tenant,
    giftCard: updatedCard._id,
    user: order.user?._id || order.user,
    order: order._id,
    direction: 'reversal',
    amount: remaining,
    balanceBefore: round(updatedCard.balance - remaining),
    balanceAfter: round(updatedCard.balance),
    source: source === 'refund' ? 'refund' : 'order_reversal',
    referenceType: 'order',
    referenceId: orderId,
    idempotencyKey: key,
    note: reason,
    createdBy,
  }], { session }))[0];
  order.giftCardRefundedAmount = round(alreadyRestored + remaining);
  order.giftCardSettlementStatus = order.giftCardRefundedAmount >= total ? (source === 'refund' ? 'refunded' : 'reversed') : 'partially_refunded';
  order.giftCardReversedAt = order.giftCardReversedAt || now;
  return { amount: remaining, transaction, reversed: true, idempotent: false };
};

module.exports = { reverseGiftCardForOrder };
