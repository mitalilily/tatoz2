import { Field, Select, Checkbox } from '../../admin/pageBuilder/inputs';

export default function SpacerSettings({ data, onChange }) {
  return (
    <div>
      <Field label="Height">
        <Select value={data.height || 'md'} onChange={e => onChange({ height: e.target.value })}
          options={[
            { value: 'xs', label: 'Tiny' }, { value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' },
            { value: 'lg', label: 'Large' }, { value: 'xl', label: 'X-Large' }, { value: '2xl', label: 'Huge' },
          ]} />
      </Field>
      <Checkbox label="Show horizontal rule" checked={!!data.showRule} onChange={e => onChange({ showRule: e.target.checked })} />
    </div>
  );
}
