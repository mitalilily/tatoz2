const asyncHandler = require('express-async-handler');
const turnstile = require('../services/turnstileService');
const tenantIntegrationService = require('../services/tenantIntegrationService');

const requireTurnstile = asyncHandler(async (req, res, next) => {
  const config = req.tenant
    ? await tenantIntegrationService.configFor(req.tenant._id, 'cloudflare_turnstile', { allowPlatformFallback: true })
    : await tenantIntegrationService.platformConfig('cloudflare_turnstile');
  const result = await turnstile.verify(req.body?.turnstileToken || req.headers['x-turnstile-token'], req.ip, config);
  if (!result.success) { res.status(403); throw new Error('Turnstile verification failed'); }
  next();
});

module.exports = { requireTurnstile };
