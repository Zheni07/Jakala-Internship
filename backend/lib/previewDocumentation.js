const { dbAll } = require('./sqliteAsync');
const { ensureSqlLimit } = require('./sqlHelpers');

function normalizeExistingDocWithPreview(preview, documentation) {
  const doc = documentation || [];
  if (!doc.length) {
    if (!preview.length) return [];
    const keys = Object.keys(preview[0]);
    return keys.map((col) => {
      const values = preview.map((row) => row[col]);
      const nonNullValues = values.filter((v) => v !== null && v !== '');
      return {
        name: col,
        type: typeof preview[0][col],
        description: '',
        nullable: values.some((v) => v === null || v === ''),
        unique:
          new Set(nonNullValues).size === nonNullValues.length &&
          nonNullValues.length === preview.length,
        testNull: false,
        testUnique: false,
      };
    });
  }
  return doc.map((col) => {
    const key = col.name || col.column;
    const normalized = {
      ...col,
      name: col.name || col.column || col.source || col.original || '',
      description: col.description || '',
      type: col.type || typeof preview[0]?.[key] || 'string',
      nullable:
        col.nullable !== undefined
          ? col.nullable
          : preview.length > 0
            ? preview.some(
                (row) => row[key] === null || row[key] === ''
              )
            : false,
      unique:
        col.unique !== undefined
          ? col.unique
          : preview.length > 0
            ? new Set(preview.map((row) => row[key])).size === preview.length
            : false,
      testNull: col.testNull || false,
      testUnique: col.testUnique || false,
    };
    delete normalized.column;
    return normalized;
  });
}

function normalizeDocWhenPreviewFails(documentation) {
  const doc = documentation || [];
  if (!doc.length) return [];
  return doc
    .map((col) => ({
      ...col,
      name: col.name || col.column || col.source || col.original || '',
      description: col.description || '',
      type: col.type || 'string',
      nullable: col.nullable !== undefined ? col.nullable : false,
      unique: col.unique !== undefined ? col.unique : false,
      testNull: col.testNull || false,
      testUnique: col.testUnique || false,
    }))
    .map((col) => {
      delete col.column;
      return col;
    });
}

/**
 * Runs preview SQL (LIMIT 100) and builds documentation rows — shared by staging / curated / marts saves.
 */
async function computePreviewAndDocumentation(db, sql, documentation) {
  const previewSQL = ensureSqlLimit(sql.trim(), 100);
  try {
    const preview = await dbAll(db, previewSQL);
    const doc = normalizeExistingDocWithPreview(preview, documentation);
    return { preview, doc };
  } catch (e) {
    return {
      preview: [],
      doc: normalizeDocWhenPreviewFails(documentation),
    };
  }
}

module.exports = {
  computePreviewAndDocumentation,
  normalizeExistingDocWithPreview,
  normalizeDocWhenPreviewFails,
};
