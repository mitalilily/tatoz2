const asyncHandler = require('express-async-handler');
const giftCardService = require('../services/giftCardService');
const { validateGiftCardPayload } = require('../utils/adminValidation');
const { getCustomerScopeIds, resolveCustomerAudience, audienceError } = require('../services/adminCustomerAudienceService');

const requireTenant = req => {
  if (!req.tenant?._id) {
    const error = new Error('Tenant context is required');
    error.statusCode = 400;
    error.publicCode = 'GIFT_CARD_TENANT_REQUIRED';
    throw error;
  }
  return req.tenant._id;
};

const validateGiftCard = asyncHandler(async (req, res) => {
  const tenant = requireTenant(req);
  const quote = await giftCardService.quoteRedemption({
    tenant,
    code: req.body?.code,
    orderTotal: req.body?.orderTotal,
    requestedAmount: req.body?.requestedAmount,
  });
  res.json({ success: true, giftCard: giftCardService.safeCard(quote.card), amount: quote.amount, codeLast4: quote.codeLast4 });
});

const getMyGiftCardHistory = asyncHandler(async (req, res) => {
  const tenant = requireTenant(req);
  const ledger = await giftCardService.listTransactions({ tenant, user: req.user._id, page: req.query.page, limit: req.query.limit });
  res.json({ success: true, ...ledger });
});

const getGiftCards = asyncHandler(async (req, res) => {
  const tenant = requireTenant(req);
  const customerIds = req.query.segmentId ? await getCustomerScopeIds({ tenant, segmentId: req.query.segmentId }) : undefined;
  const result = await giftCardService.listAdminCards({ tenant, page: req.query.page, limit: req.query.limit, search: req.query.search, status: req.query.status, customerIds });
  res.json({ success: true, ...result });
});

const createGiftCard = asyncHandler(async (req, res) => {
  const tenant = requireTenant(req);
  const idempotencyKey = req.headers?.['idempotency-key'] || req.body?.idempotencyKey;
  const validated = validateGiftCardPayload(req.body || {});
  let recipientUser = req.body?.recipientUser;
  if (recipientUser) {
    const audience = await resolveCustomerAudience({ tenant, userIds: [recipientUser] });
    recipientUser = audience.userIds[0];
  }
  const result = await giftCardService.createGiftCard({
    tenant,
    amount: validated.amount,
    expiresAt: validated.expiresAt,
    code: req.body?.code,
    recipientUser,
    recipientName: validated.recipientName,
    recipientEmail: validated.recipientEmail,
    recipientPhone: validated.recipientPhone,
    senderName: validated.senderName,
    message: validated.message,
    createdBy: req.user._id,
    idempotencyKey,
  });
  res.status(result.idempotent ? 200 : 201).json({
    success: true,
    idempotent: result.idempotent,
    giftCard: giftCardService.safeCard(result.card),
    // The bearer code is returned only when a new card is issued. It is not
    // persisted or returned by list/history endpoints.
    code: result.code || undefined,
  });
});

const createGiftCardsBulk = asyncHandler(async (req, res) => {
  const tenant = requireTenant(req);
  const operationKey = String(req.headers?.['idempotency-key'] || req.body?.idempotencyKey || '').trim();
  if (!operationKey) { res.status(400); throw audienceError('Idempotency-Key is required for bulk gift-card issuance', 400, 'GIFT_CARD_IDEMPOTENCY_REQUIRED'); }
  const audience = await resolveCustomerAudience({
    tenant,
    userIds: req.body?.userIds,
    segmentId: req.body?.segmentId,
    segmentIds: req.body?.segmentIds,
  });
  const results = [];
  for (const user of audience.users) {
    try {
      const result = await giftCardService.createGiftCard({
        tenant,
        amount: req.body?.amount,
        expiresAt: req.body?.expiresAt,
        recipientUser: user._id,
        recipientName: user.name || req.body?.recipientName,
        recipientEmail: user.email,
        recipientPhone: user.phone,
        senderName: req.body?.senderName,
        message: req.body?.message,
        createdBy: req.user._id,
        idempotencyKey: `${operationKey}:${user._id}`,
      });
      results.push({ userId: user._id, name: user.name, email: user.email, success: true, idempotent: result.idempotent, cardId: result.card?._id, code: result.code || undefined, codeLast4: result.card?.codeLast4, amount: result.card?.initialAmount });
    } catch (error) {
      results.push({ userId: user._id, name: user.name, email: user.email, success: false, code: error.publicCode, message: error.message || 'Gift card issuance failed' });
    }
  }
  const issued = results.filter(result => result.success).length;
  const failed = results.length - issued;
  res.status(200).json({ success: failed === 0, partial: issued > 0 && failed > 0, audience: { count: results.length, segmentIds: audience.segmentIds }, issued, failed, results });
});

const updateGiftCardStatus = asyncHandler(async (req, res) => {
  const tenant = requireTenant(req);
  const card = await giftCardService.setStatus({ tenant, id: req.params.id, status: req.body?.status });
  res.json({ success: true, giftCard: card });
});

const getGiftCardTransactions = asyncHandler(async (req, res) => {
  const tenant = requireTenant(req);
  const result = await giftCardService.listCardTransactions({ tenant, id: req.params.id, page: req.query.page, limit: req.query.limit });
  res.json({ success: true, ...result });
});

module.exports = { validateGiftCard, getMyGiftCardHistory, getGiftCards, createGiftCard, createGiftCardsBulk, updateGiftCardStatus, getGiftCardTransactions };
