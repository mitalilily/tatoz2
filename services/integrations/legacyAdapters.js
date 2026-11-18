const validateGoogle = config => {
  if (!config.client_id || !/\.apps\.googleusercontent\.com$/.test(config.client_id)) throw new Error('Enter a valid Google OAuth client ID');
  return { success: true, message: 'Google OAuth client ID is valid' };
};

module.exports = {
  googleauth: { contractMethods: ['testConnection'], testConnection: async config => validateGoogle(config) },
  msg91: { contractMethods: ['testConnection'], async testConnection(config) { if (!config.auth_key || !config.template_id) throw new Error('Phone OTP credentials and template ID are required'); return { success: true, message: 'Phone OTP credentials are ready' }; } },
};
