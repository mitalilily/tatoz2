const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { loadTenant } = require('../services/tenantService');
const controller = require('../controllers/supportController');

router.use(protect, loadTenant);
router.get('/', controller.listCustomerTickets);
router.post('/', controller.createTicket);
router.get('/:id', controller.getCustomerTicket);
router.post('/:id/replies', controller.replyCustomerTicket);

module.exports = router;
