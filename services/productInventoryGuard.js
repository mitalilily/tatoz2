const crypto = require('crypto');
const InventoryMovement = require('../models/InventoryMovement');

const inventoryError = (message, statusCode = 409, publicCode = 'INVENTORY_RESERVED_STOCK_PROTECTED') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
};

const asNonNegativeInteger = (value, field) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw inventoryError(`${field} must be a non-negative integer`, 400, 'INVENTORY_VALUE_INVALID');
  }
  return parsed;
};

const findCurrentVariant = (variants, incoming, index) => (
  (variants || []).find(item => item.name && incoming?.name && item.name === incoming.name)
  || (variants || [])[index]
);

const findCurrentOption = (options, incoming, index) => (
  (options || []).find(item => String(item.value) === String(incoming?.value))
  || (options || [])[index]
);

/**
 * Product editors may send the complete variants array. Preserve the ledger's
 * reserved/sold counters while still allowing the available option stock to
 * be adjusted by an operator.
 */
const preserveVariantInventory = (incomingVariants, currentVariants) => incomingVariants.map((incomingVariant, variantIndex) => {
  const currentVariant = findCurrentVariant(currentVariants, incomingVariant, variantIndex);
  const options = (incomingVariant.options || []).map((incomingOption, optionIndex) => {
    const currentOption = findCurrentOption(currentVariant?.options, incomingOption, optionIndex);
    const reservedStock = Number(currentOption?.reservedStock || 0);
    const soldStock = Number(currentOption?.soldStock || 0);
    const stock = incomingOption.stock === undefined
      ? Number(currentOption?.stock || 0)
      : asNonNegativeInteger(incomingOption.stock, 'Variant stock');
    if (stock < reservedStock) {
      throw inventoryError(`Variant ${incomingOption.value || 'option'} cannot be set below its reserved stock`);
    }
    return { ...incomingOption, stock, reservedStock, soldStock };
  });
  return { ...incomingVariant, options };
});

const prepareProductUpdate = ({ payload = {}, currentProduct }) => {
  const update = { ...payload };
  // These counters are derived by the reservation lifecycle and must never be
  // accepted from a general product-edit payload.
  delete update.reservedStock;
  delete update.soldStock;

  if (Object.prototype.hasOwnProperty.call(update, 'stock')) {
    const stock = asNonNegativeInteger(update.stock, 'Stock');
    if (stock < Number(currentProduct?.reservedStock || 0)) {
      throw inventoryError('Available stock cannot be lower than the units currently reserved');
    }
    update.stock = stock;
  }

  if (Array.isArray(update.variants)) {
    update.variants = preserveVariantInventory(update.variants, currentProduct?.variants);
  }
  return update;
};

const recordManualStockAdjustment = async ({ productBefore, productAfter, tenant, reason = 'admin_stock_adjustment', session }) => {
  const before = Number(productBefore?.stock || 0);
  const after = Number(productAfter?.stock || 0);
  if (before === after) return null;

  const movement = await InventoryMovement.create([{
    tenant,
    product: productAfter._id,
    type: 'adjustment',
    quantity: Math.max(1, Math.abs(after - before)),
    availableBefore: before,
    availableAfter: after,
    reservedBefore: Number(productBefore?.reservedStock || 0),
    reservedAfter: Number(productAfter?.reservedStock || 0),
    soldBefore: Number(productBefore?.soldStock || 0),
    soldAfter: Number(productAfter?.soldStock || 0),
    reason,
    idempotencyKey: `inventory:adjustment:${productAfter._id}:${crypto.randomUUID()}`,
  }], { session });
  return movement[0];
};

module.exports = {
  prepareProductUpdate,
  recordManualStockAdjustment,
  inventoryError,
};
