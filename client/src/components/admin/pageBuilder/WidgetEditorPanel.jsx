import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Smartphone, MousePointerClick, Check, Hash, Trash2, Eye, EyeOff,
  SlidersHorizontal,
  AlignLeft, AlignCenter, AlignRight,
} from 'lucide-react';
import {
  updateSectionData, updateSectionSettings, clearMobileOverride,
  selectActiveSection, selectResponsiveBreakpoint, removeSection,
} from '../../../store/slices/pageBuilderSlice';
import { SECTION_REGISTRY } from '../../sections/registry';
import { SECTION_STYLE_PRESETS } from '../../page/designSystem';
import { SECTION_VARIANT_OPTIONS } from '../../page/componentVariants';
import { getResponsiveData, getResponsiveSettings } from '../../page/responsive';
import { adminPageAPI } from '../../../services/api';
import {
  Field, Select, Toggle, NumberInput, ColorInput,
  SectionDivider, TextInput, ImagePicker, SegmentedControl, SuffixInput,
  SpacingSection, DimensionInput, MediaControls,
} from './inputs';

const SHADOW_PRESETS = [
  { value: 'none', label: 'None' },
  { value: 'sm',   label: 'SM' },
  { value: 'md',   label: 'MD' },
  { value: 'lg',   label: 'LG' },
  { value: 'xl',   label: 'XL' },
];

const BORDER_STYLES = [
  { value: 'solid',  label: '──' },
  { value: 'dashed', label: '╴╴' },
  { value: 'dotted', label: '⋯⋯' },
];

const ALIGN_OPTIONS = [
  { value: 'left',   icon: AlignLeft,   title: 'Align left' },
  { value: 'center', icon: AlignCenter, title: 'Align center' },
  { value: 'right',  icon: AlignRight,  title: 'Align right' },
];

const SECTION_ALIGN_OPTIONS = [
  { value: 'left', icon: AlignLeft, title: 'Align section left' },
  { value: 'center', icon: AlignCenter, title: 'Center section' },
  { value: 'right', icon: AlignRight, title: 'Align section right' },
];

const BG_SIZE_OPTIONS = [
  { value: 'cover',   label: 'Cover' },
  { value: 'contain', label: 'Contain' },
  { value: 'auto',    label: 'Auto' },
];

const BG_POSITION_OPTIONS = [
  { value: 'center center', label: 'Center' },
  { value: 'top left',      label: 'Top L' },
  { value: 'top right',     label: 'Top R' },
  { value: 'bottom left',   label: 'Bot L' },
  { value: 'bottom right',  label: 'Bot R' },
];

const RADIUS_PRESETS = [0, 4, 8, 12, 16, 24, 9999];
const FONT_OPTIONS = [
  { value: 'inherit', label: 'Page default' },
  { value: 'system', label: 'Platform sans (Inter)' },
  { value: 'serif', label: 'Editorial serif' },
  { value: 'mono', label: 'Monospace' },
];
const BACKGROUND_TOKEN_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'primary', label: 'Brand primary' },
  { value: 'accent', label: 'Brand accent' },
  { value: 'surface', label: 'Surface' },
  { value: 'muted', label: 'Muted surface' },
];
const TEXT_TOKEN_OPTIONS = [
  { value: 'text', label: 'Text' },
  { value: 'muted', label: 'Muted text' },
  { value: 'inverse', label: 'Inverse / white' },
  { value: 'primary', label: 'Brand primary' },
];

function localDateTimeValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isoFromLocalDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function EmptyState() {
  return (
    <div data-testid="page-builder-widget-inspector-empty" className="flex flex-col items-center justify-center h-full text-center p-8 bg-slate-50">
      <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center mb-4">
        <MousePointerClick className="w-7 h-7 text-indigo-400" />
      </div>
      <h3 className="text-sm font-semibold text-slate-800 mb-1">Select a widget to edit</h3>
      <p className="text-xs leading-5 text-slate-500 max-w-[210px]">Choose a widget from the preview or widget tree to start customizing it.</p>
    </div>
  );
}

