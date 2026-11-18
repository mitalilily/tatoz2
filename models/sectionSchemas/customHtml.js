function validateCustomHtml(data = {}) {
  return {
    html: typeof data.html === 'string' ? data.html : '',
    allowScripts: !!data.allowScripts,
    maxWidth: ['narrow', 'normal', 'wide', 'full'].includes(data.maxWidth) ? data.maxWidth : 'normal',
  };
}
module.exports = { validateCustomHtml };
