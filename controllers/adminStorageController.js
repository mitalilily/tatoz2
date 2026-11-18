const path = require('path');
const fs = require('fs').promises;
const asyncHandler = require('express-async-handler');
const sharp = require('sharp');

const uploadsRoot = path.resolve(__dirname, '..', 'uploads');
const PAGE_SIZE = 10;
const THUMBNAIL_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg']);

// Keep this list deliberately local instead of adding a runtime dependency just
// for file metadata. These are the asset types accepted by the project's
// upload flows, plus PDFs used by the vendor onboarding flow.
const EXTENSION_METADATA = {
  '.jpg': { mimeType: 'image/jpeg', mediaType: 'image' },
  '.jpeg': { mimeType: 'image/jpeg', mediaType: 'image' },
  '.png': { mimeType: 'image/png', mediaType: 'image' },
  '.webp': { mimeType: 'image/webp', mediaType: 'image' },
  '.avif': { mimeType: 'image/avif', mediaType: 'image' },
  '.gif': { mimeType: 'image/gif', mediaType: 'image' },
  '.svg': { mimeType: 'image/svg+xml', mediaType: 'image' },
  '.ico': { mimeType: 'image/x-icon', mediaType: 'image' },
  '.mp4': { mimeType: 'video/mp4', mediaType: 'video' },
  '.webm': { mimeType: 'video/webm', mediaType: 'video' },
  '.mov': { mimeType: 'video/quicktime', mediaType: 'video' },
  '.mp3': { mimeType: 'audio/mpeg', mediaType: 'audio' },
  '.wav': { mimeType: 'audio/wav', mediaType: 'audio' },
  '.ogg': { mimeType: 'audio/ogg', mediaType: 'audio' },
  '.pdf': { mimeType: 'application/pdf', mediaType: 'document' },
};

const metadataFor = filename => EXTENSION_METADATA[path.extname(filename).toLowerCase()] || null;

const formatBytes = bytes => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** exponent);
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
};

const toPublicUrl = relativePath => `/uploads/${relativePath
  .split(path.sep)
  .map(segment => encodeURIComponent(segment))
  .join('/')}`;

const toThumbnailUrl = relativePath => `/api/admin/storage/thumbnail?path=${encodeURIComponent(relativePath.split(path.sep).join('/'))}`;

const walkUploads = async (directory, relativeDirectory = '') => {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    // Do not follow symlinks. The storage page must never expose files outside
    // the project's uploads directory.
    if (entry.isSymbolicLink()) continue;

    const relativePath = path.join(relativeDirectory, entry.name);
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkUploads(fullPath, relativePath));
      continue;
    }
    if (!entry.isFile()) continue;

    const metadata = metadataFor(entry.name);
    if (!metadata) continue;

    const stats = await fs.stat(fullPath);
    files.push({
      id: relativePath,
      path: relativePath,
      name: entry.name,
      url: toPublicUrl(relativePath),
      thumbnailUrl: metadata.mediaType === 'image' && THUMBNAIL_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
        ? toThumbnailUrl(relativePath)
        : null,
      size: stats.size,
      sizeLabel: formatBytes(stats.size),
      mimeType: metadata.mimeType,
      mediaType: metadata.mediaType,
      createdAt: stats.birthtime.toISOString(),
      updatedAt: stats.mtime.toISOString(),
      updatedAtMs: stats.mtimeMs,
    });
  }
  return files;
};

const resolveAssetPath = assetPath => {
  const relativePath = String(assetPath || '').replace(/\\/g, '/').trim();
  const parts = relativePath.split('/');
  if (!relativePath || relativePath.startsWith('/') || parts.some(part => !part || part === '.' || part === '..')) {
    const error = new Error('Invalid asset path');
    error.statusCode = 400;
    throw error;
  }

  const fullPath = path.resolve(uploadsRoot, ...parts);
  if (fullPath !== uploadsRoot && !fullPath.startsWith(`${uploadsRoot}${path.sep}`)) {
    const error = new Error('Invalid asset path');
    error.statusCode = 400;
    throw error;
  }
  return { relativePath: parts.join(path.sep), fullPath };
};

