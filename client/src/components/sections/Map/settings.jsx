import { Field, TextInput, TextArea, Checkbox } from '../../admin/pageBuilder/inputs';

export default function MapSettings({ data, onChange }) {
  const locations = data.locations || [];
  const updateLoc = (i, patch) => {
    const next = locations.slice();
    next[i] = { ...next[i], ...patch };
    onChange({ locations: next });
  };
  const addLoc = () => onChange({ locations: [...locations, { name: '', address: '', phone: '', hours: '' }] });
  const removeLoc = (i) => onChange({ locations: locations.filter((_, j) => j !== i) });
  return (
    <div>
      <Field label="Heading"><TextInput value={data.heading || ''} onChange={e => onChange({ heading: e.target.value })} /></Field>
      <Field label="Google Maps embed URL">
        <TextInput value={data.embedUrl || ''} placeholder="https://www.google.com/maps/embed?pb=..." onChange={e => onChange({ embedUrl: e.target.value })} />
        <span className="text-[11px] text-gray-500 mt-1 block">In Google Maps, click "Share → Embed a map" and paste the <code>src</code> URL from the iframe.</span>
      </Field>
      <Checkbox label="Show location list alongside map" checked={data.showLocationList !== false} onChange={e => onChange({ showLocationList: e.target.checked })} />
      <div className="border-t border-gray-200 pt-3 mt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-700 mb-2">Locations ({locations.length})</div>
        {locations.map((l, i) => (
          <div key={i} className="border border-gray-200 rounded-md p-3 mb-3 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-700">Location {i + 1}</span>
              <button onClick={() => removeLoc(i)} className="text-xs text-red-600">Remove</button>
            </div>
            <Field label="Name"><TextInput value={l.name || ''} onChange={e => updateLoc(i, { name: e.target.value })} /></Field>
            <Field label="Address"><TextArea value={l.address || ''} onChange={e => updateLoc(i, { address: e.target.value })} /></Field>
            <Field label="Phone"><TextInput value={l.phone || ''} onChange={e => updateLoc(i, { phone: e.target.value })} /></Field>
            <Field label="Hours"><TextInput value={l.hours || ''} placeholder="Mon - Sat, 10am - 8pm" onChange={e => updateLoc(i, { hours: e.target.value })} /></Field>
          </div>
        ))}
        <button onClick={addLoc} className="w-full py-2 border border-dashed border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50">+ Add location</button>
      </div>
    </div>
  );
}
