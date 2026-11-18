const getGoogleAdsConfig = () => window.__tatozGoogleAds || {};

const normalizeItems = (items = []) => items.map((item) => ({
  item_id: item.item_id || item.product || item._id || '',
  item_name: item.item_name || item.title || '',
  price: Number(item.price || 0),
  quantity: Number(item.quantity || 1),
})).filter((item) => item.item_id);

export const trackGoogleAdsConversion = (eventName, { value = 0, transactionId, items = [] } = {}) => {
  const config = getGoogleAdsConfig();
  const label = config[`${eventName}Label`];
  if (!config.conversionId || !label || typeof window.gtag !== 'function') return false;

  const params = {
    send_to: `${config.conversionId}/${label}`,
    value: Number(value || 0),
    currency: config.currency || 'INR',
  };
  if (transactionId) params.transaction_id = String(transactionId);
  const normalizedItems = normalizeItems(items);
  if (normalizedItems.length) params.items = normalizedItems;
  window.gtag('event', 'conversion', params);
  return true;
};
