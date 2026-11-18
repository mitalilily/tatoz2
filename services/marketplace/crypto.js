const crypto = require('crypto');

const algorithm = 'aes-256-gcm';
const key = crypto.createHash('sha256')
  .update(process.env.MARKETPLACE_ENCRYPTION_KEY || process.env.JWT_SECRET || 'tatoz-marketplace-secret')
  .digest();

const encrypt = (value) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
};

const decrypt = (payload) => {
  if (!payload) return {};
  const [ivValue, tagValue, encryptedValue] = String(payload).split('.');
  if (!ivValue || !tagValue || !encryptedValue) throw new Error('Invalid encrypted marketplace credentials');
  const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  const clear = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
  return JSON.parse(clear);
};

const mask = (value) => {
  if (!value) return '';
  const text = String(value);
  if (text.length <= 6) return '••••••';
  return `${text.slice(0, 3)}••••${text.slice(-3)}`;
};

const credentialHints = (credentials = {}) => ({
  hasClientId: Boolean(credentials.clientId || credentials.appId),
  hasClientSecret: Boolean(credentials.clientSecret || credentials.appSecret),
  hasRefreshToken: Boolean(credentials.refreshToken),
  hasAccessToken: Boolean(credentials.accessToken),
  hasAwsCredentials: Boolean(credentials.awsAccessKeyId && credentials.awsSecretAccessKey),
  sellerId: credentials.sellerId || '',
  marketplaceId: credentials.marketplaceId || '',
});

module.exports = { encrypt, decrypt, mask, credentialHints };
