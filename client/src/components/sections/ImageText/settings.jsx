import { Field, TextInput, TextArea, Select, ImagePicker } from '../../admin/pageBuilder/inputs';

export default function ImageTextSettings({ data, onChange, onUpload }) {
  return (
    <div>
      <Field label="Image"><ImagePicker value={data.imageUrl} onUpload={onUpload} onChange={url => onChange({ imageUrl: url })} /></Field>
      <Field label="Image position">
        <Select value={data.imagePosition || 'left'} onChange={e => onChange({ imagePosition: e.target.value })} options={[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]} />
      </Field>
      <Field label="Heading"><TextInput value={data.heading || ''} onChange={e => onChange({ heading: e.target.value })} /></Field>
      <Field label="Body"><TextArea value={data.body || ''} onChange={e => onChange({ body: e.target.value })} /></Field>
      <Field label="CTA label"><TextInput value={data.ctaLabel || ''} onChange={e => onChange({ ctaLabel: e.target.value })} /></Field>
      <Field label="CTA link"><TextInput value={data.ctaLink || ''} onChange={e => onChange({ ctaLink: e.target.value })} /></Field>
    </div>
  );
}
