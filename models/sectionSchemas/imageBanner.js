function validateImageBanner(data = {}) {
  return {
    imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : '',
    link: typeof data.link === 'string' ? data.link : '',
    altText: typeof data.altText === 'string' ? data.altText : '',
    fullBleed: !!data.fullBleed,
    aspectRatio: ['auto', 'banner', 'square', 'wide'].includes(data.aspectRatio) ? data.aspectRatio : 'banner',
  };
}
module.exports = { validateImageBanner };
