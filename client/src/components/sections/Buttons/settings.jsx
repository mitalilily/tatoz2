import { Field, TextInput, Select } from '../../admin/pageBuilder/inputs';

export default function ButtonsSettings({ data, onChange }) {
  const buttons = data.buttons || [];
  const updateBtn = (i, patch) => {
    const next = buttons.slice();
    next[i] = { ...next[i], ...patch };
    onChange({ buttons: next });
  };
  const addBtn = () => onChange({ buttons: [...buttons, { label: '', link: '', style: 'solid', size: 'md' }] });
  const removeBtn = (i) => onChange({ buttons: buttons.filter((_, j) => j !== i) });
  return (
    <div>
      <Field label="Heading (optional)"><TextInput value={data.heading || ''} onChange={e => onChange({ heading: e.target.value })} /></Field>
      <Field label="Align">
        <Select value={data.align || 'center'} onChange={e => onChange({ align: e.target.value })} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]} />
      </Field>
      <div className="border-t border-gray-200 pt-3 mt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-700 mb-2">Buttons ({buttons.length})</div>
        {buttons.map((b, i) => (
          <div key={i} className="border border-gray-200 rounded-md p-3 mb-3 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-700">Button {i + 1}</span>
              <button onClick={() => removeBtn(i)} className="text-xs text-red-600">Remove</button>
            </div>
            <Field label="Label"><TextInput value={b.label || ''} onChange={e => updateBtn(i, { label: e.target.value })} /></Field>
            <Field label="Link"><TextInput value={b.link || ''} placeholder="/sale or https://..." onChange={e => updateBtn(i, { link: e.target.value })} /></Field>
            <Field label="Style"><Select value={b.style || 'solid'} onChange={e => updateBtn(i, { style: e.target.value })} options={[{ value: 'solid', label: 'Solid' }, { value: 'outline', label: 'Outline' }, { value: 'ghost', label: 'Ghost' }]} /></Field>
            <Field label="Size"><Select value={b.size || 'md'} onChange={e => updateBtn(i, { size: e.target.value })} options={[{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }]} /></Field>
          </div>
        ))}
        <button onClick={addBtn} className="w-full py-2 border border-dashed border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50">+ Add button</button>
      </div>
    </div>
  );
}
