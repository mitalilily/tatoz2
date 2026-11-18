const express = require('express');
const multer = require('multer');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { loadTenant } = require('../services/tenantService');
const { getStatus, uploadDocuments, acceptAgreement, resubmit } = require('../controllers/vendorOnboardingController');

// KYC uploads accept scans/photos (image) and exported statements (PDF).
// Kept separate from the shared image-only uploader on purpose.
const docUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 5, fields: 20 },
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype.startsWith('image/')
      || file.mimetype === 'application/pdf'
      || file.originalname.toLowerCase().endsWith('.pdf');
    if (ok) cb(null, true);
    else cb(new Error('Only image or PDF documents are allowed'), false);
  },
});

// Pre-approval auth chain: the seller has no active vendor profile yet, so
// this deliberately does NOT use vendorAuth (which 403s non-active vendors).
router.use(protect, loadTenant);

router.get('/status', getStatus);
router.post(
  '/documents',
  docUpload.fields([
    { name: 'gstCertificate', maxCount: 1 },
    { name: 'panCard', maxCount: 1 },
    { name: 'businessProof', maxCount: 1 },
    { name: 'bankProof', maxCount: 1 },
    { name: 'fssaiCertificate', maxCount: 1 },
  ]),
  uploadDocuments,
);
router.post('/agreement/accept', acceptAgreement);
router.post('/resubmit', resubmit);

module.exports = router;
