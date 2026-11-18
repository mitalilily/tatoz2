import { Field, TextInput, TextArea, ColorInput } from '../../admin/pageBuilder/inputs';

export default function CouponCtaSettings({ data, onChange }) {
  return (
    <div>
      <Field label="Heading"><TextInput value={data.heading || ''} onChange={e => onChange({ heading: e.target.value })} /></Field>
      <Field label="Subheading"><TextArea value={data.subheading || ''} onChange={e => onChange({ subheading: e.target.value })} /></Field>
      <Field label="Coupon code (uppercase, will be displayed as a copyable pill)">
        <TextInput value={data.code || ''} placeholder="WELCOME20" onChange={e => onChange({ code: e.target.value.toUpperCase() })} />
      </Field>
      <Field label="CTA label (optional)"><TextInput value={data.ctaLabel || ''} onChange={e => onChange({ ctaLabel: e.target.value })} /></Field>
      <Field label="CTA link"><TextInput value={data.ctaLink || ''} placeholder="/sale" onChange={e => onChange({ ctaLink: e.target.value })} /></Field>
      <Field label="Background color"><ColorInput value={data.backgroundColor} onChange={v => onChange({ backgroundColor: v })} /></Field>
      <Field label="Text color"><ColorInput value={data.textColor} onChange={v => onChange({ textColor: v })} /></Field>
    </div>
  );
}
