const crypto = require('crypto');
const httpRequest = require('../../../utils/httpRequest');

const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const assertConfig = config => { if (!config.project_id || !config.client_email || !config.private_key) throw new Error('FCM service account is incomplete'); };

const accessToken = async config => {
  assertConfig(config);
  const now = Math.floor(Date.now() / 1000);
  const assertion = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: config.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(assertion);
  const signed = `${assertion}.${signer.sign(String(config.private_key).replace(/\\n/g, '\n'), 'base64url')}`;
  const { data } = await httpRequest({ url: 'https://oauth2.googleapis.com/token', method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(signed)}` });
  return data.access_token;
};

module.exports = {
  id: 'fcm',
  contractMethods: ['send', 'testConnection'],
  async send({ token, title, body, data = {} }, config) {
    if (!token) throw new Error('FCM device token is required');
    const tokenValue = await accessToken(config);
    const response = await httpRequest({ url: `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.project_id)}/messages:send`, method: 'POST', headers: { Authorization: `Bearer ${tokenValue}` }, body: { message: { token, notification: { title: title || '', body: body || '' }, data: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value)])) } } });
    return { externalId: response.data?.name || '', status: 'sent', raw: response.data };
  },
  async testConnection(config) { await accessToken(config); return { success: true, message: 'FCM service account is valid' }; },
};
