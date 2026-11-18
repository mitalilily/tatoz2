import { Field, TextInput, Select, Checkbox, ImagePicker } from '../../admin/pageBuilder/inputs';

export default function ImageBannerSettings({ data, onChange, onUpload }) {
  return (
    <div>
      <Field label="Image"><ImagePicker value={data.imageUrl} onUpload={onUpload} onChange={url => onChange({ imageUrl: url })} /></Field>
      <Field label="Alt text (accessibility)"><TextInput value={data.altText || ''} onChange={e => onChange({ altText: e.target.value })} /></Field>
      <Field label="Link (optional)"><TextInput value={data.link || ''} placeholder="/sale" onChange={e => onChange({ link: e.target.value })} /></Field>
      <Field label="Aspect ratio">
        <Select value={data.aspectRatio || 'banner'} onChange={e => onChange({ aspectRatio: e.target.value })}
          options={[
            { value: 'banner', label: '3:1 banner' },
            { value: 'wide', label: '16:9 wide' },
            { value: 'square', label: 'Square' },
            { value: 'auto', label: 'Image native' },
          ]} />
      </Field>
      <Checkbox label="Full-bleed (edge-to-edge)" checked={!!data.fullBleed} onChange={e => onChange({ fullBleed: e.target.checked })} />
    </div>
  );
}
