import { createContext, useContext, useState, useEffect } from 'react';
import { seoAPI } from '../services/api';
import { PLATFORM_NAME, displayPlatformName } from '../constants/branding';

const SEOContext = createContext({ seoConfig: {}, loading: true });

export const useSEO = () => useContext(SEOContext);

export const SEOProvider = ({ children }) => {
  const [seoConfig, setSeoConfig] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    seoAPI.getPublicConfig()
      .then(res => {
        const raw = res.data || {};
        const organization = raw.seo_organization_schema || {};
        const socialProfiles = Array.isArray(raw.seo_social_profiles)
          ? raw.seo_social_profiles
          : (organization.socialProfiles || []);
        const defaultLanguage = raw.seo_default_language || 'en';
        const googleAds = {
          conversionId: raw.google_ads_conversion_id || '',
          purchaseLabel: raw.google_ads_purchase_label || '',
          begin_checkoutLabel: raw.google_ads_begin_checkout_label || '',
          add_to_cartLabel: raw.google_ads_add_to_cart_label || '',
          currency: 'INR',
        };
        window.__tatozGoogleAds = googleAds;
        const organizationSchema = { ...organization, name: displayPlatformName(organization.name) };
        const localBusinessSchema = raw.seo_localbusiness_schema
          ? { ...raw.seo_localbusiness_schema, name: displayPlatformName(raw.seo_localbusiness_schema.name) }
          : {};
        setSeoConfig({
          titleTemplate: displayPlatformName(raw.seo_title_template || `%s | ${PLATFORM_NAME}`),
          metaDescription: raw.seo_meta_description || '',
          canonicalBase: (raw.seo_canonical_base || '').replace(/\/$/, ''),
          robotsDefault: raw.seo_robots_default || 'index, follow',
          noindexPatterns: Array.isArray(raw.seo_noindex_patterns) ? raw.seo_noindex_patterns : [],
          trailingSlash: !!raw.seo_trailing_slash,
          faviconUrl: raw.seo_favicon_url || '',
          og: {
            title: displayPlatformName(raw.seo_og_title || ''),
            description: raw.seo_og_description || '',
            image: raw.seo_og_image || '',
            type: raw.seo_og_type || 'website',
          },
          twitter: {
            card: raw.seo_twitter_card || 'summary_large_image',
            site: raw.seo_twitter_site || '',
          },
          analytics: {
            ga4Id: raw.seo_ga4_id || '',
            gtmId: raw.seo_gtm_id || '',
            fbPixel: raw.seo_fb_pixel || '',
            verificationGoogle: raw.seo_verification_google || '',
          },
          googleAds,
          schemas: {
            organization: { ...organizationSchema, socialProfiles },
            website: raw.seo_website_schema || {},
            localBusinessEnabled: raw.seo_localbusiness_enabled || false,
            localBusiness: localBusinessSchema,
          },
          scripts: {
            customHead: raw.seo_custom_head_scripts || '',
            customBody: raw.seo_custom_body_scripts || '',
          },
          i18n: {
            defaultLanguage,
            hreflangEntries: Array.isArray(raw.seo_hreflang_entries) ? raw.seo_hreflang_entries : [],
          },
          preconnectUrls: Array.isArray(raw.seo_preconnect_urls) ? raw.seo_preconnect_urls : [],
        });
        document.documentElement.lang = defaultLanguage;
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <SEOContext.Provider value={{ seoConfig, loading }}>
      {children}
    </SEOContext.Provider>
  );
};
