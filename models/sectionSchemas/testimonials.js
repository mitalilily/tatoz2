const { validateGrid } = require('./grid');
function validateTestimonials(data = {}) {
  const items = Array.isArray(data.items) ? data.items : [];
  return {
    heading: typeof data.heading === 'string' ? data.heading : '',
    layout: ['grid', 'carousel'].includes(data.layout) ? data.layout : 'grid',
    ...validateGrid(data, 3),
    items: items.map(it => ({
      quote: typeof it?.quote === 'string' ? it.quote : '',
      authorName: typeof it?.authorName === 'string' ? it.authorName : '',
      authorTitle: typeof it?.authorTitle === 'string' ? it.authorTitle : '',
      avatarUrl: typeof it?.avatarUrl === 'string' ? it.avatarUrl : '',
      rating: Number.isFinite(it?.rating) ? Math.max(0, Math.min(5, it.rating)) : 5,
    })),
  };
}
module.exports = { validateTestimonials };
