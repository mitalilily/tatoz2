const WalletTransaction = require('../models/WalletTransaction');
const walletService = require('./walletService');

const round = value => Math.round(Number(value || 0) * 100) / 100;
const id = value => String(value?._id || value || '');

const tenantOf = order => order?.tenant?._id || order?.tenant;
const userOf = order => order?.user?._id || order?.user;

const debitTransactionsForOrder = async ({ order, session }) => {
  const query = WalletTransaction.find({
    tenant: tenantOf(order),
    user: userOf(order),
    direction: 'debit',
    source: 'order_payment',
    referenceType: 'order',
    referenceId: id(order),
  }).sort({ createdAt: 1 });
  if (session) query.session(session);
  return query;
};

const expiryForReversal = async ({ debit, session }) => {
  if (debit.bucket !== 'promotional' || !Array.isArray(debit.consumes) || debit.consumes.length === 0) return undefined;
  const ids = debit.consumes.map(entry => entry.transaction).filter(Boolean);
  if (!ids.length) return undefined;
  const query = WalletTransaction.findOne({ _id: { $in: ids }, expiresAt: { $gt: new Date() } }).sort({ expiresAt: 1 });
  if (session) query.session(session);
  const credit = await query.first();
  return credit?.expiresAt || undefined;
};

// Restore every wallet debit made for an order exactly once. This is used for
// a failed/abandoned payment or an order cancellation. The idempotency key is
// tied to the original debit transaction, so mixed promotional/cash debits
// cannot be accidentally collapsed into one refund.
const reverseWalletForOrder = async ({ order, source = 'order_reversal', reason = 'Wallet amount restored', createdBy, session } = {}) => {
  const walletAmount = round(order?.walletAmount);
  if (!walletAmount || !tenantOf(order) || !userOf(order)) {
    return { amount: 0, idempotent: true, transactions: [] };
  }

  const debits = await debitTransactionsForOrder({ order, session });
  if (!debits.length) {
    const error = new Error('Wallet debit ledger entry is missing for this order');
    error.statusCode = 409;
    error.publicCode = 'WALLET_LEDGER_CONFLICT';
    throw error;
  }

  const restored = [];
  let idempotent = true;
  for (const debit of debits) {
    const key = `wallet-order-${source}:${id(order)}:${id(debit)}`;
    const existingQuery = WalletTransaction.findOne({ tenant: tenantOf(order), user: userOf(order), idempotencyKey: key });
    if (session) existingQuery.session(session);
    const existing = await existingQuery;
    if (existing) {
      restored.push(existing);
      continue;
    }

    const result = await walletService.creditWallet({
      tenant: tenantOf(order),
      user: userOf(order),
      bucket: debit.bucket,
      amount: debit.amount,
      source,
      referenceType: 'order',
      referenceId: id(order),
      idempotencyKey: key,
      note: reason,
      createdBy,
      expiresAt: await expiryForReversal({ debit, session }),
      session,
    });
    restored.push(result.transaction);
    idempotent = false;
  }

  if (order && typeof order.save === 'function') {
    order.walletSettlementStatus = source === 'refund' ? 'refunded' : 'reversed';
    order.walletReversedAt = order.walletReversedAt || new Date();
    await order.save(session ? { session } : undefined);
  }
  return { amount: restored.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0), transactions: restored, idempotent };
};

module.exports = { reverseWalletForOrder, debitTransactionsForOrder };
