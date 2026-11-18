const crypto = require('crypto');
const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');
const Settings = require('../models/Settings');
const { PLATFORM_NAME, displayPlatformName } = require('../constants/branding');
const { addApprovedProductFilter } = require('../services/productApprovalService');
const { normalizeMerchantSettings } = require('../utils/settingsValidation');

const MERCHANT_KEYS = [
  'google_merchant_enabled',
  'google_merchant_id',
  'google_merchant_feed_key',
  'google_merchant_country',
  'google_merchant_language',
  'google_merchant_currency',
  'google_merchant_brand',
];

const ADS_KEYS = [
  'google_ads_conversion_id',
  'google_ads_purchase_label',
  'google_ads_begin_checkout_label',
  'google_ads_add_to_cart_label',
];

const getCanonicalBase = async (req) => {
  const configured = await Settings.get('seo_canonical_base', '');
  return (configured || process.env.CLIENT_URL || `${req.protocol}://${req.get('host')}` || 'https://tatoz.com').replace(/\/$/, '');
};

const xmlEscape = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const stripHtml = (value) => String(value || '')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const absoluteUrl = (value, base) => {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `${base}/${String(value).replace(/^\//, '')}`;
};

const safeId = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[^a-zA-Z0-9_-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 45) || 'item';

const combinationsFor = (product) => {
  const groups = (product.variants || []).filter(variant => (variant.options || []).some(option => option.value));
  if (!groups.length) return [[]];
  return groups.reduce((combinations, variant) => combinations.flatMap(existing =>
    (variant.options || []).filter(option => option.value).map(option => [...existing, { variant, option }])
  ), [[]]).slice(0, 100);
};

const getProductItems = (product, settings, base) => {
  const productId = product._id.toString();
  const baseId = product.sku || productId;
  const combinations = combinationsFor(product);
  const isVariant = combinations.some(combination => combination.length > 0);

  return combinations.map((combination) => {
    const selectedOptions = combination.map(entry => entry.option);
    const pricedOption = [...selectedOptions].reverse().find(option => option.price !== undefined && option.price !== null);
    const sellingPrice = pricedOption
      ? Number(pricedOption.price)
      : Number(product.price || 0) + selectedOptions.reduce((sum, option) => sum + Number(option.priceModifier || 0), 0);
    const selectedMrp = pricedOption?.comparePrice != null ? Number(pricedOption.comparePrice) : Number(product.comparePrice || 0);
    const regularPrice = selectedMrp > sellingPrice ? selectedMrp : sellingPrice;
    const image = [...selectedOptions].reverse().find(option => option.images?.length)?.images?.[0]?.url;
    const values = combination.map(entry => `${entry.variant.name}: ${entry.option.value}`);
    const suffix = combination.map(entry => safeId(entry.option.value)).join('-');
    const id = isVariant ? `${safeId(baseId)}-${suffix}`.slice(0, 50) : safeId(baseId).slice(0, 50);
    const stock = selectedOptions.length ? Math.min(...selectedOptions.map(option => Number(option.stock ?? product.stock))) : Number(product.stock || 0);
    const attributes = {};
    combination.forEach(({ variant, option }) => {
      const name = String(variant.name || '').toLowerCase();
      if (name.includes('color') || name.includes('colour')) attributes.color = option.value;
      if (name.includes('size')) attributes.size = option.value;
      if (name.includes('material')) attributes.material = option.value;
    });

    return {
      id,
      title: `${product.title}${values.length ? ` - ${values.join(' / ')}` : ''}`.slice(0, 150),
      description: stripHtml(product.shortDescription || product.description || product.title).slice(0, 5000),
      link: absoluteUrl(product.seo?.canonical || `/product/${product.slug}`, base),
      imageLink: absoluteUrl(image || product.thumbnail || product.images?.[0]?.url, base),
      price: regularPrice,
      salePrice: sellingPrice < regularPrice ? sellingPrice : null,
      availability: stock > 0 ? 'in_stock' : 'out_of_stock',
      brand: product.brand || displayPlatformName(settings.google_merchant_brand || PLATFORM_NAME),
      category: product.category?.name || '',
      condition: 'new',
      sku: product.sku || productId,
      itemGroupId: isVariant ? productId : '',
      weight: product.weight,
      ...attributes,
    };
  });
};

