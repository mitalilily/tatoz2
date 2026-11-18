import { Field, TextInput, Select, Toggle, ImagePicker, VideoPicker } from '../../admin/pageBuilder/inputs';

export default function InstaReelsSettings({ data, onChange, onUpload }) {
  const reels = data.reels || [{ url: '', customThumbnail: '', useCustomThumbnail: false }];

  const updateReel = (i, patch) => {
    const next = reels.slice();
    next[i] = { ...next[i], ...patch };
    onChange({ reels: next });
  };

  const addReel = () => onChange({ reels: [...reels, { url: '', videoUrl: '', customThumbnail: '', useCustomThumbnail: false }] });
  const removeReel = (i) => onChange({ reels: reels.filter((_, j) => j !== i) });

  const isValidUrl = (url) => !url || /instagram\.com\/(?:p|reel|tv)\/[\w-]+/.test(url);

  return (
    <div>
      <Field label="Heading (optional)">
        <TextInput value={data.heading || ''} onChange={e => onChange({ heading: e.target.value })} placeholder="e.g. Watch Our Latest Reels" />
      </Field>

      <Field label="Columns">
        <Select value={data.columns ?? 3} onChange={e => onChange({ columns: Number(e.target.value) })}
          options={[{ value: 2, label: '2 columns' }, { value: 3, label: '3 columns' }, { value: 4, label: '4 columns' }]} />
      </Field>

      <div className="border-t border-gray-200 pt-3 mt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-700 mb-2">Instagram Reels ({reels.length})</div>

        {reels.map((reel, i) => (
          <div key={i} className="border border-gray-200 rounded-md p-3 mb-3 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-700">Reel {i + 1}</span>
              <button onClick={() => removeReel(i)} className="text-xs text-red-600 hover:text-red-800">Remove</button>
            </div>

            <Field label="Video file (mp4)">
              <VideoPicker
                value={reel.videoUrl || ''}
                onUpload={onUpload}
                onChange={url => updateReel(i, { videoUrl: url })}
              />
            </Field>

            <Field label="Reel URL">
              <TextInput
                value={reel.url}
                onChange={e => updateReel(i, { url: e.target.value })}
                placeholder="https://www.instagram.com/reel/..."
              />
              {!isValidUrl(reel.url) && reel.url && (
                <div className="text-[10px] text-red-500 mt-1">Invalid Instagram URL</div>
              )}
            </Field>

            <div className="mt-2">
              <Toggle
                checked={reel.useCustomThumbnail || false}
                onChange={val => updateReel(i, { useCustomThumbnail: val })}
                label="Use custom thumbnail"
              />
            </div>

            {reel.useCustomThumbnail && (
              <div className="mt-2">
                <Field label="Custom Thumbnail">
                  <ImagePicker
                    value={reel.customThumbnail || ''}
                    onUpload={onUpload}
                    onChange={url => updateReel(i, { customThumbnail: url })}
                  />
                </Field>
              </div>
            )}
          </div>
        ))}

        <button
          onClick={addReel}
          className="w-full py-2 border border-dashed border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-100 hover:border-gray-400"
        >
          + Add Reel
        </button>
      </div>
    </div>
  );
}