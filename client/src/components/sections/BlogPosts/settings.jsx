import { Field, TextInput, Select, NumberInput } from '../../admin/pageBuilder/inputs';
import GridControls from '../../admin/pageBuilder/GridControls';

export default function BlogPostsSettings({ data, onChange }) {
  return (
    <div>
      <Field label="Heading"><TextInput value={data.heading || ''} onChange={e => onChange({ heading: e.target.value })} /></Field>
      <Field label="Source">
        <Select value={data.source || 'recent'} onChange={e => onChange({ source: e.target.value })}
          options={[{ value: 'recent', label: 'Most recent posts' }, { value: 'featured', label: 'Featured posts' }]} />
      </Field>
      <Field label="Number of posts">
        <NumberInput value={data.count ?? 3} min={1} max={12} onChange={e => onChange({ count: Number(e.target.value) })} />
      </Field>
      <GridControls data={data} onChange={onChange} />
      <Field label="See all link"><TextInput value={data.seeAllLink || '/blog'} onChange={e => onChange({ seeAllLink: e.target.value })} /></Field>
    </div>
  );
}
