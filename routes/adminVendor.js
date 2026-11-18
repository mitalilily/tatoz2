const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/auth');
const { requireTenantManager } = require('../services/tenantService');
const {
  getVendors, getVendorDetail, approveVendorGstChange, approveVendor, rejectVendor, requestChanges, suspendVendor, reactivateVendor,
  updateVendorCommission, updateVendorSettings, updateVendorVerification,
  getReasonCodes, getVendorAudit, bulkVendorAction, reverifyVendor,
  getPayouts, processPayout, completePayout, failPayout,
} = require('../controllers/adminVendorController');
const {
  listCommissionRules, createCommissionRule, updateCommissionRule, deleteCommissionRule,
} = require('../controllers/adminCommissionRuleController');
const {
  runSettlement, listSettlements,
} = require('../controllers/adminSettlementController');

router.use(protect, admin, requireTenantManager);

router.get('/vendors/meta/reason-codes', getReasonCodes);
router.post('/vendors/bulk', bulkVendorAction);
router.get('/vendors', getVendors);
router.get('/vendors/:id', getVendorDetail);
router.put('/vendors/:id/approve', approveVendor);
router.put('/vendors/:id/gst', approveVendorGstChange);
router.put('/vendors/:id/reject', rejectVendor);
router.put('/vendors/:id/request-changes', requestChanges);
router.put('/vendors/:id/suspend', suspendVendor);
router.put('/vendors/:id/reactivate', reactivateVendor);
router.put('/vendors/:id/commission', updateVendorCommission);
router.put('/vendors/:id/settings', updateVendorSettings);
router.put('/vendors/:id/verification', updateVendorVerification);
router.post('/vendors/:id/reverify', reverifyVendor);
router.get('/vendors/:id/audit', getVendorAudit);
router.get('/commission-rules', listCommissionRules);
router.post('/commission-rules', createCommissionRule);
router.put('/commission-rules/:id', updateCommissionRule);
router.delete('/commission-rules/:id', deleteCommissionRule);
router.post('/settlements/run', runSettlement);
router.get('/settlements', listSettlements);
router.get('/payouts', getPayouts);
router.put('/payouts/:id/process', processPayout);
router.put('/payouts/:id/complete', completePayout);
router.put('/payouts/:id/fail', failPayout);

module.exports = router;
