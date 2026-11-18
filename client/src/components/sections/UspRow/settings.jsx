import { Field, TextInput, Select } from '../../admin/pageBuilder/inputs';
import GridControls from '../../admin/pageBuilder/GridControls';

const ICON_OPTIONS = ['truck', 'shield', 'headphones', 'rotate', 'clock', 'check', 'gift', 'award', 'sparkles', 'zap'].map(v => ({ value: v, label: v }));

export default function UspRowSettings({ data, onChange }) {
  const items = data.items || [];
  const updateItem = (i, patch) => {
    const next = items.slice();
    next[i] = { ...next[i], ...patch };
    onChange({ items: next });
  };
  const addItem = () => onChange({ items: [...items, { icon: 'check', heading: '', subtext: '' }] });
  const removeItem = (i) => onChange({ items: items.filter((_, j) => j !== i) });
  return (
    <div>
      <GridControls data={data} onChange={onChange} defaultColumns={4} />
      <div className="border-t border-gray-200 pt-3 mt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-700 mb-2">Items ({items.length})</div>
        {items.map((it, i) => (
          <div key={i} className="border border-gray-200 rounded-md p-3 mb-3 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-700">Item {i + 1}</span>
              <button onClick={() => removeItem(i)} className="text-xs text-red-600">Remove</button>
            </div>
            <Field label="Icon"><Select value={it.icon || 'check'} onChange={e => updateItem(i, { icon: e.target.value })} options={ICON_OPTIONS} /></Field>
            <Field label="Heading"><TextInput value={it.heading || ''} onChange={e => updateItem(i, { heading: e.target.value })} /></Field>
            <Field label="Subtext"><TextInput value={it.subtext || ''} onChange={e => updateItem(i, { subtext: e.target.value })} /></Field>
          </div>
        ))}
        <button onClick={addItem} className="w-full py-2 border border-dashed border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50">+ Add item</button>
      </div>
    </div>
  );
}
