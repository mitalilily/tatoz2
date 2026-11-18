const express = require('express');
const { requireApiKey } = require('../middleware/apiKeyAuth');
const controller = require('../controllers/publicApiController');

const router = express.Router();
router.use(requireApiKey('catalog.read'));
router.get('/catalog/products', controller.catalog);
router.get('/catalog/categories', controller.categories);
router.get('/catalog/bundles', controller.bundles);

module.exports = router;
