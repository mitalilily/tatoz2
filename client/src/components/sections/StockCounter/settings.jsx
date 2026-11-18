import { Field, NumberInput, TextInput } from '../../admin/pageBuilder/inputs';

export default function StockCounterSettings({ data, onChange }) {
  return (
    <div>
      <Field label="Current stock count">
        <NumberInput value={data.count || 5} min={0} onChange={e => onChange({ count: Number(e.target.value) })} />
      </Field>
      <Field label="Low stock threshold">
        <NumberInput value={data.threshold || 5} min={1} onChange={e => onChange({ threshold: Number(e.target.value) })} />
        <span className="text-[11px] text-gray-500 mt-1 block">Show urgency styling when stock is at or below this number</span>
      </Field>
      <Field label="Message">
        <TextInput value={data.message || 'Only {count} left!'} onChange={e => onChange({ message: e.target.value })} />
        <span className="text-[11px] text-gray-500 mt-1 block">Use {'{count}'} for dynamic stock number</span>
      </Field>
    </div>
  );
}