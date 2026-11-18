const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

// Multer accepts image/* MIME types, while some browsers provide incomplete
// or generic MIME metadata. Keep the extension fallback broad enough for all
// image inputs supported by the upload layer.
const IMAGE_EXTENSIONS = /\.(avif|bmp|gif|heic|heif|ico|jpe?g|jp2|jxl|png|svg|tif?f|webp)$/i;

const isImageMimeType = mimetype => typeof mimetype === 'string' && mimetype.toLowerCase().startsWith('image/');
const isImageFilename = filename => typeof filename === 'string' && IMAGE_EXTENSIONS.test(filename);

const filesFromRequest = req => {
  const files = [];
  if (req.file) files.push(req.file);
  if (Array.isArray(req.files)) files.push(...req.files);
  else if (req.files && typeof req.files === 'object') {
    Object.values(req.files).forEach(fieldFiles => {
      if (Array.isArray(fieldFiles)) files.push(...fieldFiles);
    });
  }
  return files;
};

const unlinkIfPresent = async filePath => {
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('[convertToWebp] Cleanup failed:', error.message);
  }
};

const safeStem = filename => {
  const basename = path.basename(String(filename || 'asset'));
  const extension = path.extname(basename);
  const stem = basename.slice(0, extension ? -extension.length : undefined);
  return (stem || 'asset').replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 120) || 'asset';
};

const conversionError = error => {
  const wrapped = new Error('Image conversion to WebP failed. Please upload a valid image and try again.');
  wrapped.statusCode = 422;
  wrapped.publicCode = 'IMAGE_CONVERSION_FAILED';
  wrapped.cause = error;
  return wrapped;
};

/**
 * Convert a single image buffer to WebP and save it in the local uploads
 * directory. Callers provide a unique source filename, so the resulting
 * WebP filename is also unique.
 */
const convertBufferToWebp = async (buffer, filename = 'asset.jpg') => {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Image buffer is required');
  const webpFilename = `${safeStem(filename)}.webp`;
  const webpPath = path.join(UPLOAD_DIR, webpFilename);

  try {
    await sharp(buffer)
      .rotate()
      .resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(webpPath);
  } catch (error) {
    await unlinkIfPresent(webpPath);
    throw conversionError(error);
  }

  return { url: `/uploads/${webpFilename}`, filename: webpFilename };
};

/**
 * Middleware for disk-backed multer routes. Every image is converted before
 * the route handler runs. A failed conversion rejects the upload so a source
 * JPEG/PNG/etc. can never be reported as a successful non-WebP asset.
 */
const convertToWebp = () => async (req, res, next) => {
  const files = filesFromRequest(req);
  if (!files.length) return next();

  const createdPaths = [];
  try {
    for (const file of files) {
      const isImage = isImageMimeType(file.mimetype)
        || isImageFilename(file.originalname)
        || isImageFilename(file.filename);
      if (!isImage) continue;

      // A WebP upload already satisfies the contract. Do not re-encode it or
      // risk reading and writing the same file at once.
      const currentFilename = file.filename || file.originalname || '';
      if (path.extname(currentFilename).toLowerCase() === '.webp') {
        file.mimetype = 'image/webp';
        continue;
      }

      if (file.buffer) {
        const generatedFilename = `${Date.now()}-${Math.random().toString(16).slice(2)}${path.extname(currentFilename) || '.jpg'}`;
        const result = await convertBufferToWebp(file.buffer, generatedFilename);
        file.filename = result.filename;
        file.path = path.join(UPLOAD_DIR, result.filename);
        file.destination = UPLOAD_DIR;
        file.size = (await fs.promises.stat(file.path)).size;
        file.mimetype = 'image/webp';
        createdPaths.push(file.path);
        continue;
      }

      const originalPath = file.path || path.join(UPLOAD_DIR, file.filename);
      const extension = path.extname(file.filename || file.originalname || '.jpg');
      const webpFilename = `${path.basename(file.filename || file.originalname || 'asset', extension)}.webp`;
      const webpPath = path.join(UPLOAD_DIR, webpFilename);

      await sharp(originalPath)
        .rotate()
        .resize({ width: 1200, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(webpPath);
      createdPaths.push(webpPath);
      await fs.promises.unlink(originalPath);

      file.filename = webpFilename;
      file.path = webpPath;
      file.destination = UPLOAD_DIR;
      file.size = (await fs.promises.stat(webpPath)).size;
      file.mimetype = 'image/webp';
    }
    return next();
  } catch (error) {
    await Promise.all(createdPaths.map(unlinkIfPresent));
    await Promise.all(files.map(file => {
      if (!file.path || path.extname(file.path).toLowerCase() === '.webp') return null;
      return unlinkIfPresent(file.path);
    }));
    console.error('[convertToWebp] Error:', error.message);
    return next(error instanceof Error && error.publicCode ? error : conversionError(error));
  }
};

module.exports = {
  convertToWebp,
  convertBufferToWebp,
  isImageMimeType,
  isImageFilename,
};
