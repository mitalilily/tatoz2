const express = require('express');
const { protect } = require('../middleware/auth');
const { loadTenant, requireTenantManager } = require('../services/tenantService');
const controller = require('../controllers/authPolicyController');

const router = express.Router();
router.use(protect, loadTenant);
router.get('/', controller.getTenantAuthPolicy);
router.put('/', requireTenantManager, controller.updateTenantAuthPolicy);

module.exports = router;
