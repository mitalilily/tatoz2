import { Field, NumberInput, TextInput } from '../../admin/pageBuilder/inputs';

export default function ShippingBarSettings({ data, onChange }) {
  return (
    <div>
      <Field label="Free shipping threshold (₹)">
        <NumberInput value={data.threshold || 499} min={0} step={50}
          onChange={e => onChange({ threshold: Number(e.target.value) })} />
      </Field>
      <Field label="Message">
        <TextInput value={data.message || 'Free shipping on orders over ₹{threshold}!'}
          onChange={e => onChange({ message: e.target.value })} />
        <span className="text-[11px] text-gray-500 mt-1 block">Use {'{threshold}'} for dynamic price</span>
      </Field>
    </div>
  );
}