import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import API from '../../services/api';
import PageRenderer from '../../components/page/PageRenderer';
import Navbar from '../../components/customer/Navbar';
import Footer from '../../components/customer/Footer';

export default function PreviewPage() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const token = search.get('token');
  const requestedDevice = search.get('device');
  const [device, setDevice] = useState(['desktop', 'tablet', 'mobile'].includes(requestedDevice) ? requestedDevice : 'desktop');
  const isVendorPage = search.get('vendor') === '1';
  const [page, setPage] = useState(null);
  const [layout, setLayout] = useState({ sections: [] });
  const [mobileLayout, setMobileLayout] = useState(null);
  const [mobileLayoutMode, setMobileLayoutMode] = useState('auto');
  const [pageSettings, setPageSettings] = useState({});
  const [selectedSectionId, setSelectedSectionId] = useState(null);
  const [error, setError] = useState('');
  const bridgeReceived = useRef(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    API.get(`${isVendorPage ? '/vendor/pages/' : '/admin/pages/'}${id}`, { headers: token ? { 'x-preview-token': token } : {} })
      .then(r => {
        if (cancelled || bridgeReceived.current) return;
        const p = r.data?.page;
        setPage(p);
        setLayout(p?.draftLayout || { sections: [] });
        setMobileLayout(p?.mobileLayout || null);
        setMobileLayoutMode(p?.mobileLayoutMode || 'auto');
        setPageSettings(p?.pageSettings || {});
      })
      .catch(e => { if (!cancelled && !bridgeReceived.current) setError(e.message || 'Failed to load preview'); });
    return () => { cancelled = true; };
  }, [id, token, isVendorPage]);

  useEffect(() => {
    if (!id || search.get('editor') !== '1') return;
    const onMessage = (e) => {
      if (e.origin !== window.location.origin || e.source !== window.parent || e.data?.pageId !== id) return;
      if (e.data?.type === 'page-builder:layout') {
        bridgeReceived.current = true;
        setError('');
        if (e.data.page) setPage(e.data.page);
        if (['desktop', 'tablet', 'mobile'].includes(e.data.device)) setDevice(e.data.device);
        setLayout(e.data.layout || { sections: [] });
        if ('mobileLayout' in e.data) setMobileLayout(e.data.mobileLayout);
        if ('mobileLayoutMode' in e.data) setMobileLayoutMode(e.data.mobileLayoutMode || 'auto');
        if ('pageSettings' in e.data) setPageSettings(e.data.pageSettings || {});
        if ('selectedSectionId' in e.data) setSelectedSectionId(e.data.selectedSectionId || null);
      }
    };
    window.addEventListener('message', onMessage);
    window.parent.postMessage({ type: 'page-builder:ready' }, window.location.origin);
    return () => window.removeEventListener('message', onMessage);
  }, [id, search]);

  const onSelectSection = sectionId => window.parent.postMessage({ type: 'page-builder:select-section', sectionId }, window.location.origin);

  const widthClass = useMemo(
    () => device === 'mobile' ? 'max-w-[420px] mx-auto' : device === 'tablet' ? 'max-w-[820px] mx-auto' : '',
    [device]
  );

  const usesSeparateMobileLayout = device === 'mobile' && mobileLayoutMode === 'separate' && mobileLayout;
  const effectiveLayout = usesSeparateMobileLayout
    ? mobileLayout
    : layout;
  const isEmpty = !effectiveLayout?.sections || effectiveLayout.sections.length === 0;
  const kind = page?.kind || 'page';
  const pageStyle = pageSettings.backgroundColor ? { backgroundColor: pageSettings.backgroundColor } : undefined;

  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;
  if (!page) return <div className="p-6 text-sm text-gray-400">Loading preview…</div>;

  // ─── HEADER chrome preview: chrome above, then real Navbar, then placeholder body, then real Footer ───
  if (kind === 'header') {
    return (
      <div className={widthClass} style={pageStyle}>
        {isEmpty ? (
          <ChromeEmpty
            kind="header"
            note="Sections you add here render at the top of every customer page, above the navbar."
          />
        ) : (
          <PageRenderer layout={effectiveLayout} device={device} vendorSlug={page?.vendor?.slug} designSystem={pageSettings.designSystem} selectable={search.get('editor') === '1'} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection} preview={search.get('editor') === '1'} applyResponsiveOverrides={!usesSeparateMobileLayout} />
        )}
        <PreviewLabel position="below">↓ Below: your existing site navbar</PreviewLabel>
        <Navbar />
        <main className="min-h-[40vh] flex items-center justify-center text-gray-300 text-sm">
          (page content)
        </main>
        <Footer />
      </div>
    );
  }

  // ─── FOOTER chrome preview: real Navbar, placeholder body, then chrome above the real Footer ───
  if (kind === 'footer') {
    return (
      <div className={widthClass} style={pageStyle}>
        <Navbar />
        <main className="min-h-[40vh] flex items-center justify-center text-gray-300 text-sm">
          (page content)
        </main>
        <PreviewLabel position="above">↓ Below: your footer chrome</PreviewLabel>
        {isEmpty ? (
          <ChromeEmpty
            kind="footer"
            note="Sections you add here render at the bottom of every customer page, just above the static footer."
          />
        ) : (
          <PageRenderer layout={effectiveLayout} device={device} vendorSlug={page?.vendor?.slug} designSystem={pageSettings.designSystem} selectable={search.get('editor') === '1'} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection} preview={search.get('editor') === '1'} applyResponsiveOverrides={!usesSeparateMobileLayout} />
        )}
        <PreviewLabel position="below">↓ Below: your existing site footer</PreviewLabel>
        <Footer />
      </div>
    );
  }

  // ─── Regular page: mirror the public shell toggles configured in Page settings ───
  return (
    <div className={widthClass} style={pageStyle}>
      {pageSettings.showHeader !== false && <Navbar />}
      <PageRenderer layout={effectiveLayout} device={device} vendorSlug={page?.vendor?.slug} designSystem={pageSettings.designSystem} selectable={search.get('editor') === '1'} selectedSectionId={selectedSectionId} onSelectSection={onSelectSection} preview={search.get('editor') === '1'} applyResponsiveOverrides={!usesSeparateMobileLayout} />
      {pageSettings.showFooter !== false && <Footer />}
    </div>
  );
}

function ChromeEmpty({ kind, note }) {
  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-dashed border-indigo-300 rounded-xl p-8 m-4 text-center">
      <div className="text-indigo-700 font-bold mb-1 uppercase text-xs tracking-wider">{kind} chrome — empty</div>
      <div className="text-gray-700 text-sm mb-1">Choose a widget from <strong>Add Widget</strong> in the editor to start building.</div>
      <div className="text-gray-500 text-xs">{note}</div>
    </div>
  );
}

function PreviewLabel({ children, position }) {
  return (
    <div className={`mx-4 my-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 border-${position === 'above' ? 'b' : 't'} border-dashed border-gray-300 py-1.5`}>
      {children}
    </div>
  );
}
