/**
 * Appends a LIMIT clause when the SQL does not already contain LIMIT (case-insensitive).
 */
function ensureSqlLimit(sql, limit = 100) {
  if (!sql) return '';
  let trimmed = sql.trim();
  if (!/limit\s+\d+/i.test(trimmed)) {
    trimmed = trimmed.replace(/;*\s*$/, '') + ` LIMIT ${limit}`;
  }
  return trimmed;
}

/**
 * Adds or preserves LIMIT for large SELECTs (e.g. charts / perf runs).
 */
function ensureLimit(sql, limit) {
  if (!sql) return '';
  let trimmed = sql.trim();
  if (!/limit\s+\d+/i.test(trimmed)) {
    trimmed = trimmed.replace(/;*\s*$/, '') + ` LIMIT ${limit}`;
  }
  return trimmed;
}

module.exports = { ensureSqlLimit, ensureLimit };
