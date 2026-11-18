const production = process.env.NODE_ENV === 'production';

const requiredInProduction = [
  'MONGO_URI',
  'JWT_SECRET',
];

function validateEnvironment() {
  if (!production) return;

  const missing = requiredInProduction.filter(key => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
  }

  if (String(process.env.JWT_SECRET).length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production');
  }

  const hasGcpEncryptionSecret = Boolean((process.env.GCP_SECRET_MANAGER_PROJECT_ID || process.env.GCP_PROJECT_ID) && process.env.INTEGRATION_ENCRYPTION_SECRET_NAME);
  if (!process.env.INTEGRATION_ENCRYPTION_KEY && !hasGcpEncryptionSecret) {
    throw new Error('Configure INTEGRATION_ENCRYPTION_KEY or GCP Secret Manager integration encryption secret in production');
  }

  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    console.warn('[startup] ADMIN_EMAIL/ADMIN_PASSWORD are not configured; automatic admin seeding is disabled');
  }
}

const parseOrigins = () => [
  process.env.CLIENT_URL,
  ...(process.env.CLIENT_ORIGINS || '').split(',').map(value => value.trim()),
  ...(production ? [] : ['http://localhost:3000', 'http://localhost:3001']),
].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index);

module.exports = { production, parseOrigins, validateEnvironment };
