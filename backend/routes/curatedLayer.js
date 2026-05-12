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

module.exports = function registerCuratedLayer(app) {
// List all curated models
app.get('/curated-models', (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  const cleanedAt = workspace.getLayersCleanupTimestamp(req.user.id, req.dbSlot);
  try {
    const names = listJsonStemNames(d.CURATED_META_DIR, cleanedAt);
    res.json({ models: names });
  } catch (err) {
    Http.serverError(res, err.message);
  }
});

// Get a specific curated model (SQL, doc, preview) - with caching
app.get('/curated-model/:name', (req, res) => {
  const uid = req.user.id;
  const cacheUid = `${uid}:${req.dbSlot}`;
  const d = workspace.dirs(uid, req.dbSlot);
  const modelName = req.params.name;

  const cached = getCachedData(cacheUid, 'curated-model', modelName);
  if (cached) {
    return res.json(cached);
  }

  const metaPath = path.join(d.CURATED_META_DIR, `${modelName}.json`);
  fs.readFile(metaPath, 'utf8', (err, data) => {
    if (err) return res.status(404).json({ error: 'Curated model not found' });
    const parsed = parseJsonSafe(data);
    if (parsed.error) {
      return res.status(500).json({ error: 'Invalid curated model metadata format' });
    }
    const model = parsed.value;
    setCachedData(cacheUid, 'curated-model', modelName, model);
    res.json(model);
  });
});

// Save or update a curated model
app.post('/curated-models', async (req, res) => {
  const uid = req.user.id;
  const cacheUid = `${uid}:${req.dbSlot}`;
  const d = workspace.dirs(uid, req.dbSlot);
  const { name, sql, documentation, tableDescription, createTable = true } = req.body;
  if (!name || !sql) return res.status(400).json({ error: 'Missing name or SQL' });
  const filePath = path.join(d.CURATED_DIR, `${name}.sql`);
  fs.writeFileSync(filePath, sql);
  let preview = [];
  let doc = documentation || [];
  let tableCreated = false;
  let tableError = null;
  const db = new sqlite3.Database(d.dbPath);
  try {
    const computed = await computePreviewAndDocumentation(db, sql, documentation);
    preview = computed.preview;
    doc = computed.doc;
    if (createTable) {
      try {
        await dbRun(db, `DROP TABLE IF EXISTS "${name}"`);
        const selectSQL = sql.trim().replace(/;\s*$/, '');
        await dbRun(db, `CREATE TABLE "${name}" AS ${selectSQL}`);
        tableCreated = true;
      } catch (e) {
        tableError = e.message;
      }
    }
  } finally {
    db.close();
  }

  // Save metadata
  const meta = {
    name,
    sql,
    tableDescription: tableDescription || '',
    documentation: doc,
    preview,
    timestamp: new Date().toISOString()
  };
  fs.writeFileSync(path.join(d.CURATED_META_DIR, `${name}.json`), JSON.stringify(meta, null, 2));
  invalidateCache(cacheUid, 'curated-model', name);
  invalidateCache(cacheUid, 'table', `${name}:count`);
  res.json({ success: true, file: filePath, meta, tableCreated, tableError });
});

// Preview custom curated SQL (returns up to 100 rows and docs)
app.post('/api/curated-preview', async (req, res) => {
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

// Fetch curated model data rows (for table view)
app.get('/curated-model/:name/data', async (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  const name = req.params.name;
  const metaPath = path.join(d.CURATED_META_DIR, `${name}.json`);
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
    console.error(`Error fetching curated model data: ${err.message}`);
    Http.serverError(res, err.message);
  }
});

// Export curated model query results as CSV or JSON
app.get('/curated-model/:name/export', async (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  const name = req.params.name;
  const format = req.query.format || 'csv'; // csv or json
  const metaPath = path.join(d.CURATED_META_DIR, `${name}.json`);

  try {
    const metaData = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const sql = metaData.sql;

    if (!sql) {
      return Http.badRequest(res, 'No SQL query found for this model');
    }

    const rows = await withDatabase(d.dbPath, (db) => dbAll(db, sql.trim()));

    if (rows.length === 0) {
      return Http.notFound(res, 'No data found for this query');
    }

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${name}.json"`);
      res.json(rows);
    } else {
      // CSV format
      const keys = Object.keys(rows[0]);
      const csvRows = [keys.join(',')];
      
      for (const row of rows) {
        csvRows.push(keys.map(k => {
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
    console.error(`Error exporting curated model: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});
};
