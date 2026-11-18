import { Field, NumberInput } from '../../admin/pageBuilder/inputs';

export default function BackToTopSettings({ data, onChange }) {
  return (
    <div>
      <Field label="Show after scroll depth (px)">
        <NumberInput value={data.scrollDepth || 300} min={100} max={2000} step={50}
          onChange={e => onChange({ scrollDepth: Number(e.target.value) })} />
        <span className="text-[11px] text-gray-500 mt-1 block">Button appears after scrolling this many pixels</span>
      </Field>
    </div>
  );
}