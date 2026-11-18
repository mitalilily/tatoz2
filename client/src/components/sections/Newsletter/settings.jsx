import { Field, TextInput, TextArea, Select } from '../../admin/pageBuilder/inputs';

export default function NewsletterSettings({ data, onChange }) {
  return (
    <div>
      <Field label="Heading"><TextInput value={data.heading || ''} onChange={e => onChange({ heading: e.target.value })} /></Field>
      <Field label="Subheading"><TextArea value={data.subheading || ''} onChange={e => onChange({ subheading: e.target.value })} /></Field>
      <Field label="Input placeholder"><TextInput value={data.placeholder || ''} onChange={e => onChange({ placeholder: e.target.value })} /></Field>
      <Field label="Button label"><TextInput value={data.buttonLabel || ''} onChange={e => onChange({ buttonLabel: e.target.value })} /></Field>
      <Field label="Success message"><TextInput value={data.successMessage || ''} onChange={e => onChange({ successMessage: e.target.value })} /></Field>
      <Field label="Style">
        <Select value={data.style || 'card'} onChange={e => onChange({ style: e.target.value })}
          options={[{ value: 'card', label: 'Gradient card' }, { value: 'wide', label: 'Dark wide bar' }, { value: 'inline', label: 'Inline (no background)' }]} />
      </Field>
    </div>
  );
}
