const { validateGrid } = require('./grid');
function validateImageGallery(data = {}) {
  const images = Array.isArray(data.images) ? data.images : [];
  return {
    heading: typeof data.heading === 'string' ? data.heading : '',
    layout: ['grid', 'masonry'].includes(data.layout) ? data.layout : 'grid',
    ...validateGrid(data, 3),
    enableLightbox: data.enableLightbox !== false,
    images: images.map(im => ({
      url: typeof im?.url === 'string' ? im.url : '',
      altText: typeof im?.altText === 'string' ? im.altText : '',
    })),
  };
}
module.exports = { validateImageGallery };
