import { Field, TextInput, Checkbox, ColorInput } from '../../admin/pageBuilder/inputs';

export default function AnnouncementBarSettings({ data, onChange }) {
  return (
    <div>
      <Field label="Text"><TextInput value={data.text || ''} onChange={e => onChange({ text: e.target.value })} /></Field>
      <Field label="Link label (optional)"><TextInput value={data.linkLabel || ''} onChange={e => onChange({ linkLabel: e.target.value })} /></Field>
      <Field label="Link URL"><TextInput value={data.linkUrl || ''} placeholder="/sale or https://..." onChange={e => onChange({ linkUrl: e.target.value })} /></Field>
      <Field label="Background color">
        <ColorInput value={data.backgroundColor} onChange={v => onChange({ backgroundColor: v })} />
      </Field>
      <Field label="Text color">
        <ColorInput value={data.textColor} onChange={v => onChange({ textColor: v })} />
      </Field>
      <Checkbox label="Dismissible (X button)" checked={!!data.dismissible} onChange={e => onChange({ dismissible: e.target.checked })} />
    </div>
  );
}
