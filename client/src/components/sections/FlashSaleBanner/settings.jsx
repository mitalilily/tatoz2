import { Field, TextInput, ColorInput, Checkbox } from '../../admin/pageBuilder/inputs';

export default function FlashSaleBannerSettings({ data, onChange }) {
  return (
    <div>
      <Field label="Banner message">
        <TextInput value={data.message || 'FLASH SALE: 20% OFF!'} onChange={e => onChange({ message: e.target.value })} />
      </Field>
      <Field label="Background color">
        <ColorInput value={data.bgColor || '#ef4444'} onChange={v => onChange({ bgColor: v })} />
      </Field>
      <Checkbox label="Animated pulse effect" checked={data.animated !== false} onChange={e => onChange({ animated: e.target.checked })} />
    </div>
  );
}