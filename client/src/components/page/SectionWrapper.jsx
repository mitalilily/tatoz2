import { getSectionVariantStyle, normalizeSectionVariant } from './componentVariants';
import { FONT_STACKS } from './designSystem';

const LEGACY_PADDING = { none: 0, sm: 8, md: 16, lg: 24, xl: 32 };
const TYPOGRAPHY_CLASSES = {
  fontFamily: 'page-section-fontFamily', fontSize: 'page-section-fontSize',
  lineHeight: 'page-section-lineHeight', letterSpacing: 'page-section-letterSpacing', fontWeight: 'page-section-fontWeight',
};
const TOKEN_COLORS = {
  background: { none: null, primary: 'var(--page-primary-color)', accent: 'var(--page-accent-color)', surface: 'var(--page-surface-color)', muted: 'color-mix(in srgb, var(--page-surface-color) 92%, var(--page-text-color))' },
  text: { text: 'var(--page-text-color)', muted: 'var(--page-muted-text-color)', inverse: '#ffffff', primary: 'var(--page-primary-color)' },
  border: { border: 'var(--page-border-color)', primary: 'var(--page-primary-color)', accent: 'var(--page-accent-color)' },
};

function boxSide(box, side, fallback) {
  if (!box || typeof box !== 'object' || Array.isArray(box)) return fallback;
  const value = box[side] ?? box.all;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

function cssDimension(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}px`;
  if (typeof value === 'object' && !Array.isArray(value)) {
    if (value.unit === 'auto') return 'auto';
    if (value.value == null || value.value === '') return null;
    const number = Number(value.value);
    return Number.isFinite(number) && ['px', '%', 'vw', 'vh', 'rem', 'em'].includes(value.unit)
      ? `${number}${value.unit}`
      : null;
  }
  if (typeof value === 'string' && /^(?:auto|-?\d+(?:\.\d+)?(?:px|%|vw|vh|rem|em))$/.test(value.trim())) return value.trim();
  return null;
}

export default function SectionWrapper({ section, device = 'desktop', children, selectable = false, selected = false, onSelect, preview = false }) {
  const s = section.settings || {};
  const variant = normalizeSectionVariant(s.variant);
  if (s.visibility === 'hidden') return null;
  if (s.visibility === 'desktop' && device !== 'desktop') return null;
  if (s.visibility === 'mobile' && device !== 'mobile') return null;
  if (!preview && s.schedule) {
    const now = Date.now();
    const from = s.schedule.from ? new Date(s.schedule.from).getTime() : null;
    const until = s.schedule.until ? new Date(s.schedule.until).getTime() : null;
    if ((from != null && Number.isFinite(from) && now < from) || (until != null && Number.isFinite(until) && now >= until)) return null;
  }

  const style = { ...getSectionVariantStyle(variant, s) };
  if (s.backgroundColor) {
    if (/gradient\(/i.test(s.backgroundColor)) style.backgroundImage = s.backgroundColor;
    else style.backgroundColor = s.backgroundColor;
  }
  else if (TOKEN_COLORS.background[s.backgroundToken]) style.backgroundColor = TOKEN_COLORS.background[s.backgroundToken];
  if (TOKEN_COLORS.text[s.textToken]) style.color = TOKEN_COLORS.text[s.textToken];
  if (s.backgroundImage) {
    style.backgroundImage = `url(${s.backgroundImage})`;
    style.backgroundSize = s.backgroundSize || 'cover';
    style.backgroundPosition = s.backgroundPosition || 'center center';
  }

  // Prefer the explicit box model values. `??`-style resolution is
  // intentional here so a configured 0 remains 0 instead of falling back.
  const legacyPadding = LEGACY_PADDING[s.paddingY] ?? 16;
  style.paddingTop = `${boxSide(s.padding, 'top', legacyPadding)}px`;
  style.paddingBottom = `${boxSide(s.padding, 'bottom', legacyPadding)}px`;
  style.paddingLeft = `${boxSide(s.padding, 'left', legacyPadding)}px`;
  style.paddingRight = `${boxSide(s.padding, 'right', legacyPadding)}px`;

  style.marginTop = `${boxSide(s.margin, 'top', 0)}px`;
  style.marginBottom = `${boxSide(s.margin, 'bottom', 0)}px`;
  style.marginLeft = `${boxSide(s.margin, 'left', 0)}px`;
  style.marginRight = `${boxSide(s.margin, 'right', 0)}px`;

  style.boxSizing = 'border-box';
  style.width = s.fullWidth ? '100%' : (s.width != null && s.width !== '' ? (cssDimension(s.width) || '100%') : '100%');
  const marginValue = side => Number(s.margin?.[side] ?? s.margin?.all ?? 0);
  const hasExplicitHorizontalMargin = [marginValue('left'), marginValue('right')].some(value => Number.isFinite(value) && value !== 0);
  const applySectionAlignment = () => {
    if (hasExplicitHorizontalMargin) return;
    if (s.sectionAlign === 'left') {
      style.marginLeft = '0';
      style.marginRight = 'auto';
    } else if (s.sectionAlign === 'right') {
      style.marginLeft = 'auto';
      style.marginRight = '0';
    } else {
      style.marginLeft = 'auto';
      style.marginRight = 'auto';
    }
  };
  applySectionAlignment();
  if (s.fullWidth) style.maxWidth = 'none';
  else if (s.maxWidth != null && s.maxWidth !== '') {
    const maxWidth = Number(s.maxWidth);
    if (Number.isFinite(maxWidth)) style.maxWidth = `${maxWidth}px`;
    applySectionAlignment();
  }
  if (s.height != null && s.height !== '') style.height = cssDimension(s.height) || undefined;
  if (s.minHeight != null && s.minHeight !== '') style.minHeight = cssDimension(s.minHeight) || undefined;
  if (s.overflow) style.overflow = s.overflow;
  if (s.zIndex != null && Number.isFinite(Number(s.zIndex))) {
    style.position = 'relative';
    style.zIndex = Number(s.zIndex);
  }
  if (s.textAlign) style.textAlign = s.textAlign;
  if (s.borderWidth) {
    style.borderWidth = `${Number(s.borderWidth)}px`;
    style.borderStyle = s.borderStyle || 'solid';
    style.borderColor = s.borderColor || TOKEN_COLORS.border[s.borderColorToken] || '#000000';
  }
  if (s.borderRadius != null) style.borderRadius = `${Number(s.borderRadius)}px`;
  else if (s.borderRadiusToken === 'base') style.borderRadius = 'var(--page-base-radius)';
  const shadows = {
    sm: '0 1px 3px rgba(15, 23, 42, 0.12)',
    md: '0 4px 10px rgba(15, 23, 42, 0.14)',
    lg: '0 10px 24px rgba(15, 23, 42, 0.16)',
    xl: '0 18px 40px rgba(15, 23, 42, 0.18)',
  };
  if (shadows[s.boxShadow]) style.boxShadow = shadows[s.boxShadow];

  const typography = s.typography || {};
  const typographyClasses = [];
  const textStyle = (property, value) => {
    style[property] = value;
    style[`--page-section-${property}`] = value;
    typographyClasses.push(TYPOGRAPHY_CLASSES[property]);
  };
  if (typography.fontFamily && typography.fontFamily !== 'inherit') {
    textStyle('fontFamily', FONT_STACKS[typography.fontFamily] || FONT_STACKS.system);
  }
  if (typography.fontSize != null) textStyle('fontSize', `${Number(typography.fontSize)}px`);
  if (typography.lineHeight != null) textStyle('lineHeight', Number(typography.lineHeight));
  if (typography.letterSpacing != null) textStyle('letterSpacing', `${Number(typography.letterSpacing)}px`);
  if (typography.fontWeight != null) textStyle('fontWeight', Number(typography.fontWeight));

  const media = s.media || {};
  const mediaClassNames = [];
  const mediaStyle = (value, variable, className) => {
    const css = cssDimension(value);
    if (!css) return;
    style[variable] = css;
    mediaClassNames.push(className);
  };
  mediaStyle(media.width, '--page-builder-media-width', 'page-section-media-width');
  mediaStyle(media.height, '--page-builder-media-height', 'page-section-media-height');
  mediaStyle(media.maxWidth, '--page-builder-media-max-width', 'page-section-media-max-width');
  mediaStyle(media.maxHeight, '--page-builder-media-max-height', 'page-section-media-max-height');
  if (media.aspectRatio && media.aspectRatio !== 'auto') {
    style['--page-builder-media-aspect-ratio'] = media.aspectRatio.replace(/\s+/g, '');
    mediaClassNames.push('page-section-media-aspect-ratio');
  }
  if (['cover', 'contain', 'fill', 'none', 'scale-down'].includes(media.objectFit)) {
    style['--page-builder-media-object-fit'] = media.objectFit;
    mediaClassNames.push('page-section-media-object-fit');
  }
  if (typeof media.objectPosition === 'string' && media.objectPosition) {
    style['--page-builder-media-object-position'] = media.objectPosition;
    mediaClassNames.push('page-section-media-object-position');
  }
  const hasMediaSizing = [media.width, media.height, media.maxWidth, media.maxHeight]
    .some(value => value != null && value !== '') || (media.aspectRatio && media.aspectRatio !== 'auto');
  if (['left', 'center', 'right'].includes(media.align) && (media.align !== 'center' || hasMediaSizing)) {
    mediaClassNames.push(`page-section-media-align-${media.align}`);
  }
  const mediaRadius = cssDimension(media.borderRadius);
  if (mediaRadius) {
    style['--page-builder-media-border-radius'] = mediaRadius;
    mediaClassNames.push('page-section-media-border-radius');
  }
  if (media.opacity != null && Number.isFinite(Number(media.opacity))) {
    style['--page-builder-media-opacity'] = Math.min(1, Math.max(0, Number(media.opacity)));
    mediaClassNames.push('page-section-media-opacity');
  }

  const className = [
    `page-section-variant-${variant}`,
    ...typographyClasses,
    ...mediaClassNames,
    s.customClass,
    selectable ? 'page-builder-selectable' : '',
    selected ? 'page-builder-selected' : '',
  ].filter(Boolean).join(' ') || undefined;
  return (
    <div
      style={style}
      className={className}
      id={s.anchorId || undefined}
      data-section-id={section.id}
      data-component-variant={variant}
      data-builder-selectable={selectable ? 'true' : undefined}
      data-builder-selected={selected ? 'true' : undefined}
      onClick={selectable ? event => { event.preventDefault(); event.stopPropagation(); onSelect?.(); } : undefined}
    >
      {children}
    </div>
  );
}
