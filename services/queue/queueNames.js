const queueForEvent = type => {
  const value = String(type || '');
  if (value.startsWith('notification')) return 'notifications';
  if (value.startsWith('payment')) return 'payments';
  if (value.startsWith('shipping')) return 'shipping';
  if (value.startsWith('marketplace')) return 'marketplace-sync';
  if (value.startsWith('ai')) return 'ai-generation';
  if (value.startsWith('media')) return 'media-processing';
  if (value.startsWith('abandoned-cart')) return 'abandoned-cart';
  if (value.startsWith('analytics')) return 'analytics-events';
  if (value.startsWith('accounting')) return 'accounting-sync';
  if (value.startsWith('search')) return 'search-index';
  return 'notifications';
};

module.exports = { queueForEvent };
