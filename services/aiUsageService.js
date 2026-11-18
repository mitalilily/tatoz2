const { v4: uuidv4 } = require('uuid');
const AIUsage = require('../models/AIUsage');
const { roundCredits } = require('../config/aiCreditCosts');

const cleanText = (value, max = 1000) => String(value || '').replace(/[\r\n]+/g, ' ').slice(0, max);

function startAIUsage(req, {
  feature,
  action,
  endpoint = req?.originalUrl || req?.path || '',
  model = '',
  credits = 0,
  metadata = {},
} = {}) {
  let charged = 0;
  let refunded = 0;
  let settled = false;
  const startedAt = Date.now();

  const tracker = {
    charge(amount = credits) {
      charged = roundCredits(charged + Math.max(0, Number(amount) || 0));
    },
    refund(amount = charged) {
      refunded = roundCredits(refunded + Math.max(0, Number(amount) || 0));
    },
    async finish({ status = 'success', error = '', usage, extraMetadata = {}, model: resultModel } = {}) {
      if (settled) return;
      settled = true;
      const safeCharged = roundCredits(Math.max(0, Number(charged) || 0));
      const safeRefunded = roundCredits(Math.min(safeCharged, Math.max(0, Number(refunded) || 0)));
      try {
        await AIUsage.create({
          feature: cleanText(feature, 80) || 'other',
          action: cleanText(action, 120) || 'ai_request',
          endpoint: cleanText(endpoint, 240),
          model: cleanText(resultModel || model, 80),
          status: ['success', 'failed', 'rejected'].includes(status) ? status : 'failed',
          credits: safeCharged,
          creditsRefunded: safeRefunded,
          netCredits: roundCredits(Math.max(0, safeCharged - safeRefunded)),
          durationMs: Math.max(0, Date.now() - startedAt),
          tenant: req?.tenant?._id || req?.vendor?.tenant || null,
          user: req?.user?._id || null,
          userSnapshot: {
            name: cleanText(req?.user?.name, 120),
            email: cleanText(req?.user?.email, 160),
            role: cleanText(req?.user?.role, 40),
          },
          vendor: req?.vendor?._id || null,
          vendorSnapshot: {
            name: cleanText(req?.vendor?.storeName, 120),
            slug: cleanText(req?.vendor?.slug, 120),
          },
          requestId: cleanText(req?.headers?.['x-request-id'] || uuidv4(), 100),
          error: cleanText(error, 1000),
          metadata: { ...metadata, ...extraMetadata },
          tokenUsage: {
            prompt: Number(usage?.prompt_tokens || usage?.input_tokens || 0),
            completion: Number(usage?.completion_tokens || usage?.output_tokens || 0),
            total: Number(usage?.total_tokens || usage?.total || 0),
          },
        });
      } catch (loggingError) {
        // AI logging must never turn a successful customer/admin operation into a 500.
        console.error('[ai-usage] Failed to persist usage:', loggingError.message);
      }
    },
    async run(task) {
      try {
        const result = await task();
        await tracker.finish({ usage: result?.usage, extraMetadata: result?.usageMetadata, model: result?.usageModel });
        return result?.value === undefined ? result : result.value;
      } catch (error) {
        await tracker.finish({
          status: error?.statusCode === 402 ? 'rejected' : 'failed',
          error: error?.message || error,
        });
        throw error;
      }
    },
  };

  return tracker;
}

module.exports = { startAIUsage };
