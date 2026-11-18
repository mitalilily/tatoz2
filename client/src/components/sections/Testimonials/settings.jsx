import { Field, TextInput, TextArea, NumberInput, Select, ImagePicker } from '../../admin/pageBuilder/inputs';
import GridControls from '../../admin/pageBuilder/GridControls';

export default function TestimonialsSettings({ data, onChange, onUpload }) {
  const items = data.items || [];
  const updateItem = (i, patch) => {
    const next = items.slice();
    next[i] = { ...next[i], ...patch };
    onChange({ items: next });
  };
  const addItem = () => onChange({ items: [...items, { quote: '', authorName: '', authorTitle: '', avatarUrl: '', rating: 5 }] });
  const removeItem = (i) => onChange({ items: items.filter((_, j) => j !== i) });
  return (
    <div>
      <Field label="Heading"><TextInput value={data.heading || ''} onChange={e => onChange({ heading: e.target.value })} /></Field>
      <Field label="Layout">
        <Select value={data.layout || 'grid'} onChange={e => onChange({ layout: e.target.value })} options={[{ value: 'grid', label: 'Grid' }, { value: 'carousel', label: 'Horizontal carousel' }]} />
      </Field>
      <GridControls data={data} onChange={onChange} />
      <div className="border-t border-gray-200 pt-3 mt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-700 mb-2">Testimonials ({items.length})</div>
        {items.map((it, i) => (
          <div key={i} className="border border-gray-200 rounded-md p-3 mb-3 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-700">Item {i + 1}</span>
              <button onClick={() => removeItem(i)} className="text-xs text-red-600">Remove</button>
            </div>
            <Field label="Quote"><TextArea value={it.quote || ''} onChange={e => updateItem(i, { quote: e.target.value })} /></Field>
            <Field label="Author name"><TextInput value={it.authorName || ''} onChange={e => updateItem(i, { authorName: e.target.value })} /></Field>
            <Field label="Author title"><TextInput value={it.authorTitle || ''} placeholder="Verified buyer" onChange={e => updateItem(i, { authorTitle: e.target.value })} /></Field>
            <Field label="Avatar"><ImagePicker value={it.avatarUrl} onUpload={onUpload} onChange={url => updateItem(i, { avatarUrl: url })} /></Field>
            <Field label="Rating (0–5)"><NumberInput value={it.rating ?? 5} min={0} max={5} step={1} onChange={e => updateItem(i, { rating: Number(e.target.value) })} /></Field>
          </div>
        ))}
        <button onClick={addItem} className="w-full py-2 border border-dashed border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50">+ Add testimonial</button>
      </div>
    </div>
  );
}
