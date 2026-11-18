import { Field, TextInput, TextArea, ColorInput } from '../../admin/pageBuilder/inputs';

function isoToLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CountdownSettings({ data, onChange }) {
  return (
    <div>
      <Field label="Heading"><TextInput value={data.heading || ''} onChange={e => onChange({ heading: e.target.value })} /></Field>
      <Field label="Subheading"><TextArea value={data.subheading || ''} onChange={e => onChange({ subheading: e.target.value })} /></Field>
      <Field label="Ends at">
        <input
          type="datetime-local"
          value={isoToLocalInput(data.endsAt)}
          onChange={e => onChange({ endsAt: e.target.value ? new Date(e.target.value).toISOString() : '' })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
      </Field>
      <Field label="CTA label (optional)"><TextInput value={data.ctaLabel || ''} onChange={e => onChange({ ctaLabel: e.target.value })} /></Field>
      <Field label="CTA link"><TextInput value={data.ctaLink || ''} placeholder="/sale" onChange={e => onChange({ ctaLink: e.target.value })} /></Field>
      <Field label="Background color"><ColorInput value={data.backgroundColor} onChange={v => onChange({ backgroundColor: v })} /></Field>
      <Field label="Text color"><ColorInput value={data.textColor} onChange={v => onChange({ textColor: v })} /></Field>
      <Field label="Message after expiry"><TextInput value={data.expiredMessage || ''} onChange={e => onChange({ expiredMessage: e.target.value })} /></Field>
    </div>
  );
}
