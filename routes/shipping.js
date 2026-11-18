const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const { loadTenant, loadTenantOptional } = require('../services/tenantService');
const shipmentController = require('../controllers/shipmentController');
const { getActiveProvider, getRates, getQuote, createShipment, trackShipment, checkDelivery } = require('../controllers/shippingController');
const codPolicyController = require('../controllers/codPolicyController');

router.get('/provider', loadTenantOptional, getActiveProvider);
router.post('/rates', loadTenantOptional, getRates);
router.post('/quote', protect, loadTenant, getQuote);
router.post('/cod-eligibility', protect, loadTenant, codPolicyController.checkEligibility);
router.post('/check-delivery', loadTenantOptional, checkDelivery);
router.get('/pincode/:pincode', (req, res, next) => require('../services/tenantService').loadTenantOptional(req, res, next), async (req, res) => {
  const ServiceablePincode = require('../models/ServiceablePincode');
  const pincode = String(req.params.pincode || '').replace(/\D/g, '');
  if (!/^\d{6}$/.test(pincode)) return res.status(400).json({ success: false, message: 'Valid 6-digit pincode is required' });
  const rule = req.tenant?._id ? await ServiceablePincode.findOne({ tenant: req.tenant._id, pincode, active: true }).lean() : null;
  return res.json({ success: true, configured: Boolean(rule), pincode: rule || null });
});
router.get('/track/:trackingId', loadTenantOptional, trackShipment);
router.get('/orders/:orderId/shipment', protect, loadTenantOptional, shipmentController.getOrderShipment);
router.get('/shipments/:id/events', protect, loadTenantOptional, shipmentController.getShipmentEvents);
router.get('/shipments/:id', protect, loadTenantOptional, shipmentController.getShipment);

// Admin only: create shipment for an order
router.post('/create', protect, admin, loadTenantOptional, createShipment);
router.post('/shipments', protect, admin, loadTenantOptional, shipmentController.createShipment);

module.exports = router;
