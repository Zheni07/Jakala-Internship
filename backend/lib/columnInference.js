function detectType(values) {
  if (!Array.isArray(values) || values.length === 0) return 'string';
  if (values.every((v) => v === null || v === '' || !isNaN(Number(v)))) return 'number';
  if (values.every((v) => v === null || v === '' || !isNaN(Date.parse(v)))) return 'date';
  return 'string';
}

/** Builds column schema rows from a preview result set (used by SQL preview endpoints). */
function columnsFromPreview(preview) {
  if (!preview.length) return [];
  const keys = Object.keys(preview[0]);
  return keys.map((col) => {
    const values = preview.map((row) => row[col]);
    const nonNullValues = values.filter((v) => v !== null && v !== '');
    const type = detectType(nonNullValues);
    const nullable = values.some((v) => v === null || v === '');
    const unique =
      new Set(nonNullValues).size === nonNullValues.length &&
      nonNullValues.length === preview.length;
    return {
      name: col,
      type,
      nullable,
      unique,
    };
  });
}

module.exports = { detectType, columnsFromPreview };
