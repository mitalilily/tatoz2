const express = require('express');
const { protect } = require('../middleware/auth');
const { loadTenant } = require('../services/tenantService');
const { uploadStorage } = require('../middleware/upload');
const controller = require('../controllers/storageController');

const router = express.Router();
router.use(protect, loadTenant);
router.post('/upload-url', controller.createUploadUrl);
router.post('/upload', uploadStorage.single('file'), controller.uploadImage);
router.get('/download-url', controller.createDownloadUrl);

module.exports = router;