function AnchorChip({ id, onCopied }) {
  const [copied, setCopied] = useState(false);
  if (!id) return null;
  const handle = (e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(`#${id}`);
    setCopied(true);
    onCopied?.();
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <button
      type="button"
      onClick={handle}
      title={`Copy #${id} to clipboard`}
      className="inline-flex items-center gap-1 px-2 h-6 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-mono font-medium hover:bg-indigo-100 transition-colors"
    >
      {copied ? <Check size={9} /> : <Hash size={9} />}
      {id}
    </button>
  );
}

export default function WidgetEditorPanel() {
  const dispatch = useDispatch();
  const selectedId = useSelector(s => s.pageBuilder.selectedSectionId);
  const section = useSelector(s => selectedId ? selectActiveSection(s, selectedId) : null);
  const device = useSelector(s => s.pageBuilder.device);
  const editingMobileLayout = useSelector(s => s.pageBuilder.editingMobileLayout);
  const responsiveBreakpoint = useSelector(selectResponsiveBreakpoint);
  const responsiveOverride = Boolean(responsiveBreakpoint);
  if (!section) return <div className="h-full overflow-y-auto"><EmptyState /></div>;
  const entry = SECTION_REGISTRY[section.type];
  if (!entry) return <div className="h-full overflow-y-auto p-4"><div className="text-xs text-red-500">Unknown section type</div></div>;
  const SettingsForm = entry.settings;

  const onUpload = async (file) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('type', file.type.startsWith('video/') ? 'pageVideo' : 'pageImage');
    const res = file.type.startsWith('video/')
      ? await adminPageAPI.uploadMedia(fd)
      : await adminPageAPI.uploadImage(fd);
    return res.data?.url;
  };

  const baseData = section.data || {};
  const formData = responsiveOverride ? getResponsiveData(section, device) : baseData;
  const overrideData = responsiveBreakpoint ? (section.responsiveOverrides?.[responsiveBreakpoint] || {}) : {};
  const overrideSettings = responsiveBreakpoint ? (section.responsiveOverrides?.[`${responsiveBreakpoint}Settings`] || {}) : {};
  const hasOverrides = responsiveOverride && (Object.keys(overrideData).length > 0 || Object.keys(overrideSettings).length > 0);

  const settings = responsiveOverride ? getResponsiveSettings(section, device) : (section.settings || {});
  const editTarget = { device, layoutTarget: editingMobileLayout ? 'mobile' : 'desktop' };
  const updateSetting = (patch) => dispatch(updateSectionSettings({ id: section.id, settings: patch, ...editTarget }));
  const applyStylePreset = (preset) => updateSetting(preset.settings);
  const hasBgImage = !!settings.backgroundImage;
  const isHidden = settings.visibility === 'hidden';
  const visibilityLabel = isHidden
    ? 'Hidden from customers'
    : settings.visibility === 'desktop'
      ? 'Desktop only'
      : settings.visibility === 'mobile'
        ? 'Mobile only'
        : 'Visible on all devices';

  return (
    <div data-testid="page-builder-widget-inspector" className="h-full flex flex-col bg-slate-50">
      {/* Inspector header */}
      <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-4 z-10 flex-shrink-0">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0">
            <SlidersHorizontal size={18} />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900 truncate">{entry.label}</h2>
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 flex-shrink-0">
                {entry.category || 'Widget'}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[11px] text-slate-500">Customize widget</span>
              <AnchorChip id={settings.anchorId} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => updateSetting({ visibility: settings.visibility === 'hidden' ? 'all' : 'hidden' })}
            title={settings.visibility === 'hidden' ? 'Show widget' : 'Hide widget'}
            className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors ${
              isHidden
                ? 'bg-slate-100 border-slate-200 text-slate-400 hover:bg-slate-200'
                : 'bg-indigo-50 border-indigo-100 text-indigo-600 hover:bg-indigo-100'
            }`}
          >
            {isHidden ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
          <button
            type="button"
            onClick={() => { if (confirm('Delete this widget?')) dispatch(removeSection(section.id)); }}
            title="Delete widget"
            className="w-8 h-8 rounded-lg border border-transparent flex items-center justify-center text-slate-400 hover:bg-red-50 hover:border-red-100 hover:text-red-600 transition-colors"
          >
            <Trash2 size={15} />
          </button>
        </div>

        <div className={`mt-4 flex items-center gap-3 rounded-xl border px-3 py-2.5 ${isHidden ? 'border-slate-200 bg-slate-50' : 'border-emerald-100 bg-emerald-50/70'}`}>
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isHidden ? 'bg-slate-400' : 'bg-emerald-500'}`} />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-slate-800">{isHidden ? 'Widget hidden' : 'Widget visible'}</div>
            <div className="text-[11px] text-slate-500 truncate mt-0.5">{visibilityLabel}</div>
          </div>
          <button
            type="button"
            onClick={() => updateSetting({ visibility: isHidden ? 'all' : 'hidden' })}
            className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors ${isHidden ? 'bg-white text-indigo-600 border border-slate-200 hover:bg-indigo-50' : 'text-emerald-700 hover:bg-emerald-100'}`}
          >
            {isHidden ? 'Show' : 'Hide'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {/* Mobile Override Banner */}
        {responsiveOverride && (
          <div className="rounded-xl bg-indigo-50 border border-indigo-100 px-3 py-3 shadow-sm">
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-white text-indigo-600 flex items-center justify-center flex-shrink-0">
                <Smartphone size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-indigo-900">{responsiveBreakpoint === 'tablet' ? 'Tablet override' : 'Mobile override'}</div>
                <div className="text-[11px] text-indigo-700 mt-0.5">{responsiveBreakpoint === 'tablet' ? 'Tablet changes flow down to mobile unless overridden there.' : 'Only values changed here override desktop/tablet.'}</div>
              </div>
              {hasOverrides && (
                <button onClick={() => dispatch(clearMobileOverride(section.id))} className="text-[11px] text-red-600 font-semibold hover:underline flex-shrink-0">Reset</button>
              )}
            </div>
          </div>
        )}

        {/* Content — widget-specific */}
        <SectionDivider title="Content" defaultOpen collapsible>
          <div className="space-y-3">
            {SettingsForm && (
              <SettingsForm
                data={formData}
                onChange={(patch) => dispatch(updateSectionData({ id: section.id, data: patch, ...editTarget }))}
                onUpload={onUpload}
              />
            )}
          </div>
        </SectionDivider>

        {/* Layout */}
        <SectionDivider title="Layout" defaultOpen collapsible>
          <div className="space-y-3">
            <Field label="Visibility">
              <Select value={settings.visibility || 'all'} onChange={e => updateSetting({ visibility: e.target.value })}
                options={[
                  { value: 'all',     label: 'All devices' },
                  { value: 'desktop', label: 'Desktop only' },
                  { value: 'mobile',  label: 'Mobile only' },
                  { value: 'hidden',  label: 'Hidden' },
                ]}
              />
            </Field>

            <div className="grid grid-cols-[1fr_92px] gap-1.5 items-end">
              <Field label="Full width">
                <div className="flex items-center h-7 px-2 border border-gray-200 rounded bg-white">
                  <Toggle
                    checked={!!settings.fullWidth}
                    onChange={(v) => updateSetting({ fullWidth: v })}
                    label=""
                  />
                </div>
              </Field>
              <Field label="Max width" hint={settings.fullWidth ? 'Off' : ''}>
                <SuffixInput
                  suffix="px"
                  min={0}
                  step={10}
                  placeholder="Auto"
                  value={settings.maxWidth ?? ''}
                  disabled={!!settings.fullWidth}
                  onChange={(e) => updateSetting({ maxWidth: e.target.value === '' ? null : Number(e.target.value) })}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <Field label="Section width" hint="Leave blank for full available width">
                <DimensionInput
                  data-testid="page-builder-section-width"
                  value={settings.width}
                  defaultValue={100}
                  min={1}
                  max={4000}
                  onChange={width => updateSetting({ width })}
                />
              </Field>
              <Field label="Section height" hint="Auto keeps content height">
                <DimensionInput
                  data-testid="page-builder-section-height"
                  value={settings.height}
                  defaultValue={480}
                  min={1}
                  max={4000}
                  onChange={height => updateSetting({ height })}
                />
              </Field>
              <Field label="Minimum height">
                <DimensionInput
                  data-testid="page-builder-section-min-height"
                  value={settings.minHeight}
                  defaultValue={240}
                  min={1}
                  max={4000}
                  onChange={minHeight => updateSetting({ minHeight })}
                />
              </Field>
              <Field label="Overflow">
                <Select value={settings.overflow || 'visible'} onChange={e => updateSetting({ overflow: e.target.value })} options={[{ value: 'visible', label: 'Visible' }, { value: 'hidden', label: 'Hidden' }, { value: 'clip', label: 'Clip' }, { value: 'auto', label: 'Scroll when needed' }]} />
              </Field>
            </div>

            <Field label="Section alignment" hint="Used when the section is narrower than its container">
              <SegmentedControl
                value={settings.sectionAlign || 'center'}
                onChange={sectionAlign => updateSetting({ sectionAlign })}
                options={SECTION_ALIGN_OPTIONS}
              />
            </Field>

            <Field label="Layer order (z-index)" hint="Useful for overlapping banners or floating content">
              <NumberInput min={-100} max={1000} step={1} placeholder="Auto" value={settings.zIndex ?? ''} onChange={e => updateSetting({ zIndex: e.target.value === '' ? null : Number(e.target.value) })} />
            </Field>

            <Field label="Text align">
              <SegmentedControl
                value={settings.textAlign || 'left'}
                onChange={(v) => updateSetting({ textAlign: v })}
                options={ALIGN_OPTIONS}
              />
            </Field>
          </div>
        </SectionDivider>

        {/* Universal media controls */}
        <SectionDivider title="Media" defaultOpen collapsible>
          <MediaControls
            value={settings.media || {}}
            onChange={media => updateSetting({ media })}
          />
          <button
            type="button"
            onClick={() => updateSetting({ media: { width: null, height: null, maxWidth: null, maxHeight: null, aspectRatio: 'auto', objectFit: null, objectPosition: null, align: 'center', borderRadius: null, opacity: null } })}
            className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
            data-testid="page-builder-reset-media"
          >
            Reset media overrides
          </button>
        </SectionDivider>

        {/* Visibility scheduling */}
        <SectionDivider title="Scheduling" defaultOpen={false} collapsible>
          <div className="space-y-3" data-testid="page-builder-schedule-controls">
            <p className="text-[11px] leading-4 text-slate-500">Keep this widget hidden before or after a campaign window. Times use your local timezone.</p>
            <Field label="Show from" hint="Optional start time">
              <input
                data-testid="page-builder-schedule-from"
                type="datetime-local"
                value={localDateTimeValue(settings.schedule?.from)}
                onChange={event => updateSetting({ schedule: { from: isoFromLocalDateTime(event.target.value) } })}
                className="w-full px-3 h-9 border border-slate-200 rounded-lg text-xs bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </Field>
            <Field label="Show until" hint="Optional end time">
              <input
                data-testid="page-builder-schedule-until"
                type="datetime-local"
                value={localDateTimeValue(settings.schedule?.until)}
                onChange={event => updateSetting({ schedule: { until: isoFromLocalDateTime(event.target.value) } })}
                className="w-full px-3 h-9 border border-slate-200 rounded-lg text-xs bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </Field>
            {(settings.schedule?.from || settings.schedule?.until) && (
              <button
                type="button"
                onClick={() => updateSetting({ schedule: { from: null, until: null } })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 hover:border-red-200 hover:text-red-600"
                data-testid="page-builder-reset-schedule"
              >
                Clear schedule
              </button>
            )}
          </div>
        </SectionDivider>

        {/* Reusable design-system styles */}
        <SectionDivider title="Style presets" defaultOpen collapsible>
          <Field label="Component variant" hint="Applies to this section">
            <Select
              data-testid="page-builder-component-variant"
              value={settings.variant || 'default'}
              onChange={e => updateSetting({ variant: e.target.value })}
              options={SECTION_VARIANT_OPTIONS.map(option => ({ value: option.value, label: option.label }))}
            />
          </Field>
          <div className="grid grid-cols-3 gap-1.5" data-testid="page-builder-style-presets">
            {SECTION_STYLE_PRESETS.map(preset => (
              <button
                key={preset.value}
                type="button"
                data-testid={`page-builder-style-preset-${preset.value}`}
                onClick={() => applyStylePreset(preset)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-[10px] font-semibold text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-4 text-slate-400">Presets use the page design system and can be fine-tuned below.</p>
        </SectionDivider>

        {/* Spacing */}
        <SectionDivider title="Spacing" defaultOpen={false} collapsible>
          <SpacingSection
            margin={settings.margin || {}}
            padding={settings.padding || {}}
            onMarginChange={(v) => updateSetting({ margin: v })}
            onPaddingChange={(v) => updateSetting({ padding: v })}
          />
        </SectionDivider>

        {/* Appearance */}
        <SectionDivider title="Appearance" defaultOpen={false} collapsible>
          <div className="space-y-3">
            <Field label="Background color">
              <ColorInput
                value={settings.backgroundColor}
                onChange={(v) => updateSetting({ backgroundColor: v })}
              />
            </Field>

            <div className="grid grid-cols-2 gap-1.5">
              <Field label="Background token">
                <Select value={settings.backgroundToken || 'none'} onChange={e => updateSetting({ backgroundToken: e.target.value, backgroundColor: '' })} options={BACKGROUND_TOKEN_OPTIONS} />
              </Field>
              <Field label="Text token">
                <Select value={settings.textToken || 'text'} onChange={e => updateSetting({ textToken: e.target.value })} options={TEXT_TOKEN_OPTIONS} />
              </Field>
            </div>

            <Field label="Background image">
              <ImagePicker
                value={settings.backgroundImage}
                onUpload={onUpload}
                onChange={(v) => updateSetting({ backgroundImage: v })}
              />
            </Field>

            {hasBgImage && (
              <div className="grid grid-cols-2 gap-1.5">
                <Field label="Size">
                  <SegmentedControl
                    value={settings.backgroundSize || 'cover'}
                    onChange={(v) => updateSetting({ backgroundSize: v })}
                    options={BG_SIZE_OPTIONS}
                  />
                </Field>
                <Field label="Position">
                  <Select
                    value={settings.backgroundPosition || 'center center'}
                    onChange={(e) => updateSetting({ backgroundPosition: e.target.value })}
                    options={BG_POSITION_OPTIONS}
                  />
                </Field>
              </div>
            )}

            <Field label="Border" hint={`${settings.borderWidth || 0}px ${settings.borderStyle || 'solid'}`}>
              <div className="grid grid-cols-[60px_1fr_28px] gap-1.5 items-end">
                <NumberInput
                  min={0}
                  max={20}
                  value={settings.borderWidth ?? 0}
                  onChange={(e) => updateSetting({ borderWidth: Number(e.target.value) || 0 })}
                />
                <SegmentedControl
                  value={settings.borderStyle || 'solid'}
                  onChange={(v) => updateSetting({ borderStyle: v })}
                  options={BORDER_STYLES}
                />
                <input
                  type="color"
                  value={settings.borderColor || '#000000'}
                  onChange={(e) => updateSetting({ borderColor: e.target.value })}
                  className="h-7 w-7 rounded border border-gray-200 cursor-pointer"
                  style={{ padding: 0 }}
                  title="Border color"
                />
              </div>
            </Field>

            <Field label="Corner radius">
              <div className="space-y-1.5">
                <SuffixInput
                  suffix="px"
                  min={0}
                  value={settings.borderRadius ?? 0}
                  onChange={(e) => updateSetting({ borderRadius: Number(e.target.value) || 0 })}
                />
                <div className="flex gap-1">
                  {RADIUS_PRESETS.map((r) => {
                    const active = (settings.borderRadius ?? 0) === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => updateSetting({ borderRadius: r })}
                        className={`flex-1 h-6 rounded text-[10px] font-medium border transition-colors ${
                          active
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {r === 9999 ? '∞' : r}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Field>

            <Field label="Shadow">
              <SegmentedControl
                value={settings.boxShadow || 'none'}
                onChange={(v) => updateSetting({ boxShadow: v })}
                options={SHADOW_PRESETS}
              />
            </Field>
          </div>
        </SectionDivider>

        {/* Typography */}
        <SectionDivider title="Typography" defaultOpen={false} collapsible>
          <div className="space-y-3" data-testid="page-builder-typography-controls">
            <Field label="Font family">
              <Select data-testid="page-builder-font-family" value={settings.typography?.fontFamily || 'inherit'} onChange={e => updateSetting({ typography: { fontFamily: e.target.value } })} options={FONT_OPTIONS} />
            </Field>
            <div className="grid grid-cols-2 gap-1.5">
              <Field label="Font size" hint="Optional">
                <SuffixInput data-testid="page-builder-font-size" suffix="px" min={8} max={96} value={settings.typography?.fontSize ?? ''} onChange={e => updateSetting({ typography: { fontSize: e.target.value === '' ? null : Number(e.target.value) } })} />
              </Field>
              <Field label="Line height" hint="Optional">
                <NumberInput data-testid="page-builder-line-height" min={0.8} max={3} step={0.1} value={settings.typography?.lineHeight ?? ''} onChange={e => updateSetting({ typography: { lineHeight: e.target.value === '' ? null : Number(e.target.value) } })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <Field label="Letter spacing" hint="Optional">
                <SuffixInput data-testid="page-builder-letter-spacing" suffix="px" min={-5} max={20} step={0.5} value={settings.typography?.letterSpacing ?? ''} onChange={e => updateSetting({ typography: { letterSpacing: e.target.value === '' ? null : Number(e.target.value) } })} />
              </Field>
              <Field label="Weight" hint="Optional">
                <Select value={settings.typography?.fontWeight ?? ''} onChange={e => updateSetting({ typography: { fontWeight: e.target.value === '' ? null : Number(e.target.value) } })} options={[{ value: '', label: 'Page default' }, ...[300, 400, 500, 600, 700, 800].map(value => ({ value, label: String(value) }))]} />
              </Field>
            </div>
          </div>
        </SectionDivider>

        {/* Advanced — collapsed by default */}
        <SectionDivider title="Advanced" defaultOpen={false} collapsible>
          <div className="space-y-3">
            <Field label="Anchor ID" hint="e.g. featured-products">
              <TextInput
                value={settings.anchorId || ''}
                placeholder="my-section"
                onChange={(e) => {
                  const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
                  updateSetting({ anchorId: v });
                }}
              />
            </Field>

            <Field label="Custom CSS class" hint="Space-separated class names">
              <TextInput
                value={settings.customClass || ''}
                placeholder="my-class another-class"
                onChange={(e) => updateSetting({ customClass: e.target.value })}
              />
            </Field>
          </div>
        </SectionDivider>

        <div className="h-2" />
      </div>
    </div>
  );
}
