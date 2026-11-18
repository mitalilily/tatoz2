import { Field, TextInput, TextArea, Select, Checkbox, NumberInput, ImagePicker, ColorInput } from '../../admin/pageBuilder/inputs';

const VARIANT_HINTS = {
  classic: 'Full-bleed image with dark overlay and text — the default e-commerce hero.',
  split: '50/50 image + text panel side-by-side. Cleaner, more editorial.',
  minimal: 'Text on a solid color, no image. Best for typography-led announcements.',
  card: 'Contained, rounded card (not edge-to-edge). Sits inside the page padding.',
  strip: 'Continuously scrolling row of images at a fixed height — like a marquee gallery. Each image keeps its native aspect ratio and is clickable.',
};

export default function HeroSettings({ data, onChange, onUpload }) {
  const slides = data.slides || [];
  const variant = data.variant || 'classic';
  const aspectRatio = data.aspectRatio || '2.15/1';
  const showColorFields = variant === 'split' || variant === 'minimal';
  const showImagePosField = variant === 'split';
  const showOverlayField = variant === 'classic' || variant === 'card';

  const updateSlide = (i, patch) => {
    const next = slides.slice();
    next[i] = { ...next[i], ...patch };
    onChange({ slides: next });
  };
  const addSlide = () => onChange({
    slides: [...slides, { imageUrl: '', headline: '', subheadline: '', ctaLabel: '', ctaLink: '', alignment: 'center', overlayOpacity: 0.4, bgColor: '', textColor: '', imagePosition: 'left' }],
  });
  const removeSlide = (i) => onChange({ slides: slides.filter((_, j) => j !== i) });

  return (
    <div>
      {/* ─── Variant ─── */}
      <Field label="Style">
        <Select value={variant} onChange={e => onChange({ variant: e.target.value })}
          options={[
            { value: 'classic', label: 'Classic — full-bleed with overlay' },
            { value: 'split', label: 'Split — image + text side-by-side' },
            { value: 'minimal', label: 'Minimal — text on solid color' },
            { value: 'card', label: 'Card — contained, rounded' },
            { value: 'strip', label: 'Strip — auto-scrolling image row' },
          ]} />
        <span className="text-[11px] text-gray-500 mt-1 block">{VARIANT_HINTS[variant]}</span>
      </Field>

      {variant === 'strip' ? (
        // ─── Strip-specific settings ───
        <>
          <Field label="Image height">
            <div className="flex gap-2">
              <NumberInput value={data.stripHeight?.value ?? 400} min={80} max={2000}
                onChange={e => onChange({ stripHeight: { ...(data.stripHeight || { unit: 'px' }), value: Number(e.target.value) } })} />
              <Select value={data.stripHeight?.unit ?? 'px'}
                onChange={e => onChange({ stripHeight: { ...(data.stripHeight || { value: 400 }), unit: e.target.value } })}
                options={[{ value: 'px', label: 'px' }, { value: 'vh', label: 'vh' }, { value: 'rem', label: 'rem' }]} />
            </div>
            <span className="text-[11px] text-gray-500 mt-1 block">All images render at this height; widths follow each image's native aspect ratio.</span>
          </Field>
          <Field label="Gap between images">
            <div className="flex gap-2">
              <NumberInput value={data.stripGap?.value ?? 8} min={0} max={200}
                onChange={e => onChange({ stripGap: { ...(data.stripGap || { unit: 'px' }), value: Number(e.target.value) } })} />
              <Select value={data.stripGap?.unit ?? 'px'}
                onChange={e => onChange({ stripGap: { ...(data.stripGap || { value: 8 }), unit: e.target.value } })}
                options={[{ value: 'px', label: 'px' }, { value: 'rem', label: 'rem' }]} />
            </div>
          </Field>
          <Field label={`Scroll speed: ${data.stripSpeed ?? 40}s per loop`}>
            <input type="range" min="5" max="120" step="1" value={data.stripSpeed ?? 40} onChange={e => onChange({ stripSpeed: Number(e.target.value) })} className="w-full" />
            <span className="text-[11px] text-gray-500 mt-1 block">Lower = faster scroll. 40s is a calm, eye-catching default.</span>
          </Field>
          <Field label="Direction">
            <Select value={data.stripDirection || 'left'} onChange={e => onChange({ stripDirection: e.target.value })}
              options={[{ value: 'left', label: 'Scroll left (default)' }, { value: 'right', label: 'Scroll right' }]} />
          </Field>
          <Checkbox label="Pause on hover" checked={data.stripPauseOnHover !== false} onChange={e => onChange({ stripPauseOnHover: e.target.checked })} />
        </>
      ) : (
        // ─── Standard slideshow settings (sizing + carousel chrome) ───
        <>
          <Field label="Aspect ratio">
            <Select value={aspectRatio} onChange={e => onChange({ aspectRatio: e.target.value })}
              options={[
                { value: '21/9', label: '21:9 (cinematic)' },
                { value: '16/9', label: '16:9 (widescreen)' },
                { value: '2.15/1', label: '2.15:1 (default e-commerce)' },
                { value: '2/1', label: '2:1' },
                { value: '4/3', label: '4:3 (classic)' },
                { value: '1/1', label: '1:1 (square)' },
                { value: 'custom', label: 'Custom height (vh / px / rem)' },
              ]} />
          </Field>
          {aspectRatio === 'custom' && (
            <Field label="Custom height">
              <div className="flex gap-2">
                <NumberInput value={data.customHeight?.value ?? 60} min={10} max={2000}
                  onChange={e => onChange({ customHeight: { ...(data.customHeight || { unit: 'vh' }), value: Number(e.target.value) } })} />
                <Select value={data.customHeight?.unit ?? 'vh'}
                  onChange={e => onChange({ customHeight: { ...(data.customHeight || { value: 60 }), unit: e.target.value } })}
                  options={[{ value: 'vh', label: 'vh' }, { value: 'px', label: 'px' }, { value: 'rem', label: 'rem' }]} />
              </div>
              <span className="text-[11px] text-gray-500 mt-1 block">vh = % of viewport height (60vh = 60% of screen). px = exact pixels. rem = relative to base font size (~16px).</span>
            </Field>
          )}
          {slides.length > 1 && (
            <>
              <Field label="Transition">
                <Select value={data.transition || 'fade'} onChange={e => onChange({ transition: e.target.value })}
                  options={[{ value: 'fade', label: 'Fade' }, { value: 'slide', label: 'Slide' }]} />
              </Field>
              <Checkbox label="Show prev/next arrows" checked={data.showArrows !== false} onChange={e => onChange({ showArrows: e.target.checked })} />
              <Checkbox label="Show dot indicators" checked={data.showDots !== false} onChange={e => onChange({ showDots: e.target.checked })} />
            </>
          )}
          <Field label="Autoplay"><Checkbox label="Cycle slides automatically" checked={!!data.autoplay} onChange={e => onChange({ autoplay: e.target.checked })} /></Field>
          {data.autoplay && (
            <Field label="Interval (ms)"><NumberInput value={data.intervalMs ?? 5000} min={2000} max={20000} step={500} onChange={e => onChange({ intervalMs: Number(e.target.value) })} /></Field>
          )}
        </>
      )}

      {/* ─── Slides ─── */}
      <div className="border-t border-gray-200 pt-3 mt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-700 mb-2">Slides ({slides.length})</div>
        {slides.map((s, i) => (
          <div key={i} className="border border-gray-200 rounded-md p-3 mb-3 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-700">Slide {i + 1}</span>
              <button onClick={() => removeSlide(i)} className="text-xs text-red-600">Remove</button>
            </div>
            {/* Image — hidden for minimal variant */}
            {variant !== 'minimal' && (
              <Field label="Image"><ImagePicker value={s.imageUrl} onUpload={onUpload} onChange={url => updateSlide(i, { imageUrl: url })} /></Field>
            )}
            <Field label={variant === 'strip' ? 'Headline (shown on hover)' : 'Headline'}>
              <TextInput value={s.headline} onChange={e => updateSlide(i, { headline: e.target.value })} />
            </Field>
            <Field label={variant === 'strip' ? 'Caption (shown on hover)' : 'Subheadline'}>
              <TextArea value={s.subheadline} onChange={e => updateSlide(i, { subheadline: e.target.value })} />
            </Field>
            {/* CTA button — hidden for strip (whole image is the link) */}
            {variant !== 'strip' && (
              <>
                <Field label="CTA label"><TextInput value={s.ctaLabel} onChange={e => updateSlide(i, { ctaLabel: e.target.value })} /></Field>
                <Field label="CTA link"><TextInput value={s.ctaLink} placeholder="/category/..." onChange={e => updateSlide(i, { ctaLink: e.target.value })} /></Field>
              </>
            )}
            {variant === 'strip' && (
              <Field label="Image link (entire image is clickable)">
                <TextInput value={s.ctaLink} placeholder="/product/shilajit-resin" onChange={e => updateSlide(i, { ctaLink: e.target.value })} />
              </Field>
            )}
            {/* Alignment — not relevant for strip */}
            {variant !== 'strip' && (
              <Field label="Text alignment">
                <Select value={s.alignment} onChange={e => updateSlide(i, { alignment: e.target.value })} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]} />
              </Field>
            )}
            {/* Overlay — only for variants with an image-as-background */}
            {showOverlayField && (
              <Field label={`Overlay opacity (${(s.overlayOpacity ?? 0.4).toFixed(2)})`}>
                <input type="range" min="0" max="1" step="0.05" value={s.overlayOpacity ?? 0.4} onChange={e => updateSlide(i, { overlayOpacity: Number(e.target.value) })} className="w-full" />
              </Field>
            )}
            {/* Image position — only for split */}
            {showImagePosField && (
              <Field label="Image position">
                <Select value={s.imagePosition || 'left'} onChange={e => updateSlide(i, { imagePosition: e.target.value })} options={[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]} />
              </Field>
            )}
            {/* Per-slide colors — only for split + minimal */}
            {showColorFields && (
              <>
                <Field label="Text panel background">
                  <ColorInput value={s.bgColor} onChange={v => updateSlide(i, { bgColor: v })} />
                </Field>
                <Field label="Text color">
                  <ColorInput value={s.textColor} onChange={v => updateSlide(i, { textColor: v })} />
                </Field>
              </>
            )}
          </div>
        ))}
        <button onClick={addSlide} className="w-full py-2 border border-dashed border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50">+ Add slide</button>
      </div>
    </div>
  );
}
