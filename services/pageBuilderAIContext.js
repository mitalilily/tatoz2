const DEFAULT_CAPABILITY = {
  role: 'content',
  solves: [],
  bestFor: [],
  requiredData: [],
  mobileRisk: 'low',
};

// This is deliberately server-owned metadata. The browser can describe the
// available registry, but it must not be able to redefine what a section is
// good for or bypass the planner's safety assumptions.
const SECTION_CAPABILITIES = {
  announcementBar: { role: 'support', solves: ['announce an offer', 'create urgency'], bestFor: ['sale', 'campaign'], requiredData: [], mobileRisk: 'low' },
  hero: { role: 'primary', solves: ['capture attention', 'explain the offer', 'drive the primary action'], bestFor: ['homepage', 'sale', 'launch', 'brand'], requiredData: ['headline', 'cta'], mobileRisk: 'medium' },
  imageBanner: { role: 'primary', solves: ['promote a visual campaign', 'direct attention'], bestFor: ['sale', 'campaign', 'collection'], requiredData: ['image', 'headline'], mobileRisk: 'medium' },
  productsShowcase: { role: 'commerce', solves: ['product discovery', 'conversion', 'cross-sell'], bestFor: ['sale', 'collection', 'homepage'], requiredData: ['product source'], mobileRisk: 'medium' },
  categoriesShowcase: { role: 'commerce', solves: ['category discovery', 'navigation'], bestFor: ['homepage', 'collection'], requiredData: ['categories'], mobileRisk: 'low' },
  brandStrip: { role: 'commerce', solves: ['brand discovery', 'trust'], bestFor: ['homepage', 'collection'], requiredData: ['brands'], mobileRisk: 'low' },
  cardGrid: { role: 'content', solves: ['structured comparison', 'feature discovery'], bestFor: ['collection', 'content'], requiredData: ['cards'], mobileRisk: 'medium' },
  mosaic: { role: 'content', solves: ['editorial discovery', 'visual browsing'], bestFor: ['homepage', 'brand', 'campaign'], requiredData: ['cards'], mobileRisk: 'high' },
  richText: { role: 'content', solves: ['explain details', 'support SEO'], bestFor: ['content', 'policy', 'brand'], requiredData: ['copy'], mobileRisk: 'low' },
  uspRow: { role: 'trust', solves: ['explain benefits', 'reduce hesitation'], bestFor: ['sale', 'homepage', 'product'], requiredData: ['benefits'], mobileRisk: 'low' },
  testimonials: { role: 'trust', solves: ['social proof', 'reduce hesitation'], bestFor: ['sale', 'homepage', 'lead'], requiredData: ['testimonials'], mobileRisk: 'medium' },
  trustBadges: { role: 'trust', solves: ['reassure shoppers', 'reduce checkout anxiety'], bestFor: ['sale', 'product', 'checkout'], requiredData: ['trust badges'], mobileRisk: 'low' },
  newsletter: { role: 'conversion', solves: ['capture leads', 'retain visitors'], bestFor: ['lead', 'content', 'homepage'], requiredData: ['offer or value proposition'], mobileRisk: 'low' },
  buttons: { role: 'conversion', solves: ['provide focused calls to action'], bestFor: ['sale', 'lead', 'content'], requiredData: ['cta label', 'cta link'], mobileRisk: 'low' },
  countdown: { role: 'conversion', solves: ['create urgency'], bestFor: ['sale', 'launch', 'campaign'], requiredData: ['end time'], mobileRisk: 'medium' },
  couponCta: { role: 'conversion', solves: ['make an offer actionable'], bestFor: ['sale', 'campaign'], requiredData: ['coupon or offer'], mobileRisk: 'low' },
  flashSaleBanner: { role: 'conversion', solves: ['highlight a limited-time offer'], bestFor: ['sale', 'campaign'], requiredData: ['offer', 'end time'], mobileRisk: 'medium' },
  contactCta: { role: 'conversion', solves: ['capture enquiries', 'start a sales conversation'], bestFor: ['lead', 'service', 'content'], requiredData: ['contact action'], mobileRisk: 'low' },
  faq: { role: 'support', solves: ['answer objections', 'reduce support load'], bestFor: ['product', 'policy', 'lead'], requiredData: ['questions'], mobileRisk: 'low' },
  shippingBar: { role: 'trust', solves: ['communicate delivery value'], bestFor: ['sale', 'product', 'homepage'], requiredData: ['shipping promise'], mobileRisk: 'low' },
};

