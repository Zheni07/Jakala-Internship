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

module.exports = function registerDatasetsAndAi(app) {
app.get('/tables', async (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  try {
    const rows = await withDatabase(d.dbPath, (db) =>
      dbAll(db, `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
    );
    res.json(rows.map((row) => row.name));
  } catch (err) {
    Http.serverError(res, err.message);
  }
});

app.get('/ai/database-analysis', async (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  try {
    await withDatabase(d.dbPath, async (ldb) => {
    const tableRows = await dbAll(ldb, `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`);
    const tables = tableRows.map((row) => row.name);

    const tableProfiles = [];
    for (const tableName of tables) {
      const countRow = await dbGet(ldb, `SELECT COUNT(*) AS c FROM "${tableName}"`);
      const rowCount = countRow?.c || 0;

      const schemaRows = await dbAll(ldb, `PRAGMA table_info("${tableName}")`);

      const columns = [];
      for (const col of schemaRows) {
        const colName = col.name;
        const sampledRows = await dbAll(ldb, `SELECT "${colName}" AS v FROM "${tableName}" LIMIT 1000`);
        const sampled = sampledRows.map((r) => r.v);

        const nonNull = sampled.filter((v) => v !== null && v !== '');
        const nulls = sampled.length - nonNull.length;
        const distinct = new Set(nonNull.map((v) => String(v))).size;
        const numericValues = nonNull
          .map((v) => Number(v))
          .filter((v) => Number.isFinite(v));
        const numericRatio = nonNull.length ? (numericValues.length / nonNull.length) : 0;
        const isNumeric = numericRatio >= 0.8;

        columns.push({
          name: colName,
          declaredType: col.type || '',
          sampleSize: sampled.length,
          nullRatio: sampled.length ? (nulls / sampled.length) : 0,
          distinctRatio: nonNull.length ? (distinct / nonNull.length) : 0,
          cardinality: toCardinalityLabel(nonNull.length ? (distinct / nonNull.length) : 0),
          inferredType: isNumeric ? 'number' : detectType(nonNull.slice(0, 100)),
          numericStats: isNumeric ? calcNumericStats(numericValues) : null,
        });
      }

      tableProfiles.push({
        table: tableName,
        rowCount,
        columnCount: columns.length,
        columns,
      });
    }

    const totalRows = tableProfiles.reduce((sum, t) => sum + t.rowCount, 0);
    const totalColumns = tableProfiles.reduce((sum, t) => sum + t.columnCount, 0);
    const largestTables = [...tableProfiles]
      .sort((a, b) => b.rowCount - a.rowCount)
      .slice(0, 5)
      .map((t) => ({ table: t.table, rowCount: t.rowCount, columnCount: t.columnCount }));

    const qualityRisks = [];
    tableProfiles.forEach((table) => {
      table.columns.forEach((col) => {
        if (col.sampleSize >= 50 && col.nullRatio > 0.4) {
          qualityRisks.push({
            severity: col.nullRatio > 0.7 ? 'high' : 'medium',
            title: `High null ratio in ${table.table}.${col.name}`,
            detail: `~${Math.round(col.nullRatio * 100)}% null/empty in sample.`,
          });
        }
      });
    });

    const numericHighlights = [];
    tableProfiles.forEach((table) => {
      table.columns
        .filter((c) => c.numericStats && c.numericStats.count > 0)
        .sort((a, b) => (b.numericStats?.p90 || 0) - (a.numericStats?.p90 || 0))
        .slice(0, 2)
        .forEach((c) => {
          numericHighlights.push({
            table: table.table,
            column: c.name,
            p50: c.numericStats.p50,
            p90: c.numericStats.p90,
            min: c.numericStats.min,
            max: c.numericStats.max,
          });
        });
    });

    const aiInsights = [];
    if (largestTables[0]) {
      aiInsights.push({
        kind: 'focus_table',
        title: `Focus first on "${largestTables[0].table}"`,
        explanation: `It has the largest volume (${largestTables[0].rowCount} rows), so optimizing this table will likely have the biggest impact.`,
      });
    }
    if (qualityRisks.length > 0) {
      aiInsights.push({
        kind: 'data_quality',
        title: 'Data quality risks detected',
        explanation: `${qualityRisks.length} column(s) show high null ratios in sampled data.`,
      });
    }
    if (numericHighlights.length > 0) {
      const top = numericHighlights[0];
      aiInsights.push({
        kind: 'numeric_distribution',
        title: `Numeric spread insight for ${top.table}.${top.column}`,
        explanation: `Median ${top.p50}, P90 ${top.p90}, range [${top.min}, ${top.max}] in sampled rows.`,
      });
    }
    if (tableProfiles.length > 8) {
      aiInsights.push({
        kind: 'modeling_strategy',
        title: 'Recommended modeling strategy',
        explanation: 'Create curated intermediate models by domain first, then marts, to keep complexity manageable.',
      });
    }

    const result = {
      generatedAt: new Date().toISOString(),
      summary: {
        tables: tableProfiles.length,
        totalRows,
        totalColumns,
      },
      largestTables,
      qualityRisks: qualityRisks.slice(0, 15),
      numericHighlights: numericHighlights.slice(0, 20),
      aiInsights,
      tableProfiles,
    };

    const historyFile = analysisHistoryPath(req.user.id, req.dbSlot);
    appendHistoryEntry(historyFile, {
      id: randomUUID(),
      generatedAt: result.generatedAt,
      summary: result.summary,
      importantCharacteristics: extractImportantCharacteristics(result),
    }, 100);

    res.json(result);
    });
  } catch (err) {
    Http.serverError(res, err.message || 'Failed to analyze database');
  }
});

app.post('/ai/curated-suggestions', async (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  const { selectedTables = [], criteria = '', prompt = '' } = req.body || {};
  if (!Array.isArray(selectedTables) || selectedTables.length === 0) {
    return Http.badRequest(res, 'selectedTables is required');
  }
  try {
    await withDatabase(d.dbPath, async (ldb) => {
      const availableRows = await dbAll(ldb, `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`);
      const availableTables = availableRows.map((r) => r.name);
      const validTables = selectedTables.filter((t) => availableTables.includes(t));
      if (validTables.length === 0) {
        return Http.badRequest(res, 'No valid selected tables found in the active database');
      }

      const tableColumnsByTable = {};
      for (const table of validTables) {
        const cols = await dbAll(ldb, `PRAGMA table_info(${safeSqlIdentifier(table)})`);
        tableColumnsByTable[table] = cols.map((c) => ({ name: c.name, type: c.type || '' }));
      }

      let suggestions = await generateCuratedSuggestionsWithLLM({
        selectedTables: validTables,
        tableColumnsByTable,
        prompt,
        criteria,
      });
      let source = 'llm';
      if (!suggestions || suggestions.length === 0) {
        suggestions = buildCuratedSuggestions({
          selectedTables: validTables,
          tableColumnsByTable,
          prompt,
          criteria,
        });
        source = 'rule-based';
      }

      appendHistoryEntry(curatedHistoryPath(req.user.id, req.dbSlot), {
        id: randomUUID(),
        generatedAt: new Date().toISOString(),
        source,
        selectedTables: validTables,
        criteria,
        prompt,
        suggestions,
        usedSuggestionIndex: null,
      }, 200);

      res.json({
        generatedAt: new Date().toISOString(),
        dbSlot: req.dbSlot,
        source,
        selectedTables: validTables,
        suggestions,
      });
    });
  } catch (err) {
    Http.serverError(res, err.message || 'Failed to generate curated suggestions');
  }
});

app.get('/ai/analysis-history', (req, res) => {
  const history = readJsonArray(analysisHistoryPath(req.user.id, req.dbSlot));
  res.json({ snapshots: history.slice(0, 20) });
});

app.get('/ai/curated-history', (req, res) => {
  const history = readJsonArray(curatedHistoryPath(req.user.id, req.dbSlot));
  res.json({ entries: history.slice(0, 40) });
});

app.post('/ai/curated-history/use', (req, res) => {
  const { historyId, suggestionIndex } = req.body || {};
  if (!historyId && suggestionIndex === undefined) {
    return Http.badRequest(res, 'historyId or suggestionIndex is required');
  }
  const filePath = curatedHistoryPath(req.user.id, req.dbSlot);
  const entries = readJsonArray(filePath);
  if (!entries.length) return Http.notFound(res, 'No curated AI history found');

  const targetIdx = historyId
    ? entries.findIndex((e) => e.id === historyId)
    : 0;
  if (targetIdx < 0) return Http.notFound(res, 'History entry not found');
  entries[targetIdx] = {
    ...entries[targetIdx],
    usedSuggestionIndex: Number.isFinite(Number(suggestionIndex)) ? Number(suggestionIndex) : 0,
    usedAt: new Date().toISOString(),
  };
  writeJsonArray(filePath, entries);
  res.json({ success: true });
});

// Get all data from a specific table with pagination and caching
app.get('/table/:name', async (req, res) => {
  const uid = req.user.id;
  const cacheUid = `${uid}:${req.dbSlot}`;
  const d = workspace.dirs(uid, req.dbSlot);
  const tableName = req.params.name;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(500, parseInt(req.query.limit, 10) || 100); // Max 500 per page
  const offset = (page - 1) * limit;

  let countResult = getCachedData(cacheUid, 'table', `${tableName}:count`);

  try {
    await withDatabase(d.dbPath, async (ldb) => {
      let total = countResult;
      if (total === null) {
        const row = await dbGet(ldb, `SELECT COUNT(*) as count FROM "${tableName}"`);
        total = row.count;
        setCachedData(cacheUid, 'table', `${tableName}:count`, total);
      }
      const rows = await dbAll(ldb, `SELECT * FROM "${tableName}" LIMIT ${limit} OFFSET ${offset}`);
      res.json({
        data: rows,
        pagination: {
          page,
          limit,
          total,
          hasMore: offset + limit < total,
        },
      });
    });
  } catch (err) {
    Http.serverError(res, err.message);
  }
});
};
