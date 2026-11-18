const https = require('https');
const http = require('http');
const { URL } = require('url');

const request = ({ url, method = 'GET', headers = {}, body = null, timeout = 30000, raw = false }) => new Promise((resolve, reject) => {
  const target = new URL(url);
  const transport = target.protocol === 'https:' ? https : http;
  const bodyValue = body === null || body === undefined
    ? null
    : (typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  const requestHeaders = {
    Accept: raw ? '*/*' : 'application/json',
    ...headers,
  };
  if (bodyValue && !requestHeaders['Content-Length']) requestHeaders['Content-Length'] = Buffer.byteLength(bodyValue);
  const req = transport.request({
    hostname: target.hostname,
    port: target.port || 443,
    path: `${target.pathname}${target.search}`,
    method,
    headers: requestHeaders,
    timeout,
  }, (res) => {
    const chunks = [];
    res.on('data', chunk => chunks.push(Buffer.from(chunk)));
    res.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const contentType = String(res.headers['content-type'] || '');
      let data = buffer;
      if (!raw && (contentType.includes('json') || buffer.length)) {
        try { data = JSON.parse(buffer.toString('utf8')); } catch (_) { data = buffer.toString('utf8'); }
      }
      if (res.statusCode >= 200 && res.statusCode < 300) return resolve({ data, status: res.statusCode, headers: res.headers });
      const message = typeof data === 'object'
        ? (data.message || data.error_description || data.error || data.errors?.[0]?.message)
        : data;
      const error = new Error(message || `Marketplace API returned HTTP ${res.statusCode}`);
      error.status = res.statusCode;
      error.response = data;
      error.headers = res.headers;
      reject(error);
    });
  });
  req.on('timeout', () => { req.destroy(); reject(new Error('Marketplace API request timed out')); });
  req.on('error', reject);
  if (bodyValue) req.write(bodyValue);
  req.end();
});

module.exports = request;
