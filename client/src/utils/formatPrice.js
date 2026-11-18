/**
 * Format a price value using the site's currency settings.
 * Import and use: formatPrice(1299.5, settings) → "₹1,299.50"
 *
 * @param {number} amount
 * @param {object} settings - from useSite().settings
 * @returns {string}
 */
export function formatPrice(amount, settings = {}) {
  const symbol = settings.currencySymbol || '₹';
  const locale = settings.locale || 'en-IN';
  const currency = settings.currency || 'INR';
  const rateFromBase = Number.isFinite(Number(settings.rateFromBase)) ? Number(settings.rateFromBase) : 1;
  const decimals = Number.isInteger(Number(settings.currencyDecimals))
    ? Math.min(4, Math.max(0, Number(settings.currencyDecimals)))
    : 2;
  const convertedAmount = Number.isFinite(Number(amount)) ? Number(amount) * rateFromBase : 0;

  try {
    const formatted = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(convertedAmount);
    return formatted;
  } catch {
    // Fallback if Intl doesn't support the currency
    return `${symbol}${convertedAmount.toFixed(decimals)}`;
  }
}
