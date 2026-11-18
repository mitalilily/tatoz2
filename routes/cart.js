const express = require('express');
const { optionalAuth, requireOtpQualified } = require('../middleware/auth');
const { loadTenant } = require('../services/tenantService');
const { resolveCartContext } = require('../services/guestCartService');
const { addBundle, addItem, clearCart, getCart, importItems, removeItem, updateItem } = require('../controllers/cartController');

const router = express.Router();
const identifyCart = [optionalAuth, loadTenant, resolveCartContext];
const mutateCart = [...identifyCart, requireOtpQualified];

router.get('/', ...identifyCart, getCart);
router.post('/items', ...mutateCart, addItem);
router.post('/bundles', ...mutateCart, addBundle);
router.patch('/items/:itemId', ...mutateCart, updateItem);
router.delete('/items/:itemId', ...mutateCart, removeItem);
router.post('/import', ...mutateCart, importItems);
router.delete('/', ...mutateCart, clearCart);

module.exports = router;
