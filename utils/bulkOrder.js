const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const bulkOrderError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  error.publicCode = 'PRODUCT_BULK_ORDER_INVALID';
  return error;
};

const normalizeBulkOrderTiers = (tiers, { sellingPrice } = {}) => {
  if (!Array.isArray(tiers)) throw bulkOrderError('Bulk-order tiers must be an array');
  if (tiers.length > 20) throw bulkOrderError('A product can have at most 20 bulk-order tiers');

  const seenQuantities = new Set();
  const normalized = tiers.map((tier, index) => {
    const minQuantity = Number(tier?.minQuantity);
    const price = Number(tier?.price);
    if (!Number.isInteger(minQuantity) || minQuantity < 1 || minQuantity > 100000) {
      throw bulkOrderError(`Bulk-order tier ${index + 1} quantity must be a whole number between 1 and 100000`);
    }
    if (!Number.isFinite(price) || !Number.isSafeInteger(Math.round(price * 100)) || price <= 0 || price > 1000000000) {
      throw bulkOrderError(`Bulk-order tier ${index + 1} price must be greater than zero and at most 1000000000`);
    }
    if (seenQuantities.has(minQuantity)) {
      throw bulkOrderError(`Bulk-order tier quantity ${minQuantity} is duplicated`);
    }
    seenQuantities.add(minQuantity);
    return {
      minQuantity,
      price: roundMoney(price),
      ...(tier?.label ? { label: String(tier.label).trim().slice(0, 80) } : {}),
    };
  });

  const sorted = normalized.sort((left, right) => left.minQuantity - right.minQuantity);
  if (sellingPrice !== undefined && sellingPrice !== null && sellingPrice !== '') {
    const basePrice = Number(sellingPrice);
    if (!Number.isFinite(basePrice) || basePrice <= 0) throw bulkOrderError('Selling price must be greater than zero when bulk-order pricing is enabled');
    sorted.forEach((tier, index) => {
      if (tier.price >= basePrice) throw bulkOrderError(`Bulk-order tier ${index + 1} price must be lower than the selling price`);
      if (index > 0 && tier.price >= sorted[index - 1].price) {
        throw bulkOrderError('Bulk-order prices must decrease as the minimum quantity increases');
      }
    });
  }
  return sorted;
};

const normalizeBulkOrderPayload = (payload = {}, { sellingPrice } = {}) => {
  const hasEnabled = Object.prototype.hasOwnProperty.call(payload, 'bulkOrderEnabled');
  const hasTiers = Object.prototype.hasOwnProperty.call(payload, 'bulkOrderTiers');
  if (!hasEnabled && !hasTiers) return {};

  const result = {};
  if (hasEnabled) result.bulkOrderEnabled = Boolean(payload.bulkOrderEnabled);
  if (hasTiers) result.bulkOrderTiers = normalizeBulkOrderTiers(payload.bulkOrderTiers, { sellingPrice });
  if (result.bulkOrderEnabled && hasTiers && result.bulkOrderTiers.length === 0) {
    throw bulkOrderError('Add at least one bulk-order tier when bulk-order pricing is enabled');
  }
  return result;
};

const getBulkOrderTier = (product, quantity) => {
  if (!product?.bulkOrderEnabled || !Array.isArray(product.bulkOrderTiers)) return null;
  const requestedQuantity = Number(quantity);
  if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1) return null;
  const eligible = product.bulkOrderTiers
    .filter(tier => Number(tier?.minQuantity) <= requestedQuantity)
    .sort((left, right) => Number(left.minQuantity) - Number(right.minQuantity));
  return eligible.length ? eligible[eligible.length - 1] : null;
};

const resolveBulkOrderPrice = (product, quantity, basePrice) => {
  const tier = getBulkOrderTier(product, quantity);
  return roundMoney(tier ? tier.price : basePrice);
};

module.exports = {
  getBulkOrderTier,
  normalizeBulkOrderPayload,
  normalizeBulkOrderTiers,
  resolveBulkOrderPrice,
  roundMoney,
};