const renderItem = (item, settings) => {
  const currency = settings.google_merchant_currency || 'INR';
  const country = settings.google_merchant_country || 'IN';
  const lines = [
    ['g:id', item.id],
    ['g:title', item.title],
    ['g:description', item.description],
    ['g:link', item.link],
    ['g:image_link', item.imageLink],
    ['g:availability', item.availability],
    ['g:price', `${item.price.toFixed(2)} ${currency}`],
    ...(item.salePrice ? [['g:sale_price', `${item.salePrice.toFixed(2)} ${currency}`]] : []),
    ['g:brand', item.brand],
    ['g:condition', item.condition],
    ['g:identifier_exists', 'no'],
    ...(item.category ? [['g:product_type', item.category]] : []),
    ...(item.itemGroupId ? [['g:item_group_id', item.itemGroupId]] : []),
    ...(item.color ? [['g:color', item.color]] : []),
    ...(item.size ? [['g:size', item.size]] : []),
    ...(item.material ? [['g:material', item.material]] : []),
    ...(item.weight ? [['g:shipping_weight', `${Number(item.weight).toFixed(2)} kg`]] : []),
    ['g:shipping', `<g:country>${xmlEscape(country)}</g:country><g:service>Standard</g:service>`],
  ];
  return `    <item>\n${lines.map(([tag, value]) => {
    if (tag === 'g:shipping') {
      return `      <g:shipping><g:country>${xmlEscape(country)}</g:country><g:service>Standard</g:service></g:shipping>`;
    }
    return `      <${tag}>${xmlEscape(value)}</${tag}>`;
  }).join('\n')}\n    </item>`;
};

const getMerchantSettings = async () => {
  const entries = await Settings.find({ key: { $in: [...MERCHANT_KEYS, ...ADS_KEYS] } }).lean();
  return entries.reduce((result, entry) => ({ ...result, [entry.key]: entry.value }), {});
};

const getMerchantSettingsAdmin = asyncHandler(async (req, res) => {
  const settings = await getMerchantSettings();
  const base = await getCanonicalBase(req);
  const feedKey = settings.google_merchant_feed_key || '';
  res.json({
    success: true,
    settings: {
      google_merchant_enabled: !!settings.google_merchant_enabled,
      google_merchant_id: settings.google_merchant_id || '',
      google_merchant_feed_key: feedKey,
      google_merchant_country: settings.google_merchant_country || 'IN',
      google_merchant_language: settings.google_merchant_language || 'en',
      google_merchant_currency: settings.google_merchant_currency || 'INR',
      google_merchant_brand: displayPlatformName(settings.google_merchant_brand || PLATFORM_NAME),
      google_ads_conversion_id: settings.google_ads_conversion_id || '',
      google_ads_purchase_label: settings.google_ads_purchase_label || '',
      google_ads_begin_checkout_label: settings.google_ads_begin_checkout_label || '',
      google_ads_add_to_cart_label: settings.google_ads_add_to_cart_label || '',
      feed_url: `${base}/google-merchant-feed.xml${feedKey ? `?key=${encodeURIComponent(feedKey)}` : '?key=YOUR_FEED_KEY'}`,
    },
  });
});

const updateMerchantSettings = asyncHandler(async (req, res) => {
  const input = req.body?.settings || {};
  const values = normalizeMerchantSettings({ ...input, google_merchant_brand: input.google_merchant_brand || PLATFORM_NAME });
  values.google_merchant_brand = displayPlatformName(values.google_merchant_brand).slice(0, 100);
  await Promise.all(Object.entries(values).map(([key, value]) => Settings.set(key, value, 'google')));
  res.json({ success: true, message: 'Google Shopping settings saved' });
});

const generateFeedKey = asyncHandler(async (req, res) => {
  const key = crypto.randomBytes(24).toString('hex');
  res.json({ success: true, key });
});

const getMerchantFeed = asyncHandler(async (req, res) => {
  const settings = await getMerchantSettings();
  const expectedKey = settings.google_merchant_feed_key || '';
  if (!settings.google_merchant_enabled || !expectedKey || req.query.key !== expectedKey) {
    res.status(404).send('Merchant feed not available');
    return;
  }
  const base = await getCanonicalBase(req);
  const productQuery = { isActive: true };
  addApprovedProductFilter(productQuery);
  const products = await Product.find(productQuery)
    .populate('category', 'name')
    .select('title slug description shortDescription price comparePrice brand sku stock thumbnail images variants category seo weight')
    .limit(Number(process.env.MERCHANT_FEED_MAX_PRODUCTS) || 50000)
    .lean();
  const items = products.flatMap(product => getProductItems(product, settings, base));
  const title = displayPlatformName(settings.google_merchant_brand || PLATFORM_NAME);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n  <channel>\n    <title>${xmlEscape(title)}</title>\n    <link>${xmlEscape(base)}</link>\n    <description>Product feed for Google Merchant Center</description>\n${items.map(item => renderItem(item, settings)).join('\n')}\n  </channel>\n</rss>`;
  res.set('Content-Type', 'application/xml; charset=UTF-8');
  res.set('Cache-Control', 'public, max-age=300');
  res.send(xml);
});

module.exports = {
  getMerchantSettingsAdmin,
  updateMerchantSettings,
  generateFeedKey,
  getMerchantFeed,
};
