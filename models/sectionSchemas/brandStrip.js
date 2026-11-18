function validateBrandStrip(data = {}) {
  return {
    heading: typeof data.heading === 'string' ? data.heading : '',
    brandIds: Array.isArray(data.brandIds) ? data.brandIds.filter(id => typeof id === 'string') : [],
    style: ['static', 'marquee'].includes(data.style) ? data.style : 'static',
    grayscale: !!data.grayscale,
  };
}
module.exports = { validateBrandStrip };
