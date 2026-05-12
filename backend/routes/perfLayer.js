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

module.exports = function registerPerfLayer(app) {
// --- Performance comparison endpoints ---
app.post('/api/execute/manual', async (req, res) => {
  try {
    const d = workspace.dirs(req.user.id, req.dbSlot);
    const { sql, rowLimit = FULL_CHART_ROWS, runId = randomUUID() } = req.body || {};
    if (!sql) return res.status(400).json({ error: 'Missing sql' });
    runPerfJob({
      runId,
      mode: 'manual',
      sql,
      rowLimit,
      userId: req.user.id,
      dbPath: d.dbPath,
      perfDir: d.PERF_DIR,
    });
    res.json({ runId, streamUrl: `/api/perf/${runId}/stream` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/execute/dataflow', async (req, res) => {
  try {
    const d = workspace.dirs(req.user.id, req.dbSlot);
    const { curatedName, rowLimit = FULL_CHART_ROWS, runId = randomUUID() } = req.body || {};
    if (!curatedName) return res.status(400).json({ error: 'Missing curatedName' });
    const sqlPath = path.join(d.CURATED_DIR, `${curatedName}.sql`);
    if (!fs.existsSync(sqlPath)) return res.status(404).json({ error: 'Curated SQL not found' });
    const sql = fs.readFileSync(sqlPath, 'utf8');
    runPerfJob({
      runId,
      mode: 'dataflow',
      sql,
      curatedName,
      rowLimit,
      userId: req.user.id,
      dbPath: d.dbPath,
      perfDir: d.PERF_DIR,
    });
    res.json({ runId, streamUrl: `/api/perf/${runId}/stream` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SSE stream for a run
app.get('/api/perf/:runId/stream', (req, res) => {
  const { runId } = req.params;
  const job = perfJobs.get(runId);
  if (!job) {
    return res.status(404).json({ error: 'Run not found' });
  }
  if (job.userId !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  res.write('\n');
  job.esClients.add(res);
  // Send existing samples immediately
  job.samples.forEach(sample => {
    res.write(`data: ${JSON.stringify(sample)}\n\n`);
  });
  req.on('close', () => {
    job.esClients.delete(res);
  });
});

// Cancel a run
app.post('/api/perf/:runId/cancel', (req, res) => {
  const { runId } = req.params;
  const job = perfJobs.get(runId);
  if (!job) return res.status(404).json({ error: 'Run not found' });
  if (job.userId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  if (job.status !== 'running') {
    return res.status(409).json({ error: `Run is already ${job.status}` });
  }
  job.cancelRequested = true;
  if (job.db && typeof job.db.interrupt === 'function') {
    try {
      job.db.interrupt();
    } catch (e) {
      // Ignore interrupt errors; run loop will handle completion/error state.
    }
  }
  res.json({ cancelRequested: true });
});

// Final perf JSON
app.get('/api/perf/:runId', (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  const { runId } = req.params;
  const inMem = perfJobs.get(runId);
  if (inMem && inMem.userId === req.user.id && inMem.meta && inMem.samples.length > 0) {
    return res.json({ meta: inMem.meta, samples: inMem.samples, final: inMem.samples[inMem.samples.length - 1] });
  }
  const jsonPath = path.join(d.PERF_DIR, `${runId}.json`);
  if (!fs.existsSync(jsonPath)) return res.status(404).json({ error: 'Perf run not found' });
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  res.json(data);
});

// List perf runs
app.get('/api/perf/list', (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  let files = [];
  try {
    files = fs.readdirSync(d.PERF_DIR).filter(f => f.endsWith('.json'));
  } catch (e) {
    files = [];
  }
  const runs = files.map(f => {
    const data = JSON.parse(fs.readFileSync(path.join(d.PERF_DIR, f), 'utf8'));
    return {
      runId: data.runId || f.replace(/\.json$/, ''),
      mode: data.mode,
      curatedName: data.curatedName || null,
      rowLimit: data.rowLimit,
      startedAt: data.startedAt || data.meta?.startedAt,
      finishedAt: data.finishedAt || data.meta?.finishedAt,
      rowsProcessed: data.rowsProcessed || data.final?.rowsProcessed || 0
    };
  }).sort((a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0));
  res.json({ runs });
});
};
