const tenantIntegrationService = require('../tenantIntegrationService');
const legacyIntegrationService = require('../integrationService');
const shiprocket = require('./providers/shiprocket');
const { catalog, getAdapter, registerAdapter } = require('../integrations/providerRegistry');
const { getActiveProvider } = require('../providerSelectionService');
require('../integrations/registerBuiltins');
require('../integrations/contractAdapters');

const contractProviders = ['delhivery', 'xpressbees', 'bluedart', 'dtdc'];
for (const provider of contractProviders) {
  if (!getAdapter(provider)) registerAdapter(provider, {
    contractMethods: ['getRates', 'createShipment', 'trackShipment', 'cancelShipment', 'testConnection'],
    async testConnection() { throw new Error(`${catalog[provider].name} adapter requires provider sandbox activation`); },
    async getRates() { throw new Error(`${catalog[provider].name} adapter requires provider sandbox activation`); },
    async createShipment() { throw new Error(`${catalog[provider].name} adapter requires provider sandbox activation`); },
    async trackShipment() { throw new Error(`${catalog[provider].name} adapter requires provider sandbox activation`); },
    async cancelShipment() { throw new Error(`${catalog[provider].name} adapter requires provider sandbox activation`); },
  });
}

const configFor = async (tenantId, provider) => tenantId
  ? tenantIntegrationService.configFor(tenantId, provider, { allowPlatformFallback: true })
  : provider === 'shiprocket'
    ? legacyIntegrationService.getProviderConfig(provider)
    : tenantIntegrationService.platformConfig(provider);

const adapterFor = provider => provider === 'shiprocket' ? shiprocket : getAdapter(provider);

const resolveProvider = async provider => provider || getActiveProvider('shipping');
const noProviderError = () => {
  const error = new Error('No shipping provider is active. Orders will be processed manually.');
  error.statusCode = 409;
  error.publicCode = 'SHIPPING_PROVIDER_INACTIVE';
  return error;
};

const getRates = async ({ tenantId, provider, ...params }) => {
  const resolvedProvider = await resolveProvider(provider);
  if (!resolvedProvider) throw noProviderError();
  const adapter = adapterFor(resolvedProvider);
  const config = await configFor(tenantId, resolvedProvider);
  if (!adapter || !config.enabled) throw new Error(`${catalog[resolvedProvider]?.name || resolvedProvider} is not configured`);
  if (typeof adapter.getRates !== 'function') throw new Error(`${resolvedProvider} does not support rates`);
  return adapter.getRates(params, config);
};

const createShipment = async ({ tenantId, provider, data }) => {
  const resolvedProvider = await resolveProvider(provider);
  if (!resolvedProvider) throw noProviderError();
  const adapter = adapterFor(resolvedProvider);
  const config = await configFor(tenantId, resolvedProvider);
  if (!adapter || !config.enabled) throw new Error(`${catalog[resolvedProvider]?.name || resolvedProvider} is not configured`);
  return adapter.createShipment(data, config);
};

const trackShipment = async ({ tenantId, provider, trackingNumber }) => {
  const resolvedProvider = await resolveProvider(provider);
  if (!resolvedProvider) throw noProviderError();
  const adapter = adapterFor(resolvedProvider);
  const config = await configFor(tenantId, resolvedProvider);
  if (!adapter || !config.enabled) throw new Error(`${catalog[resolvedProvider]?.name || resolvedProvider} is not configured`);
  return adapter.trackShipment(trackingNumber, config);
};

const cancelShipment = async ({ tenantId, provider, trackingNumber, externalOrderId }) => {
  const resolvedProvider = await resolveProvider(provider);
  if (!resolvedProvider) throw noProviderError();
  const adapter = adapterFor(resolvedProvider);
  const config = await configFor(tenantId, resolvedProvider);
  if (!adapter || !config.enabled) throw new Error(`${catalog[resolvedProvider]?.name || resolvedProvider} is not configured`);
  if (typeof adapter.cancelShipment !== 'function') throw new Error(`${catalog[resolvedProvider]?.name || resolvedProvider} does not support cancellation`);
  return adapter.cancelShipment(
    adapter.cancelShipmentInput === 'object'
      ? { orderId: externalOrderId || trackingNumber, trackingNumber }
      : trackingNumber,
    config,
  );
};

module.exports = { getRates, createShipment, trackShipment, cancelShipment, adapterFor, configFor, resolveProvider, noProviderError };
