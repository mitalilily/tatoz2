const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { convertBufferToWebp, isImageMimeType, isImageFilename } = require('./convertToWebp');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${uniqueSuffix}${ext}`);
  },
});

const memoryStorage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) cb(null, true);
  else cb(new Error('Only image files are allowed'), false);
};

const upload = multer({
  storage: diskStorage,
  limits: { fileSize: 10 * 1024 * 1024, files: 10, fields: 100 },
  fileFilter,
});

const uploadMemory = multer({
  storage: memoryStorage,
  limits: { fileSize: 10 * 1024 * 1024, files: 10, fields: 100 },
  fileFilter,
});

// Server-mediated object-storage uploads keep the larger storage API limit,
// but still accept images only so they always pass through WebP conversion.
const uploadStorage = multer({
  storage: memoryStorage,
  limits: { fileSize: (Number(process.env.STORAGE_UPLOAD_MAX_MB) || 50) * 1024 * 1024, files: 1, fields: 50 },
  fileFilter,
});

const csvFileFilter = (req, file, cb) => {
  const allowed = ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain'];
  if (allowed.includes(file.mimetype) || file.originalname.endsWith('.csv')) cb(null, true);
  else cb(new Error('Only CSV files are allowed'), false);
};

const uploadCSV = multer({
  storage: memoryStorage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 50 },
  fileFilter: csvFileFilter,
});

// Accept image and short-form video uploads (e.g. InstaReels MP4s up to 100MB).
const mediaFileFilter = (req, file, cb) => {
  const allowed = ['video/mp4', 'video/webm', 'video/quicktime'];
  if (file.mimetype.startsWith('image/') || allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only image or short-form video files are allowed'), false);
};

const uploadMedia = multer({
  storage: memoryStorage,
  limits: { fileSize: (Number(process.env.MEDIA_UPLOAD_MAX_MB) || 50) * 1024 * 1024, files: 1, fields: 50 },
  fileFilter: mediaFileFilter,
});

// Save buffer to disk (replaces uploadToCloudinary)
const saveFileToDisk = async (buffer, options = {}) => {
  const requestedExt = String(options.ext || path.extname(options.originalname || options.filename || '') || '.jpg');
  const ext = requestedExt.startsWith('.') ? requestedExt : `.${requestedExt}`;
  const safeExt = /^\.[A-Za-z0-9]{1,10}$/.test(ext) ? ext.toLowerCase() : '.jpg';
  const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${safeExt}`;

  const isImage = isImageMimeType(options.mimetype)
    || isImageFilename(options.originalname)
    || isImageFilename(filename);
  if (isImage) return convertBufferToWebp(buffer, filename);

  const filepath = path.join(uploadsDir, filename);
  await fs.promises.writeFile(filepath, buffer);
  return { url: `/uploads/${filename}`, filename };
};

// Delete file from disk (replaces cloudinary.uploader.destroy)
const deleteFile = async (fileUrl) => {
  if (typeof fileUrl !== 'string' || !fileUrl.startsWith('/uploads/')) {
    throw new Error('Only uploaded assets can be deleted');
  }

  const relativeName = fileUrl.slice('/uploads/'.length);
  // Uploads are generated as flat filenames. Reject traversal, encoded path
  // separators, and arbitrary absolute filesystem paths before resolving.
  if (!relativeName || relativeName !== path.basename(relativeName) || !/^[A-Za-z0-9._-]+$/.test(relativeName)) {
    throw new Error('Invalid uploaded asset path');
  }

  const uploadRoot = path.resolve(uploadsDir);
  const fullPath = path.resolve(uploadRoot, relativeName);
  if (!fullPath.startsWith(`${uploadRoot}${path.sep}`)) {
    throw new Error('Invalid uploaded asset path');
  }
  try {
    await fs.promises.unlink(fullPath);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
};

module.exports = { upload, uploadMemory, uploadStorage, uploadCSV, uploadMedia, saveFileToDisk, deleteFile };
