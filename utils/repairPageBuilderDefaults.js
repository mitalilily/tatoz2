function repairPageBuilderDefaults(document, { sharedLayout = false, platformFonts = false } = {}) {
  const changes = [];
  const repairLayout = (layout, path) => {
    for (const section of layout?.sections || []) {
      for (const [settings, suffix] of [[section.settings, 'settings'], [section.responsiveOverrides?.tabletSettings, 'tabletSettings'], [section.responsiveOverrides?.mobileSettings, 'mobileSettings']]) {
        const type = settings?.typography;
        // Exact signature produced by the old Number(null) normalizer. An
        // intentional zero opacity without this signature is preserved.
        if (type?.fontFamily === 'inherit' && type.fontSize === 8 && type.lineHeight === 0.8 && type.letterSpacing === 0 && type.fontWeight == null) {
          type.fontSize = null;
          type.lineHeight = null;
          type.letterSpacing = null;
          if (settings.media?.opacity === 0) settings.media.opacity = null;
          changes.push(`${path}.${section.id}.${suffix}`);
        }
      }
    }
  };
  for (const key of ['draftLayout', 'mobileLayout', 'publishedLayout', 'publishedMobileLayout']) repairLayout(document[key], key);
  for (const key of ['layout', 'mobileLayout']) repairLayout(document.publishedDocument?.[key], `publishedDocument.${key}`);
  if (sharedLayout) {
    if (document.mobileLayoutMode !== 'auto') { document.mobileLayoutMode = 'auto'; changes.push('mobileLayoutMode'); }
    if (document.publishedDocument && document.publishedDocument.mobileLayoutMode !== 'auto') {
      document.publishedDocument.mobileLayoutMode = 'auto'; changes.push('publishedDocument.mobileLayoutMode');
    }
  }
  if (platformFonts) {
    for (const [settings, path] of [[document.pageSettings, 'pageSettings'], [document.publishedDocument?.pageSettings, 'publishedDocument.pageSettings']]) {
      if (!settings) continue;
      settings.designSystem = settings.designSystem || {};
      for (const key of ['headingFont', 'bodyFont']) {
        if (settings.designSystem[key] !== 'system') { settings.designSystem[key] = 'system'; changes.push(`${path}.${key}`); }
      }
    }
  }
  return changes;
}

module.exports = { repairPageBuilderDefaults };
