const crypto = require('crypto');
const { PLATFORM_NAME } = require('../constants/branding');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const encodeBase32 = buffer => {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { output += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
};

const decodeBase32 = input => {
  let bits = 0;
  let value = 0;
  const output = [];
  for (const char of String(input || '').toUpperCase().replace(/=+$/g, '').replace(/\s/g, '')) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error('Invalid two-factor secret');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) { output.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(output);
};

const generateSecret = () => encodeBase32(crypto.randomBytes(20));
const codeFor = (secret, timestamp = Date.now()) => {
  const counter = Math.floor(timestamp / 30000);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 15;
  const number = (digest.readUInt32BE(offset) & 0x7fffffff) % 1000000;
  return String(number).padStart(6, '0');
};
const verifyCode = (secret, code) => {
  const normalized = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;
  return [-1, 0, 1].some(offset => codeFor(secret, Date.now() + offset * 30000) === normalized);
};
const otpauthUrl = ({ secret, account, issuer = PLATFORM_NAME }) => `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

module.exports = { generateSecret, codeFor, verifyCode, otpauthUrl };
