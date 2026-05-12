'use strict';

const {
  path,
  fs,
  sqlite3,
  randomUUID,
  workspace,
  dbAll,
  dbGet,
  dbRun,
  withDatabase,
  Http,
  ensureSqlLimit,
  listJsonStemNames,
  computePreviewAndDocumentation,
  detectType,
  columnsFromPreview,
  generateDbtYaml,
  getCachedData,
  setCachedData,
  invalidateCache,
  perfJobs,
  runPerfJob,
  safeSqlIdentifier,
  buildCuratedSuggestions,
  analysisHistoryPath,
  curatedHistoryPath,
  readJsonArray,
  writeJsonArray,
  appendHistoryEntry,
  extractImportantCharacteristics,
  generateCuratedSuggestionsWithLLM,
  parseJsonSafe,
  parseLimitQueryParam,
  toCardinalityLabel,
  calcNumericStats,
  inlineCuratedIntoMartSql,
  runTimedQuery,
  FULL_CHART_ROWS,
} = require('./deps');

module.exports = function registerMartsLayer(app) {
// --- Marts layer endpoints ---
// List all marts models
app.get('/marts', (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  const cleanedAt = workspace.getLayersCleanupTimestamp(req.user.id, req.dbSlot);
  try {
    const names = listJsonStemNames(d.MARTS_META_DIR, cleanedAt);
    res.json({ models: names });
  } catch (err) {
    Http.serverError(res, err.message);
  }
});

// Get a specific mart model (SQL, doc, preview)
app.get('/mart/:name', (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  const metaPath = path.join(d.MARTS_META_DIR, `${req.params.name}.json`);
  fs.readFile(metaPath, 'utf8', (err, data) => {
    if (err) return res.status(404).json({ error: 'Mart model not found' });
    const parsed = parseJsonSafe(data);
    if (parsed.error) {
      return res.status(500).json({ error: 'Invalid mart model metadata format' });
    }
    res.json(parsed.value);
  });
});

// Get mart SQL plus source-based SQL (curated inlined to their definitions)
app.get('/mart/:name/source-sql', (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  const metaPath = path.join(d.MARTS_META_DIR, `${req.params.name}.json`);
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const martSql = meta.sql || '';
    const sourceSql = inlineCuratedIntoMartSql(martSql, d.CURATED_META_DIR);
    res.json({ martSql, sourceSql });
  } catch (err) {
    res.status(404).json({ error: 'Mart model not found' });
  }
});

