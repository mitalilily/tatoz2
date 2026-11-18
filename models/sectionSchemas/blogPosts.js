const { validateGrid } = require('./grid');
function validateBlogPosts(data = {}) {
  return {
    heading: typeof data.heading === 'string' ? data.heading : '',
    source: ['recent', 'featured'].includes(data.source) ? data.source : 'recent',
    count: Number.isFinite(data.count) ? Math.max(1, Math.min(12, data.count)) : 3,
    ...validateGrid(data, 3),
    seeAllLink: typeof data.seeAllLink === 'string' ? data.seeAllLink : '/blog',
  };
}
module.exports = { validateBlogPosts };
