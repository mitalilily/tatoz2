// Shared responsive helpers for the page builder and the customer renderer.
// Keeping this logic in one place prevents the editor and the public page from
// resolving tablet/mobile overrides differently.

export const RESPONSIVE_BREAKPOINTS = ['tablet', 'mobile'];

const isObject = value => value && typeof value === 'object' && !Array.isArray(value);

export function getResponsiveBreakpoint(device = 'desktop') {
  return RESPONSIVE_BREAKPOINTS.includes(device) ? device : null;
}

export function mergeResponsivePatch(base = {}, patch = {}) {
  const next = { ...(isObject(base) ? base : {}) };
  if (!isObject(patch)) return next;

  // Settings contain nested objects. A shallow merge here would make changing
  // one padding side or one media property erase the other sides/properties.
  ['padding', 'margin', 'typography', 'media', 'schedule'].forEach(key => {
    if (isObject(patch[key])) {
      const resetsBox = ['padding', 'margin'].includes(key) && Object.prototype.hasOwnProperty.call(patch[key], 'all');
      next[key] = { ...(!resetsBox && isObject(next[key]) ? next[key] : {}), ...patch[key] };
    }
  });
  Object.entries(patch).forEach(([key, value]) => {
    if (!['padding', 'margin', 'typography', 'media', 'schedule'].includes(key)) next[key] = value;
  });
  return next;
}

export function getResponsiveData(section, device = 'desktop') {
  const overrides = section?.responsiveOverrides || {};
  const breakpoint = getResponsiveBreakpoint(device);
  const data = { ...(isObject(section?.data) ? section.data : {}) };
  if (breakpoint === 'tablet' || breakpoint === 'mobile') {
    Object.assign(data, isObject(overrides.tablet) ? overrides.tablet : {});
  }
  if (breakpoint === 'mobile') {
    Object.assign(data, isObject(overrides.mobile) ? overrides.mobile : {});
  }
  return data;
}

export function getResponsiveSettings(section, device = 'desktop') {
  const overrides = section?.responsiveOverrides || {};
  const breakpoint = getResponsiveBreakpoint(device);
  let settings = mergeResponsivePatch({}, section?.settings || {});
  if (breakpoint === 'tablet' || breakpoint === 'mobile') {
    settings = mergeResponsivePatch(settings, overrides.tabletSettings);
  }
  if (breakpoint === 'mobile') {
    settings = mergeResponsivePatch(settings, overrides.mobileSettings);
  }
  return settings;
}

export function getEffectiveSection(section, device = 'desktop') {
  if (!section) return section;
  return {
    ...section,
    data: getResponsiveData(section, device),
    settings: getResponsiveSettings(section, device),
  };
}

export function responsiveSettingsKey(breakpoint) {
  return breakpoint ? `${breakpoint}Settings` : null;
}
