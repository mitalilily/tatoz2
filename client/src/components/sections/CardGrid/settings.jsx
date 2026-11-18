import { Field, TextInput, Select, ImagePicker } from '../../admin/pageBuilder/inputs';
import GridControls from '../../admin/pageBuilder/GridControls';

export default function CardGridSettings({ data, onChange, onUpload }) {
  const cards = data.cards || [];
  const updateCard = (i, patch) => {
    const next = cards.slice();
    next[i] = { ...next[i], ...patch };
    onChange({ cards: next });
  };
  const addCard = () => onChange({ cards: [...cards, { imageUrl: '', heading: '', subtext: '', link: '' }] });
  const removeCard = (i) => onChange({ cards: cards.filter((_, j) => j !== i) });

  return (
    <div>
      <Field label="Heading (optional)"><TextInput value={data.heading || ''} onChange={e => onChange({ heading: e.target.value })} /></Field>
      <GridControls data={data} onChange={onChange} />
      <Field label="Card style">
        <Select value={data.cardStyle || 'belowImage'} onChange={e => onChange({ cardStyle: e.target.value })} options={[{ value: 'overlay', label: 'Text overlay on image' }, { value: 'belowImage', label: 'Text below image' }, { value: 'imageOnly', label: 'Image only' }]} />
      </Field>
      <div className="border-t border-gray-200 pt-3 mt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-700 mb-2">Cards ({cards.length})</div>
        {cards.map((c, i) => (
          <div key={i} className="border border-gray-200 rounded-md p-3 mb-3 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-700">Card {i + 1}</span>
              <button onClick={() => removeCard(i)} className="text-xs text-red-600">Remove</button>
            </div>
            <Field label="Image"><ImagePicker value={c.imageUrl} onUpload={onUpload} onChange={url => updateCard(i, { imageUrl: url })} /></Field>
            <Field label="Heading"><TextInput value={c.heading} onChange={e => updateCard(i, { heading: e.target.value })} /></Field>
            <Field label="Subtext"><TextInput value={c.subtext} onChange={e => updateCard(i, { subtext: e.target.value })} /></Field>
            <Field label="Link"><TextInput value={c.link} placeholder="/category/..." onChange={e => updateCard(i, { link: e.target.value })} /></Field>
          </div>
        ))}
        <button onClick={addCard} className="w-full py-2 border border-dashed border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50">+ Add card</button>
      </div>
    </div>
  );
}