// Compare a user-provided source SQL against a mart by executing both and timing
app.post('/mart/:name/compare', async (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  const { sourceSql, rowLimit = 1000, runs = 5 } = req.body || {};
  const metaPath = path.join(d.MARTS_META_DIR, `${req.params.name}.json`);
  try {
    if (!sourceSql) return res.status(400).json({ error: 'Missing sourceSql' });

    // Basic validation: source SQL should not reference curated or mart tables
    const srcLower = String(sourceSql).toLowerCase();
    const badNames = [];
    try {
      const curatedFiles = fs.readdirSync(d.CURATED_META_DIR).filter(f => f.endsWith('.json'));
      curatedFiles.forEach(f => {
        const n = f.replace(/\.json$/, '').toLowerCase();
        if (srcLower.includes(n)) badNames.push(n);
      });
      const martFiles = fs.readdirSync(d.MARTS_META_DIR).filter(f => f.endsWith('.json'));
      martFiles.forEach(f => {
        const n = f.replace(/\.json$/, '').toLowerCase();
        if (srcLower.includes(n)) badNames.push(n);
      });
    } catch (e) {
      // ignore validation errors, fall back to allowing query
    }
    if (badNames.length > 0) {
      return res.status(400).json({
        error: 'Source SQL must not reference curated or mart tables',
        tables: Array.from(new Set(badNames))
      });
    }

    const runsClamped = Math.min(10, Math.max(1, Number(runs) || 5));

    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const martSql = meta.sql || '';
    if (!martSql) return res.status(400).json({ error: 'Mart SQL missing' });

    const martTimes = [];
    const rawTimes = [];
    let martRowsSample = [];
    let rawRowsSample = [];

    // Warm-up: run each query once to populate caches / JIT and then ignore
    try {
      await runTimedQuery(d.dbPath, sourceSql, rowLimit);
    } catch (e) { /* ignore warm-up errors */ }
    try {
      await runTimedQuery(d.dbPath, martSql, rowLimit);
    } catch (e) { /* ignore warm-up errors */ }

    for (let i = 0; i < runsClamped; i++) {
      const rawRes = await runTimedQuery(d.dbPath, sourceSql, rowLimit);
      const martRes = await runTimedQuery(d.dbPath, martSql, rowLimit);
      rawTimes.push(rawRes.elapsedMs);
      martTimes.push(martRes.elapsedMs);
      if (i === 0) {
        rawRowsSample = rawRes.rows;
        martRowsSample = martRes.rows;
      }
    }

    const stats = (arr) => {
      const min = Math.min(...arr);
      const max = Math.max(...arr);
      const avg = arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
      return { min, max, avg };
    };

    const rawStats = stats(rawTimes);
    const martStats = stats(martTimes);

    function median(arr) {
      if (!arr || arr.length === 0) return null;
      const s = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
    }

    function winsCount(rawArr, martArr) {
      let rawWins = 0, martWins = 0;
      for (let i = 0; i < Math.min(rawArr.length, martArr.length); i++) {
        if (rawArr[i] < martArr[i]) rawWins++;
        else if (martArr[i] < rawArr[i]) martWins++;
      }
      return { rawWins, martWins };
    }

    const raw_median_ms = median(rawTimes);
    const mart_median_ms = median(martTimes);
    const wins = winsCount(rawTimes, martTimes);

    const sameShape =
      Array.isArray(rawRowsSample) &&
      Array.isArray(martRowsSample) &&
      rawRowsSample.length === martRowsSample.length &&
      (rawRowsSample[0]
        ? Object.keys(rawRowsSample[0]).join(',') ===
          (martRowsSample[0] ? Object.keys(martRowsSample[0]).join(',') : '')
        : true);

    const marts_avg_time_ms = martStats.avg;
    const raw_avg_time_ms = rawStats.avg;
    const marts_median_time_ms = mart_median_ms;
    const raw_median_time_ms = raw_median_ms;
    const comparison_ratio = marts_median_time_ms > 0 ? raw_median_time_ms / marts_median_time_ms : null;

    res.json({
      mart: req.params.name,
      rowLimit,
      runs: runsClamped,
      marts_avg_time_ms,
      raw_avg_time_ms,
      marts_median_time_ms,
      raw_median_time_ms,
      comparison_ratio,
      mart_stats: {
        avg_ms: martStats.avg,
        min_ms: martStats.min,
        max_ms: martStats.max,
        runs: martTimes,
      },
      raw_stats: {
        avg_ms: rawStats.avg,
        min_ms: rawStats.min,
        max_ms: rawStats.max,
        runs: rawTimes,
      },
      median_stats: {
        mart_median_ms: marts_median_time_ms,
        raw_median_ms: raw_median_time_ms,
      },
      wins: wins,
      row_counts: {
        raw: rawRowsSample.length,
        mart: martRowsSample.length,
      },
      shape_equal: sameShape,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Save or update a mart model
app.post('/marts', async (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  const { name, sql, documentation, tableDescription } = req.body;
  if (!name || !sql) return Http.badRequest(res, 'Missing name or SQL');
  const filePath = path.join(d.MARTS_DIR, `${name}.sql`);
  fs.writeFileSync(filePath, sql);
  let preview = [];
  let doc = documentation || [];
  const db = new sqlite3.Database(d.dbPath);
  try {
    const computed = await computePreviewAndDocumentation(db, sql, documentation);
    preview = computed.preview;
    doc = computed.doc;
  } finally {
    db.close();
  }

  const meta = {
    name,
    sql,
    tableDescription: tableDescription || '',
    documentation: doc,
    preview,
    timestamp: new Date().toISOString()
  };
  fs.writeFileSync(path.join(d.MARTS_META_DIR, `${name}.json`), JSON.stringify(meta, null, 2));
  res.json({ success: true, file: filePath, meta });
});

// Preview custom mart SQL (returns up to 100 rows and docs)
app.post('/api/mart-preview', async (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  const { sql } = req.body;
  if (!sql) return Http.badRequest(res, 'Missing SQL');
  const previewSQL = ensureSqlLimit(sql.trim(), 100);
  try {
    const preview = await withDatabase(d.dbPath, (db) => dbAll(db, previewSQL));
    res.json({ columns: columnsFromPreview(preview), preview });
  } catch (e) {
    Http.badRequest(res, e.message);
  }
});

// Fetch mart model data rows (for table view)
app.get('/mart/:name/data', async (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  const name = req.params.name;
  const metaPath = path.join(d.MARTS_META_DIR, `${name}.json`);
  const limit = parseLimitQueryParam(req.query.limit, 1000);

  try {
    const metaData = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const sql = metaData.sql;
    if (!sql) {
      return res.status(400).json({ error: 'No SQL query found for this model' });
    }

    let finalSQL = sql.trim();
    if (limit && !/limit\s+\d+/i.test(finalSQL)) {
      finalSQL = finalSQL.replace(/;*\s*$/, '') + ` LIMIT ${limit}`;
    }
    const rows = await withDatabase(d.dbPath, (db) => dbAll(db, finalSQL));
    res.json({ rows, limit });
  } catch (err) {
    console.error(`Error fetching mart model data: ${err.message}`);
    Http.serverError(res, err.message);
  }
});

// Export mart model query results as CSV or JSON
app.get('/mart/:name/export', async (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  const name = req.params.name;
  const format = req.query.format || 'csv'; // csv or json
  const metaPath = path.join(d.MARTS_META_DIR, `${name}.json`);

  try {
    const metaData = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const sql = metaData.sql;

    if (!sql) {
      return Http.badRequest(res, 'No SQL query found for this model');
    }

    const rows = await withDatabase(d.dbPath, (db) => dbAll(db, sql.trim()));

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${name}.json"`);
      res.json(rows);
    } else {
      if (rows.length === 0) {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
        return res.send('');
      }
      
      const headers = Object.keys(rows[0]);
      const csvRows = [headers.join(',')];
      for (const row of rows) {
        csvRows.push(headers.map(k => {
          const val = row[k];
          if (val == null) return '';
          // Escape quotes and wrap in quotes if contains comma, newline, or quote
          const str = String(val);
          if (str.includes(',') || str.includes('\n') || str.includes('"')) {
            return '"' + str.replace(/"/g, '""') + '"';
          }
          return str;
        }).join(','));
      }
      
      const csv = csvRows.join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
      res.send(csv);
    }
  } catch (err) {
    console.error(`Error exporting mart model: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});
};
