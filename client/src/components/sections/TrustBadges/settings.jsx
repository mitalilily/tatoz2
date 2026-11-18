import { Field, TextInput, ImagePicker } from '../../admin/pageBuilder/inputs';

export default function TrustBadgesSettings({ data, onChange, onUpload }) {
  const badges = data.badges || [];
  const updateBadge = (i, patch) => {
    const next = badges.slice();
    next[i] = { ...next[i], ...patch };
    onChange({ badges: next });
  };
  const addBadge = () => onChange({ badges: [...badges, { imageUrl: '', altText: '', link: '' }] });
  const removeBadge = (i) => onChange({ badges: badges.filter((_, j) => j !== i) });
  return (
    <div>
      <Field label="Heading (optional)"><TextInput value={data.heading || ''} placeholder="Secure payment via" onChange={e => onChange({ heading: e.target.value })} /></Field>
      <div className="border-t border-gray-200 pt-3 mt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-700 mb-2">Badges ({badges.length})</div>
        {badges.map((b, i) => (
          <div key={i} className="border border-gray-200 rounded-md p-3 mb-3 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-700">Badge {i + 1}</span>
              <button onClick={() => removeBadge(i)} className="text-xs text-red-600">Remove</button>
            </div>
            <Field label="Image"><ImagePicker value={b.imageUrl} onUpload={onUpload} onChange={url => updateBadge(i, { imageUrl: url })} /></Field>
            <Field label="Alt text"><TextInput value={b.altText || ''} onChange={e => updateBadge(i, { altText: e.target.value })} /></Field>
            <Field label="Link (optional)"><TextInput value={b.link || ''} onChange={e => updateBadge(i, { link: e.target.value })} /></Field>
          </div>
        ))}
        <button onClick={addBadge} className="w-full py-2 border border-dashed border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50">+ Add badge</button>
      </div>
    </div>
  );
}
