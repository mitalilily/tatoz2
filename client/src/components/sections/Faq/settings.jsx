import { Field, TextInput, TextArea, Checkbox } from '../../admin/pageBuilder/inputs';

export default function FaqSettings({ data, onChange }) {
  const items = data.items || [];
  const updateItem = (i, patch) => {
    const next = items.slice();
    next[i] = { ...next[i], ...patch };
    onChange({ items: next });
  };
  const addItem = () => onChange({ items: [...items, { question: '', answer: '' }] });
  const removeItem = (i) => onChange({ items: items.filter((_, j) => j !== i) });
  return (
    <div>
      <Field label="Heading"><TextInput value={data.heading || ''} onChange={e => onChange({ heading: e.target.value })} /></Field>
      <Checkbox label="Expand the first question by default" checked={!!data.expandFirst} onChange={e => onChange({ expandFirst: e.target.checked })} />
      <div className="border-t border-gray-200 pt-3 mt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-700 mb-2">Q&A ({items.length})</div>
        {items.map((it, i) => (
          <div key={i} className="border border-gray-200 rounded-md p-3 mb-3 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-700">Item {i + 1}</span>
              <button onClick={() => removeItem(i)} className="text-xs text-red-600">Remove</button>
            </div>
            <Field label="Question"><TextInput value={it.question || ''} onChange={e => updateItem(i, { question: e.target.value })} /></Field>
            <Field label="Answer"><TextArea value={it.answer || ''} onChange={e => updateItem(i, { answer: e.target.value })} /></Field>
          </div>
        ))}
        <button onClick={addItem} className="w-full py-2 border border-dashed border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50">+ Add question</button>
      </div>
    </div>
  );
}
