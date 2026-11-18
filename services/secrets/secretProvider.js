let client;
let loaded = false;

const hydrateIntegrationKey = async () => {
  if (loaded || process.env.INTEGRATION_ENCRYPTION_KEY) { loaded = true; return { source: process.env.INTEGRATION_ENCRYPTION_KEY ? 'runtime-secret' : 'legacy-jwt-fallback' }; }
  const projectId = process.env.GCP_SECRET_MANAGER_PROJECT_ID || process.env.GCP_PROJECT_ID;
  const secretName = process.env.INTEGRATION_ENCRYPTION_SECRET_NAME;
  if (!projectId || !secretName) { loaded = true; return { source: 'legacy-jwt-fallback' }; }
  try {
    if (!client) {
      // Google ADC is used; service-account JSON is never placed in `.env`.
      const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
      client = new SecretManagerServiceClient();
    }
    const [version] = await client.accessSecretVersion({ name: `projects/${projectId}/secrets/${secretName}/versions/latest` });
    const value = version.payload?.data?.toString('utf8');
    if (!value || value.length < 32) throw new Error('GCP integration encryption secret must be at least 32 characters');
    process.env.INTEGRATION_ENCRYPTION_KEY = value;
    loaded = true;
    return { source: 'gcp-secret-manager' };
  } catch (error) {
    throw new Error(`Could not load integration encryption key from GCP Secret Manager: ${error.message}`);
  }
};

module.exports = { hydrateIntegrationKey };
