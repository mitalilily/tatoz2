const crypto = require('crypto');

const requestContext = (req, res, next) => {
  const incoming = req.headers['x-request-id'];
  req.requestId = typeof incoming === 'string' && /^[A-Za-z0-9._:-]{1,100}$/.test(incoming)
    ? incoming
    : crypto.randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
};

module.exports = { requestContext };
