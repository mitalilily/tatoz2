const asyncHandler = require('express-async-handler');
const Page = require('../models/Page');
const PageBuilderCheckpoint = require('../models/PageBuilderCheckpoint');
const { fingerprint } = require('../services/pageBuilderCheckpointService');

function pageQuery(req) {
  return req.vendor
    ? { _id: req.params.id, vendor: req.vendor._id, scope: 'vendor', kind: 'page' }
    : { _id: req.params.id };
}

const rollbackPageBuilderCheckpoint = asyncHandler(async (req, res) => {
  const page = await Page.findOne(pageQuery(req));
  if (!page) { res.status(404); throw new Error('Page not found'); }
  const checkpoint = await PageBuilderCheckpoint.findOne({
    _id: req.params.checkpointId,
    pageId: page._id,
    usedAt: null,
  }).lean();
  if (!checkpoint) { res.status(404); throw new Error('AI checkpoint not found or already used'); }

  const expectedRevision = Number(req.body?.builderRevision);
  const currentRevision = Number(page.builderRevision || 0);
  if (Number.isInteger(expectedRevision) && expectedRevision !== currentRevision) {
    return res.status(409).json({
      success: false,
      code: 'PAGE_REVISION_CONFLICT',
      message: 'This AI checkpoint is no longer aligned with the current draft. Reload the latest draft before undoing it.',
      latestRevision: currentRevision,
    });
  }

  // Do not roll back over edits made after the AI apply. The fingerprint makes
  // the one-click undo safe even if the draft was changed in another tab.
  const currentDraftLayout = page.draftLayout?.toObject ? page.draftLayout.toObject() : (page.draftLayout || { sections: [] });
  const currentMobileLayout = page.mobileLayout?.toObject ? page.mobileLayout.toObject() : (page.mobileLayout || null);
  const currentTargetLayout = checkpoint.target === 'mobile' ? currentMobileLayout : currentDraftLayout;
  const currentTargetFingerprint = fingerprint(currentTargetLayout);
  if (currentTargetFingerprint !== checkpoint.afterFingerprint) {
    return res.status(409).json({
      success: false,
      code: 'PAGE_AI_CHECKPOINT_CONFLICT',
      message: 'The draft changed after this AI apply. Review the latest preview before undoing it.',
      latestRevision: currentRevision,
    });
  }

  const restoreFields = checkpoint.target === 'mobile'
    ? { mobileLayout: checkpoint.beforeLayout }
    : { draftLayout: checkpoint.beforeLayout };
  const restored = await Page.findOneAndUpdate(
    { _id: page._id, builderRevision: currentRevision },
    {
      $set: {
        ...restoreFields,
        updatedBy: req.user?._id || page.updatedBy,
      },
      $inc: { builderRevision: 1 },
    },
    { new: true, runValidators: true },
  );
  if (!restored) {
    const latest = await Page.findById(page._id).select('builderRevision').lean();
    return res.status(409).json({
      success: false,
      code: 'PAGE_REVISION_CONFLICT',
      message: 'This page changed in another editor. Reload the latest draft before undoing the AI change.',
      latestRevision: latest?.builderRevision || 0,
    });
  }

  await PageBuilderCheckpoint.updateOne(
    { _id: checkpoint._id, usedAt: null },
    { $set: { usedAt: new Date(), usedBy: req.user?._id || null } },
  );
  res.json({
    success: true,
    message: 'The AI change was rolled back from the saved checkpoint.',
    page: restored.toObject(),
    checkpoint: { id: String(checkpoint._id), used: true },
  });
});

module.exports = { rollbackPageBuilderCheckpoint };
