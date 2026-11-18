import { Field, NumberInput } from './inputs';

export default function GridControls({ data, onChange, columns = true, defaultColumns = 3 }) {
  const numberChange = key => event => onChange({ [key]: event.target.value === '' ? null : Number(event.target.value) });
  const gap = ({ sm: 8, md: 16, lg: 24 })[data.gap] ?? data.gap ?? 16;
  return (
    <div className="grid grid-cols-2 gap-2" data-testid="page-builder-grid-controls">
      {columns && <Field label="Columns" hint="Blank = responsive default">
        <NumberInput data-testid="page-builder-grid-columns" min={1} max={6} value={data.columns ?? ''} placeholder={String(defaultColumns)} onChange={numberChange('columns')} />
      </Field>}
      <Field label="Gap (px)">
        <NumberInput data-testid="page-builder-grid-gap" min={0} max={200} value={gap} onChange={numberChange('gap')} />
      </Field>
      <Field label="Row gap (px)" hint="Blank = gap">
        <NumberInput data-testid="page-builder-grid-row-gap" min={0} max={200} value={data.rowGap ?? ''} onChange={numberChange('rowGap')} />
      </Field>
      <Field label="Column gap (px)" hint="Blank = gap">
        <NumberInput data-testid="page-builder-grid-column-gap" min={0} max={200} value={data.columnGap ?? ''} onChange={numberChange('columnGap')} />
      </Field>
    </div>
  );
}
