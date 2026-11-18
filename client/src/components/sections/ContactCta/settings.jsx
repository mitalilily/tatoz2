import { Field, TextInput, Select } from '../../admin/pageBuilder/inputs';

export default function ContactCtaSettings({ data, onChange }) {
  return (
    <div>
      <Field label="Display mode">
        <Select value={data.mode || 'inline'}
          onChange={e => onChange({ mode: e.target.value })}
          options={[
            { value: 'inline', label: 'Inline banner' },
            { value: 'floating', label: 'Floating button (bottom-right)' },
          ]} />
      </Field>
      <Field label="Icon">
        <Select value={data.iconType || 'chat'}
          onChange={e => onChange({ iconType: e.target.value })}
          options={[
            { value: 'chat', label: 'Chat bubble' },
            { value: 'phone', label: 'Phone' },
            { value: 'mail', label: 'Email' },
            { value: 'whatsapp', label: 'WhatsApp' },
          ]} />
      </Field>
      <Field label="Button text">
        <TextInput value={data.label || 'Need help? Chat with us'} onChange={e => onChange({ label: e.target.value })} />
      </Field>
      <Field label="Link/URL">
        <TextInput value={data.link || '#'} placeholder="https://wa.me/..." onChange={e => onChange({ link: e.target.value })} />
      </Field>
    </div>
  );
}