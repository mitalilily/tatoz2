import { Field, TextInput, Select } from '../../admin/pageBuilder/inputs';
import GridControls from '../../admin/pageBuilder/GridControls';

export default function StatsSettings({ data, onChange }) {
  const items = data.items || [];
  const updateItem = (i, patch) => {
    const next = items.slice();
    next[i] = { ...next[i], ...patch };
    onChange({ items: next });
  };
  const addItem = () => onChange({ items: [...items, { value: '', label: '' }] });
  const removeItem = (i) => onChange({ items: items.filter((_, j) => j !== i) });
  return (
    <div>
      <Field label="Heading (optional)"><TextInput value={data.heading || ''} onChange={e => onChange({ heading: e.target.value })} /></Field>
      <GridControls data={data} onChange={onChange} defaultColumns={4} />
      <Field label="Style">
        <Select value={data.style || 'plain'} onChange={e => onChange({ style: e.target.value })}
          options={[{ value: 'plain', label: 'Plain' }, { value: 'card', label: 'Card' }, { value: 'split', label: 'Split (left-bordered)' }]} />
      </Field>
      <div className="border-t border-gray-200 pt-3 mt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-700 mb-2">Stats ({items.length})</div>
        {items.map((it, i) => (
          <div key={i} className="border border-gray-200 rounded-md p-3 mb-3 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-700">Stat {i + 1}</span>
              <button onClick={() => removeItem(i)} className="text-xs text-red-600">Remove</button>
            </div>
            <Field label="Value"><TextInput value={it.value || ''} placeholder="50k+" onChange={e => updateItem(i, { value: e.target.value })} /></Field>
            <Field label="Label"><TextInput value={it.label || ''} placeholder="Happy customers" onChange={e => updateItem(i, { label: e.target.value })} /></Field>
          </div>
        ))}
        <button onClick={addItem} className="w-full py-2 border border-dashed border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50">+ Add stat</button>
      </div>
    </div>
  );
}
