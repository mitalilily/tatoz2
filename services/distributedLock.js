const crypto = require('crypto');
const JobLock = require('../models/JobLock');

const ownerId = `${process.pid}-${crypto.randomBytes(8).toString('hex')}`;

async function withLock(key, ttlMs, work) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);
  let lock;
  try {
    lock = await JobLock.findOneAndUpdate(
      { key, $or: [{ expiresAt: { $lte: now } }, { owner: ownerId }] },
      { $set: { key, owner: ownerId, expiresAt } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    if (error.code === 11000) return false;
    throw error;
  }
  if (!lock || lock.owner !== ownerId) return false;

  try {
    await work();
  } finally {
    await JobLock.deleteOne({ key, owner: ownerId }).catch(() => {});
  }
  return true;
}

module.exports = { withLock };
