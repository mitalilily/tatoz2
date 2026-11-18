import { Field, TextInput, TextArea } from '../../admin/pageBuilder/inputs';

export default function SizeGuideSettings({ data, onChange }) {
  const sizes = data.sizes || [
    { size: 'S', chest: '36', waist: '28', length: '26' },
    { size: 'M', chest: '38', waist: '30', length: '27' },
    { size: 'L', chest: '40', waist: '32', length: '28' },
    { size: 'XL', chest: '42', waist: '34', length: '29' },
  ];

  const updateSize = (i, field, value) => {
    const next = sizes.slice();
    next[i] = { ...next[i], [field]: value };
    onChange({ sizes: next });
  };

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-700 mb-2">Size Table</div>
      {sizes.map((row, i) => (
        <div key={i} className="flex gap-2 mb-2">
          <Field label="Size">
            <TextInput value={row.size} onChange={e => updateSize(i, 'size', e.target.value)} />
          </Field>
          <Field label="Chest">
            <TextInput value={row.chest} onChange={e => updateSize(i, 'chest', e.target.value)} />
          </Field>
          <Field label="Waist">
            <TextInput value={row.waist} onChange={e => updateSize(i, 'waist', e.target.value)} />
          </Field>
          <Field label="Length">
            <TextInput value={row.length} onChange={e => updateSize(i, 'length', e.target.value)} />
          </Field>
        </div>
      ))}
      <Field label="Fitting tips">
        <TextArea value={data.tips || ''} placeholder="When in doubt, size up!" onChange={e => onChange({ tips: e.target.value })} />
      </Field>
    </div>
  );
}