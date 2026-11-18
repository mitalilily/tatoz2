import { useEffect, useState } from 'react';
import { Field, TextInput, Select, Checkbox } from '../../admin/pageBuilder/inputs';
import { brandAPI } from '../../../services/api';

export default function BrandStripSettings({ data, onChange }) {
  const [brands, setBrands] = useState([]);
  useEffect(() => { brandAPI.getAll().then(r => setBrands(r.data?.brands || [])).catch(() => {}); }, []);
  const ids = data.brandIds || [];
  const toggle = (id) => onChange({ brandIds: ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id] });
  return (
    <div>
      <Field label="Heading (optional)"><TextInput value={data.heading || ''} placeholder="Trusted by brands" onChange={e => onChange({ heading: e.target.value })} /></Field>
      <Field label="Style">
        <Select value={data.style || 'static'} onChange={e => onChange({ style: e.target.value })} options={[{ value: 'static', label: 'Static row' }, { value: 'marquee', label: 'Marquee scroll' }]} />
      </Field>
      <Checkbox label="Grayscale (color-on-hover)" checked={!!data.grayscale} onChange={e => onChange({ grayscale: e.target.checked })} />
      <Field label={`Brands (${ids.length} selected)`}>
        <div className="border border-gray-200 rounded-md max-h-64 overflow-y-auto">
          {brands.map(b => (
            <label key={b._id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={ids.includes(b._id)} onChange={() => toggle(b._id)} />
              {b.logo && <img src={b.logo} className="w-6 h-6 object-contain rounded" />}
              {b.name}
            </label>
          ))}
        </div>
      </Field>
    </div>
  );
}
