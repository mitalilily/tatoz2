import { useState, useRef, useEffect } from 'react';
import { Link, Unlink } from 'lucide-react';

const INPUT_CLASS = 'w-full px-3 h-9 border border-slate-200 rounded-lg text-xs bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors';

const SPACING_PRESETS = [0, 8, 16, 24, 32, 48];

// Helper to render spacing preset buttons
const renderPresets = (value, onChange, color) => (
  <div className="flex gap-1">
    {SPACING_PRESETS.map(v => (
      <button
        key={`${color}-${v}`}
        onClick={() => onChange({ all: v })}
        className={`flex-1 py-1 text-[10px] rounded transition-colors ${
          value === v
            ? `bg-${color}-500 text-white`
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        {v}
      </button>
    ))}
  </div>
);

export const Field = ({ label, children, className = '', hint }) => (
  <label className={`block ${className}`}>
    <span className="block text-[11px] font-semibold text-slate-600 mb-1.5">{label}</span>
    {children}
    {hint && <span className="block text-[11px] leading-4 text-slate-400 mt-1.5">{hint}</span>}
  </label>
);

export const TextInput = (p) => (
  <input type="text" className={INPUT_CLASS} {...p} />
);

export const TextArea = (p) => (
  <textarea className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none transition-colors" rows={2} {...p} />
);

export const NumberInput = (p) => (
  <input type="number" className={INPUT_CLASS} {...p} />
);

export const Select = ({ options = [], ...p }) => (
  <select className={INPUT_CLASS} {...p}>
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

// Segmented (pill) control — for 2-5 mutually exclusive options
export const SegmentedControl = ({ value, onChange, options }) => (
  <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1 gap-1">
    {options.map(({ value: v, label, icon: Icon, title }) => {
      const active = value === v;
      return (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          title={title || label}
          className={`flex-1 flex items-center justify-center gap-1 h-7 px-2 rounded-md text-[11px] font-medium transition-colors ${
            active
              ? 'bg-white text-indigo-700 shadow-sm border border-gray-200'
              : 'text-gray-500 hover:text-gray-700 border border-transparent'
          }`}
        >
          {Icon && <Icon size={11} />}
          {label && <span>{label}</span>}
        </button>
      );
    })}
  </div>
);

const MEDIA_FIT_OPTIONS = [
  { value: 'cover', label: 'Cover' },
  { value: 'contain', label: 'Contain' },
  { value: 'fill', label: 'Fill' },
  { value: 'none', label: 'Native' },
  { value: 'scale-down', label: 'Scale down' },
];

const MEDIA_POSITION_OPTIONS = [
  { value: 'center center', label: 'Center' },
  { value: 'top left', label: 'Top left' },
  { value: 'top center', label: 'Top center' },
  { value: 'top right', label: 'Top right' },
  { value: 'center left', label: 'Center left' },
  { value: 'center right', label: 'Center right' },
  { value: 'bottom left', label: 'Bottom left' },
  { value: 'bottom center', label: 'Bottom center' },
  { value: 'bottom right', label: 'Bottom right' },
];

const MEDIA_RATIO_OPTIONS = [
  { value: 'auto', label: 'Native' },
  { value: '21/9', label: '21:9' },
  { value: '16/9', label: '16:9' },
  { value: '3/2', label: '3:2' },
  { value: '4/3', label: '4:3' },
  { value: '1/1', label: 'Square' },
  { value: '4/5', label: '4:5' },
  { value: '9/16', label: '9:16' },
];

const MEDIA_ALIGN_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

const EMPTY_MEDIA = {
  width: null,
  height: null,
  maxWidth: null,
  maxHeight: null,
  aspectRatio: 'auto',
  objectFit: null,
  objectPosition: null,
  align: 'center',
  borderRadius: null,
  opacity: null,
};

// Universal media controls apply to content images/videos inside the selected
// widget. Individual widgets keep their own composition, while these controls
// give authors a consistent way to tune dimensions and cropping.
export function MediaControls({ value = {}, onChange }) {
  const media = { ...EMPTY_MEDIA, ...(value && typeof value === 'object' ? value : {}) };
  const patch = next => onChange(next);

  return (
    <div className="space-y-3" data-testid="page-builder-media-controls">
      <div className="grid grid-cols-2 gap-1.5">
        <Field label="Width">
          <DimensionInput data-testid="page-builder-media-width" value={media.width} defaultValue={100} min={1} max={4000} onChange={width => patch({ width })} />
        </Field>
        <Field label="Height">
          <DimensionInput data-testid="page-builder-media-height" value={media.height} defaultValue={400} min={1} max={4000} onChange={height => patch({ height })} />
        </Field>
        <Field label="Max width">
          <DimensionInput data-testid="page-builder-media-max-width" value={media.maxWidth} defaultValue={1200} min={1} max={4000} onChange={maxWidth => patch({ maxWidth })} />
        </Field>
        <Field label="Max height">
          <DimensionInput data-testid="page-builder-media-max-height" value={media.maxHeight} defaultValue={1200} min={1} max={4000} onChange={maxHeight => patch({ maxHeight })} />
        </Field>
      </div>

      <Field label="Aspect ratio" hint="Overrides the widget's default crop when supported by its layout.">
        <Select value={media.aspectRatio || 'auto'} onChange={event => patch({ aspectRatio: event.target.value })} options={MEDIA_RATIO_OPTIONS} />
      </Field>

      <div className="grid grid-cols-2 gap-1.5">
        <Field label="Fit mode">
          <Select value={media.objectFit || 'cover'} onChange={event => patch({ objectFit: event.target.value })} options={MEDIA_FIT_OPTIONS} />
        </Field>
        <Field label="Focus point">
          <Select value={media.objectPosition || 'center center'} onChange={event => patch({ objectPosition: event.target.value })} options={MEDIA_POSITION_OPTIONS} />
        </Field>
      </div>

      <Field label="Alignment">
        <SegmentedControl value={media.align || 'center'} onChange={align => patch({ align })} options={MEDIA_ALIGN_OPTIONS} />
      </Field>

      <div className="grid grid-cols-2 gap-1.5 items-end">
        <Field label="Corner radius">
          <DimensionInput data-testid="page-builder-media-radius" value={media.borderRadius} defaultValue={12} min={0} max={200} onChange={borderRadius => patch({ borderRadius })} allowAuto={false} />
        </Field>
        <Field label={`Opacity ${media.opacity == null ? '100' : Math.round(Number(media.opacity) * 100)}%`}>
          <input type="range" min="0" max="1" step="0.05" value={media.opacity == null ? 1 : media.opacity} onChange={event => patch({ opacity: Number(event.target.value) })} className="w-full accent-indigo-600" />
        </Field>
      </div>
    </div>
  );
}

// Suffix input — number with a unit label baked in (e.g. "120 px")
export const SuffixInput = ({ suffix, ...p }) => (
  <div className="relative">
    <input type="number" className={`${INPUT_CLASS} pr-7`} {...p} />
    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-medium pointer-events-none">{suffix}</span>
  </div>
);

const DIMENSION_UNITS = [
  { value: 'px', label: 'px' },
  { value: '%', label: '%' },
  { value: 'vw', label: 'vw' },
  { value: 'vh', label: 'vh' },
  { value: 'rem', label: 'rem' },
  { value: 'em', label: 'em' },
  { value: 'auto', label: 'Auto' },
];

function dimensionParts(value, fallbackUnit = 'px') {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const unit = DIMENSION_UNITS.some(item => item.value === value.unit) ? value.unit : fallbackUnit;
    const number = value.value == null || value.value === '' ? NaN : Number(value.value);
    return { value: Number.isFinite(number) ? number : null, unit };
  }
  if (typeof value === 'number' && Number.isFinite(value)) return { value, unit: 'px' };
  if (typeof value === 'string') {
    const match = value.trim().match(/^(-?\d+(?:\.\d+)?)(px|%|vw|vh|rem|em)$/i);
    if (match) return { value: Number(match[1]), unit: match[2].toLowerCase() };
    if (value.trim() === 'auto') return { value: null, unit: 'auto' };
  }
  return { value: null, unit: fallbackUnit };
}

// A compact unit-aware input used by section geometry and media controls.
// Values are stored as { value, unit } so responsive overrides can be merged
// without losing the unit selected by the author.
export function DimensionInput({ value, onChange, defaultValue = 100, min = 0, max = 4000, step = 1, allowAuto = true, 'data-testid': testId }) {
  const current = dimensionParts(value);
  const units = allowAuto ? DIMENSION_UNITS : DIMENSION_UNITS.filter(item => item.value !== 'auto');
  const emitNumber = event => {
    const raw = event.target.value;
    onChange(raw === '' ? null : { value: Number(raw), unit: current.unit === 'auto' ? 'px' : current.unit });
  };
  const emitUnit = event => {
    const unit = event.target.value;
    onChange({ value: unit === 'auto' ? null : (current.value ?? defaultValue), unit });
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_74px] gap-1.5">
      <input
        data-testid={testId ? `${testId}-value` : undefined}
        type="number"
        className={INPUT_CLASS}
        min={min}
        max={max}
        step={step}
        value={current.unit === 'auto' ? '' : (current.value ?? '')}
        onChange={emitNumber}
        disabled={current.unit === 'auto'}
        placeholder={current.unit === 'auto' ? 'Auto' : String(defaultValue)}
      />
      <select data-testid={testId ? `${testId}-unit` : undefined} className={INPUT_CLASS} value={current.unit} onChange={emitUnit}>
        {units.map(unit => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
      </select>
    </div>
  );
}

export const Checkbox = ({ label, ...p }) => (
  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer hover:text-slate-900">
    <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" {...p} />
    {label}
  </label>
);

export const Toggle = ({ checked, onChange, label }) => {
  const hasLabel = label != null && label !== '';
  return (
    <label className={`flex items-center cursor-pointer ${hasLabel ? 'justify-between' : ''}`}>
      {hasLabel && <span className="text-xs text-gray-700">{label}</span>}
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-indigo-600' : 'bg-slate-300'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </button>
    </label>
  );
};

// Spacing Input — T/R/B/L with link toggle
export function SpacingInput({ value = {}, onChange, label }) {
  const [linked, setLinked] = useState(() => 'all' in (value || {}));
  const allValue = value.all ?? 0;

  const handleChange = (key, val) => {
    if (linked) {
      onChange({ all: val });
    } else {
      onChange({ [key]: val });
    }
  };

  const inputs = [
    { key: 'top', label: 'T' },
    { key: 'right', label: 'R' },
    { key: 'bottom', label: 'B' },
    { key: 'left', label: 'L' },
  ];

  return (
    <div className="space-y-1.5">
      {label && <span className="block text-[10px] font-medium text-gray-700">{label}</span>}
      <div className="flex items-center gap-1 w-full">
        {inputs.map(({ key, label }) => (
          <div key={key} className="relative flex-1 min-w-0">
            <input
              type="number"
              value={value[key] ?? allValue}
              onChange={e => handleChange(key, parseInt(e.target.value) || 0)}
              className="w-full pl-4 pr-1 h-8 border border-slate-200 rounded-lg text-[11px] text-center focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white shadow-sm"
              min={0}
            />
            <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[9px] text-gray-400 font-medium">{label}</span>
          </div>
        ))}
        <button
          onClick={() => setLinked(!linked)}
          className={`shrink-0 ml-1 p-1.5 rounded transition-colors ${
            linked
              ? 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'
              : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
          }`}
          title={linked ? 'Unlink values' : 'Link values'}
        >
          {linked ? <Link size={12} /> : <Unlink size={12} />}
        </button>
      </div>
    </div>
  );
}

// Visual Box — Figma-style representation of margin/padding
export function VisualBox({ marginValue = 20, paddingValue = 16 }) {
  return (
    <div className="relative w-full h-24 bg-gray-50 rounded border border-gray-200 overflow-hidden">
      {/* Margin Zone */}
      <div
        className="absolute inset-0 border-2 border-dashed border-green-400 rounded transition-colors hover:border-green-500"
        style={{
          backgroundColor: 'rgba(34, 197, 94, 0.08)',
          margin: `${marginValue}px`
        }}
      >
        {/* Padding Zone */}
        <div
          className="absolute inset-0 border-2 border-blue-400 rounded transition-colors hover:border-blue-500"
          style={{
            backgroundColor: 'rgba(59, 130, 246, 0.12)',
            margin: `${Math.max(0, paddingValue - marginValue)}px`
          }}
        >
          {/* Content Area */}
          <div className="absolute inset-0 bg-white/80 border border-dashed border-gray-300 rounded flex items-center justify-center">
            <span className="text-[10px] text-gray-400 font-medium">Content</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Spacing Section — combines margin and padding controls
export function SpacingSection({ margin = {}, padding = {}, onMarginChange, onPaddingChange }) {
  const marginAll = margin.all ?? 0;
  const paddingAll = padding.all ?? 16;

  return (
    <div className="space-y-3">
      {/* Visual Preview */}
      <VisualBox marginValue={marginAll} paddingValue={paddingAll} />

      {/* Margin Control */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-green-700 uppercase tracking-wide">Margin</span>
          <span className="text-[9px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded">Outer</span>
        </div>
        <SpacingInput
          value={margin}
          onChange={onMarginChange}
        />
        {renderPresets(marginAll, onMarginChange, 'green')}
      </div>

      {/* Divider */}
      <div className="border-t border-dashed border-gray-200" />

      {/* Padding Control */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-blue-700 uppercase tracking-wide">Padding</span>
          <span className="text-[9px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Inner</span>
        </div>
        <SpacingInput
          value={padding}
          onChange={onPaddingChange}
        />
        {renderPresets(paddingAll, onPaddingChange, 'blue')}
      </div>
    </div>
  );
}

// Enhanced Color Picker with Gradients
export function ColorInput({ value, onChange, allowClear = true }) {
  // Use refs to always have latest values
  const angleRef = useRef(90);
  const stopsRef = useRef([
    { color: '#4f46e5', position: 0 },
    { color: '#7c3aed', position: 100 },
  ]);

  const [activeTab, setActiveTab] = useState('solid');
  const [gradientAngle, setGradientAngle] = useState(90);
  const [gradientStops, setGradientStops] = useState([
    { color: '#4f46e5', position: 0 },
    { color: '#7c3aed', position: 100 },
  ]);
  const [initialized, setInitialized] = useState(false);

  // Sync refs when state changes
  useEffect(() => {
    angleRef.current = gradientAngle;
    stopsRef.current = gradientStops;
  }, [gradientAngle, gradientStops]);

  // Parse existing gradient value when component mounts or value changes
  useEffect(() => {
    if (!value || !value.includes('gradient')) {
      setInitialized(true);
      return;
    }

    // Parse gradient to extract angle and colors
    const match = value.match(/linear-gradient\((\d+)deg,\s*([^)]+)\)/);
    if (match) {
      const angle = parseInt(match[1]) || 90;
      const colorsStr = match[2];
      const stops = [];

      const colorMatches = colorsStr.matchAll(/([a-fA-F0-9#]+)\s+(\d+)%/g);
      for (const m of colorMatches) {
        stops.push({ color: m[1], position: parseInt(m[2]) });
      }

      if (stops.length >= 2) {
        setGradientAngle(angle);
        setGradientStops(stops);
        angleRef.current = angle;
        stopsRef.current = stops;
      }
    }
    setInitialized(true);
  }, [value]);

  // Keep refs in sync with props when switching tabs
  useEffect(() => {
    if (activeTab === 'gradient' && value && value.includes('gradient')) {
      const match = value.match(/linear-gradient\((\d+)deg,\s*([^)]+)\)/);
      if (match) {
        const angle = parseInt(match[1]) || 90;
        const colorsStr = match[2];
        const stops = [];
        const colorMatches = colorsStr.matchAll(/([a-fA-F0-9#]+)\s+(\d+)%/g);
        for (const m of colorMatches) {
          stops.push({ color: m[1], position: parseInt(m[2]) });
        }
        if (stops.length >= 2) {
          setGradientAngle(angle);
          setGradientStops(stops);
          angleRef.current = angle;
          stopsRef.current = stops;
        }
      }
    }
  }, [activeTab, value]);

  const buildGradient = (stops, angle) => {
    return `linear-gradient(${angle}deg, ${stops.map(s => `${s.color} ${s.position}%`).join(', ')})`;
  };

  const applyGradient = () => {
    const gradientValue = buildGradient(stopsRef.current, angleRef.current);
    onChange(gradientValue);
  };

  const presets = [
    { name: 'Indigo', colors: ['#4f46e5', '#7c3aed'] },
    { name: 'Sunset', colors: ['#f97316', '#ef4444'] },
    { name: 'Ocean', colors: ['#0ea5e9', '#06b6d4'] },
    { name: 'Forest', colors: ['#22c55e', '#16a34a'] },
    { name: 'Dark', colors: ['#1f2937', '#111827'] },
    { name: 'Pink', colors: ['#ec4899', '#f472b6'] },
  ];

  const applyPreset = (preset) => {
    setActiveTab('gradient');
    const newStops = [
      { color: preset.colors[0], position: 0 },
      { color: preset.colors[1], position: 100 },
    ];
    setGradientStops(newStops);
    stopsRef.current = newStops;
    applyGradient();
  };

  const handleGradientTab = () => {
    setActiveTab('gradient');
    if (value && value.includes('gradient')) {
      // Already has gradient, parse it
      return;
    }
    // Initialize with default gradient
    const newStops = [
      { color: '#4f46e5', position: 0 },
      { color: '#7c3aed', position: 100 },
    ];
    setGradientStops(newStops);
    stopsRef.current = newStops;
    applyGradient();
  };

  const handleSolidColor = (color) => {
    onChange(color);
    setActiveTab('solid');
  };

  const handleAngleChange = (e) => {
    const newAngle = parseInt(e.target.value);
    setGradientAngle(newAngle);
    angleRef.current = newAngle;
    applyGradient();
  };

  const handleColorChange = (index, newColor) => {
    const newStops = [...gradientStops];
    newStops[index] = { ...newStops[index], color: newColor };
    setGradientStops(newStops);
    stopsRef.current = newStops;
    applyGradient();
  };

  const addStop = () => {
    const newStops = [...gradientStops, { color: '#ffffff', position: 50 }];
    setGradientStops(newStops);
    stopsRef.current = newStops;
    applyGradient();
  };

  const removeStop = (index) => {
    if (gradientStops.length <= 2) return;
    const newStops = gradientStops.filter((_, i) => i !== index);
    setGradientStops(newStops);
    stopsRef.current = newStops;
    applyGradient();
  };

  if (!initialized) return null;

  const isGradient = activeTab === 'gradient' || (value && value.includes('gradient'));
  const currentGradient = isGradient ? buildGradient(gradientStops, gradientAngle) : null;

  return (
    <div className="space-y-2">
      {/* Color/Solid Toggle */}
      <div className="flex gap-1">
        <button
          onClick={() => setActiveTab('solid')}
          className={`px-2 py-1 text-[10px] rounded ${activeTab === 'solid' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          Solid
        </button>
        <button
          onClick={handleGradientTab}
          className={`px-2 py-1 text-[10px] rounded ${activeTab === 'gradient' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          Gradient
        </button>
      </div>

      {activeTab === 'solid' ? (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={value?.includes('gradient') ? '#4f46e5' : (value || '#ffffff')}
            onChange={e => handleSolidColor(e.target.value)}
            className="w-10 h-10 cursor-pointer rounded border border-gray-200"
            style={{ padding: 0 }}
          />
          <input
            type="text"
            value={value?.includes('gradient') ? '' : (value || '')}
            placeholder="#hex"
            onChange={e => onChange(e.target.value)}
            className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {allowClear && value && !value.includes('gradient') && (
            <button type="button" onClick={() => onChange('')} className="text-[10px] text-red-500 hover:text-red-700">Clear</button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {/* Gradient Preview */}
          <div
            className="h-8 rounded border border-gray-200"
            style={{ background: currentGradient }}
          />

          {/* Angle Control */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 w-8">Angle</span>
            <input
              type="range"
              min={0}
              max={360}
              value={gradientAngle}
              onChange={handleAngleChange}
              className="flex-1 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-[10px] text-gray-600 w-8 text-right">{gradientAngle}°</span>
          </div>

          {/* Color Stops */}
          <div className="flex gap-1.5 items-center flex-wrap">
            {gradientStops.map((stop, i) => (
              <div key={i} className="relative group">
                <input
                  type="color"
                  value={stop.color}
                  onChange={e => handleColorChange(i, e.target.value)}
                  className="w-7 h-7 rounded border border-gray-200 cursor-pointer"
                  style={{ padding: 0 }}
                />
                {gradientStops.length > 2 && (
                  <button
                    onClick={() => removeStop(i)}
                    className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 text-white rounded-full text-[8px] opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={addStop}
              className="w-7 h-7 rounded border border-dashed border-gray-300 text-gray-400 text-sm hover:border-gray-400 hover:text-gray-600"
            >
              +
            </button>
          </div>

          {/* Presets */}
          <div className="grid grid-cols-6 gap-1">
            {presets.map((preset) => (
              <button
                key={preset.name}
                onClick={() => applyPreset(preset)}
                className="h-6 rounded border border-gray-200 hover:ring-2 hover:ring-indigo-400"
                style={{ background: `linear-gradient(90deg, ${preset.colors[0]}, ${preset.colors[1]})` }}
                title={preset.name}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Section Divider
export const SectionDivider = ({ title, collapsible = false, defaultOpen = true, badge, children }) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => collapsible && setOpen(!open)}
        className={`w-full flex items-center justify-between px-3.5 py-3 text-left ${collapsible ? 'cursor-pointer hover:bg-slate-50' : 'cursor-default'}`}
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-slate-800">
          <span className={`w-1.5 h-1.5 rounded-full ${open ? 'bg-indigo-500' : 'bg-slate-300'}`} />
          {title}
          {badge != null && badge !== '' && (
            <span className="px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-semibold normal-case tracking-normal">{badge}</span>
          )}
        </span>
        {collapsible && (
          <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>
      {(!collapsible || open) && (
        <div className="px-3.5 pb-4">
          {children}
        </div>
      )}
    </section>
  );
};

export const ImagePicker = ({ value, onUpload, onChange }) => {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [uploading, setUploading] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [error, setError] = useState('');

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const url = await onUpload(file);
      if (url) onChangeRef.current(url);
      else setError('Upload returned no URL');
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const applyUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    onChange(trimmed);
    setUrlInput('');
    setError('');
  };

  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative group">
          <img
            src={value}
            className="w-full h-20 object-cover rounded border border-gray-200 bg-gray-50"
            onError={(e) => { e.currentTarget.style.opacity = '0.4'; }}
            onLoad={(e) => { e.currentTarget.style.opacity = '1'; }}
            alt=""
          />
          <button onClick={() => onChange('')} className="absolute top-1 right-1 bg-white/90 hover:bg-white rounded px-1.5 py-0.5 text-[10px] shadow">✕</button>
        </div>
      ) : (
        <div className="w-full h-20 bg-gray-50 border border-dashed border-gray-300 rounded flex items-center justify-center text-[11px] text-gray-400">
          {uploading ? 'Uploading…' : 'No image'}
        </div>
      )}
      <div>
        <input type="file" accept="image/*" onChange={handleFile} disabled={uploading} className="text-[11px] w-full" />
      </div>
      <div className="flex items-center gap-1">
        <input
          type="url"
          value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyUrl(); } }}
          placeholder="Image URL"
          className="flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded text-[11px]"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={applyUrl}
          disabled={!urlInput.trim()}
          className="px-2 py-1.5 bg-gray-900 text-white rounded text-[10px] hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400"
        >
          Add
        </button>
      </div>
      {error && <div className="text-[10px] text-red-500">{error}</div>}
    </div>
  );
};

export const VideoPicker = ({ value, onUpload, onChange }) => {
  const [uploading, setUploading] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [error, setError] = useState('');

  const ACCEPTED_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Only mp4, webm, or mov files are allowed');
      e.target.value = '';
      return;
    }
    setUploading(true);
    setError('');
    try {
      const url = await onUpload(file);
      if (url) onChange(url);
      else setError('Upload returned no URL');
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const applyUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    onChange(trimmed);
    setUrlInput('');
    setError('');
  };

  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative group">
          <video
            src={value}
            muted
            playsInline
            className="w-full h-20 object-cover rounded border border-gray-200 bg-gray-50"
            onError={(e) => { e.currentTarget.style.opacity = '0.4'; }}
            onLoadedData={(e) => { e.currentTarget.style.opacity = '1'; }}
          />
          <button onClick={() => onChange('')} className="absolute top-1 right-1 bg-white/90 hover:bg-white rounded px-1.5 py-0.5 text-[10px] shadow">✕</button>
        </div>
      ) : (
        <div className="w-full h-20 bg-gray-50 border border-dashed border-gray-300 rounded flex items-center justify-center text-[11px] text-gray-400">
          {uploading ? 'Uploading…' : 'No video'}
        </div>
      )}
      <div>
        <input
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          onChange={handleFile}
          disabled={uploading}
          className="text-[11px] w-full"
        />
      </div>
      <div className="flex items-center gap-1">
        <input
          type="url"
          value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyUrl(); } }}
          placeholder="Video URL"
          className="flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded text-[11px]"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={applyUrl}
          disabled={!urlInput.trim()}
          className="px-2 py-1.5 bg-gray-900 text-white rounded text-[10px] hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400"
        >
          Add
        </button>
      </div>
      {error && <div className="text-[10px] text-red-500">{error}</div>}
    </div>
  );
};
