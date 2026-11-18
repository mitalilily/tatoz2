const crypto = require('crypto');
const PageBuilderCheckpoint = require('../models/PageBuilderCheckpoint');

function clone(value) {
  if (value == null) return value;
  if (typeof value.toObject === 'function') return value.toObject();
  return JSON.parse(JSON.stringify(value));
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.keys(value).filter(key => {
      if (value[key] === undefined) return false;
      if (key !== 'responsiveOverrides' || !value[key] || typeof value[key] !== 'object') return true;
      const responsiveKeys = ['tablet', 'mobile', 'tabletSettings', 'mobileSettings'];
      const isEmptyObject = child => child && typeof child === 'object' && !Array.isArray(child) && Object.keys(child).length === 0;
      return !(Object.keys(value[key]).length > 0
        && Object.keys(value[key]).every(childKey => responsiveKeys.includes(childKey) && isEmptyObject(value[key][childKey])));
    }).sort();
    return `{${entries.map(key => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value == null ? null : value);
}

function fingerprint(value) {
  return crypto.createHash('sha256').update(stableSerialize(value)).digest('hex');
}

function draftLayoutForTarget(page, target) {
  return target === 'mobile' && page.mobileLayout
    ? clone(page.mobileLayout)
    : clone(page.draftLayout || { sections: [] });
}

async function createPageBuilderCheckpoint(page, {
  target = 'desktop',
  prompt = '',
  changes = [],
  afterDraftLayout,
  afterMobileLayout,
  userId = null,
} = {}) {
  const beforeDraftLayout = clone(page.draftLayout || { sections: [] });
  const beforeMobileLayout = clone(page.mobileLayout || null);
  const nextDraftLayout = clone(afterDraftLayout || (target === 'desktop' ? draftLayoutForTarget(page, target) : page.draftLayout || { sections: [] }));
  const nextMobileLayout = clone(afterMobileLayout || (target === 'mobile' ? draftLayoutForTarget(page, target) : page.mobileLayout || null));
  const beforeLayout = target === 'mobile' ? beforeMobileLayout : beforeDraftLayout;
  const afterLayout = target === 'mobile' ? nextMobileLayout : nextDraftLayout;
  return PageBuilderCheckpoint.create({
    pageId: page._id,
    target,
    prompt: String(prompt || '').trim().slice(0, 300),
    changes: (Array.isArray(changes) ? changes : []).filter(item => typeof item === 'string' && item.trim()).slice(0, 12).map(item => item.trim().slice(0, 240)),
    beforeLayout,
    beforeBuilderRevision: Number(page.builderRevision || 0),
    afterFingerprint: fingerprint(afterLayout),
    createdBy: userId || null,
  });
}

module.exports = { clone, fingerprint, createPageBuilderCheckpoint };
