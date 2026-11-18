const express = require('express');
const router = express.Router();
const { getPageBySlug, getHomepage, getChrome } = require('../controllers/pageController');

router.get('/homepage', getHomepage);
router.get('/chrome/:kind', getChrome);
router.get('/by-slug/:slug', getPageBySlug);

module.exports = router;
