const asyncHandler = require('express-async-handler');
const customer360Service = require('../services/customer360Service');

// @desc    Get a tenant-scoped Customer 360 profile and lifecycle timeline
// @route   GET /api/admin/users/:id/360
const getCustomer360 = asyncHandler(async (req, res) => {
  const result = await customer360Service.getCustomer360({
    userId: req.params.id,
    tenant: req.tenant?._id,
  });
  if (!result) {
    res.status(404);
    throw new Error('Customer is not available in this tenant');
  }
  res.json({ success: true, ...result });
});

module.exports = { getCustomer360 };
