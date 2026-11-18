/**
 * JSON-LD structured data builders for SEO.
 * Each function returns a plain object ready for JSON.stringify.
 */

export const buildProductSchema = (product, settings, canonicalBase, reviewStats) => {
  const currency = settings?.currency || 'INR';
  const url = product.seo?.canonical || (canonicalBase ? `${canonicalBase}/product/${product.slug}` : '');
  const variantPrices = (product.variants || []).flatMap(variant => (variant.options || []).map(option => (
    option.price !== undefined && option.price !== null
      ? Number(option.price)
      : Number(product.price || 0) + Number(option.priceModifier || 0)
  ))).filter(price => Number.isFinite(price) && price >= 0);
  const image = product.images?.[0]?.url || product.thumbnail || '';
  const availability = product.stock > 0
    ? 'https://schema.org/InStock'
    : 'https://schema.org/OutOfStock';

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.seo?.metaTitle || product.title,
    description: product.seo?.metaDescription || product.shortDescription || product.description?.replace(/<[^>]+>/g, '').substring(0, 300),
    image: image,
    sku: product.sku || product._id,
    url: url,
    offers: variantPrices.length > 1 ? {
      '@type': 'AggregateOffer',
      lowPrice: Math.min(...variantPrices),
      highPrice: Math.max(...variantPrices),
      offerCount: variantPrices.length,
      priceCurrency: currency,
      url,
    } : {
      '@type': 'Offer',
      price: product.price,
      priceCurrency: currency,
      availability: availability,
      url,
    },
  };

  if (product.brand?.name || product.brand) {
    schema.brand = {
      '@type': 'Brand',
      name: typeof product.brand === 'string' ? product.brand : product.brand.name,
    };
  }

  if (product.comparePrice && product.comparePrice > product.price) {
    schema.offers.priceValidUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  }

  if (reviewStats?.averageRating && reviewStats?.totalReviews > 0) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: reviewStats.averageRating,
      reviewCount: reviewStats.totalReviews,
      bestRating: 5,
      worstRating: 1,
    };
  }

  return schema;
};

export const buildOrganizationSchema = (config) => {
  if (!config?.name) return null;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: config.name,
    url: config.url || '',
  };
  if (config.logo) schema.logo = config.logo;
  if (config.contactEmail) {
    schema.contactPoint = {
      '@type': 'ContactPoint',
      email: config.contactEmail,
      contactType: 'customer service',
    };
    if (config.contactPhone) schema.contactPoint.telephone = config.contactPhone;
  }
  if (config.socialProfiles?.length > 0) {
    schema.sameAs = config.socialProfiles;
  }
  return schema;
};