const listAssets = asyncHandler(async (req, res) => {
  const requestedPage = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const allAssets = await walkUploads(uploadsRoot);
  allAssets.sort((left, right) => right.updatedAtMs - left.updatedAtMs || left.name.localeCompare(right.name));

  const total = allAssets.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, pages);
  const start = (page - 1) * PAGE_SIZE;
  const assets = allAssets.slice(start, start + PAGE_SIZE).map(({ updatedAtMs, ...asset }) => asset);

  res.json({
    success: true,
    assets,
    pagination: { page, limit: PAGE_SIZE, pages, total },
  });
});

const deleteAsset = asyncHandler(async (req, res) => {
  const { relativePath, fullPath } = resolveAssetPath(req.body?.path || req.body?.id);
  const metadata = metadataFor(relativePath);
  if (!metadata) {
    res.status(400);
    throw new Error('Only supported project media assets can be deleted');
  }

  let stats;
  try {
    stats = await fs.lstat(fullPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404);
      throw new Error('Asset not found');
    }
    throw error;
  }
  if (!stats.isFile() || stats.isSymbolicLink()) {
    res.status(400);
    throw new Error('Invalid asset');
  }

  await fs.unlink(fullPath);
  res.json({ success: true, message: 'Asset deleted', path: relativePath });
});

const getThumbnail = asyncHandler(async (req, res) => {
  const { relativePath, fullPath } = resolveAssetPath(req.query?.path || req.query?.id);
  const metadata = metadataFor(relativePath);
  if (!metadata || metadata.mediaType !== 'image' || !THUMBNAIL_EXTENSIONS.has(path.extname(relativePath).toLowerCase())) {
    res.status(400);
    throw new Error('Only image thumbnails are supported');
  }

  let source;
  try {
    source = await fs.readFile(fullPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404);
      throw new Error('Asset not found');
    }
    throw error;
  }

  const thumbnail = await sharp(source)
    .rotate()
    .resize({ width: 180, height: 180, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 38, effort: 3 })
    .toBuffer();

  res.set({
    'Content-Type': 'image/webp',
    'Cache-Control': 'private, max-age=3600',
    ETag: `W/"${thumbnail.length}-${(await fs.stat(fullPath)).mtimeMs}"`,
  });
  res.send(thumbnail);
});

const deleteAssets = asyncHandler(async (req, res) => {
  const paths = Array.isArray(req.body?.paths) ? [...new Set(req.body.paths.map(String))] : [];
  if (!paths.length) {
    res.status(400);
    throw new Error('At least one asset path is required');
  }
  if (paths.length > 100) {
    res.status(400);
    throw new Error('You can delete at most 100 assets at once');
  }

  const results = await Promise.all(paths.map(async assetPath => {
    try {
      const { relativePath, fullPath } = resolveAssetPath(assetPath);
      if (!metadataFor(relativePath)) throw new Error('Unsupported media type');
      const stats = await fs.lstat(fullPath);
      if (!stats.isFile() || stats.isSymbolicLink()) throw new Error('Invalid asset');
      await fs.unlink(fullPath);
      return { path: relativePath, deleted: true };
    } catch (error) {
      return { path: assetPath, deleted: false, error: error.message || 'Delete failed' };
    }
  }));

  const deleted = results.filter(result => result.deleted);
  const failed = results.filter(result => !result.deleted);
  res.json({
    success: deleted.length > 0,
    message: `${deleted.length} media file${deleted.length === 1 ? '' : 's'} deleted`,
    deletedCount: deleted.length,
    failedCount: failed.length,
    deleted: deleted.map(result => result.path),
    failed,
  });
});

module.exports = { listAssets, deleteAsset, deleteAssets, getThumbnail, PAGE_SIZE, metadataFor, resolveAssetPath };
