const crypto = require('crypto');
const mongoose = require('mongoose');
const Cart = require('../models/Cart');
const CartMutationReceipt = require('../models/CartMutationReceipt');
const {
  assertQuantity,
  hydrateCart,
  loadValidatedBundle,
  loadValidatedProduct,
  makeError,
  resolveProductSelection,
} = require('./cartProductService');

const RECEIPT_TTL_MS = 24 * 60 * 60 * 1000;
const APPLIED_MUTATION_LIMIT = 100;
const MAX_DISTINCT_ITEMS = 50;
const MAX_CAS_ATTEMPTS = 12;

const cartModelFor = context => context.cartModel || Cart;
const receiptModelFor = context => context.receiptModel || CartMutationReceipt;
const ownerFilter = context => context.userId
  ? { user: context.userId }
  : { tokenHash: context.tokenHash };
const ownerData = context => context.userId
  ? { user: context.userId }
  : { tokenHash: context.tokenHash };

const stableValue = value => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      if (value[key] !== undefined) result[key] = stableValue(value[key]);
      return result;
    }, {});
  }
  return value;
};

const requestHash = (operation, payload) => crypto
  .createHash('sha256')
  .update(JSON.stringify(stableValue({ operation, payload })))
  .digest('hex');

const assertIdempotencyKey = value => {
  const key = String(value || '').trim();
  if (!key) throw makeError('Idempotency-Key header is required', 400, 'IDEMPOTENCY_KEY_REQUIRED');
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) {
    throw makeError('Idempotency-Key must be 8-128 safe characters', 400, 'IDEMPOTENCY_KEY_INVALID');
  }
  return key;
};

const assertRevision = value => {
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !value.trim())) {
    throw makeError('A valid cart revision is required', 400, 'CART_REVISION_REQUIRED');
  }
  const revision = Number(value);
  if (!Number.isInteger(revision) || revision < 0) {
    throw makeError('A valid cart revision is required', 400, 'CART_REVISION_REQUIRED');
  }
  return revision;
};

const plainItems = cart => (cart.items || []).map(item => ({
  _id: item._id,
  itemType: item.itemType || (item.bundle ? 'bundle' : 'product'),
  product: item.product,
  bundle: item.bundle,
  bundleSelections: item.bundleSelections || {},
  variant: item.variant || {},
  variantKey: item.variantKey || '',
  quantity: item.quantity,
  addedAt: item.addedAt,
  updatedAt: item.updatedAt,
}));

const ensureCart = async context => {
  const model = cartModelFor(context);
  const filter = { tenant: context.tenantId, ...ownerFilter(context) };
  let cart = await model.findOne(filter).lean();
  if (cart) return cart;
  try {
    const created = await model.create({ tenant: context.tenantId, ...ownerData(context) });
    return created.toObject();
  } catch (error) {
    if (error.code !== 11000) throw error;
    cart = await model.findOne(filter).lean();
    if (!cart) throw error;
    return cart;
  }
};

const applyCartMutation = async context => {
  const { tenantId, key, hash, mutate } = context;
  const model = cartModelFor(context);
  let cart = await ensureCart(context);
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const alreadyApplied = (cart.appliedMutations || []).find(entry => entry.key === key && entry.requestHash === hash);
    if (alreadyApplied) return hydrateCart(cart, tenantId);

    const nextItems = await mutate(cart);
    if (!Array.isArray(nextItems) || nextItems.length > MAX_DISTINCT_ITEMS) {
      throw makeError(`A cart can contain at most ${MAX_DISTINCT_ITEMS} distinct items`, 409, 'CART_ITEM_LIMIT_REACHED');
    }

    const updated = await model.findOneAndUpdate(
      {
        _id: cart._id,
        tenant: tenantId,
        ...ownerFilter(context),
        revision: cart.revision,
        'appliedMutations.key': { $ne: key },
      },
      {
        $set: { items: nextItems },
        $inc: { revision: 1 },
        $push: {
          appliedMutations: {
            $each: [{ key, requestHash: hash, appliedAt: new Date() }],
            $slice: -APPLIED_MUTATION_LIMIT,
          },
        },
      },
      { new: true, runValidators: true },
    ).lean();
    if (updated) return hydrateCart(updated, tenantId);

    cart = await model.findOne({ tenant: tenantId, ...ownerFilter(context) }).lean();
    if (!cart) cart = await ensureCart(context);
  }
  throw makeError('Cart changed concurrently; retry with a new idempotency key', 409, 'CART_CONCURRENCY_CONFLICT');
};

