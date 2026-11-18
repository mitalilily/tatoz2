function validateSpacer(data = {}) {
  return {
    height: ['xs', 'sm', 'md', 'lg', 'xl', '2xl'].includes(data.height) ? data.height : 'md',
    showRule: !!data.showRule,
  };
}
module.exports = { validateSpacer };
