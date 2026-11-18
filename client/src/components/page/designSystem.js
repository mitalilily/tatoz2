export const DEFAULT_DESIGN_SYSTEM = {
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
};

export const FONT_STACKS = {
  system: 'Inter, system-ui, sans-serif',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
};

function mergeDesignSystem(value = {}) {
  return { ...DEFAULT_DESIGN_SYSTEM, ...(value && typeof value === 'object' ? value : {}) };
}

export function designSystemStyle(value = {}) {
  const tokens = mergeDesignSystem(value);
  return {
    '--page-primary-color': tokens.primaryColor,
    '--page-accent-color': tokens.accentColor,
    '--page-text-color': tokens.textColor,
    '--page-muted-text-color': tokens.mutedTextColor,
    '--page-surface-color': tokens.surfaceColor,
    '--page-border-color': tokens.borderColor,
    '--page-base-radius': `${Number.isFinite(Number(tokens.baseRadius)) ? Number(tokens.baseRadius) : 12}px`,
    '--page-content-width': `${Number(tokens.contentWidth) || 1200}px`,
    '--page-heading-font': FONT_STACKS[tokens.headingFont] || FONT_STACKS.system,
    '--page-body-font': FONT_STACKS[tokens.bodyFont] || FONT_STACKS.system,
    '--page-mono-font': FONT_STACKS.mono,
    '--page-serif-font': FONT_STACKS.serif,
    fontFamily: FONT_STACKS[tokens.bodyFont] || FONT_STACKS.system,
    color: tokens.textColor,
  };
}

export const SECTION_STYLE_PRESETS = [
  {
    value: 'clean',
    label: 'Clean',
    settings: {
      backgroundToken: 'none', textToken: 'text', backgroundColor: '',
      borderWidth: 0, borderRadius: 0, boxShadow: 'none', padding: { all: 16 },
    },
  },
  {
    value: 'softCard',
    label: 'Soft card',
    settings: {
      backgroundToken: 'surface', textToken: 'text', backgroundColor: '',
      borderWidth: 1, borderStyle: 'solid', borderColor: '', borderColorToken: 'border',
      borderRadius: null, borderRadiusToken: 'base', boxShadow: 'sm', padding: { all: 24 },
    },
  },
  {
    value: 'brandBand',
    label: 'Brand band',
    settings: {
      backgroundToken: 'primary', textToken: 'inverse', backgroundColor: '',
      borderWidth: 0, borderRadius: 0, borderColor: '', borderColorToken: 'border', boxShadow: 'none', textAlign: 'center', padding: { all: 32 },
    },
  },
];
