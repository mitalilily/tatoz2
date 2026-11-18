import { useEffect, useState } from 'react';
import { Field, TextInput, Select } from '../../admin/pageBuilder/inputs';
import { categoryAPI } from '../../../services/api';
import GridControls from '../../admin/pageBuilder/GridControls';

export default function CategoriesShowcaseSettings({ data, onChange }) {
  const [cats, setCats] = useState([]);
  useEffect(() => { categoryAPI.getAll().then(r => setCats(r.data?.categories || [])).catch(() => {}); }, []);
  const ids = data.categoryIds || [];
  const toggle = (id) => onChange({ categoryIds: ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id] });
  return (
    <div>
      <GridControls data={data} onChange={onChange} defaultColumns={4} />
      <Field label="Heading"><TextInput value={data.heading || ''} onChange={e => onChange({ heading: e.target.value })} /></Field>
      <Field label="Layout">
        <Select value={data.layout || 'circle'} onChange={e => onChange({ layout: e.target.value })} options={[{ value: 'circle', label: 'Circle row' }, { value: 'square', label: 'Square grid' }]} />
      </Field>
      <Field label={`Categories (${ids.length} selected)`}>
        <div className="border border-gray-200 rounded-md max-h-64 overflow-y-auto">
          {cats.map(c => (
            <label key={c._id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={ids.includes(c._id)} onChange={() => toggle(c._id)} />
              {c.image && <img src={c.image} className="w-6 h-6 object-cover rounded" />}
              {c.name}
            </label>
          ))}
        </div>
      </Field>
    </div>
  );
}
