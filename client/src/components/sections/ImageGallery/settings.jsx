import { Field, TextInput, Select, Checkbox, ImagePicker } from '../../admin/pageBuilder/inputs';
import GridControls from '../../admin/pageBuilder/GridControls';

export default function ImageGallerySettings({ data, onChange, onUpload }) {
  const images = data.images || [];
  const updateImage = (i, patch) => {
    const next = images.slice();
    next[i] = { ...next[i], ...patch };
    onChange({ images: next });
  };
  const addImage = () => onChange({ images: [...images, { url: '', altText: '' }] });
  const removeImage = (i) => onChange({ images: images.filter((_, j) => j !== i) });
  return (
    <div>
      <Field label="Heading (optional)"><TextInput value={data.heading || ''} onChange={e => onChange({ heading: e.target.value })} /></Field>
      <Field label="Layout">
        <Select value={data.layout || 'grid'} onChange={e => onChange({ layout: e.target.value })}
          options={[{ value: 'grid', label: 'Even grid (square cells)' }, { value: 'masonry', label: 'Masonry (native heights)' }]} />
      </Field>
      <GridControls data={data} onChange={onChange} />
      <Checkbox label="Enable lightbox (click to zoom)" checked={data.enableLightbox !== false} onChange={e => onChange({ enableLightbox: e.target.checked })} />
      <div className="border-t border-gray-200 pt-3 mt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-700 mb-2">Images ({images.length})</div>
        {images.map((im, i) => (
          <div key={i} className="border border-gray-200 rounded-md p-3 mb-3 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-700">Image {i + 1}</span>
              <button onClick={() => removeImage(i)} className="text-xs text-red-600">Remove</button>
            </div>
            <Field label="Image"><ImagePicker value={im.url} onUpload={onUpload} onChange={url => updateImage(i, { url })} /></Field>
            <Field label="Alt text"><TextInput value={im.altText || ''} onChange={e => updateImage(i, { altText: e.target.value })} /></Field>
          </div>
        ))}
        <button onClick={addImage} className="w-full py-2 border border-dashed border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50">+ Add image</button>
      </div>
    </div>
  );
}
