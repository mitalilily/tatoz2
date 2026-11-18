const express = require('express');
const router = express.Router();
const { protect, optionalAuth, requireOtpQualified } = require('../middleware/auth');
const { loadTenant, loadTenantOptional } = require('../services/tenantService');
const { createOrder, getMyOrders, getOrder } = require('../controllers/orderController');
const { getCancellationPolicy, checkEligibility, cancelOrder, requestRefund } = require('../controllers/cancellationController');
const { createCustomerReturn, getCustomerReturns } = require('../controllers/returnController');
const { uploadMemory } = require('../middleware/upload');
const { getCustomerInvoiceNotes } = require('../controllers/invoiceNoteController');
const { reorderCustomerOrder } = require('../controllers/orderCopyController');

router.post('/', optionalAuth, loadTenant, requireOtpQualified, createOrder);
router.get('/my', protect, loadTenantOptional, getMyOrders);
router.post('/:id/reorder', protect, loadTenant, requireOtpQualified, reorderCustomerOrder);
router.get('/cancellation-policy', getCancellationPolicy);
router.get('/:id/cancellation-eligibility', protect, loadTenantOptional, checkEligibility);
router.post('/:id/cancel', protect, loadTenantOptional, cancelOrder);
router.post('/:id/refund-request', protect, loadTenantOptional, uploadMemory.array('images', 3), requestRefund);
router.get('/:id/returns', protect, loadTenantOptional, getCustomerReturns);
router.post('/:id/returns', protect, loadTenantOptional, uploadMemory.array('images', 3), createCustomerReturn);
router.get('/:id/invoice', protect, loadTenantOptional, (req, res, next) => {
  req.params.orderId = req.params.id;
  return require('../controllers/invoiceController').getCustomerInvoice(req, res, next);
});
router.get('/:id/invoice-notes', protect, loadTenantOptional, (req, res, next) => {
  req.params.orderId = req.params.id;
  return getCustomerInvoiceNotes(req, res, next);
});
router.get('/:id', optionalAuth, loadTenantOptional, getOrder);

module.exports = router;
