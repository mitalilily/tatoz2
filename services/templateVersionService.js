const TemplateVersion = require('../models/TemplateVersion');

function snapshotFromPage(page) {
  return {
    layoutSnapshot: page.draftLayout || { sections: [] },
    mobileLayoutSnapshot: page.mobileLayout || null,
    mobileLayoutMode: page.mobileLayoutMode || 'auto',
    pageSettingsSnapshot: page.pageSettings || {},
    seoSnapshot: page.seo || {},
  };
}

async function createTemplateVersionSnapshot(page, { userId = null, changeNote = '' } = {}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const latest = await TemplateVersion.findOne({ templateId: page._id }).sort({ version: -1 }).select('version').lean();
    const version = (latest?.version || 0) + 1;
    try {
      return await TemplateVersion.create({
        templateId: page._id,
        version,
        ...snapshotFromPage(page),
        changeNote: String(changeNote || '').trim().slice(0, 500),
        createdBy: userId || null,
      });
    } catch (error) {
      if (error?.code !== 11000 || attempt === 2) throw error;
    }
  }
  return null;
}

async function ensureInitialTemplateVersion(page, options = {}) {
  const existing = await TemplateVersion.exists({ templateId: page._id });
  if (existing) return null;
  return createTemplateVersionSnapshot(page, { ...options, changeNote: options.changeNote || 'Initial template snapshot' });
}

async function getTemplateVersionSeed({ templateId, versionId }) {
  if (!versionId) return null;
  const version = await TemplateVersion.findById(versionId).lean();
  if (!version || (templateId && String(version.templateId) !== String(templateId))) return null;
  return {
    version,
    draftLayout: version.layoutSnapshot || { sections: [] },
    mobileLayout: version.mobileLayoutSnapshot || null,
    mobileLayoutMode: version.mobileLayoutMode || 'auto',
    pageSettings: version.pageSettingsSnapshot || {},
    seo: version.seoSnapshot || {},
  };
}

module.exports = { snapshotFromPage, createTemplateVersionSnapshot, ensureInitialTemplateVersion, getTemplateVersionSeed };
