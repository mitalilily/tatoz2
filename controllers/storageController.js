const asyncHandler = require('express-async-handler');
const path = require('path');
const storage = require('../services/storage/storageManager');
const tenantIntegrationService = require('../services/tenantIntegrationService');
const { saveFileToDisk } = require('../middleware/upload');
const { isImageMimeType } = require('../middleware/convertToWebp');

const createUploadUrl = asyncHandler(async (req, res) => {
  if (!req.tenant) { res.status(400); throw new Error('Tenant context is required'); }
  const { folder, filename, contentType, maxBytes } = req.body || {};
  if (!filename || !contentType) { res.status(400); throw new Error('filename and contentType are required'); }
  if (!isImageMimeType(contentType)) { res.status(400); throw new Error('Only image uploads are allowed'); }
  // A browser must not upload directly to object storage: that bypasses the
  // WebP conversion pipeline. Keep this endpoint as the upload contract, but
  // make it return the server-mediated multipart endpoint instead of a raw
  // signed PUT URL.
  res.json({
    success: true,
    upload: {
      provider: 'server',
      directUpload: false,
      url: '/api/storage/upload',
      method: 'POST',
      fieldName: 'file',
      folder: String(folder || 'media').slice(0, 80),
      filename: String(filename).slice(0, 160),
      contentType: 'image/webp',
      sourceContentType: contentType,
      maxBytes: Number(maxBytes) || (Number(process.env.STORAGE_UPLOAD_MAX_MB) || 50) * 1024 * 1024,
    },
  });
});

const uploadImage = asyncHandler(async (req, res) => {
  if (!req.tenant) { res.status(400); throw new Error('Tenant context is required'); }
  if (!req.file?.buffer) { res.status(400); throw new Error('Image file is required'); }

  const folder = String(req.body?.folder || 'media').slice(0, 80);
  const filename = String(req.body?.filename || req.file.originalname || 'asset').slice(0, 160);
  const config = await tenantIntegrationService.configFor(req.tenant._id, 'r2', { allowPlatformFallback: true });

  if (storage.isConfigured(config)) {
    const variants = await storage.putImageVariants({
      tenant: req.tenant._id,
      folder,
      filename,
      buffer: req.file.buffer,
      config,
    });
    return res.json({ success: true, provider: 'r2', variants });
  }

  const result = await saveFileToDisk(req.file.buffer, {
    ext: path.extname(req.file.originalname) || '.jpg',
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
  });
  return res.json({
    success: true,
    provider: 'local',
    image: { url: result.url, filename: result.filename },
  });
});

const createDownloadUrl = asyncHandler(async (req, res) => {
  if (!req.tenant) { res.status(400); throw new Error('Tenant context is required'); }
  const key = String(req.query.key || '');
  if (!key || !key.startsWith(`${req.tenant._id}/`)) { res.status(403); throw new Error('Asset does not belong to this tenant'); }
  const config = await tenantIntegrationService.configFor(req.tenant._id, 'r2', { allowPlatformFallback: true });
  res.json({ success: true, download: await storage.getDownloadUrl({ key, privateFile: req.query.private !== 'false', config }) });
});

module.exports = { createUploadUrl, uploadImage, createDownloadUrl };
