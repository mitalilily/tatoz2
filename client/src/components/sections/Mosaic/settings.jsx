import { Field, TextInput, Select, ImagePicker, NumberInput } from '../../admin/pageBuilder/inputs';
import GridControls from '../../admin/pageBuilder/GridControls';

const PRESET_TILE_COUNT = { '1+2': 3, '2x2': 4, 'L': 3, 'T': 3 };

export default function MosaicSettings({ data, onChange, onUpload }) {
  const tiles = data.tiles || [];
  const needed = PRESET_TILE_COUNT[data.preset] || 3;
  const updateTile = (i, patch) => {
    const next = tiles.slice();
    while (next.length < needed) next.push({});
    next[i] = { ...next[i], ...patch };
    onChange({ tiles: next });
  };
  return (
    <div>
      <Field label="Heading (optional)"><TextInput value={data.heading || ''} onChange={e => onChange({ heading: e.target.value })} /></Field>
      <Field label="Preset">
        <Select value={data.preset || '1+2'} onChange={e => onChange({ preset: e.target.value })}
          options={[
            { value: '1+2', label: '1 large + 2 small (3 tiles)' },
            { value: '2x2', label: '2 × 2 grid (4 tiles)' },
            { value: 'L', label: 'L-shape (3 tiles)' },
            { value: 'T', label: 'T-shape (3 tiles)' },
          ]} />
      </Field>
      <Field label="Arrangement" hint="The pattern stays the same on all devices. Switch to a mobile override to stack only on mobile.">
        <Select data-testid="page-builder-mosaic-arrangement" value={data.layoutMode || 'preserve'} onChange={e => onChange({ layoutMode: e.target.value })} options={[{ value: 'preserve', label: 'Keep mosaic pattern' }, { value: 'stack', label: 'Stack tiles vertically' }]} />
      </Field>
      <GridControls data={data} onChange={onChange} columns={false} />
      <Field label="Grid aspect ratio">
        <Select data-testid="page-builder-mosaic-ratio" value={data.aspectRatio || '2/1'} onChange={e => onChange({ aspectRatio: e.target.value })} options={['21/9', '2/1', '16/9', '3/2', '4/3', '1/1', '4/5'].map(value => ({ value, label: value.replace('/', ':') }))} />
      </Field>
      <Field label="Grid height (px)" hint="Leave blank for fluid height from the aspect ratio">
        <NumberInput data-testid="page-builder-mosaic-height" min={80} max={2000} value={data.height ?? ''} onChange={e => onChange({ height: e.target.value === '' ? null : Number(e.target.value) })} />
      </Field>
      <Field label="Tile corners (px)">
        <NumberInput data-testid="page-builder-mosaic-radius" min={0} max={200} value={data.borderRadius ?? 12} onChange={e => onChange({ borderRadius: Number(e.target.value) })} />
      </Field>
      <div className="border-t border-gray-200 pt-3 mt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-700 mb-2">Tiles ({needed})</div>
        {Array.from({ length: needed }).map((_, i) => {
          const t = tiles[i] || {};
          return (
            <div key={i} className="border border-gray-200 rounded-md p-3 mb-3 bg-gray-50">
              <div className="text-xs font-semibold text-gray-700 mb-2">Tile {i + 1}</div>
              <Field label="Image"><ImagePicker value={t.imageUrl} onUpload={onUpload} onChange={url => updateTile(i, { imageUrl: url })} /></Field>
              <Field label="Heading"><TextInput value={t.heading || ''} onChange={e => updateTile(i, { heading: e.target.value })} /></Field>
              <Field label="Alt text"><TextInput value={t.altText || ''} onChange={e => updateTile(i, { altText: e.target.value })} /></Field>
              <Field label="Image fit"><Select value={t.objectFit || 'cover'} onChange={e => updateTile(i, { objectFit: e.target.value })} options={['cover', 'contain', 'fill', 'scale-down'].map(value => ({ value, label: value }))} /></Field>
              <Field label="Image focus"><Select value={t.objectPosition || 'center center'} onChange={e => updateTile(i, { objectPosition: e.target.value })} options={['center center', 'top left', 'top center', 'top right', 'center left', 'center right', 'bottom left', 'bottom center', 'bottom right'].map(value => ({ value, label: value }))} /></Field>
              <Field label="Link"><TextInput value={t.link || ''} placeholder="/category/..." onChange={e => updateTile(i, { link: e.target.value })} /></Field>
            </div>
          );
        })}
      </div>
    </div>
  );
}
