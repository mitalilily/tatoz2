const asyncHandler = require('express-async-handler');
const storefrontLocaleService = require('../services/storefrontLocaleService');
const publicCache = require('../services/publicCache');

const getConfig = asyncHandler(async (req, res) => {
  const config = await storefrontLocaleService.getConfig({ tenantId: req.tenant?._id });
  res.json({ success: true, config });
});

const updateConfig = asyncHandler(async (req, res) => {
  const config = await storefrontLocaleService.updateConfig({
    tenantId: req.tenant?._id,
    userId: req.user?._id,
    payload: req.body || {},
  });
  await publicCache.invalidate(req, { namespace: 'site' });
  res.json({ success: true, config, message: 'Storefront language and currency settings updated' });
});

const refreshRates = asyncHandler(async (req, res) => {
  const config = await storefrontLocaleService.refreshRates({
    tenantId: req.tenant?._id,
    userId: req.user?._id,
  });
  await publicCache.invalidate(req, { namespace: 'site' });
  res.json({ success: true, config, message: 'Currency display rates refreshed' });
});

module.exports = { getConfig, updateConfig, refreshRates };
