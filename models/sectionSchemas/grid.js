const bounded = (value, fallback, min = 0, max = 200) => {
  if (value == null || value === '') return fallback;
  return Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;
};

function validateGrid(data = {}, defaultColumns = null) {
  const legacyGap = { sm: 8, md: 16, lg: 24 };
  return {
    columns: bounded(data.columns, defaultColumns, 1, 6) == null ? null : Math.round(bounded(data.columns, defaultColumns, 1, 6)),
    gap: bounded(legacyGap[data.gap] ?? data.gap, 16),
    rowGap: bounded(data.rowGap, null),
    columnGap: bounded(data.columnGap, null),
  };
}

module.exports = { validateGrid, bounded };
