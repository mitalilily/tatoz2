import { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectSection } from '../../../store/slices/pageBuilderSlice';
import { setPreviewCritique } from '../../../store/slices/pageBuilderSlice';
import { inspectPreviewDocument } from './previewCritic';

const VIEWPORTS = { desktop: 1440, tablet: 820, mobile: 390 };

export default function PreviewFrame() {
  const dispatch = useDispatch();
  const iframeRef = useRef(null);
  const canvasRef = useRef(null);
  const [bounds, setBounds] = useState({ width: 0, height: 700 });
  const page = useSelector(s => s.pageBuilder.page);
  const pageId = useSelector(s => s.pageBuilder.pageId);
  const layout = useSelector(s => s.pageBuilder.layout);
  const mobileLayout = useSelector(s => s.pageBuilder.mobileLayout);
  const mobileLayoutMode = useSelector(s => s.pageBuilder.page?.mobileLayoutMode || 'auto');
  const device = useSelector(s => s.pageBuilder.device);
  const isVendorPage = useSelector(s => s.pageBuilder.page?.scope === 'vendor');
  const selectedSectionId = useSelector(s => s.pageBuilder.selectedSectionId);
  const pageSettings = page?.pageSettings;
  const stateRef = useRef(null);
  stateRef.current = {
    type: 'page-builder:layout', pageId, layout, mobileLayout, mobileLayoutMode,
    pageSettings, selectedSectionId, device,
    page: { _id: pageId, kind: page?.kind, vendor: page?.vendor, scope: page?.scope },
  };
  const sendState = () => iframeRef.current?.contentWindow?.postMessage(stateRef.current, window.location.origin);

  const runCritique = () => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument?.body) return;
    const result = inspectPreviewDocument(iframe.contentDocument, { device });
    if (result) dispatch(setPreviewCritique(result));
  };

  useEffect(() => {
    const onMessage = event => {
      // Each editor talks only to its own iframe, including when multiple
      // tabs have the same page open with different unsaved documents.
      if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type === 'page-builder:ready') sendState();
      if (event.data?.type === 'page-builder:select-section' && event.data.sectionId) {
        dispatch(selectSection(event.data.sectionId));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [dispatch]);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setBounds(entry.contentRect));
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [pageId]);

  useEffect(() => { sendState(); }, [pageId, layout, mobileLayout, mobileLayoutMode, pageSettings, selectedSectionId, device]);

  // Lightweight DOM checks only. Rasterizing the entire page after each edit
  // blocks typing and piles up expensive screenshot jobs on device switches.
  useEffect(() => {
    if (!pageId) return undefined;
    const timer = setTimeout(runCritique, 650);
    return () => clearTimeout(timer);
  }, [pageId, layout, mobileLayout, mobileLayoutMode, pageSettings, device]);

  if (!pageId) return null;
  const width = VIEWPORTS[device] || VIEWPORTS.desktop;
  const scale = bounds.width > 0 ? Math.min(1, bounds.width / width) : 1;
  const height = Math.max(200, bounds.height / scale);

  return (
    <div data-testid="page-builder-preview-frame" className="flex-1 min-w-0 bg-gray-100 flex flex-col p-4">
      <div className="text-[11px] text-gray-500 flex justify-between mb-2">
        <span>{device[0].toUpperCase() + device.slice(1)} · {width}px</span>
        <span>Fit {Math.round(scale * 100)}%</span>
      </div>
      <div ref={canvasRef} className="flex-1 min-h-0 overflow-hidden flex justify-center">
      <div className="relative bg-white rounded-md shadow ring-1 ring-gray-200 overflow-hidden shrink-0" style={{ width: width * scale, height: bounds.height }}>
        <iframe
          ref={iframeRef}
          title="preview"
          src={`/preview/${pageId}?editor=1${isVendorPage ? '&vendor=1' : ''}`}
          onLoad={sendState}
          style={{ width, height, maxWidth: 'none', border: 0, transform: `scale(${scale})`, transformOrigin: 'top left' }}
        />
      </div>
      </div>
    </div>
  );
}
