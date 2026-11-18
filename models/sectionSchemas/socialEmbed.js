function validateSocialEmbed(data = {}) {
  return {
    heading: typeof data.heading === 'string' ? data.heading : '',
    embedUrl: typeof data.embedUrl === 'string' ? data.embedUrl : '',
    aspectRatio: ['9/16', '1/1', '16/9', '4/5'].includes(data.aspectRatio) ? data.aspectRatio : '9/16',
    maxWidth: ['narrow', 'normal', 'wide'].includes(data.maxWidth) ? data.maxWidth : 'narrow',
  };
}
module.exports = { validateSocialEmbed };
