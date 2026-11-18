const asyncHandler = require('express-async-handler');
const cartService = require('../services/cartService');

const context = req => ({
  ...(req.cartContext || { tenantId: req.tenant._id, userId: req.user._id }),
  idempotencyKey: req.get('Idempotency-Key'),
});

const sendCart = (res, result) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    success: true,
    cart: result.cart,
    idempotentReplay: result.idempotentReplay,
  });
};

const getCart = asyncHandler(async (req, res) => {
  const cart = await cartService.getCart(context(req));
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, cart });
});

const addItem = asyncHandler(async (req, res) => {
  const result = await cartService.addItem({
    ...context(req),
    productId: req.body.productId || req.body.product,
    quantity: req.body.quantity,
    variant: req.body.variant,
    source: req.body.source,
  });
  sendCart(res, result);
});

const addBundle = asyncHandler(async (req, res) => {
  const result = await cartService.addBundle({
    ...context(req),
    bundleId: req.body.bundleId || req.body.bundle,
    quantity: req.body.quantity,
    selections: req.body.selections || req.body.bundleSelections,
    source: req.body.source,
  });
  sendCart(res, result);
});

const updateItem = asyncHandler(async (req, res) => {
  const result = await cartService.updateItem({
    ...context(req),
    itemId: req.params.itemId,
    quantity: req.body.quantity,
    revision: req.body.revision,
  });
  sendCart(res, result);
});

const removeItem = asyncHandler(async (req, res) => {
  const result = await cartService.removeItem({
    ...context(req),
    itemId: req.params.itemId,
    revision: req.query.revision,
  });
  sendCart(res, result);
});

const clearCart = asyncHandler(async (req, res) => {
  const result = await cartService.clearCart({
    ...context(req),
    revision: req.query.revision,
  });
  sendCart(res, result);
});

const importItems = asyncHandler(async (req, res) => {
  const result = await cartService.importItems({
    ...context(req),
    items: req.body.items,
    source: req.body.source,
  });
  sendCart(res, result);
});

module.exports = { addBundle, addItem, clearCart, getCart, importItems, removeItem, updateItem };
