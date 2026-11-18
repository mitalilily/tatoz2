const { validateGrid } = require('./grid');
function validateCardGrid(data = {}) {
  const cards = Array.isArray(data.cards) ? data.cards : [];
  return {
    ...validateGrid(data, 3),
    cardStyle: ['overlay', 'belowImage', 'imageOnly'].includes(data.cardStyle) ? data.cardStyle : 'belowImage',
    heading: typeof data.heading === 'string' ? data.heading : '',
    cards: cards.map(c => ({
      imageUrl: typeof c?.imageUrl === 'string' ? c.imageUrl : '',
      heading: typeof c?.heading === 'string' ? c.heading : '',
      subtext: typeof c?.subtext === 'string' ? c.subtext : '',
      link: typeof c?.link === 'string' ? c.link : '',
    })),
  };
}
module.exports = { validateCardGrid };
