const tenantIntegrationService = require('../tenantIntegrationService');
const { getAdapter } = require('../integrations/providerRegistry');
require('../integrations/registerBuiltins');
const searchProviders = require('./searchProviders');

const resolve = async (tenantId, preferred) => {
  for (const provider of [preferred, 'algolia', 'opensearch'].filter(Boolean)) {
    const config = await tenantIntegrationService.configFor(tenantId, provider, { allowPlatformFallback: true });
    if (config.enabled && ((provider === 'algolia' && config.app_id && config.admin_api_key) || (provider === 'opensearch' && config.endpoint && config.index_name))) return { provider, config, adapter: getAdapter(provider) || searchProviders[provider] };
  }
  return null;
};

const search = async ({ tenantId, preferred, query, filters, page, hitsPerPage }) => { const selected = await resolve(tenantId, preferred); if (!selected) return null; return selected.adapter.search({ query, filters, page, hitsPerPage }, selected.config); };
const indexProduct = async ({ tenantId, preferred, product }) => { const selected = await resolve(tenantId, preferred); if (!selected) return null; return selected.adapter.upsert({ objectID: String(product._id || product.objectID), tenant: String(tenantId), title: product.title, description: product.description, brand: product.brand || '', category: String(product.category || ''), price: product.price, isActive: product.isActive !== false, tags: product.tags || [] }, selected.config); };

module.exports = { resolve, search, indexProduct };
