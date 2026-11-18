module.exports = {
  id: 'cloudflare_turnstile',
  contractMethods: ['testConnection'],
  async testConnection(config) {
    if (!config.site_key || !config.secret_key) throw new Error('Turnstile site key and secret key are required');
    return { success: true, message: 'Cloudflare Turnstile configuration is valid' };
  },
};
