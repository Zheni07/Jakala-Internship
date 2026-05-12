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
  validatePerfManualPayload,
  validatePerfDataflowPayload,
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
    const payload = validatePerfManualPayload(req.body, FULL_CHART_ROWS);
    const sql = payload.sql;
    const rowLimit = payload.rowLimit;
    const runId = payload.runId || randomUUID();
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
    if (err?.status === 400) {
      return Http.badRequest(res, err.message, err.details ? { details: err.details } : undefined);
    }
    Http.serverError(res, err.message);
  }
});

app.post('/api/execute/dataflow', async (req, res) => {
  try {
    const d = workspace.dirs(req.user.id, req.dbSlot);
    const payload = validatePerfDataflowPayload(req.body, FULL_CHART_ROWS);
    const curatedName = payload.curatedName;
    const rowLimit = payload.rowLimit;
    const runId = payload.runId || randomUUID();
    const sqlPath = path.join(d.CURATED_DIR, `${curatedName}.sql`);
    if (!fs.existsSync(sqlPath)) return Http.notFound(res, 'Curated SQL not found');
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
    if (err?.status === 400) {
      return Http.badRequest(res, err.message, err.details ? { details: err.details } : undefined);
    }
    Http.serverError(res, err.message);
  }
});

// SSE stream for a run
app.get('/api/perf/:runId/stream', (req, res) => {
  const { runId } = req.params;
  const job = perfJobs.get(runId);
  if (!job) {
    return Http.notFound(res, 'Run not found');
  }
  if (job.userId !== req.user.id) {
    return Http.forbidden(res, 'Forbidden');
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
  if (!job) return Http.notFound(res, 'Run not found');
  if (job.userId !== req.user.id) return Http.forbidden(res, 'Forbidden');
  if (job.status !== 'running') {
    return Http.conflict(res, `Run is already ${job.status}`);
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
  if (!fs.existsSync(jsonPath)) return Http.notFound(res, 'Perf run not found');
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
