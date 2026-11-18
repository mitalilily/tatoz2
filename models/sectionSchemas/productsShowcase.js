const SOURCES = ['manual', 'collection'];
const { validateGrid } = require('./grid');
const COLLECTIONS = ['featured', 'newest', 'bestsellers', 'all', 'category', 'brand'];
const LAYOUTS = ['horizontalScroll', 'grid', 'carousel'];
const CARD_VARIANTS = ['classic', 'minimal', 'overlay', 'compact', 'editorial'];

function validateProductsShowcase(data = {}) {
  return {
    ...validateGrid(data),
    heading: typeof data.heading === 'string' ? data.heading : '',
    source: SOURCES.includes(data.source) ? data.source : 'collection',
    manualProductIds: Array.isArray(data.manualProductIds) ? data.manualProductIds.filter(id => typeof id === 'string') : [],
    collection: COLLECTIONS.includes(data.collection) ? data.collection : 'featured',
    collectionRef: typeof data.collectionRef === 'string' ? data.collectionRef : null,
    layout: LAYOUTS.includes(data.layout) ? data.layout : 'horizontalScroll',
    cardVariant: CARD_VARIANTS.includes(data.cardVariant) ? data.cardVariant : 'classic',
    count: Number.isFinite(data.count) ? Math.max(1, Math.min(48, data.count)) : 8,
    seeAllLink: typeof data.seeAllLink === 'string' ? data.seeAllLink : '',
  };
}
module.exports = { validateProductsShowcase };
