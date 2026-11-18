import { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';
import { useSEO } from '../../context/SEOContext';
import { configureMetaPixel, trackMetaPageView } from '../../utils/metaPixel';
import { configureGoogleAnalytics, configureGoogleTagManager, trackGooglePageView } from '../../utils/googleAnalytics';

const removeMarkedNodes = marker => {
  if (typeof document === 'undefined') return;
  document.querySelectorAll(`[${marker}]`).forEach(node => node.remove());
};

const cloneCustomNode = node => {
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  if (node.tagName.toLowerCase() !== 'script') return node.cloneNode(true);

  // Scripts created with innerHTML do not execute. Recreate script elements
  // explicitly so both inline and external custom scripts behave as expected.
  const script = document.createElement('script');
  [...node.attributes].forEach(attribute => script.setAttribute(attribute.name, attribute.value));
  script.textContent = node.textContent || '';
  return script;
};

const injectCustomMarkup = (value, target, marker) => {
  removeMarkedNodes(marker);
  const raw = String(value || '').trim();
  if (!raw || typeof document === 'undefined') return;

  const nodes = [];
  if (!/<\s*[a-z][^>]*>/i.test(raw)) {
    const script = document.createElement('script');
    script.textContent = raw;
    nodes.push(script);
  } else {
    const template = document.createElement('template');
    template.innerHTML = raw;
    template.content.childNodes.forEach(node => {
      const clone = cloneCustomNode(node);
      if (clone) nodes.push(clone);
    });
  }

  nodes.forEach(node => {
    node.setAttribute(marker, 'true');
    target.appendChild(node);
  });
};

const AnalyticsHead = () => {
  const { seoConfig } = useSEO();
  const location = useLocation();
  const { analytics, googleAds, scripts, preconnectUrls } = seoConfig;

  useEffect(() => {
    const marker = 'data-tatoz-seo-body-script';
    injectCustomMarkup(scripts?.customBody, document.body, marker);
    return () => removeMarkedNodes(marker);
  }, [scripts?.customBody]);

  useEffect(() => {
    const marker = 'data-tatoz-seo-head-script';
    injectCustomMarkup(scripts?.customHead, document.head, marker);
    return () => removeMarkedNodes(marker);
  }, [scripts?.customHead]);

  // Load third-party SDKs through effects so the public config is available
  // before bootstrapping and so every script is queued only once in StrictMode.
  useEffect(() => {
    if (analytics === undefined) return;
    configureMetaPixel(analytics?.fbPixel);
    configureGoogleAnalytics({ ga4Id: analytics?.ga4Id, googleAdsId: googleAds?.conversionId });
    configureGoogleTagManager(analytics?.gtmId);
  }, [analytics?.fbPixel, analytics?.ga4Id, analytics?.gtmId, googleAds?.conversionId]);

  // CustomerLayout stays mounted while React Router changes pages. Explicit
  // route events keep GA4, GTM and Meta aligned with SPA navigation.
  useEffect(() => {
    if (!analytics?.fbPixel && !analytics?.ga4Id && !analytics?.gtmId) return undefined;
    const routeKey = `${location.pathname}${location.search}`;
    const timer = window.setTimeout(() => {
      if (analytics?.fbPixel) trackMetaPageView(routeKey);
      trackGooglePageView(routeKey, { ga4Id: analytics?.ga4Id, gtmId: analytics?.gtmId });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [analytics?.fbPixel, analytics?.ga4Id, analytics?.gtmId, location.pathname, location.search]);

  if (!analytics) return null;

  return (
    <>
      <Helmet>
        {analytics.verificationGoogle && (
          <meta name="google-site-verification" content={analytics.verificationGoogle} />
        )}

        {(preconnectUrls || []).map((url, i) => (
          <link key={i} rel="preconnect" href={url} />
        ))}
      </Helmet>

      {/* GTM's no-JavaScript fallback. The normal GTM loader is bootstrapped
          above, while this iframe remains available for supported crawlers. */}
      {analytics.gtmId && (
        <noscript data-tatoz-gtm-noscript="true">
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${analytics.gtmId}`}
            height="0" width="0" style={{ display: 'none', visibility: 'hidden' }}
            title="GTM"
          />
        </noscript>
      )}
    </>
  );
};

export default AnalyticsHead;
