const STYLES = ['solid', 'outline', 'ghost'];
const SIZES = ['sm', 'md', 'lg'];

function validateButtons(data = {}) {
  const buttons = Array.isArray(data.buttons) ? data.buttons : [];
  return {
    align: ['left', 'center', 'right'].includes(data.align) ? data.align : 'center',
    heading: typeof data.heading === 'string' ? data.heading : '',
    buttons: buttons.map(b => ({
      label: typeof b?.label === 'string' ? b.label : '',
      link: typeof b?.link === 'string' ? b.link : '',
      style: STYLES.includes(b?.style) ? b.style : 'solid',
      size: SIZES.includes(b?.size) ? b.size : 'md',
    })),
  };
}
module.exports = { validateButtons };
