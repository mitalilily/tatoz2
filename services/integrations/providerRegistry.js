const catalog = require('./providerCatalog');

const adapters = new Map();

const registerAdapter = (provider, adapter) => {
  if (!catalog[provider]) throw new Error(`Cannot register unknown provider: ${provider}`);
  if (!adapter || typeof adapter !== 'object') throw new Error(`Invalid adapter for ${provider}`);
  adapters.set(provider, adapter);
  return adapter;
};

const getProviderDefinition = provider => {
  const definition = catalog[String(provider || '').toLowerCase()];
  if (!definition) {
    const error = new Error(`Unsupported integration: ${provider}`);
    error.statusCode = 400;
    throw error;
  }
  return definition;
};

const getAdapter = provider => adapters.get(String(provider || '').toLowerCase()) || null;

const assertContract = adapter => {
  const methods = adapter?.contractMethods || [];
  const missing = methods.filter(method => typeof adapter[method] !== 'function');
  if (missing.length) throw new Error(`Adapter contract incomplete: ${missing.join(', ')}`);
  return true;
};

const listProviders = () => Object.values(catalog).map(definition => ({
  ...definition,
  adapterAvailable: Boolean(adapters.get(definition.id) && adapters.get(definition.id).activation !== 'contract'),
}));

module.exports = { catalog, registerAdapter, getProviderDefinition, getAdapter, assertContract, listProviders };
