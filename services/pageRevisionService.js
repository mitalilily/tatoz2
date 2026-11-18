const Page = require('../models/Page');

// Draft, publish and restore writers share an atomic revision contract.
async function savePageWithRevision(page, expectedRevision = page.builderRevision || 0) {
  const revision = Number(expectedRevision);
  if (!Number.isInteger(revision) || revision < 0) {
    const error = new Error('builderRevision must be a non-negative integer');
    error.statusCode = 400;
    throw error;
  }
  const document = page.toObject();
  const changes = Object.fromEntries(Object.entries(document)
    .filter(([key]) => !['_id', '__v', 'builderRevision', 'createdAt', 'updatedAt'].includes(key) && page.isModified(key)));
  const revisionFilter = revision === 0
    ? { $or: [{ builderRevision: 0 }, { builderRevision: { $exists: false } }] }
    : { builderRevision: revision };
  const saved = await Page.findOneAndUpdate(
    { _id: page._id, ...revisionFilter },
    { $set: changes, $inc: { builderRevision: 1 } },
    { new: true, runValidators: true },
  );
  if (!saved) {
    const error = new Error('This page changed in another editor. Reload the latest draft before trying again.');
    error.statusCode = 409;
    error.publicCode = 'PAGE_REVISION_CONFLICT';
    throw error;
  }
  return saved;
}

module.exports = { savePageWithRevision };
