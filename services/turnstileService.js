const httpRequest = require('../utils/httpRequest');

const verify = async (token, remoteip, config = {}) => {
  if (!config.enabled || !config.secret_key) return { success: true, skipped: true };
  if (!token) return { success: false, error: 'Turnstile token is required' };
  const response = await httpRequest({ url: 'https://challenges.cloudflare.com/turnstile/v0/siteverify', method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `secret=${encodeURIComponent(config.secret_key)}&response=${encodeURIComponent(token)}${remoteip ? `&remoteip=${encodeURIComponent(remoteip)}` : ''}` });
  return response.data;
};

module.exports = { verify };
