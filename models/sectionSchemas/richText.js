function validateRichText(data = {}) {
  return {
    html: typeof data.html === 'string' ? data.html : '',
    align: ['left', 'center', 'right'].includes(data.align) ? data.align : 'left',
    maxWidth: ['narrow', 'normal', 'wide', 'full'].includes(data.maxWidth) ? data.maxWidth : 'normal',
  };
}
module.exports = { validateRichText };
