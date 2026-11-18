const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { loadTenantOptional } = require('../services/tenantService');
const { getCustomerInvoice } = require('../controllers/invoiceController');
const { getCustomerInvoiceNotes } = require('../controllers/invoiceNoteController');

router.get('/orders/:orderId', protect, loadTenantOptional, getCustomerInvoice);
router.get('/orders/:orderId/notes', protect, loadTenantOptional, getCustomerInvoiceNotes);

module.exports = router;
