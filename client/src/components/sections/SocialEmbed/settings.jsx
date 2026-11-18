import { Field, TextInput, Select } from '../../admin/pageBuilder/inputs';

export default function SocialEmbedSettings({ data, onChange }) {
  return (
    <div>
      <Field label="Heading (optional)"><TextInput value={data.heading || ''} onChange={e => onChange({ heading: e.target.value })} /></Field>
      <Field label="Embed URL">
        <TextInput value={data.embedUrl || ''} placeholder="https://www.instagram.com/p/..., https://www.tiktok.com/@user/video/..., or YouTube" onChange={e => onChange({ embedUrl: e.target.value })} />
      </Field>
      <Field label="Aspect ratio">
        <Select value={data.aspectRatio || '9/16'} onChange={e => onChange({ aspectRatio: e.target.value })}
          options={[
            { value: '9/16', label: '9:16 (reels / TikTok)' },
            { value: '4/5', label: '4:5 (Instagram portrait)' },
            { value: '1/1', label: '1:1 (square)' },
            { value: '16/9', label: '16:9 (YouTube)' },
          ]} />
      </Field>
      <Field label="Max width">
        <Select value={data.maxWidth || 'narrow'} onChange={e => onChange({ maxWidth: e.target.value })}
          options={[{ value: 'narrow', label: 'Narrow (single feed)' }, { value: 'normal', label: 'Normal' }, { value: 'wide', label: 'Wide' }]} />
      </Field>
    </div>
  );
}
