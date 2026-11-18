const express = require('express');
const { protect } = require('../middleware/auth');
const { loadTenant, requireTenantManager } = require('../services/tenantService');
const controller = require('../controllers/tenantIntegrationController');

const router = express.Router();
router.use(protect, loadTenant);
router.get('/', controller.getIntegrations);
router.get('/:provider/health', controller.getHealth);
router.get('/:provider/deliveries', controller.getDeliveries);
router.post('/:provider/test', requireTenantManager, controller.testIntegration);
router.post('/:provider/rotate-key', requireTenantManager, controller.rotateIntegrationKey);
router.put('/:provider', requireTenantManager, controller.updateIntegration);
router.delete('/:provider', requireTenantManager, controller.deleteIntegration);

module.exports = router;