const GOAL_LABELS = {
  sale: 'Drive a sale or promotional campaign',
  product_discovery: 'Help shoppers discover products',
  collection: 'Present a collection or category',
  lead: 'Capture leads or enquiries',
  trust: 'Build trust and reduce hesitation',
  content: 'Explain information or tell a brand story',
  launch: 'Launch or announce something new',
  brand: 'Create a premium brand experience',
  general: 'Improve the page toward the user request',
};

function getSectionCapability(type) {
  const capability = SECTION_CAPABILITIES[type] || DEFAULT_CAPABILITY;
  return {
    role: capability.role,
    solves: [...capability.solves],
    bestFor: [...capability.bestFor],
    requiredData: [...capability.requiredData],
    mobileRisk: capability.mobileRisk,
  };
}

function inferPageGoal(prompt = '', page = {}) {
  const value = `${prompt} ${page?.title || ''} ${page?.slug || ''}`.toLowerCase();
  if (/diwali|sale|discount|offer|deal|clearance|coupon|flash sale|% off/.test(value)) return 'sale';
  if (/lead|enquir|contact us|newsletter|signup|sign up|whatsapp/.test(value)) return 'lead';
  if (/testimonial|review|trust|proof|guarantee/.test(value)) return 'trust';
  if (/launch|new product|coming soon|announce/.test(value)) return 'launch';
  if (/premium|editorial|brand experience|brand story/.test(value)) return 'brand';
  if (/blog|about|story|policy|faq|article|guide/.test(value)) return 'content';
  if (/product|products|bestseller|featured|newest|shop now|buy/.test(value)) return 'product_discovery';
  if (/category|collection|catalog|shop by/.test(value)) return 'collection';
  return 'general';
}

function sectionTypes(layout) {
  return (layout?.sections || []).map(section => section.type).filter(Boolean);
}

function catalogSummary(catalogContext = {}) {
  const collections = Array.isArray(catalogContext.collections) ? catalogContext.collections : [];
  const allProducts = collections.find(item => item.key === 'all');
  return {
    scope: catalogContext.scope || 'unknown',
    totalProducts: Number(catalogContext.totalProducts ?? allProducts?.productCount ?? 0),
    featuredProducts: Number(catalogContext.featuredProducts ?? collections.find(item => item.key === 'featured')?.productCount ?? 0),
    categoryCount: Number(catalogContext.categoryCount ?? catalogContext.categories?.length ?? 0),
    brandCount: Number(catalogContext.brandCount ?? catalogContext.brands?.length ?? 0),
    sources: [
      ...collections.map(item => ({ type: 'collection', key: String(item.key), label: String(item.label || item.key), productCount: Number(item.productCount || 0) })),
      ...(catalogContext.categories || []).slice(0, 20).map(item => ({ type: 'category', key: String(item.id), label: String(item.name || ''), productCount: Number(item.productCount || 0) })),
      ...(catalogContext.brands || []).slice(0, 20).map(item => ({ type: 'brand', key: String(item.id), label: String(item.name || ''), productCount: Number(item.productCount || 0) })),
    ].slice(0, 50),
  };
}

