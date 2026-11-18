const VARIANTS = ['classic', 'split', 'minimal', 'card', 'strip'];
const ASPECT_RATIOS = ['21/9', '16/9', '2.15/1', '2/1', '4/3', '1/1', 'custom'];
const HEIGHT_UNITS = ['vh', 'px', 'rem'];
const TRANSITIONS = ['fade', 'slide'];
const STRIP_DIRECTIONS = ['left', 'right'];

function validateHero(data = {}) {
  const slides = Array.isArray(data.slides) ? data.slides : [];
  const ch = (data.customHeight && typeof data.customHeight === 'object') ? data.customHeight : {};
  const sh = (data.stripHeight && typeof data.stripHeight === 'object') ? data.stripHeight : {};
  const sg = (data.stripGap && typeof data.stripGap === 'object') ? data.stripGap : {};
  return {
    variant: VARIANTS.includes(data.variant) ? data.variant : 'classic',
    aspectRatio: ASPECT_RATIOS.includes(data.aspectRatio) ? data.aspectRatio : '2.15/1',
    customHeight: {
      value: Number.isFinite(ch.value) ? Math.max(10, Math.min(2000, ch.value)) : 60,
      unit: HEIGHT_UNITS.includes(ch.unit) ? ch.unit : 'vh',
    },
    transition: TRANSITIONS.includes(data.transition) ? data.transition : 'fade',
    showArrows: data.showArrows !== false,
    showDots: data.showDots !== false,
    autoplay: !!data.autoplay,
    intervalMs: Number.isFinite(data.intervalMs) ? Math.max(2000, Math.min(20000, data.intervalMs)) : 5000,
    // Strip-variant settings
    stripHeight: {
      value: Number.isFinite(sh.value) ? Math.max(80, Math.min(2000, sh.value)) : 400,
      unit: HEIGHT_UNITS.includes(sh.unit) ? sh.unit : 'px',
    },
    stripGap: {
      value: Number.isFinite(sg.value) ? Math.max(0, Math.min(200, sg.value)) : 8,
      unit: HEIGHT_UNITS.includes(sg.unit) ? sg.unit : 'px',
    },
    stripSpeed: Number.isFinite(data.stripSpeed) ? Math.max(5, Math.min(180, data.stripSpeed)) : 40,
    stripDirection: STRIP_DIRECTIONS.includes(data.stripDirection) ? data.stripDirection : 'left',
    stripPauseOnHover: data.stripPauseOnHover !== false,
    slides: slides.map(s => ({
      imageUrl: typeof s?.imageUrl === 'string' ? s.imageUrl : '',
      headline: typeof s?.headline === 'string' ? s.headline : '',
      subheadline: typeof s?.subheadline === 'string' ? s.subheadline : '',
      ctaLabel: typeof s?.ctaLabel === 'string' ? s.ctaLabel : '',
      ctaLink: typeof s?.ctaLink === 'string' ? s.ctaLink : '',
      alignment: ['left', 'center', 'right'].includes(s?.alignment) ? s.alignment : 'center',
      overlayOpacity: typeof s?.overlayOpacity === 'number' && s.overlayOpacity >= 0 && s.overlayOpacity <= 1 ? s.overlayOpacity : 0.4,
      bgColor: typeof s?.bgColor === 'string' ? s.bgColor : '',
      textColor: typeof s?.textColor === 'string' ? s.textColor : '',
      imagePosition: ['left', 'right'].includes(s?.imagePosition) ? s.imagePosition : 'left',
    })),
  };
}
module.exports = { validateHero };
