import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { pageAPI } from '../../services/api';
import PageRenderer from '../../components/page/PageRenderer';
import Loader from '../../components/common/Loader';
import SEO from '../../components/common/SEO';
import { usePageFrame } from '../../context/PageFrameContext';
import { useViewportDevice } from '../../hooks/useViewportDevice';


export default function DynamicPage({ slug: forcedSlug }) {
  const { slug: paramSlug } = useParams();
  const [searchParams] = useSearchParams();
  const slug = forcedSlug || (paramSlug ? '/' + paramSlug : '/');
  const previewToken = searchParams.get('token') || '';
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const device = useViewportDevice();
  const { setPageFrame } = usePageFrame();

  useEffect(() => {
    setLoading(true); setNotFound(false); setPage(null);
    const req = slug === '/' ? pageAPI.getHomepage(previewToken) : pageAPI.getBySlug(slug, previewToken);
    req.then(r => setPage(r.data?.page || null))
       .catch(() => setNotFound(true))
       .finally(() => setLoading(false));
  }, [slug, previewToken]);

  const ps = page?.pageSettings || {};
  useEffect(() => {
    setPageFrame({ showHeader: ps.showHeader !== false, showFooter: ps.showFooter !== false });
    return () => setPageFrame();
  }, [setPageFrame, ps.showHeader, ps.showFooter]);

  if (loading) return <div className="min-h-[40vh] flex items-center justify-center"><Loader size="lg" /></div>;
  if (notFound || !page) return <div className="min-h-[40vh] flex items-center justify-center text-gray-500">Page not found</div>;

  const wrapStyle = ps.backgroundColor ? { backgroundColor: ps.backgroundColor } : undefined;
  const usesSeparateMobileLayout = device === 'mobile' && page.mobileLayoutMode === 'separate' && page.mobileLayout;
  const effectiveLayout = usesSeparateMobileLayout
    ? page.mobileLayout
    : page.layout;
  return (
    <div style={wrapStyle} className="min-h-[40vh]">
      <SEO title={page.seo?.metaTitle || page.title} description={page.seo?.metaDescription} ogImage={page.seo?.ogImage} canonical={page.seo?.canonical} />
      <PageRenderer layout={effectiveLayout} device={device} designSystem={ps.designSystem} preview={Boolean(previewToken)} applyResponsiveOverrides={!usesSeparateMobileLayout} />
    </div>
  );
}
