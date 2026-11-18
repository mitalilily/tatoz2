import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';
import { useSite } from '../../context/SiteContext';
import { useSEO } from '../../context/SEOContext';
import { PLATFORM_NAME, displayPlatformName } from '../../constants/branding';

const matchesNoindexPattern = (pathname, pattern) => {
  if (!pattern || typeof pattern !== 'string') return false;
  const normalizedPath = pathname.replace(/\/$/, '') || '/';
  const normalizedPattern = pattern.trim().replace(/\/$/, '') || '/';
  if (normalizedPattern.endsWith('*')) return normalizedPath.startsWith(normalizedPattern.slice(0, -1));
  return normalizedPath === normalizedPattern;
};

const stripUrlDecorators = value => {
  try {
    const parsed = new URL(value);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch (_) {
    return value;
  }
};

const siteOrigin = baseUrl => {
  try {
    return new URL(baseUrl || window.location.origin).origin;
  } catch (_) {
    return typeof window !== 'undefined' ? window.location.origin : '';
  }
};

const absoluteAssetUrl = (value, baseUrl) => {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/') && baseUrl) return `${siteOrigin(baseUrl)}${value}`;
  return value;
};

const canonicalForPath = (baseUrl, pathname) => {
  if (!baseUrl) return '';
  const base = baseUrl.replace(/\/$/, '');
  const path = pathname === '/' ? '/' : `/${String(pathname || '').replace(/^\/+/, '')}`;
  return stripUrlDecorators(`${base}${path}`);
};

const absoluteCanonicalUrl = (value, baseUrl) => {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return stripUrlDecorators(value);
  if (value.startsWith('/') && baseUrl) return canonicalForPath(baseUrl, value);
  return value;
};

const buildGlobalSchemas = (seoConfig, siteName, canonicalBase) => {
  const schemas = [];
  const organization = seoConfig.schemas?.organization || {};
  const website = seoConfig.schemas?.website || {};
  const baseUrl = canonicalBase || (typeof window !== 'undefined' ? window.location.origin : '');
  const origin = siteOrigin(baseUrl);

  if (organization.name) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: organization.name,
      url: absoluteCanonicalUrl(organization.url, baseUrl) || baseUrl,
      ...(organization.logo ? { logo: absoluteAssetUrl(organization.logo, origin) } : {}),
      ...(organization.contactEmail ? {
        contactPoint: {
          '@type': 'ContactPoint',
          email: organization.contactEmail,
          telephone: organization.contactPhone || undefined,
          contactType: 'customer service',
        },
      } : {}),
      ...(organization.socialProfiles?.length ? { sameAs: organization.socialProfiles } : {}),
    });
  }

  if (baseUrl || website.searchActionUrl) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: siteName,
      url: baseUrl,
      ...(website.searchActionUrl ? {
        potentialAction: {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: website.searchActionUrl },
          'query-input': 'required name=search_term_string',
        },
      } : {}),
    });
  }

  const localBusiness = seoConfig.schemas?.localBusiness || {};
  if (seoConfig.schemas?.localBusinessEnabled && localBusiness.name) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: localBusiness.name,
      ...(localBusiness.address ? {
        address: typeof localBusiness.address === 'string'
          ? { '@type': 'PostalAddress', streetAddress: localBusiness.address }
          : localBusiness.address,
      } : {}),
      ...(localBusiness.phone ? { telephone: localBusiness.phone } : {}),
      ...(localBusiness.openingHours ? { openingHours: localBusiness.openingHours } : {}),
      ...(localBusiness.latitude !== '' && localBusiness.longitude !== '' && localBusiness.latitude != null && localBusiness.longitude != null ? {
        geo: { '@type': 'GeoCoordinates', latitude: Number(localBusiness.latitude), longitude: Number(localBusiness.longitude) },
      } : {}),
    });
  }
  return schemas;
};

