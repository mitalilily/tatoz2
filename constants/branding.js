const PLATFORM_NAME = 'Tatoz India';
const PLATFORM_SHORT_NAME = 'Tatoz';

const displayPlatformName = value => {
  const text = String(value || '').trim();
  if (!text || /tatoz/i.test(text)) return text ? text.replace(/tatoz/gi, PLATFORM_NAME) : PLATFORM_NAME;
  return text;
};

module.exports = { PLATFORM_NAME, PLATFORM_SHORT_NAME, displayPlatformName };
