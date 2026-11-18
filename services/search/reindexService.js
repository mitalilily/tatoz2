const { enqueue } = require('../outboxService');

const enqueueProductReindex = async ({ tenant, productId, action = 'upsert' }) => enqueue({ tenant, type: `search.product-${action}`, aggregateType: 'Product', aggregateId: productId, idempotencyKey: `search:${action}:${productId}`, payload: { productId: String(productId), action } });

module.exports = { enqueueProductReindex };
