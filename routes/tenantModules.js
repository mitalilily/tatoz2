const express = require('express');
const { protect } = require('../middleware/auth');
const { loadTenant, requireTenantManager } = require('../services/tenantService');
const controller = require('../controllers/moduleController');

const router = express.Router();
router.use(protect, loadTenant);
router.get('/', controller.getModules);
router.put('/:module', requireTenantManager, controller.updateModule);

module.exports = router;
