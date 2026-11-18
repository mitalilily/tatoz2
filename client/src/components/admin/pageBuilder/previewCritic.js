function isVisible(element, win) {
  if (!element) return false;
  const style = win?.getComputedStyle?.(element);
  if (style && (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0)) return false;
  const rect = element.getBoundingClientRect?.();
  return !rect || (rect.width > 0 && rect.height > 0);
}

function issue(code, severity, message, suggestion) {
  return { code, severity, message, suggestion };
}

export function inspectPreviewDocument(doc, { device = 'desktop' } = {}) {
  if (!doc?.documentElement) return null;
  const win = doc.defaultView;
  const root = doc.documentElement;
  const body = doc.body;
  const viewportWidth = Math.round(win?.innerWidth || root.clientWidth || 0);
  const viewportHeight = Math.round(win?.innerHeight || root.clientHeight || 0);
  const contentWidth = Math.max(root.scrollWidth || 0, body?.scrollWidth || 0);
  const sections = [...doc.querySelectorAll('[data-section-id]')];
  const images = [...doc.images];
  const visibleSections = sections.filter(section => isVisible(section, win));
  const failedImages = images.filter(image => image.complete && image.naturalWidth === 0 && isVisible(image, win));
  const emptySections = visibleSections.filter(section => {
    const hasText = String(section.textContent || '').replace(/\s+/g, ' ').trim().length > 0;
    const hasVisual = section.querySelector('img, video, svg, canvas, iframe, [role="img"]');
    return !hasText && !hasVisual;
  });
  const clippedSections = visibleSections.filter(section => {
    const rect = section.getBoundingClientRect?.();
    return rect && (rect.left < -4 || rect.right > viewportWidth + 4);
  });
  const issues = [];
  let score = 100;

  if (viewportWidth > 0 && contentWidth > viewportWidth + 4) {
    score -= 25;
    issues.push(issue(
      'horizontal_overflow',
      'high',
      'The rendered preview is wider than the current viewport.',
      'Remove fixed widths or make the affected section fluid on this breakpoint.',
    ));
  }
  if (failedImages.length) {
    score -= Math.min(25, failedImages.length * 10);
    issues.push(issue(
      'broken_images',
      'high',
      `${failedImages.length} visible image${failedImages.length === 1 ? '' : 's'} failed to load.`,
      'Replace the asset URL or use a verified image result before publishing.',
    ));
  }
  if (emptySections.length) {
    score -= Math.min(20, emptySections.length * 5);
    issues.push(issue(
      'empty_sections',
      'medium',
      `${emptySections.length} visible section${emptySections.length === 1 ? '' : 's'} look empty in the rendered preview.`,
      'Check section data, visibility rules, and the selected catalog source.',
    ));
  }
  if (clippedSections.length) {
    score -= Math.min(15, clippedSections.length * 5);
    issues.push(issue(
      'clipped_sections',
      'medium',
      `${clippedSections.length} section${clippedSections.length === 1 ? '' : 's'} extend beyond the viewport.`,
      'Review responsive padding, card widths, and long text at this breakpoint.',
    ));
  }

  score = Math.max(0, Math.min(100, score));
  const level = score >= 90 ? 'good' : score >= 75 ? 'review' : 'high_attention';
  return {
    version: 1,
    capturedAt: new Date().toISOString(),
    device,
    status: issues.length ? 'needs_review' : 'healthy',
    score,
    level,
    summary: issues.length
      ? `${issues.length} rendered preview issue${issues.length === 1 ? '' : 's'} need review.`
      : 'Rendered preview passed the first visual health checks.',
    viewport: { width: viewportWidth, height: viewportHeight },
    screenshot: { captured: false },
    metrics: {
      sectionCount: visibleSections.length,
      imageCount: images.length,
      failedImages: failedImages.length,
      emptySections: emptySections.length,
      clippedSections: clippedSections.length,
      contentWidth,
    },
    issues: issues.slice(0, 6),
  };
}
