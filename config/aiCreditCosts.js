// Single source of truth for AI credit charges.
// Keep values in credits (not paise/currency) and round balances to two decimals
// so low-cost chat requests do not create floating-point balance noise.
const AI_CREDIT_COSTS = Object.freeze({
  productAI: 2,
  siteSEO: 50,
  seoAudit: 20,
  bulkSEO: 2,
  blog: 2,
  clickTracking: 2,
  customerChatStart: 0.25,
  customerChatMessage: 0.05,
  pageBuilder: 2,
});

const roundCredits = (value) => Math.round((Number(value) || 0) * 100) / 100;

module.exports = { AI_CREDIT_COSTS, roundCredits };
