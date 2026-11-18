const providerManager = require('./providerManager');
const { getActiveProvider } = require('../providerSelectionService');

const getConfig = async (provider, tenantId) => {
  const resolvedProvider = provider || await getActiveProvider('shipping');
  if (!resolvedProvider) return { provider: null, source: 'none', enabled: false };
  return providerManager.configFor(tenantId, resolvedProvider);
};

const selectedProvider = async () => getActiveProvider('shipping');

const isEnabled = async (tenantId) => {
  const provider = await selectedProvider();
  if (!provider) return false;
  const config = await getConfig(provider, tenantId);
  return Boolean(config.enabled);
};

const getRates = async ({ tenantId, provider, ...params }) => providerManager.getRates({ tenantId, provider: provider || await selectedProvider(), ...params });

const createShipment = async (orderData, { tenantId, provider } = {}) => providerManager.createShipment({ tenantId, provider: provider || await selectedProvider(), data: orderData });

const trackShipment = async (trackingId, { tenantId, provider } = {}) => providerManager.trackShipment({ tenantId, provider: provider || await selectedProvider(), trackingNumber: trackingId });

const cancelShipment = async (trackingId, { tenantId, provider, externalOrderId } = {}) => providerManager.cancelShipment({ tenantId, provider: provider || await selectedProvider(), trackingNumber: trackingId, externalOrderId });

module.exports = { getConfig, selectedProvider, isEnabled, getRates, createShipment, trackShipment, cancelShipment };