const errorFromReceipt = receipt => makeError(
  receipt.error?.message || 'Cart mutation failed',
  Number(receipt.error?.statusCode) || 409,
  receipt.error?.code || 'CART_MUTATION_FAILED',
);

const recoverAppliedMutation = async context => {
  const { tenantId, userId, tokenHash, key, hash, receiptId } = context;
  const model = cartModelFor(context);
  const receiptModel = receiptModelFor(context);
  const cart = await model.findOne({
    tenant: tenantId,
    ...ownerFilter(context),
    appliedMutations: { $elemMatch: { key, requestHash: hash } },
  }).lean();
  if (!cart) return null;
  const response = await hydrateCart(cart, tenantId);
  await receiptModel.updateOne(
    { _id: receiptId, status: 'pending' },
    { $set: { status: 'completed', response } },
  );
  return response;
};

const replayReceipt = async context => {
  const { receipt, key, hash } = context;
  if (receipt.requestHash !== hash) {
    throw makeError('Idempotency key was already used for a different cart mutation', 409, 'IDEMPOTENCY_KEY_REUSED');
  }
  if (receipt.status === 'completed') return receipt.response;
  if (receipt.status === 'failed') throw errorFromReceipt(receipt);

  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 50));
    const current = await receiptModelFor(context).findById(receipt._id).lean();
    if (!current) break;
    if (current.requestHash !== hash) {
      throw makeError('Idempotency key was already used for a different cart mutation', 409, 'IDEMPOTENCY_KEY_REUSED');
    }
    if (current.status === 'completed') return current.response;
    if (current.status === 'failed') throw errorFromReceipt(current);
  }

  const recovered = await recoverAppliedMutation({ ...context, key, hash, receiptId: receipt._id });
  if (recovered) return recovered;
  throw makeError('This cart mutation is still in progress', 409, 'IDEMPOTENCY_REQUEST_IN_PROGRESS');
};

const executeMutation = async context => {
  const { tenantId, idempotencyKey, operation, payload, mutate } = context;
  const receiptModel = receiptModelFor(context);
  const key = assertIdempotencyKey(idempotencyKey);
  const hash = requestHash(operation, payload);
  let receipt;
  let ownsReceipt = false;
  try {
    receipt = await receiptModel.create({
      tenant: tenantId,
      ...ownerData(context),
      key,
      requestHash: hash,
      operation,
      expiresAt: new Date(Date.now() + RECEIPT_TTL_MS),
    });
    ownsReceipt = true;
  } catch (error) {
    if (error.code !== 11000) throw error;
    receipt = await receiptModel.findOne({ tenant: tenantId, ...ownerFilter(context), key }).lean();
    if (!receipt) throw error;
  }

  if (!ownsReceipt) {
    const response = await replayReceipt({ ...context, receipt, key, hash });
    return { cart: response, idempotentReplay: true };
  }

  try {
    const response = await applyCartMutation({ ...context, key, hash, mutate });
    await receiptModel.updateOne(
      { _id: receipt._id },
      { $set: { status: 'completed', response } },
    );
    return { cart: response, idempotentReplay: false };
  } catch (error) {
    const statusCode = Number(error.statusCode) || 500;
    const applied = await cartModelFor(context).exists({
      tenant: tenantId,
      ...ownerFilter(context),
      appliedMutations: { $elemMatch: { key, requestHash: hash } },
    });
    if (!applied && statusCode < 500) {
      await receiptModel.updateOne(
        { _id: receipt._id },
        { $set: { status: 'failed', error: { statusCode, code: error.publicCode || '', message: error.message } } },
      );
    } else if (!applied) {
      await receiptModel.deleteOne({ _id: receipt._id });
    }
    throw error;
  }
};

const getCart = async context => {
  const cart = await cartModelFor(context).findOne({ tenant: context.tenantId, ...ownerFilter(context) }).lean();
  return hydrateCart(cart, context.tenantId);
};