function buildPageBuilderContext({ page = {}, layout = { sections: [] }, mobileLayout = null, catalogContext = {}, target = 'desktop', prompt = '' } = {}) {
  const sections = layout?.sections || [];
  const types = sectionTypes(layout);
  const mobileTypes = sectionTypes(mobileLayout);
  const goal = inferPageGoal(prompt, page);
  const separateMobile = Boolean(mobileLayout);
  const mobileMissingTypes = separateMobile
    ? types.filter(type => !mobileTypes.includes(type)).slice(0, 12)
    : [];
  const usedCapabilities = [...new Set(types)].slice(0, 20).map(type => ({ type, capability: getSectionCapability(type) }));
  const risks = [];
  if (['sale', 'launch', 'brand'].includes(goal) && !types.includes('hero')) risks.push('The page has no primary hero section for its campaign goal.');
  if (['sale', 'product_discovery', 'collection'].includes(goal) && !types.includes('productsShowcase')) risks.push('The page has no product showcase for its commerce goal.');
  if (separateMobile && mobileMissingTypes.length) risks.push(`Separate mobile layout is missing: ${mobileMissingTypes.join(', ')}.`);

  return {
    version: 1,
    goal: { key: goal, label: GOAL_LABELS[goal] || GOAL_LABELS.general },
    target,
    page: {
      title: String(page?.title || '').slice(0, 120),
      slug: String(page?.publicSlug || page?.slug || '').slice(0, 160),
      kind: String(page?.kind || 'page'),
    },
    layout: {
      sectionCount: sections.length,
      sectionTypes: types.slice(0, 20),
      order: sections.slice(0, 20).map(section => ({ id: String(section.id || ''), type: String(section.type || ''), role: getSectionCapability(section.type).role })),
      hasHero: types.includes('hero'),
      hasProductsShowcase: types.includes('productsShowcase'),
      hasPrimaryCta: types.some(type => ['hero', 'buttons', 'couponCta', 'contactCta', 'newsletter', 'flashSaleBanner'].includes(type)),
      hasTrustSignals: types.some(type => ['uspRow', 'testimonials', 'trustBadges', 'shippingBar', 'faq'].includes(type)),
      empty: sections.length === 0,
    },
    responsive: {
      mode: separateMobile ? 'separate' : 'auto',
      desktopSectionCount: sections.length,
      mobileSectionCount: mobileTypes.length,
      mobileMissingTypes,
    },
    catalog: catalogSummary(catalogContext),
    usedCapabilities,
    risks,
  };
}

