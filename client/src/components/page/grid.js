// A configured column count is authoritative at every breakpoint. Inherited
// sections without a count retain their responsive commerce defaults.
export function gridStyle(data = {}, { columns = 3, gap = 16 } = {}) {
  const number = (value, fallback) => value == null || value === '' || !Number.isFinite(Number(value)) ? fallback : Number(value);
  const resolvedGap = number(({ sm: 8, md: 16, lg: 24 })[data.gap] ?? data.gap, gap);
  const count = Math.round(Math.min(6, Math.max(1, number(data.columns, columns))));
  return {
    gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
    rowGap: Math.max(0, number(data.rowGap, resolvedGap)),
    columnGap: Math.max(0, number(data.columnGap, resolvedGap)),
  };
}
