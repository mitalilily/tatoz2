const crypto = require('crypto');
const sharp = require('sharp');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const hasStorageConfig = config => Boolean(config?.enabled && config.endpoint && config.bucket && config.access_key_id && config.secret_access_key);
const client = config => {
  if (!hasStorageConfig(config)) return null;
  return new S3Client({ region: config.region || 'auto', endpoint: config.endpoint, forcePathStyle: true, credentials: { accessKeyId: config.access_key_id, secretAccessKey: config.secret_access_key } });
};

const safePart = value => String(value || '').replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 120);
const objectKey = ({ tenant, folder = 'media', filename, extension = '' }) => `${safePart(tenant)}/${safePart(folder)}/${Date.now()}-${crypto.randomUUID()}-${safePart(filename || 'asset')}${extension}`;
const publicUrl = (key, config) => config?.public_url ? `${String(config.public_url).replace(/\/$/, '')}/${key}` : key;
const serverUpload = ({ folder, filename, contentType, maxBytes }) => ({
  provider: 'server',
  directUpload: false,
  url: '/api/storage/upload',
  method: 'POST',
  fieldName: 'file',
  folder: String(folder || 'media').slice(0, 80),
  filename: String(filename || 'asset').slice(0, 160),
  contentType: 'image/webp',
  sourceContentType: contentType,
  maxBytes: Number(maxBytes) || (Number(process.env.STORAGE_UPLOAD_MAX_MB) || 50) * 1024 * 1024,
});

const getUploadUrl = async ({ tenant, folder, filename, contentType, maxBytes = 50 * 1024 * 1024, config }) => {
  // Never issue a raw signed PUT URL for JPEG/PNG/etc. because that would
  // bypass server-side normalization. A pre-existing WebP is safe to upload
  // directly, while every other image must use the multipart server route.
  if (String(contentType || '').toLowerCase() !== 'image/webp') return serverUpload({ folder, filename, contentType, maxBytes });
  const storage = client(config);
  if (!storage) return { provider: 'local', directUpload: false, key: null, url: null };
  const key = objectKey({ tenant, folder, filename, extension: '.webp' });
  const command = new PutObjectCommand({ Bucket: config.bucket, Key: key, ContentType: 'image/webp', Metadata: { tenant: safePart(tenant), maxBytes: String(maxBytes) } });
  const expiresIn = Number(process.env.STORAGE_SIGNED_URL_TTL) || 900;
  return { provider: 'r2', directUpload: true, key, url: await getSignedUrl(storage, command, { expiresIn }), expiresIn, publicUrl: publicUrl(key, config) };
};

const getDownloadUrl = async ({ key, privateFile = true, config }) => {
  const storage = client(config);
  if (!storage) return { provider: 'local', url: key };
  if (!privateFile && config.public_url) return { provider: 'r2', url: publicUrl(key, config) };
  return { provider: 'r2', url: await getSignedUrl(storage, new GetObjectCommand({ Bucket: config.bucket, Key: key }), { expiresIn: Number(process.env.STORAGE_SIGNED_URL_TTL) || 900 }) };
};

const putImageVariants = async ({ tenant, folder = 'images', filename = 'asset', buffer, config }) => {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Image buffer is required');
  const storage = client(config);
  if (!storage) throw new Error('Cloudflare R2 is not configured for this tenant');
  const variants = [{ name: 'original', width: 2400, quality: 88 }, { name: 'large', width: 1200, quality: 84 }, { name: 'thumb', width: 480, quality: 78 }];
  const results = {};
  for (const variant of variants) {
    const transformed = await sharp(buffer).rotate().resize({ width: variant.width, withoutEnlargement: true }).webp({ quality: variant.quality }).toBuffer();
    const key = objectKey({ tenant, folder: `${folder}/${variant.name}`, filename, extension: '.webp' });
    await storage.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: transformed, ContentType: 'image/webp', CacheControl: 'public,max-age=31536000,immutable' }));
    results[variant.name] = { key, url: publicUrl(key, config) };
  }
  return results;
};

const testConnection = async config => {
  const storage = client(config);
  if (!storage) throw new Error('Cloudflare R2 endpoint, bucket and credentials are required');
  await storage.send(new HeadBucketCommand({ Bucket: config.bucket }));
  return { success: true, message: 'Cloudflare R2 connection is valid' };
};

const deleteObject = async (key, config) => { const storage = client(config); if (!storage) return { deleted: false, provider: 'local' }; await storage.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key })); return { deleted: true, key }; };

module.exports = { isConfigured: hasStorageConfig, getUploadUrl, getDownloadUrl, putImageVariants, deleteObject, objectKey, publicUrl, testConnection };