const addItem = async ({ tenantId, userId, tokenHash, cartModel, receiptModel, idempotencyKey, productId, quantity, variant, source }) => {
  const checkedQuantity = assertQuantity(quantity);
  const payload = { productId: String(productId || ''), quantity: checkedQuantity, variant: variant || {}, source: String(source || '').slice(0, 64) };
  return executeMutation({
    tenantId, userId, tokenHash, cartModel, receiptModel,
    idempotencyKey,
    operation: 'add-item',
    payload,
    mutate: async cart => {
      const { product, selection } = await loadValidatedProduct({ tenantId, productId, variant, quantity: checkedQuantity });
      const items = plainItems(cart);
      const index = items.findIndex(item => String(item.product) === String(product._id) && item.variantKey === selection.variantKey);
      if (index >= 0) {
        const nextQuantity = Number(items[index].quantity) + checkedQuantity;
        resolveProductSelection(product, selection.canonicalVariant, nextQuantity);
        items[index] = { ...items[index], variant: selection.canonicalVariant, quantity: nextQuantity, updatedAt: new Date() };
      } else {
        items.push({
          _id: new mongoose.Types.ObjectId(),
          product: product._id,
          variant: selection.canonicalVariant,
          variantKey: selection.variantKey,
          quantity: checkedQuantity,
          addedAt: new Date(),
          updatedAt: new Date(),
        });
      }
      return items;
    },
  });
};

const addBundle = async ({ tenantId, userId, tokenHash, cartModel, receiptModel, idempotencyKey, bundleId, quantity, selections, source }) => {
  const checkedQuantity = assertQuantity(quantity);
  const payload = { bundleId: String(bundleId || ''), quantity: checkedQuantity, selections: selections || {}, source: String(source || '').slice(0, 64) };
  return executeMutation({
    tenantId, userId, tokenHash, cartModel, receiptModel,
    idempotencyKey,
    operation: 'add-bundle',
    payload,
    mutate: async cart => {
      const quote = await loadValidatedBundle({ tenantId, bundleId, quantity: checkedQuantity, selections });
      const selectionKey = JSON.stringify(selections || {});
      const items = plainItems(cart);
      const index = items.findIndex(item => item.itemType === 'bundle' && String(item.bundle) === String(bundleId) && JSON.stringify(item.bundleSelections || {}) === selectionKey);
      if (index >= 0) {
        const nextQuantity = Number(items[index].quantity) + checkedQuantity;
        await loadValidatedBundle({ tenantId, bundleId, quantity: nextQuantity, selections });
        items[index] = { ...items[index], bundleSelections: selections || {}, quantity: nextQuantity, updatedAt: new Date() };
      } else {
        items.push({ _id: new mongoose.Types.ObjectId(), itemType: 'bundle', bundle: quote.bundle._id, bundleSelections: selections || {}, variantKey: selectionKey, quantity: checkedQuantity, addedAt: new Date(), updatedAt: new Date() });
      }
      return items;
    },
  });
};

const updateItem = async ({ tenantId, userId, tokenHash, cartModel, receiptModel, idempotencyKey, itemId, quantity, revision }) => {
  if (!mongoose.isValidObjectId(itemId)) throw makeError('Invalid cart item identifier', 400, 'CART_ITEM_ID_INVALID');
  const checkedQuantity = assertQuantity(quantity);
  const expectedRevision = assertRevision(revision);
  const payload = { itemId: String(itemId), quantity: checkedQuantity, revision: expectedRevision };
  return executeMutation({
    tenantId, userId, tokenHash, cartModel, receiptModel,
    idempotencyKey,
    operation: 'update-item',
    payload,
    mutate: async cart => {
      if (Number(cart.revision) !== expectedRevision) {
        throw makeError('Cart revision is stale; reload the cart and retry', 409, 'CART_REVISION_CONFLICT');
      }
      const items = plainItems(cart);
      const index = items.findIndex(item => String(item._id) === String(itemId));
      if (index < 0) throw makeError('Cart item not found', 404, 'CART_ITEM_NOT_FOUND');
      if (items[index].itemType === 'bundle') {
        await loadValidatedBundle({ tenantId, bundleId: items[index].bundle, quantity: checkedQuantity, selections: items[index].bundleSelections });
        items[index] = { ...items[index], quantity: checkedQuantity, updatedAt: new Date() };
        return items;
      }
      const { selection } = await loadValidatedProduct({
        tenantId,
        productId: items[index].product,
        variant: items[index].variant,
        quantity: checkedQuantity,
      });
      items[index] = {
        ...items[index],
        variant: selection.canonicalVariant,
        variantKey: selection.variantKey,
        quantity: checkedQuantity,
        updatedAt: new Date(),
      };
      return items;
    },
  });
};

