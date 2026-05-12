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

module.exports = function registerStagingLayer(app) {
// Save generated staging model SQL
app.post('/generate-staging-model', (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  const { table, sql } = req.body;
  if (!table || !sql) return res.status(400).json({ error: 'Missing table or sql' });
  const filePath = path.join(d.modelsStaging, `stg_${table}.sql`);
  fs.writeFile(filePath, sql, err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, file: filePath });
  });
});

app.post('/generate-user-model', (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  const { name, sql } = req.body;
  if (!name || !sql) return res.status(400).json({ error: 'Missing name or sql' });
  const filePath = path.join(d.MARTS_DIR, `${name}.sql`);
  fs.mkdir(d.MARTS_DIR, { recursive: true }, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    fs.writeFile(filePath, sql, err => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, file: filePath });
    });
  });
});

// Preview custom staging SQL (returns up to 100 rows)
app.post('/preview-staging-sql', async (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  const { sql } = req.body;
  if (!sql) return Http.badRequest(res, 'Missing SQL');
  const previewSQL = ensureSqlLimit(sql.trim(), 100);
  try {
    const rows = await withDatabase(d.dbPath, (db) => dbAll(db, previewSQL));
    res.json({ rows });
  } catch (err) {
    Http.badRequest(res, err.message);
  }
});

// Auto-documentation preview endpoint
app.post('/api/preview', async (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  const { sql } = req.body;
  if (!sql) return Http.badRequest(res, 'Missing SQL');
  const previewSQL = ensureSqlLimit(sql.trim(), 100);
  try {
    const preview = await withDatabase(d.dbPath, (db) => dbAll(db, previewSQL));
    const columns = columnsFromPreview(preview);
    res.json({ columns, preview });
  } catch (e) {
    Http.badRequest(res, e.message);
  }
});

// List all saved stagings
app.get('/stagings', (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  const cleanedAt = workspace.getLayersCleanupTimestamp(req.user.id, req.dbSlot);
  try {
    const names = listJsonStemNames(d.METADATA_DIR, cleanedAt);
    res.json({ stagings: names });
  } catch (err) {
    Http.serverError(res, err.message);
  }
});

// Get a specific staging (SQL, doc, preview) - with caching
app.get('/staging/:name', (req, res) => {
  const uid = req.user.id;
  const cacheUid = `${uid}:${req.dbSlot}`;
  const d = workspace.dirs(uid, req.dbSlot);
  const stagingName = req.params.name;

  const cached = getCachedData(cacheUid, 'staging', stagingName);
  if (cached) {
    return res.json(cached);
  }

  const metaPath = path.join(d.METADATA_DIR, `${stagingName}.json`);
  fs.readFile(metaPath, 'utf8', (err, data) => {
    if (err) return res.status(404).json({ error: 'Staging not found' });
    const parsed = parseJsonSafe(data);
    if (parsed.error) {
      return res.status(500).json({ error: 'Invalid staging metadata format' });
    }
    const staging = parsed.value;
    setCachedData(cacheUid, 'staging', stagingName, staging);
    res.json(staging);
  });
});

// Delete a saved staging (metadata, SQL file, and drop table)
app.delete('/staging/:name', async (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  const name = req.params.name;
  const metaPath = path.join(d.METADATA_DIR, `${name}.json`);
  const sqlPath = path.join(d.modelsStaging, `${name}.sql`);
  const errors = [];
  const cacheUid = `${req.user.id}:${req.dbSlot}`;
  invalidateCache(cacheUid, 'staging', name);
  invalidateCache(cacheUid, 'table', `${name}:count`);
  try {
    fs.unlinkSync(metaPath);
  } catch (e) {
    errors.push(e.message);
  }
  try {
    fs.unlinkSync(sqlPath);
  } catch (e) {
    errors.push(e.message);
  }
  try {
    await withDatabase(d.dbPath, (ldb) => dbRun(ldb, `DROP TABLE IF EXISTS "${name}"`));
  } catch (err) {
    errors.push(err.message);
  }
  if (errors.length > 0) {
    return res.status(500).json({ error: 'Failed to delete some files or table', details: errors });
  }
  res.json({ success: true });
});

// Save custom staging SQL as dbt model and with metadata
app.post('/save-staging-sql', (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  const { name, sql, dialect = 'sqlite', createTable, documentation, tableDescription, yaml } = req.body;
  if (!name || !sql) return res.status(400).json({ error: 'Missing name or SQL' });
  const filePath = path.join(d.modelsStaging, `${name}.sql`);
  fs.writeFile(filePath, sql, async err => {
    if (err) return res.status(500).json({ error: err.message });
    let preview = [];
    let doc = documentation || [];
    let tableCreated = false;
    let tableError = null;
    let yamlSchema = yaml;
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
    // Generate YAML if not provided
    if (!yamlSchema) {
      yamlSchema = generateDbtYaml({ name, description: tableDescription, columns: doc });
    }
    // Save metadata
    const meta = {
      name,
      sql,
      dialect,
      tableDescription: tableDescription || '',
      documentation: doc,
      yaml: yamlSchema,
      preview,
      timestamp: new Date().toISOString()
    };
    fs.writeFile(path.join(d.METADATA_DIR, `${name}.json`), JSON.stringify(meta, null, 2), err => {
      if (err) return res.status(500).json({ error: err.message });
      const cacheUid = `${req.user.id}:${req.dbSlot}`;
      invalidateCache(cacheUid, 'staging', name);
      invalidateCache(cacheUid, 'table', `${name}:count`);
      res.json({ success: true, file: filePath, tableCreated, tableError, meta });
    });
  });
});

// Endpoint to drop all staged tables (names starting with 'stg_')
app.post('/drop-staged-tables', async (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  try {
    const { dropped, errors } = await withDatabase(d.dbPath, async (db) => {
      const rows = await dbAll(db, `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'stg_%'`);
      const tables = rows.map((r) => r.name);
      const errors = [];
      for (const table of tables) {
        try {
          await dbRun(db, `DROP TABLE IF EXISTS "${table}"`);
        } catch (err) {
          errors.push({ table, error: err.message });
        }
      }
      return { dropped: tables.length, errors };
    });
    if (errors.length > 0) {
      return res.status(500).json({ error: 'Some tables could not be dropped', details: errors });
    }
    res.json({ success: true, dropped });
  } catch (err) {
    Http.serverError(res, err.message);
  }
});

// Download entire staged table as CSV
app.get('/download-staged/:name', async (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  const tableName = req.params.name;
  if (!tableName.startsWith('stg_')) {
    return Http.badRequest(res, 'Not a staged table');
  }
  try {
    const rows = await withDatabase(d.dbPath, (db) => dbAll(db, `SELECT * FROM "${tableName}"`));
    if (!rows.length) {
      res.setHeader('Content-Disposition', `attachment; filename="${tableName}.csv"`);
      res.setHeader('Content-Type', 'text/csv');
      return res.send('');
    }
    const keys = Object.keys(rows[0]);
    const csvRows = [keys.join(',')];
    for (const row of rows) {
      csvRows.push(
        keys.map((k) => {
          const val = row[k];
          if (val == null) return '';
          return '"' + String(val).replace(/"/g, '""') + '"';
        }).join(',')
      );
    }
    const csv = csvRows.join('\n');
    res.setHeader('Content-Disposition', `attachment; filename="${tableName}.csv"`);
    res.setHeader('Content-Type', 'text/csv');
    res.send(csv);
  } catch (err) {
    Http.serverError(res, err.message);
  }
});
};
