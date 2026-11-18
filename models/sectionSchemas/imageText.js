function validateImageText(data = {}) {
  return {
    imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : '',
    imagePosition: ['left', 'right'].includes(data.imagePosition) ? data.imagePosition : 'left',
    heading: typeof data.heading === 'string' ? data.heading : '',
    body: typeof data.body === 'string' ? data.body : '',
    ctaLabel: typeof data.ctaLabel === 'string' ? data.ctaLabel : '',
    ctaLink: typeof data.ctaLink === 'string' ? data.ctaLink : '',
  };
}
module.exports = { validateImageText };
