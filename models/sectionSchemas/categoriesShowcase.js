const LAYOUTS = ['circle', 'square', 'banner'];

const { validateGrid } = require('./grid');
function validateCategoriesShowcase(data = {}) {
  return {
    ...validateGrid(data),
    heading: typeof data.heading === 'string' ? data.heading : '',
    categoryIds: Array.isArray(data.categoryIds) ? data.categoryIds.filter(id => typeof id === 'string') : [],
    layout: LAYOUTS.includes(data.layout) ? data.layout : 'circle',
  };
}
module.exports = { validateCategoriesShowcase };
