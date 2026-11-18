const asyncHandler = require('express-async-handler');
const Page = require('../models/Page');
const TemplateVersion = require('../models/TemplateVersion');
const { createTemplateVersionSnapshot, ensureInitialTemplateVersion } = require('../services/templateVersionService');

async function findTemplate(req, id) {
  const template = await Page.findOne({ _id: id, isTemplate: true, scope: { $ne: 'vendor' }, kind: 'page' });
  if (!template) {
    const error = new Error('Template not found');
    error.statusCode = 404;
    throw error;
  }
  return template;
}

const listTemplateVersions = asyncHandler(async (req, res) => {
  const template = await findTemplate(req, req.params.id);
  await ensureInitialTemplateVersion(template, { userId: req.user?._id });
  const versions = await TemplateVersion.find({ templateId: template._id })
    .select('version changeNote createdBy createdAt updatedAt')
    .sort({ version: -1 })
    .limit(100)
    .lean();
  res.json({ success: true, template: { _id: template._id, title: template.title }, versions });
});

const createTemplateVersion = asyncHandler(async (req, res) => {
  const template = await findTemplate(req, req.params.id);
  const version = await createTemplateVersionSnapshot(template, {
    userId: req.user?._id,
    changeNote: req.body?.changeNote || 'Manual snapshot',
  });
  res.status(201).json({ success: true, version: version.toObject() });
});

const restoreTemplateVersion = asyncHandler(async (req, res) => {
  const template = await findTemplate(req, req.params.id);
  const version = await TemplateVersion.findOne({ _id: req.params.versionId, templateId: template._id }).lean();
  if (!version) { res.status(404); throw new Error('Template version not found'); }

  // Preserve the current draft before applying the selected snapshot. The
  // post-restore snapshot below then makes the restored state the new latest
  // version, so both sides of the restore remain recoverable.
  await createTemplateVersionSnapshot(template, {
    userId: req.user?._id,
    changeNote: `Pre-restore snapshot before v${version.version}`,
  });

  template.draftLayout = version.layoutSnapshot || { sections: [] };
  template.mobileLayout = version.mobileLayoutSnapshot || null;
  template.mobileLayoutMode = version.mobileLayoutMode || 'auto';
  template.pageSettings = version.pageSettingsSnapshot || template.pageSettings;
  template.seo = version.seoSnapshot || template.seo;
  template.builderRevision = (template.builderRevision || 0) + 1;
  template.updatedBy = req.user?._id || template.updatedBy;
  await template.save();
  const restored = await createTemplateVersionSnapshot(template, {
    userId: req.user?._id,
    changeNote: `Restored from v${version.version}`,
  });
  res.json({ success: true, page: template.toObject(), version: restored.toObject() });
});

module.exports = { listTemplateVersions, createTemplateVersion, restoreTemplateVersion, findTemplate };