function critiquePageBuilderPlan({ prompt = '', currentLayout = { sections: [] }, nextLayout = { sections: [] }, catalogContext = {}, target = 'desktop', pageContext = null, visualAssetCount = 0 } = {}) {
  const context = pageContext || buildPageBuilderContext({ layout: currentLayout, catalogContext, target, prompt });
  const goal = context.goal?.key || inferPageGoal(prompt);
  const nextTypes = sectionTypes(nextLayout);
  const currentIds = new Set((currentLayout.sections || []).map(section => section.id));
  const nextIds = new Set((nextLayout.sections || []).map(section => section.id));
  const issues = [];
  const strengths = [];
  let score = 100;
  const addIssue = (code, severity, message, suggestion, penalty) => {
    issues.push({ code, severity, message, suggestion });
    score -= penalty;
  };

  if (currentIds.size === nextIds.size && [...currentIds].every(id => nextIds.has(id))
    && JSON.stringify(currentLayout) === JSON.stringify(nextLayout) && !visualAssetCount) {
    addIssue('no_op', 'medium', 'The proposed plan does not change the current preview.', 'Ask for a more specific outcome or explain what is already satisfied.', 15);
  } else {
    strengths.push('The plan produces a concrete change against the current preview.');
  }
  if (['sale', 'launch', 'brand'].includes(goal) && !nextTypes.includes('hero')) {
    addIssue('missing_primary_visual', 'high', 'The campaign goal has no hero or primary visual anchor.', 'Add a hero or image banner with one clear primary action.', 18);
  } else if (['sale', 'launch', 'brand'].includes(goal)) strengths.push('The plan has a primary visual anchor for the campaign.');
  if (['sale', 'product_discovery', 'collection'].includes(goal) && !nextTypes.includes('productsShowcase')) {
    addIssue('missing_product_path', 'high', 'The commerce goal has no product discovery section.', 'Add a Products Showcase using a real catalog source.', 20);
  } else if (['sale', 'product_discovery', 'collection'].includes(goal)) strengths.push('The plan gives shoppers a real product discovery path.');

  const showcase = (nextLayout.sections || []).find(section => section.type === 'productsShowcase');
  const hasCatalog = Number.isFinite(Number(context.catalog?.totalProducts));
  if (showcase && ['category', 'brand'].includes(showcase.data?.collection) && !showcase.data?.collectionRef) {
    addIssue('unresolved_catalog_source', 'high', 'The product showcase references a category or brand without a verified source.', 'Resolve the source against the live catalog before applying.', 25);
  } else if (showcase && hasCatalog && Number(context.catalog.totalProducts) === 0) {
    addIssue('empty_catalog', 'high', 'The selected page has no active products available for a showcase.', 'Ask the user to select a populated source or add products first.', 25);
  } else if (showcase) strengths.push('Product content is grounded in a live catalog path.');

  if ((nextLayout.sections || []).length > 10) addIssue('section_density', 'medium', 'The page is becoming dense and may dilute the primary action.', 'Group or remove low-value sections before applying.', 8);
  if ((currentLayout.sections || []).some(section => !nextIds.has(section.id))) {
    addIssue('content_removal', 'medium', 'The plan removes existing content and needs a deliberate review.', 'Confirm that every removed section is intentionally replaced.', 8);
  }
  if (context.responsive?.mode === 'separate' && target === 'desktop' && context.responsive.mobileMissingTypes.length) {
    addIssue('mobile_gap', 'medium', 'The separate mobile layout does not contain every desktop section.', 'Review mobile intentionally or ask AI to plan the mobile target too.', 8);
  }
  if (Number(visualAssetCount) > 0) strengths.push('Requested visual assets will be verified after approval.');
  if (nextTypes.some(type => ['uspRow', 'testimonials', 'trustBadges', 'shippingBar'].includes(type))) strengths.push('The plan includes a trust or reassurance signal.');

  score = Math.max(0, Math.min(100, score));
  const level = score >= 85 ? 'good' : score >= 70 ? 'review' : 'high_attention';
  return {
    score,
    level,
    summary: `Plan quality: ${score}/100. ${issues.length ? `${issues.length} review item${issues.length === 1 ? '' : 's'} need attention.` : 'No critical review items detected.'}`,
    strengths: strengths.slice(0, 5),
    issues: issues.slice(0, 6),
    checks: {
      goalCovered: !issues.some(issue => ['missing_primary_visual', 'missing_product_path'].includes(issue.code)),
      catalogGrounded: !issues.some(issue => ['unresolved_catalog_source', 'empty_catalog'].includes(issue.code)),
      responsiveReviewed: !issues.some(issue => issue.code === 'mobile_gap'),
      preservesIntent: !issues.some(issue => issue.code === 'no_op'),
    },
  };
}

function critiqueAppliedVisualOutcome(quality = {}, visualChecks = [], warnings = []) {
  const checks = Array.isArray(visualChecks) ? visualChecks : [];
  const warningList = Array.isArray(warnings) ? warnings : [];
  if (!checks.length && !warningList.length) return quality;

  const failedChecks = checks.filter(check => check?.verified !== true);
  const visualFailureCount = failedChecks.length || (warningList.length ? 1 : 0);
  if (!visualFailureCount) {
    return {
      ...quality,
      checks: { ...(quality.checks || {}), visualAssetsVerified: true },
    };
  }

  const score = Math.max(0, Math.min(100, Number(quality.score || 0) - Math.min(45, visualFailureCount * 15)));
  const level = score >= 85 ? 'good' : score >= 70 ? 'review' : 'high_attention';
  const requestedCount = checks.length || visualFailureCount;
  const visualIssue = {
    code: 'visual_assets_unverified',
    severity: 'high',
    message: `Rendered visual verification failed for ${visualFailureCount} of ${requestedCount} requested asset${requestedCount === 1 ? '' : 's'}.`,
    suggestion: 'Retry the image search with a shorter subject query or choose a verified image before publishing.',
  };
  const issues = [visualIssue, ...(quality.issues || [])].slice(0, 6);
  return {
    ...quality,
    score,
    level,
    summary: `Plan quality: ${score}/100. ${issues.length} review item${issues.length === 1 ? '' : 's'} need attention after the rendered visual check.`,
    issues,
    checks: { ...(quality.checks || {}), visualAssetsVerified: false },
  };
}

