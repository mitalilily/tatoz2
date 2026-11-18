const DEFAULT_DESIGN_SYSTEM = Object.freeze({
  primaryColor: '#4f46e5',
  accentColor: '#7c3aed',
  textColor: '#0f172a',
  mutedTextColor: '#64748b',
  surfaceColor: '#ffffff',
  borderColor: '#e2e8f0',
  headingFont: 'system',
  bodyFont: 'system',
  baseRadius: 12,
  contentWidth: 1200,
});

const COLOR_KEYS = new Set([
  'primaryColor', 'accentColor', 'textColor', 'mutedTextColor', 'surfaceColor', 'borderColor',
]);
const FONT_KEYS = new Set(['headingFont', 'bodyFont']);
const FONT_VALUES = new Set(['system', 'serif', 'mono']);

function safeColor(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const color = value.trim();
  return /^#[0-9a-f]{3,8}$/i.test(color) ? color : fallback;
}

function safeNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
}

function normalizeDesignSystem(input = {}, current = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const existing = current && typeof current === 'object' ? current : {};
  const next = { ...DEFAULT_DESIGN_SYSTEM };
  const merged = { ...existing, ...source };

  for (const key of COLOR_KEYS) {
    if (Object.prototype.hasOwnProperty.call(merged, key)) next[key] = safeColor(merged[key], next[key]);
  }
  for (const key of FONT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(merged, key) && FONT_VALUES.has(merged[key])) next[key] = merged[key];
  }
  if (Object.prototype.hasOwnProperty.call(merged, 'baseRadius')) {
    next.baseRadius = safeNumber(merged.baseRadius, next.baseRadius, 0, 48);
  }
  if (Object.prototype.hasOwnProperty.call(merged, 'contentWidth')) {
    next.contentWidth = safeNumber(merged.contentWidth, next.contentWidth, 640, 1920);
  }
  return next;
}

module.exports = { DEFAULT_DESIGN_SYSTEM, normalizeDesignSystem };
