const httpRequest = require('../../utils/httpRequest');

const algoliaHeaders = config => ({ 'X-Algolia-Application-Id': config.app_id, 'X-Algolia-API-Key': config.admin_api_key });
const algoliaUrl = config => `https://${config.app_id}-dsn.algolia.net`;
const assertAlgolia = config => { if (!config.app_id || !config.admin_api_key || !config.index_name) throw new Error('Algolia app ID, admin API key and index name are required'); };

const algolia = {
  contractMethods: ['search', 'upsert', 'delete', 'testConnection'],
  async search({ query = '', filters = '', facets = ['*'], page = 0, hitsPerPage = 20 }, config) { assertAlgolia(config); const { data } = await httpRequest({ url: `${algoliaUrl(config)}/1/indexes/${encodeURIComponent(config.index_name)}/query`, method: 'POST', headers: algoliaHeaders(config), body: { params: new URLSearchParams({ query, filters, facets: facets.join(','), page: String(page), hitsPerPage: String(hitsPerPage) }).toString() } }); return data; },
  async upsert(document, config) { assertAlgolia(config); const { data } = await httpRequest({ url: `${algoliaUrl(config)}/1/indexes/${encodeURIComponent(config.index_name)}/${encodeURIComponent(document.objectID)}`, method: 'PUT', headers: algoliaHeaders(config), body: document }); return data; },
  async delete(objectID, config) { assertAlgolia(config); const { data } = await httpRequest({ url: `${algoliaUrl(config)}/1/indexes/${encodeURIComponent(config.index_name)}/${encodeURIComponent(objectID)}`, method: 'DELETE', headers: algoliaHeaders(config) }); return data; },
  async testConnection(config) { assertAlgolia(config); await httpRequest({ url: `${algoliaUrl(config)}/1/indexes/${encodeURIComponent(config.index_name)}/settings`, headers: algoliaHeaders(config) }); return { success: true, message: 'Algolia connection is valid' }; },
};

const openSearchHeaders = config => ({ Authorization: `Basic ${Buffer.from(`${config.username || ''}:${config.password || ''}`).toString('base64')}` });
const openSearchUrl = config => `${String(config.endpoint || '').replace(/\/$/, '')}/${encodeURIComponent(config.index_name)}`;
const assertOpenSearch = config => { if (!config.endpoint || !config.index_name) throw new Error('OpenSearch endpoint and index name are required'); };

const opensearch = {
  contractMethods: ['search', 'upsert', 'delete', 'testConnection'],
  async search({ query = '', filters = {}, page = 0, hitsPerPage = 20 }, config) { assertOpenSearch(config); const must = query ? [{ multi_match: { query, fields: ['title^3', 'description', 'brand', 'tags'] } }] : [{ match_all: {} }]; const filter = Object.entries(filters).map(([field, value]) => ({ term: { [field]: value } })); const { data } = await httpRequest({ url: `${openSearchUrl(config)}/_search`, method: 'POST', headers: openSearchHeaders(config), body: { from: Number(page) * Number(hitsPerPage), size: Number(hitsPerPage), query: { bool: { must, filter } } } }); return data; },
  async upsert(document, config) { assertOpenSearch(config); const { data } = await httpRequest({ url: `${openSearchUrl(config)}/_doc/${encodeURIComponent(document.objectID)}`, method: 'PUT', headers: openSearchHeaders(config), body: document }); return data; },
  async delete(objectID, config) { assertOpenSearch(config); const { data } = await httpRequest({ url: `${openSearchUrl(config)}/_doc/${encodeURIComponent(objectID)}`, method: 'DELETE', headers: openSearchHeaders(config) }); return data; },
  async testConnection(config) { assertOpenSearch(config); await httpRequest({ url: openSearchUrl(config), headers: openSearchHeaders(config) }); return { success: true, message: 'OpenSearch connection is valid' }; },
};

module.exports = { algolia, opensearch };
