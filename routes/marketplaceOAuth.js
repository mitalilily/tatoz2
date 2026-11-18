const express = require('express');
const router = express.Router();
const { oauthCallback } = require('../controllers/marketplaceController');

router.get('/:provider/callback', oauthCallback);

module.exports = router;
