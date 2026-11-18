import { Field, TextArea, Select, Checkbox } from '../../admin/pageBuilder/inputs';

export default function CustomHtmlSettings({ data, onChange }) {
  return (
    <div>
      <Field label="HTML">
        <textarea
          rows={12}
          value={data.html || ''}
          onChange={e => onChange({ html: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-xs font-mono"
          placeholder="<div>Custom block</div>"
        />
      </Field>
      <Field label="Max width">
        <Select value={data.maxWidth || 'normal'} onChange={e => onChange({ maxWidth: e.target.value })}
          options={[{ value: 'narrow', label: 'Narrow' }, { value: 'normal', label: 'Normal' }, { value: 'wide', label: 'Wide' }, { value: 'full', label: 'Full' }]} />
      </Field>
      <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs text-amber-800">
        Output is sanitized — <code>&lt;script&gt;</code> tags and inline event handlers (<code>onclick</code> etc.) are stripped automatically. Iframes are allowed for embeds.
      </div>
    </div>
  );
}
