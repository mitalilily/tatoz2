const asyncHandler = require('express-async-handler');
const { assertActiveProvider } = require('../services/providerSelectionService');

const requireActiveProvider = (kind, provider) => asyncHandler(async (req, res, next) => {
  await assertActiveProvider(kind, provider);
  next();
});

const requireActiveProviderParam = kind => asyncHandler(async (req, res, next) => {
  await assertActiveProvider(kind, req.params.provider);
  next();
});

module.exports = { requireActiveProvider, requireActiveProviderParam };
