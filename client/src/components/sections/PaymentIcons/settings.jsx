import { Field, Checkbox } from '../../admin/pageBuilder/inputs';

const PAYMENT_OPTIONS = [
  { id: 'upi', label: 'UPI' },
  { id: 'card', label: 'Credit/Debit Cards' },
  { id: 'netbanking', label: 'Net Banking' },
  { id: 'wallet', label: 'Wallets' },
  { id: 'cod', label: 'Cash on Delivery' },
];

export default function PaymentIconsSettings({ data, onChange }) {
  const enabled = data.enabled || ['upi', 'card', 'netbanking', 'wallet', 'cod'];

  const toggle = (id) => {
    if (enabled.includes(id)) {
      onChange({ enabled: enabled.filter(e => e !== id) });
    } else {
      onChange({ enabled: [...enabled, id] });
    }
  };

  return (
    <div>
      <Field label="Enabled payment methods">
        {PAYMENT_OPTIONS.map(p => (
          <Checkbox key={p.id} label={p.label} checked={enabled.includes(p.id)} onChange={() => toggle(p.id)} />
        ))}
      </Field>
    </div>
  );
}