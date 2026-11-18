// Canonical Indian mobile normalization.
// Accepts anything (with/without country code, spaces, dashes, +), returns 10-digit string or null.
const normalize = (raw) => {
  if (raw === null || raw === undefined) return null;
  const digits = String(raw).replace(/\D/g, '');
  const cleaned = digits.length === 12 && digits.startsWith('91')
    ? digits.slice(2)
    : digits.length === 11 && digits.startsWith('0')
      ? digits.slice(1)
      : digits;
  if (cleaned.length !== 10 || !/^[6-9]/.test(cleaned)) return null;
  return cleaned;
};

const assertValid = (raw) => {
  const n = normalize(raw);
  if (!n) {
    const err = new Error('Invalid phone number — must be a 10-digit Indian mobile starting with 6-9');
    err.statusCode = 400;
    throw err;
  }
  return n;
};

module.exports = { normalize, assertValid };