const SEO = ({ title, description, keywords, ogImage, ogTitle, ogDescription, ogType, canonical, noindex, robots, breadcrumbs, jsonLd }) => {
  const { settings } = useSite();
  const { seoConfig } = useSEO();
  const location = useLocation();

  const siteName = displayPlatformName(settings?.siteName || PLATFORM_NAME);
  const publicBase = seoConfig.canonicalBase || (typeof window !== 'undefined' ? window.location.origin : '');

  // Build title using the configured site template.
  const template = seoConfig.titleTemplate || '%s | ' + siteName;
  const fullTitle = title
    ? template.replace('%s', title)
    : siteName;

  // Description falls back to global SEO description
  const metaDesc = description || seoConfig.metaDescription || '';

  // Canonical URL
  const configuredPath = seoConfig.trailingSlash && location.pathname !== '/' && !location.pathname.endsWith('/')
    ? `${location.pathname}/`
    : location.pathname;
  const canonicalUrl = absoluteCanonicalUrl(canonical, publicBase)
    || canonicalForPath(publicBase, configuredPath);

  // Robots directive
  const configuredNoindex = (seoConfig.noindexPatterns || []).some(pattern => matchesNoindexPattern(location.pathname, pattern));
  const robotsContent = (noindex || configuredNoindex)
    ? 'noindex, nofollow'
    : (robots || seoConfig.robotsDefault || 'index, follow');

  // OG fallbacks from global config
  const resolvedOgTitle = ogTitle || seoConfig.og?.title || fullTitle;
  const ogDesc = ogDescription || metaDesc || seoConfig.og?.description || '';
  const ogImg = absoluteAssetUrl(ogImage || seoConfig.og?.image || '', publicBase);
  const ogT = ogType || seoConfig.og?.type || 'website';

  // Twitter
  const twitterCard = seoConfig.twitter?.card || 'summary_large_image';
  const twitterSite = seoConfig.twitter?.site || '';

  // Hreflang
  const hreflangEntries = seoConfig.i18n?.hreflangEntries || [];

  // Collect all JSON-LD schemas
  const schemas = [];
  if (jsonLd) {
    if (Array.isArray(jsonLd)) schemas.push(...jsonLd);
    else schemas.push(jsonLd);
  }
  // Auto-generate BreadcrumbList from breadcrumbs prop
  if (breadcrumbs && breadcrumbs.length > 0) {
    const base = publicBase;
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbs.map((item, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: item.name,
      item: item.url ? absoluteCanonicalUrl(item.url, base) : undefined,
      })),
    });
  }

  const existingTypes = new Set(schemas.map(schema => schema?.['@type']));
  buildGlobalSchemas(seoConfig, siteName, publicBase)
    // Product pages provide their own four-schema set; their WebPage schema already
    // references WebSite, so do not add a fifth standalone WebSite block there.
    .filter(schema => !(jsonLd && schema['@type'] === 'WebSite'))
    .filter(schema => !existingTypes.has(schema['@type']))
    .forEach(schema => schemas.push(schema));

  return (
    <Helmet>
      <title>{fullTitle}</title>
      {metaDesc && <meta name="description" content={metaDesc} />}
      {keywords && (
        <meta name="keywords" content={Array.isArray(keywords) ? keywords.join(', ') : keywords} />
      )}
      <meta name="robots" content={robotsContent} />
      {seoConfig.faviconUrl && <link rel="icon" href={absoluteAssetUrl(seoConfig.faviconUrl, publicBase)} />}

      {/* Canonical */}
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}

      {/* Open Graph */}
      <meta property="og:title" content={resolvedOgTitle} />
      <meta property="og:site_name" content={siteName} />
      {ogDesc && <meta property="og:description" content={ogDesc} />}
      <meta property="og:type" content={ogT} />
      {ogImg && <meta property="og:image" content={ogImg} />}
      {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}

      {/* Twitter */}
      <meta name="twitter:card" content={twitterCard} />
      {twitterSite && <meta name="twitter:site" content={twitterSite} />}
      <meta name="twitter:title" content={resolvedOgTitle} />
      {ogDesc && <meta name="twitter:description" content={ogDesc} />}
      {ogImg && <meta name="twitter:image" content={ogImg} />}

      {/* Hreflang */}
      {hreflangEntries.map((entry, i) => (
        <link key={i} rel="alternate" hrefLang={entry.lang} href={entry.url} />
      ))}

      {/* Structured Data */}
      {schemas.map((schema, i) => (
        <script key={i} type="application/ld+json">{JSON.stringify(schema)}</script>
      ))}
    </Helmet>
  );
};

export default SEO;
