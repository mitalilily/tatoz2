export const SECTION_VARIANT_OPTIONS = [
  { value: 'default', label: 'Default', description: 'Use the section’s normal surface.' },
  { value: 'soft-card', label: 'Soft card', description: 'Surface, radius and subtle elevation.' },
  { value: 'bordered', label: 'Bordered', description: 'Crisp border with a contained surface.' },
  { value: 'full-bleed', label: 'Full bleed', description: 'Edge-to-edge visual treatment.' },
  { value: 'editorial', label: 'Editorial', description: 'Typography-led, spacious composition.' },
];

export const PRODUCT_CARD_VARIANT_OPTIONS = [
  { value: 'classic', label: 'Classic', description: 'Balanced commerce card with hover actions.' },
  { value: 'minimal', label: 'Minimal', description: 'Quiet borderless card with less chrome.' },
  { value: 'overlay', label: 'Overlay', description: 'Product information sits over the image.' },
  { value: 'compact', label: 'Compact', description: 'Tighter card for dense product rails.' },
  { value: 'editorial', label: 'Editorial', description: 'Portrait image and premium typography.' },
];

const SECTION_VARIANT_VALUES = new Set(SECTION_VARIANT_OPTIONS.map(option => option.value));
const PRODUCT_CARD_VARIANT_VALUES = new Set(PRODUCT_CARD_VARIANT_OPTIONS.map(option => option.value));

export function normalizeSectionVariant(value) {
  return SECTION_VARIANT_VALUES.has(value) ? value : 'default';
}

export function normalizeProductCardVariant(value) {
  return PRODUCT_CARD_VARIANT_VALUES.has(value) ? value : 'classic';
}

export function getSectionVariantStyle(value, settings = {}) {
  const variant = normalizeSectionVariant(value);
  const style = {};
  const hasCustomBackground = !!settings.backgroundColor || settings.backgroundToken !== 'none';
  const hasCustomBorder = Number(settings.borderWidth) > 0;

  if (variant === 'soft-card') {
    if (!hasCustomBackground) style.backgroundColor = 'var(--page-surface-color)';
    if (!hasCustomBorder) {
      style.borderWidth = '1px';
      style.borderStyle = 'solid';
      style.borderColor = 'var(--page-border-color)';
    }
    if (settings.borderRadius == null || (Number(settings.borderRadius) === 0 && settings.borderRadiusToken === 'none')) {
      style.borderRadius = 'var(--page-base-radius)';
    }
    if (!settings.boxShadow || settings.boxShadow === 'none') style.boxShadow = '0 10px 28px rgba(15, 23, 42, 0.08)';
  }

  if (variant === 'bordered') {
    if (!hasCustomBorder) {
      style.borderWidth = '1px';
      style.borderStyle = 'solid';
      style.borderColor = 'var(--page-border-color)';
    }
    if (settings.borderRadius == null || (Number(settings.borderRadius) === 0 && settings.borderRadiusToken === 'none')) {
      style.borderRadius = 'var(--page-base-radius)';
    }
  }

  if (variant === 'full-bleed') {
    style.borderRadius = '0px';
    style.marginLeft = '0px';
    style.marginRight = '0px';
  }

  return style;
}
