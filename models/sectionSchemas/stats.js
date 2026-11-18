const { validateGrid } = require('./grid');
function validateStats(data = {}) {
  const items = Array.isArray(data.items) ? data.items : [];
  return {
    heading: typeof data.heading === 'string' ? data.heading : '',
    ...validateGrid(data, 4),
    style: ['plain', 'card', 'split'].includes(data.style) ? data.style : 'plain',
    items: items.map(it => ({
      value: typeof it?.value === 'string' ? it.value : '',
      label: typeof it?.label === 'string' ? it.label : '',
    })),
  };
}
module.exports = { validateStats };
