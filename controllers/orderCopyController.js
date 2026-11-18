const asyncHandler = require('express-async-handler');
const orderCopyService = require('../services/orderCopyService');

const reorderCustomerOrder = asyncHandler(async (req, res) => {
  const result = await orderCopyService.reorderCustomerOrder({
    orderId: req.params.id,
    tenant: req.tenant?._id,
    userId: req.user._id,
    idempotencyKey: req.get('Idempotency-Key'),
  });
  res.json({ success: true, ...result });
});

module.exports = { reorderCustomerOrder };
