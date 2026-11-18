const asyncHandler = require('express-async-handler');
const codPolicyService = require('../services/codPolicyService');

const getPolicy = asyncHandler(async (req, res) => {
  const policy = await codPolicyService.getPolicy({ tenantId: req.tenant._id });
  res.json({ success: true, policy: policy ? codPolicyService.safePolicy(policy) : codPolicyService.safePolicy({ tenant: req.tenant._id }) });
});

const updatePolicy = asyncHandler(async (req, res) => {
  const policy = await codPolicyService.updatePolicy({ tenantId: req.tenant._id, userId: req.user._id, payload: req.body || {} });
  res.json({ success: true, policy });
});

const checkEligibility = asyncHandler(async (req, res) => {
  const result = await codPolicyService.evaluate({
    tenantId: req.tenant._id,
    userId: req.user._id,
    paymentMethod: 'cod',
    total: Number(req.body?.total || 0),
    address: req.body?.shippingAddress || {},
  });
  res.json({ success: true, authoritative: false, ...result, note: 'Final COD eligibility is recalculated from the committed order total during checkout.' });
});

module.exports = { getPolicy, updatePolicy, checkEligibility };
