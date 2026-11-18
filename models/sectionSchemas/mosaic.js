const PRESETS = ['1+2', '2x2', 'L', 'T'];
const { validateGrid, bounded } = require('./grid');

function validateMosaic(data = {}) {
  const tiles = Array.isArray(data.tiles) ? data.tiles : [];
  return {
    ...validateGrid(data),
    preset: PRESETS.includes(data.preset) ? data.preset : '1+2',
    layoutMode: data.layoutMode === 'stack' ? 'stack' : 'preserve',
    aspectRatio: ['21/9', '2/1', '16/9', '3/2', '4/3', '1/1', '4/5'].includes(data.aspectRatio) ? data.aspectRatio : '2/1',
    height: bounded(data.height, null, 80, 2000),
    borderRadius: bounded(data.borderRadius, 12),
    heading: typeof data.heading === 'string' ? data.heading : '',
    tiles: tiles.map(t => ({
      imageUrl: typeof t?.imageUrl === 'string' ? t.imageUrl : '',
      heading: typeof t?.heading === 'string' ? t.heading : '',
      link: typeof t?.link === 'string' ? t.link : '',
      altText: typeof t?.altText === 'string' ? t.altText : '',
      objectFit: ['cover', 'contain', 'fill', 'scale-down'].includes(t?.objectFit) ? t.objectFit : 'cover',
      objectPosition: ['center center', 'top left', 'top center', 'top right', 'center left', 'center right', 'bottom left', 'bottom center', 'bottom right'].includes(t?.objectPosition) ? t.objectPosition : 'center center',
    })),
  };
}
module.exports = { validateMosaic };