function fallbackPlanRecommendations({ goal = 'general', quality = {}, visualAssetCount = 0 } = {}) {
  const score = Math.max(0, Math.min(100, Number(quality.score) || 0));
  const commerceGoal = ['sale', 'product_discovery', 'collection'].includes(goal);
  const visualNote = visualAssetCount ? ' Includes a rendered visual-asset check after approval.' : '';
  return [
    {
      key: 'balanced',
      rank: 1,
      title: 'Balanced recommendation',
      summary: 'Keep the requested change focused while preserving the current page structure.',
      tradeoff: 'Best default for safe iteration and predictable review.',
      fitScore: score,
      recommended: true,
    },
    {
      key: 'minimal',
      rank: 2,
      title: 'Minimal-change direction',
      summary: 'Prioritize the smallest patch that satisfies the user request.',
      tradeoff: 'Lower change risk, but it may leave conversion or trust opportunities untouched.',
      fitScore: Math.max(0, score - 2),
      recommended: false,
    },
    {
      key: 'conversion',
      rank: 3,
      title: commerceGoal ? 'Conversion-first direction' : 'Experience-first direction',
      summary: commerceGoal
        ? 'Strengthen the primary action, product discovery path, and shopper reassurance.'
        : 'Strengthen hierarchy, clarity, and the next action for the visitor.',
      tradeoff: `More opinionated and may add supporting structure for a stronger outcome.${visualNote}`,
      fitScore: Math.max(0, score - 4),
      recommended: false,
    },
  ];
}

function normalizePlanRecommendations(value, { goal = 'general', quality = {}, visualAssetCount = 0 } = {}) {
  const fallback = fallbackPlanRecommendations({ goal, quality, visualAssetCount });
  const supplied = Array.isArray(value) ? value : [];
  const allowedKeys = new Set(fallback.map(item => item.key));
  const normalizeFitScore = valueToNormalize => {
    const numeric = Number(valueToNormalize);
    if (!Number.isFinite(numeric)) return 0;
    // Models often return a probability-like score (0.98) even though the
    // UI contract is a percentage out of 100. Normalize that contract once at
    // the server boundary so every client shows 98/100, never 0.98/100.
    const percentage = numeric >= 0 && numeric <= 1 ? numeric * 100 : numeric;
    return Math.round(Math.max(0, Math.min(100, percentage)) * 10) / 10;
  };
  const normalized = supplied
    .filter(item => item && allowedKeys.has(String(item.key)))
    .map(item => ({
      key: String(item.key),
      title: String(item.title || '').trim().slice(0, 100),
      summary: String(item.summary || '').trim().slice(0, 240),
      tradeoff: String(item.tradeoff || item.tradeoffs || '').trim().slice(0, 240),
      fitScore: normalizeFitScore(item.fitScore ?? item.score),
      recommended: item.recommended === true,
    }))
    .filter(item => item.title && item.summary)
    .reduce((result, item) => {
      if (!result.some(existing => existing.key === item.key)) result.push(item);
      return result;
    }, []);
  fallback.forEach(item => {
    if (!normalized.some(existing => existing.key === item.key)) normalized.push(item);
  });
  const ranked = normalized.slice(0, 3).sort((a, b) => (b.recommended - a.recommended) || (b.fitScore - a.fitScore));
  if (ranked.length && !ranked.some(item => item.recommended)) ranked[0].recommended = true;
  return ranked.map((item, index) => ({ ...item, rank: index + 1 }));
}

module.exports = {
  getSectionCapability,
  inferPageGoal,
  buildPageBuilderContext,
  critiquePageBuilderPlan,
  critiqueAppliedVisualOutcome,
  fallbackPlanRecommendations,
  normalizePlanRecommendations,
};
