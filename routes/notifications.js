const express = require('express');
const { protect } = require('../middleware/auth');
const { loadTenantOptional, requireTenantManager } = require('../services/tenantService');
const controller = require('../controllers/notificationController');
const preferenceController = require('../controllers/notificationPreferenceController');

const router = express.Router();
router.use(protect, loadTenantOptional);
router.get('/preferences', preferenceController.getPreferences);
router.put('/preferences', preferenceController.updatePreferences);
router.post('/send', requireTenantManager, controller.sendNotification);
router.get('/deliveries', controller.getNotificationDeliveries);

module.exports = router;
