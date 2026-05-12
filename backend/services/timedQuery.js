const { withDatabase, dbAll } = require('../lib/sqliteAsync');
const { ensureLimit } = require('../lib/sqlHelpers');
const config = require('../config');

async function runTimedQuery(dbPath, sql, limit = config.fullChartRows) {
  if (!sql) throw new Error('Missing SQL');
  const finalSQL = ensureLimit(sql, limit);
  const start = process.hrtime.bigint();
  const rows = await withDatabase(dbPath, (ldb) => dbAll(ldb, finalSQL));
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  return { rows, elapsedMs };
}

module.exports = { runTimedQuery };
