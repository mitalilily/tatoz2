const ICONS = ['truck', 'shield', 'headphones', 'rotate', 'clock', 'check', 'gift', 'award', 'sparkles', 'zap'];
const { validateGrid } = require('./grid');

function validateUspRow(data = {}) {
  const items = Array.isArray(data.items) ? data.items : [];
  return {
    ...validateGrid(data, 4),
    items: items.map(it => ({
      icon: ICONS.includes(it?.icon) ? it.icon : 'check',
      heading: typeof it?.heading === 'string' ? it.heading : '',
      subtext: typeof it?.subtext === 'string' ? it.subtext : '',
    })),
  };
}
module.exports = { validateUspRow, ICONS };
