const { handlePaymentWebhook } = require('./paymentWebhookController');

// Preserve the established Razorpay webhook URL while routing it through the
// provider-neutral tenant-bound reconciliation path.
const handleRazorpayWebhook = (req, res, next) => {
  req.params = { ...(req.params || {}), provider: 'razorpay' };
  return handlePaymentWebhook(req, res, next);
};

module.exports = { handleRazorpayWebhook };
