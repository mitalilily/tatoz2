import { Field, TextInput, Select, Checkbox, ImagePicker } from '../../admin/pageBuilder/inputs';

export default function VideoSettings({ data, onChange, onUpload }) {
  return (
    <div>
      <Field label="Heading (optional)"><TextInput value={data.heading || ''} onChange={e => onChange({ heading: e.target.value })} /></Field>
      <Field label="Source">
        <Select value={data.source || 'url'} onChange={e => onChange({ source: e.target.value })}
          options={[{ value: 'url', label: 'YouTube / Vimeo / direct URL' }, { value: 'upload', label: 'Uploaded MP4' }]} />
      </Field>
      <Field label="Video URL">
        <TextInput value={data.videoUrl || ''} placeholder="https://youtube.com/watch?v=... or https://your-cdn.com/video.mp4" onChange={e => onChange({ videoUrl: e.target.value })} />
      </Field>
      <Field label="Poster image (optional, for direct MP4)">
        <ImagePicker value={data.posterUrl} onUpload={onUpload} onChange={url => onChange({ posterUrl: url })} />
      </Field>
      <Field label="Aspect ratio">
        <Select value={data.aspectRatio || '16/9'} onChange={e => onChange({ aspectRatio: e.target.value })}
          options={[
            { value: '16/9', label: '16:9 (widescreen)' },
            { value: '4/3', label: '4:3 (classic)' },
            { value: '1/1', label: '1:1 (square)' },
            { value: '9/16', label: '9:16 (vertical / reels)' },
          ]} />
      </Field>
      <Checkbox label="Autoplay" checked={!!data.autoplay} onChange={e => onChange({ autoplay: e.target.checked })} />
      <Checkbox label="Muted (required for autoplay in most browsers)" checked={data.muted !== false} onChange={e => onChange({ muted: e.target.checked })} />
      <Checkbox label="Loop" checked={!!data.loop} onChange={e => onChange({ loop: e.target.checked })} />
    </div>
  );
}