const removeItem = async ({ tenantId, userId, tokenHash, cartModel, receiptModel, idempotencyKey, itemId, revision }) => {
  if (!mongoose.isValidObjectId(itemId)) throw makeError('Invalid cart item identifier', 400, 'CART_ITEM_ID_INVALID');
  const expectedRevision = assertRevision(revision);
  const payload = { itemId: String(itemId), revision: expectedRevision };
  return executeMutation({
    tenantId, userId, tokenHash, cartModel, receiptModel,
    idempotencyKey,
    operation: 'remove-item',
    payload,
    mutate: async cart => {
      if (Number(cart.revision) !== expectedRevision) {
        throw makeError('Cart revision is stale; reload the cart and retry', 409, 'CART_REVISION_CONFLICT');
      }
      const items = plainItems(cart);
      const nextItems = items.filter(item => String(item._id) !== String(itemId));
      if (nextItems.length === items.length) throw makeError('Cart item not found', 404, 'CART_ITEM_NOT_FOUND');
      return nextItems;
    },
  });
};

const clearCart = async ({ tenantId, userId, tokenHash, cartModel, receiptModel, idempotencyKey, revision }) => {
  const expectedRevision = assertRevision(revision);
  return executeMutation({
    tenantId, userId, tokenHash, cartModel, receiptModel,
    idempotencyKey,
    operation: 'clear-cart',
    payload: { revision: expectedRevision },
    mutate: async cart => {
      if (Number(cart.revision) !== expectedRevision) {
        throw makeError('Cart revision is stale; reload the cart and retry', 409, 'CART_REVISION_CONFLICT');
      }
      return [];
    },
  });
};

const importItems = async ({ tenantId, userId, tokenHash, cartModel, receiptModel, idempotencyKey, items: requestedItems, source }) => {
  if (!Array.isArray(requestedItems) || requestedItems.length < 1 || requestedItems.length > MAX_DISTINCT_ITEMS) {
    throw makeError(`Import must contain between 1 and ${MAX_DISTINCT_ITEMS} items`, 400, 'CART_IMPORT_INVALID');
  }
  const payloadItems = requestedItems.map(item => ({
    bundleId: item.bundleId || item.bundle || '',
    productId: String(item.productId || item.product || ''),
    quantity: assertQuantity(item.quantity),
    variant: item.variant || {},
    selections: item.selections || item.bundleSelections || {},
  }));
  const payload = { items: payloadItems, source: String(source || 'legacy-local-cart').slice(0, 64) };
  return executeMutation({
    tenantId, userId, tokenHash, cartModel, receiptModel,
    idempotencyKey,
    operation: 'import-items',
    payload,
    mutate: async cart => {
      const items = plainItems(cart);
      for (const requested of payloadItems) {
        if (requested.bundleId) {
          const quote = await loadValidatedBundle({ tenantId, bundleId: requested.bundleId, quantity: requested.quantity, selections: requested.selections });
          items.push({ _id: new mongoose.Types.ObjectId(), itemType: 'bundle', bundle: quote.bundle._id, bundleSelections: requested.selections, variantKey: JSON.stringify(requested.selections || {}), quantity: requested.quantity, addedAt: new Date(), updatedAt: new Date() });
          continue;
        }
        const { product, selection } = await loadValidatedProduct({
          tenantId,
          productId: requested.productId,
          variant: requested.variant,
          quantity: requested.quantity,
        });
        const index = items.findIndex(item => String(item.product) === String(product._id) && item.variantKey === selection.variantKey);
        if (index >= 0) {
          const nextQuantity = Number(items[index].quantity) + requested.quantity;
          resolveProductSelection(product, selection.canonicalVariant, nextQuantity);
          items[index] = { ...items[index], variant: selection.canonicalVariant, quantity: nextQuantity, updatedAt: new Date() };
        } else {
          items.push({
            _id: new mongoose.Types.ObjectId(),
            product: product._id,
            variant: selection.canonicalVariant,
            variantKey: selection.variantKey,
            quantity: requested.quantity,
            addedAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }
      return items;
    },
  });
};

module.exports = {
  addBundle,
  addItem,
  clearCart,
  getCart,
  importItems,
  removeItem,
  updateItem,
};
