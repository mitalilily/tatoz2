import { Field, NumberInput, TextInput, Select } from '../../admin/pageBuilder/inputs';

export default function ReturnPolicySettings({ data, onChange }) {
  return (
    <div>
      <Field label="Return duration (days)">
        <NumberInput value={data.days || 7} min={1} max={365} onChange={e => onChange({ days: Number(e.target.value) })} />
      </Field>
      <Field label="Icon">
        <Select value={data.iconType || 'refresh'}
          onChange={e => onChange({ iconType: e.target.value })}
          options={[
            { value: 'refresh', label: 'Refresh (Return)' },
            { value: 'shield', label: 'Shield (Guarantee)' },
          ]} />
      </Field>
      <Field label="Additional text">
        <TextInput value={data.text || ''} placeholder="Hassle-free refund process" onChange={e => onChange({ text: e.target.value })} />
      </Field>
    </div>
  );
}