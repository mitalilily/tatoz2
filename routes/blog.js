const express = require('express');
const router = express.Router();
const { getPosts, getFeaturedPosts, getPostBySlug, getPublicCategories } = require('../controllers/blogController');

router.get('/', getPosts);
router.get('/featured', getFeaturedPosts);
router.get('/categories', getPublicCategories);
router.get('/:slug', getPostBySlug);

module.exports = router;
