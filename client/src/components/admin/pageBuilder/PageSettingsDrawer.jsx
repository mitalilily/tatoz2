import { useDispatch, useSelector } from 'react-redux';
import { X } from 'lucide-react';
import { updatePageMeta } from '../../../store/slices/pageBuilderSlice';
import { adminPageAPI } from '../../../services/api';
import { Field, TextInput, TextArea, Select, Checkbox, ImagePicker, NumberInput, SuffixInput } from './inputs';
import { DEFAULT_DESIGN_SYSTEM } from '../../page/designSystem';

export default function PageSettingsDrawer({ open, onClose }) {
  const dispatch = useDispatch();
  const page = useSelector(s => s.pageBuilder.page);
  if (!open || !page) return null;

  const onUpload = async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('type', file.type.startsWith('video/') ? 'pageVideo' : 'pageImage');
    const res = file.type.startsWith('video/')
      ? await adminPageAPI.uploadMedia(fd)
      : await adminPageAPI.uploadImage(fd);
    return res.data?.url;
  };

  const seo = page.seo || {};
  const ps = page.pageSettings || {};
  const ds = { ...DEFAULT_DESIGN_SYSTEM, ...(ps.designSystem || {}) };
  const updateDesignSystem = patch => dispatch(updatePageMeta({ pageSettings: { designSystem: { ...ds, ...patch } } }));

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="absolute right-0 top-0 bottom-0 w-[420px] bg-white shadow-xl border-l border-gray-200 overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="text-lg font-bold">Page settings</h2>
          <button data-testid="page-builder-close-settings" onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <div className="p-5">
          {page.kind === 'header' && (
            <div className="bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-md px-3 py-2 mb-4 text-xs">
              You're editing the <strong>site header</strong>. Sections you add here render at the top of every customer page, above the navbar.
            </div>
          )}
          {page.kind === 'footer' && (
            <div className="bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-md px-3 py-2 mb-4 text-xs">
              You're editing the <strong>site footer</strong>. Sections you add here render at the bottom of every customer page, just above the static footer.
            </div>
          )}

          <div className="text-xs font-semibold uppercase tracking-wide text-gray-700 mb-2">Basics</div>
          <Field label="Title">
            <TextInput value={page.title || ''} onChange={e => dispatch(updatePageMeta({ title: e.target.value }))} />
          </Field>
          {(!page.kind || page.kind === 'page') && (
            <Field label="Slug (URL path)">
              <TextInput
                value={page.scope === 'vendor' ? '/' : (page.slug || '')}
                onChange={e => dispatch(updatePageMeta({ slug: e.target.value }))}
                placeholder="/about"
                disabled={!!page.isHomepage || page.scope === 'vendor'}
              />
              {page.isHomepage && <span className="text-[11px] text-gray-400">Homepage slug is locked to <code>/</code></span>}
              {page.scope === 'vendor' && <span className="text-[11px] text-gray-400">Vendor landing page URL is fixed to the store root.</span>}
            </Field>
          )}

          {(!page.kind || page.kind === 'page') && (
            <>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-700 mb-2 mt-5">SEO</div>
              <Field label="Meta title"><TextInput value={seo.metaTitle || ''} onChange={e => dispatch(updatePageMeta({ seo: { metaTitle: e.target.value } }))} /></Field>
              <Field label="Meta description"><TextArea value={seo.metaDescription || ''} onChange={e => dispatch(updatePageMeta({ seo: { metaDescription: e.target.value } }))} /></Field>
              <Field label="OG image"><ImagePicker value={seo.ogImage || ''} onUpload={onUpload} onChange={url => dispatch(updatePageMeta({ seo: { ogImage: url } }))} /></Field>
              <Field label="Canonical URL"><TextInput value={seo.canonical || ''} placeholder="https://your-domain.com/about" onChange={e => dispatch(updatePageMeta({ seo: { canonical: e.target.value } }))} /></Field>
              <Field label="Robots"><Select value={seo.robots || 'index, follow'} onChange={e => dispatch(updatePageMeta({ seo: { robots: e.target.value } }))} options={[{ value: 'index, follow', label: 'Index, Follow' }, { value: 'noindex, follow', label: 'Noindex, Follow' }, { value: 'noindex, nofollow', label: 'Noindex, Nofollow' }]} /></Field>
            </>
          )}

          <div className="text-xs font-semibold uppercase tracking-wide text-gray-700 mb-2 mt-5">Layout</div>
          <Checkbox label="Show site header" checked={ps.showHeader !== false} onChange={e => dispatch(updatePageMeta({ pageSettings: { showHeader: e.target.checked } }))} />
          <Checkbox label="Show site footer" checked={ps.showFooter !== false} onChange={e => dispatch(updatePageMeta({ pageSettings: { showFooter: e.target.checked } }))} />
          <Field label="Page background color">
            <input type="color" value={ps.backgroundColor || '#ffffff'} onChange={e => dispatch(updatePageMeta({ pageSettings: { backgroundColor: e.target.value } }))} className="h-9 w-16 cursor-pointer rounded border border-gray-300" />
            {ps.backgroundColor && <button onClick={() => dispatch(updatePageMeta({ pageSettings: { backgroundColor: '' } }))} className="ml-3 text-xs text-red-600">Clear</button>}
          </Field>

          <div data-testid="page-builder-design-system" className="mt-5 border-t border-gray-100 pt-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-700 mb-2">Design system</div>
            <p className="mb-3 text-[11px] leading-4 text-gray-500">Shared tokens power section presets and keep the page visually consistent.</p>
            <div className="grid grid-cols-2 gap-3">
              {[['primaryColor', 'Primary'], ['accentColor', 'Accent'], ['textColor', 'Text'], ['mutedTextColor', 'Muted text'], ['surfaceColor', 'Surface'], ['borderColor', 'Border']].map(([key, label]) => (
                <Field key={key} label={label}>
                  <input data-testid={`page-builder-token-${key}`} type="color" value={ds[key]} onChange={e => updateDesignSystem({ [key]: e.target.value })} className="h-9 w-full cursor-pointer rounded border border-gray-300" />
                </Field>
              ))}
            </div>
            <div className="mt-3 space-y-3">
              <Field label="Heading font">
                <Select value={ds.headingFont} onChange={e => updateDesignSystem({ headingFont: e.target.value })} options={[{ value: 'system', label: 'Platform sans (Inter)' }, { value: 'serif', label: 'Editorial serif' }, { value: 'mono', label: 'Monospace' }]} />
              </Field>
              <Field label="Body font">
                <Select value={ds.bodyFont} onChange={e => updateDesignSystem({ bodyFont: e.target.value })} options={[{ value: 'system', label: 'Platform sans (Inter)' }, { value: 'serif', label: 'Editorial serif' }, { value: 'mono', label: 'Monospace' }]} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Base radius">
                  <SuffixInput suffix="px" min={0} max={48} value={ds.baseRadius} onChange={e => updateDesignSystem({ baseRadius: Number(e.target.value) || 0 })} />
                </Field>
                <Field label="Content width">
                  <NumberInput min={640} max={1920} step={10} value={ds.contentWidth} onChange={e => updateDesignSystem({ contentWidth: Number(e.target.value) || 1200 })} />
                </Field>
              </div>
            </div>
          </div>

          <div className="text-xs font-semibold uppercase tracking-wide text-gray-700 mb-2 mt-5">Mobile</div>
          <Field label="Mobile layout mode">
            <Select data-testid="page-builder-mobile-layout-mode" value={page.mobileLayoutMode || 'auto'} onChange={e => dispatch(updatePageMeta({ mobileLayoutMode: e.target.value }))}
              options={[
                { value: 'auto', label: 'Shared layout — desktop with responsive overrides' },
                { value: 'separate', label: 'Build a separate mobile layout' },
              ]} />
          </Field>
          <p className="text-xs text-gray-500">Shared mode keeps the same sections and order across devices. Mobile/tablet controls override only the values you change. Separate mode keeps an independent mobile document.</p>
        </div>
      </aside>
    </div>
  );
}
