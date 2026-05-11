require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const multer = require('multer');
const workspace = require('./workspace');
const auth = require('./auth');

const app = express();
const PORT = 4000;
const FULL_CHART_ROWS = process.env.FULL_CHART_ROWS ? Number(process.env.FULL_CHART_ROWS) : 10000;

auth.initAuthDb();

const uploadTmp = path.join(__dirname, 'data', 'tmp');
fs.mkdirSync(uploadTmp, { recursive: true });
const upload = multer({ dest: uploadTmp, limits: { fileSize: 120 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());

function publicAuthPath(req) {
  return req.path === '/auth/register' || req.path === '/auth/login';
}

function resolveDbSlot(req) {
  const rawSlot = req.headers['x-database-slot'] || req.query.dbSlot || 'db1';
  return workspace.normalizeDbSlot(String(rawSlot));
}

app.post('/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const user = await auth.createUser(email, password);
    workspace.ensureUserWorkspaces(user.id);
    const token = auth.signToken(user);
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    res.status(500).json({ error: e.message || 'Registration failed' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = await auth.verifyLogin(email, password);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    workspace.ensureUserWorkspaces(user.id);
    const token = auth.signToken(user);
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Login failed' });
  }
});

app.use((req, res, next) => {
  if (req.method === 'OPTIONS' || publicAuthPath(req)) return next();
  return auth.authMiddleware(req, res, (err) => {
    if (err) return next(err);
    req.dbSlot = resolveDbSlot(req);
    workspace.ensureNewUserWorkspace(req.user.id, req.dbSlot);
    next();
  });
});

app.get('/auth/me', (req, res) => {
  const dbSlots = workspace.DB_SLOTS.reduce((acc, slot) => {
    acc[slot] = { hasDatabase: workspace.userHasDatabase(req.user.id, slot) };
    return acc;
  }, {});
  res.json({
    user: req.user,
    dbSlots,
    activeDbSlot: req.dbSlot,
    hasDatabase: workspace.userHasDatabase(req.user.id, req.dbSlot),
  });
});

function requireUploadedSqlite(req, res, next) {
  if (!workspace.userHasDatabase(req.user.id, req.dbSlot)) {
    return res.status(400).json({
      error: 'NO_DATABASE',
      message: `Качете SQLite файл (.sqlite или .db) за ${req.dbSlot.toUpperCase()} от профила, за да работите с данни.`,
    });
  }
  next();
}

/** Metadata / file-only endpoints: empty workspace until the user creates models (no sample data). */
function canUseAppWithoutDatabase(req) {
  const m = req.method;
  const p = req.path;
  if (m === 'GET' && p === '/stagings') return true;
  if (m === 'GET' && /^\/staging\/[^/]+$/.test(p)) return true;
  if (m === 'GET' && p === '/curated-models') return true;
  if (m === 'GET' && /^\/curated-model\/[^/]+$/.test(p)) return true;
  if (m === 'GET' && p === '/marts') return true;
  if (m === 'GET' && /^\/mart\/[^/]+$/.test(p)) return true;
  if (m === 'GET' && /^\/mart\/[^/]+\/source-sql$/.test(p)) return true;
  if (m === 'POST' && (p === '/generate-staging-model' || p === '/generate-user-model')) return true;
  return false;
}

function uploadDatabaseHandler(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded (field name: database)' });
  const slot = workspace.normalizeDbSlot(req.params.slot || req.dbSlot || 'db1');
  const ext = path.extname(req.file.originalname || '').toLowerCase();
  if (!['.sqlite', '.db', '.sqlite3'].includes(ext)) {
    try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    return res.status(400).json({ error: 'Only SQLite files (.sqlite, .db) are allowed' });
  }
  try {
    workspace.ensureNewUserWorkspace(req.user.id, slot);
    workspace.resetUserModels(req.user.id, slot);
    const dest = workspace.userDbPath(req.user.id, slot);
    fs.copyFileSync(req.file.path, dest);
    try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
    res.json({ success: true, slot, path: 'database.sqlite' });
  } catch (e) {
    try { fs.unlinkSync(req.file.path); } catch (err) { /* ignore */ }
    res.status(500).json({ error: e.message || 'Upload failed' });
  }
}

app.post('/auth/upload-database', upload.single('database'), uploadDatabaseHandler);
app.post('/auth/upload-database/:slot', upload.single('database'), uploadDatabaseHandler);

app.use((req, res, next) => {
  if (canUseAppWithoutDatabase(req)) return next();
  return requireUploadedSqlite(req, res, next);
});

app.use('/performance-reports', (req, res, next) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  express.static(d.PERF_DIR)(req, res, next);
});

process.on('SIGINT', () => {
  process.exit(0);
});

// In-memory caching for frequently accessed data
const dataCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(userId, type, name) {
  return `${userId}:${type}:${name}`;
}

function getCachedData(userId, type, name) {
  const key = getCacheKey(userId, type, name);
  const cached = dataCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  dataCache.delete(key);
  return null;
}

function setCachedData(userId, type, name, data) {
  const key = getCacheKey(userId, type, name);
  dataCache.set(key, { data, timestamp: Date.now() });
  // Clean up cache if it grows too large
  if (dataCache.size > 100) {
    const oldestKey = Array.from(dataCache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
    dataCache.delete(oldestKey);
  }
}

function invalidateCache(userId, type, name) {
  const key = getCacheKey(userId, type, name);
  dataCache.delete(key);
}

// In-memory performance job store for streaming
const perfJobs = new Map();

function ensureLimit(sql, limit) {
  if (!sql) return '';
  let trimmed = sql.trim();
  if (!/limit\s+\d+/i.test(trimmed)) {
    trimmed = trimmed.replace(/;*\s*$/, '') + ` LIMIT ${limit}`;
  }
  return trimmed;
}

function broadcastSample(job, payload) {
  job.esClients.forEach(res => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  });
}

function closeClients(job) {
  job.esClients.forEach(res => res.end());
  job.esClients.clear();
}

function savePerfArtifacts(job, finalSample) {
  try {
    const perfDir = job.perfDir;
    fs.mkdirSync(perfDir, { recursive: true });
    const outJsonPath = path.join(perfDir, `${job.runId}.json`);
    // Attach paths later as well to ensure metadata includes report link
    const baseMeta = { ...job.meta };

    // Build a simple HTML report with Chart.js
    const labels = job.samples.map((_, i) => i + 1);
    const elapsedSeries = job.samples.map(s => s.elapsedMs);
    const cpuUserSeries = job.samples.map(s => s.cpuUserMs);
    const cpuSysSeries = job.samples.map(s => s.cpuSystemMs);
    const rssSeries = job.samples.map(s => s.rssMb);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Performance Report - ${job.runId}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body { font-family: 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; padding: 32px; }
    .card { background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 20px; box-shadow: 0 15px 40px rgba(0,0,0,0.35); margin-bottom: 20px; }
    h1 { margin: 0 0 10px 0; color: #cbd5e1; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
    .label { color: #94a3b8; font-size: 13px; }
    .value { color: #e2e8f0; font-size: 20px; font-weight: 700; }
    canvas { background: #0b1224; border-radius: 10px; padding: 10px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Performance Run - ${job.meta.curatedName || 'manual'}</h1>
    <div class="label">${new Date().toLocaleString()}</div>
    <div class="grid" style="margin-top:12px;">
      <div><div class="label">Mode</div><div class="value">${job.meta.mode}</div></div>
      <div><div class="label">Elapsed (ms)</div><div class="value">${finalSample.elapsedMs.toFixed(2)}</div></div>
      <div><div class="label">CPU User (ms)</div><div class="value">${finalSample.cpuUserMs.toFixed(2)}</div></div>
      <div><div class="label">CPU System (ms)</div><div class="value">${finalSample.cpuSystemMs.toFixed(2)}</div></div>
      <div><div class="label">Rows Processed</div><div class="value">${finalSample.rowsProcessed}</div></div>
      <div><div class="label">Row Limit</div><div class="value">${job.meta.rowLimit}</div></div>
    </div>
  </div>
  <div class="card">
    <h2 style="margin-top:0;color:#cbd5e1;">Time / CPU Over Time</h2>
    <canvas id="chart-time" height="220"></canvas>
    <canvas id="chart-cpu" height="220" style="margin-top:16px;"></canvas>
    <canvas id="chart-rss" height="180" style="margin-top:16px;"></canvas>
  </div>
  <script>
    const labels = ${JSON.stringify(labels)};
    const elapsed = ${JSON.stringify(elapsedSeries)};
    const cpuUser = ${JSON.stringify(cpuUserSeries)};
    const cpuSys = ${JSON.stringify(cpuSysSeries)};
    const rss = ${JSON.stringify(rssSeries)};
    const palette = ['#60a5fa','#a78bfa','#34d399'];
    new Chart(document.getElementById('chart-time'), {
      type: 'line',
      data: { labels, datasets: [{ label: 'Elapsed ms', data: elapsed, borderColor: '#60a5fa', backgroundColor: 'rgba(96,165,250,0.15)', fill: true, tension: 0.15, pointRadius: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins:{ legend:{display:true}}, scales:{ x:{ticks:{color:'#94a3b8'}}, y:{ticks:{color:'#94a3b8'}}}}
    });
    new Chart(document.getElementById('chart-cpu'), {
      type: 'line',
      data: { labels, datasets: [
        { label: 'CPU User ms', data: cpuUser, borderColor: '#a78bfa', backgroundColor: 'rgba(167,139,250,0.15)', fill: true, tension: 0.15, pointRadius: 0 },
        { label: 'CPU Sys ms', data: cpuSys, borderColor: '#34d399', backgroundColor: 'rgba(52,211,153,0.15)', fill: true, tension: 0.15, pointRadius: 0 }
      ]},
      options: { responsive: true, maintainAspectRatio: false, plugins:{ legend:{display:true}}, scales:{ x:{ticks:{color:'#94a3b8'}}, y:{ticks:{color:'#94a3b8'}}}}
    });
    new Chart(document.getElementById('chart-rss'), {
      type: 'bar',
      data: { labels, datasets: [{ label: 'RSS MB', data: rss, backgroundColor: '#fbbf24' }]},
      options: { responsive: true, maintainAspectRatio: false, plugins:{ legend:{display:true}}, scales:{ x:{ticks:{color:'#94a3b8'}}, y:{ticks:{color:'#94a3b8'}}}}
    });
  </script>
</body>
</html>`;

    const outHtmlPath = path.join(perfDir, `${job.runId}.html`);
    fs.writeFileSync(outHtmlPath, html);
    const enrichedMeta = { ...baseMeta, reportPath: path.basename(outHtmlPath), jsonPath: path.basename(outJsonPath) };
    fs.writeFileSync(outJsonPath, JSON.stringify({ ...enrichedMeta, final: finalSample, samples: job.samples }, null, 2));
    return { jsonPath: outJsonPath, htmlPath: outHtmlPath, meta: enrichedMeta };
  } catch (err) {
    console.error('Failed to save perf artifacts:', err.message);
    return {};
  }
}

async function runPerfJob({ runId, mode, sql, curatedName, rowLimit = FULL_CHART_ROWS, userId, dbPath, perfDir }) {
  const job = {
    runId,
    userId,
    dbPath,
    perfDir,
    mode,
    meta: {
      runId,
      mode,
      curatedName: curatedName || null,
      rowLimit,
      sql,
      startedAt: new Date().toISOString()
    },
    status: 'running',
    samples: [],
    esClients: new Set(),
    cancelRequested: false
  };

  perfJobs.set(runId, job);

  const startCpu = process.cpuUsage();
  const startTime = process.hrtime.bigint();
  let rowsProcessed = 0;

  const pushSample = (status = 'running') => {
    const elapsedNs = process.hrtime.bigint() - startTime;
    const elapsedMs = Number(elapsedNs) / 1e6;
    const cpu = process.cpuUsage(startCpu);
    const cpuUserMs = cpu.user / 1000;
    const cpuSystemMs = cpu.system / 1000;
    const rssMb = Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100;
    const sample = { elapsedMs, cpuUserMs, cpuSystemMs, rssMb, rowsProcessed, status, ts: Date.now() };
    job.samples.push(sample);
    broadcastSample(job, sample);
    return sample;
  };

  const sampler = setInterval(() => {
    if (job.status !== 'running') return;
    pushSample('running');
  }, 400);

  const sqldb = new sqlite3.Database(dbPath);
  job.db = sqldb;
  try {
    const finalSql = ensureLimit(sql, rowLimit);
    await new Promise((resolve, reject) => {
      sqldb.all(finalSql, (err, rows) => {
        if (err) return reject(err);
        rowsProcessed = rows.length;
        resolve();
      });
    });
    if (job.cancelRequested) throw new Error('Cancelled');
    job.status = 'done';
    const finalSample = pushSample('done');
    job.meta.finishedAt = new Date().toISOString();
    job.meta.rowsProcessed = rowsProcessed;
    const artifacts = savePerfArtifacts(job, finalSample);
    if (artifacts.meta) {
      job.meta = { ...job.meta, ...artifacts.meta };
    } else {
      job.meta.reportPath = artifacts.htmlPath ? path.basename(artifacts.htmlPath) : null;
      job.meta.jsonPath = artifacts.jsonPath ? path.basename(artifacts.jsonPath) : null;
    }
    broadcastSample(job, { ...finalSample, status: 'done', reportPath: job.meta.reportPath });
    closeClients(job);
  } catch (err) {
    job.status = job.cancelRequested ? 'cancelled' : 'error';
    const finalSample = pushSample(job.status);
    job.meta.error = err.message;
    broadcastSample(job, { ...finalSample, status: job.status, error: err.message });
    closeClients(job);
  } finally {
    clearInterval(sampler);
    try {
      sqldb.close();
    } catch (e) { /* ignore */ }
    job.db = null;
  }
  return job;
}

function toSnakeCase(str) {
  return str.replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .replace(/__+/g, '_')
    .toLowerCase();
}

function detectType(values) {
  if (!Array.isArray(values) || values.length === 0) return 'string';
  // Try to detect if all values are numbers or dates
  if (values.every(v => v === null || v === '' || !isNaN(Number(v)))) return 'number';
  if (values.every(v => v === null || v === '' || !isNaN(Date.parse(v)))) return 'date';
  return 'string';
}

function safeSqlIdentifier(name) {
  return `"${String(name || '').replace(/"/g, '""')}"`;
}

function buildCuratedSuggestions({ selectedTables, tableColumnsByTable, prompt = '', criteria = '' }) {
  const normalizedTables = Array.isArray(selectedTables) ? selectedTables.filter(Boolean) : [];
  if (normalizedTables.length === 0) return [];

  const baseTable = normalizedTables[0];
  const baseColumns = tableColumnsByTable[baseTable] || [];
  const numericColumn = baseColumns.find((c) => /int|real|num|decimal|double|float|amount|price|qty|count/i.test(c.type || '') || /amount|price|qty|count|total|sum|value/i.test(c.name || ''));
  const dateColumn = baseColumns.find((c) => /date|time/i.test(c.type || '') || /date|time|created|updated|month|year/i.test(c.name || ''));
  const dimensionColumn = baseColumns.find((c) => c.name !== numericColumn?.name && c.name !== dateColumn?.name) || baseColumns[0];

  const criteriaWhere = criteria && criteria.trim() ? `\nWHERE ${criteria.trim()}` : '';
  const promptComment = prompt && prompt.trim() ? `-- User intent: ${prompt.trim()}\n` : '';
  const tableRef = safeSqlIdentifier(baseTable);
  const dimRef = dimensionColumn ? safeSqlIdentifier(dimensionColumn.name) : null;
  const numRef = numericColumn ? safeSqlIdentifier(numericColumn.name) : null;
  const dateRef = dateColumn ? safeSqlIdentifier(dateColumn.name) : null;

  const suggestions = [];

  if (dimRef) {
    suggestions.push({
      title: 'Distribution by key dimension',
      rationale: `Good first curated view for table "${baseTable}" with grouped counts by ${dimensionColumn.name}.`,
      sql: `${promptComment}SELECT\n  ${dimRef} AS dimension_value,\n  COUNT(*) AS row_count\nFROM ${tableRef}${criteriaWhere}\nGROUP BY ${dimRef}\nORDER BY row_count DESC\nLIMIT 100;`,
    });
  }

  if (dateRef) {
    suggestions.push({
      title: 'Trend over time',
      rationale: `Tracks volume trend by ${dateColumn.name} for table "${baseTable}".`,
      sql: `${promptComment}SELECT\n  DATE(${dateRef}) AS day,\n  COUNT(*) AS row_count${numRef ? `,\n  SUM(COALESCE(${numRef}, 0)) AS total_value` : ''}\nFROM ${tableRef}${criteriaWhere}\nGROUP BY DATE(${dateRef})\nORDER BY day DESC\nLIMIT 365;`,
    });
  }

  if (numRef) {
    suggestions.push({
      title: 'Numeric KPI summary',
      rationale: `Provides essential aggregates for ${numericColumn.name} from "${baseTable}".`,
      sql: `${promptComment}SELECT\n  COUNT(*) AS total_rows,\n  SUM(COALESCE(${numRef}, 0)) AS total_${numericColumn.name},\n  AVG(COALESCE(${numRef}, 0)) AS avg_${numericColumn.name},\n  MIN(${numRef}) AS min_${numericColumn.name},\n  MAX(${numRef}) AS max_${numericColumn.name}\nFROM ${tableRef}${criteriaWhere};`,
    });
  }

  return suggestions.slice(0, 3);
}

function aiArtifactsDir(userId, dbSlot) {
  return path.join(workspace.workspaceRoot(userId, dbSlot), 'ai');
}

function ensureAiArtifactsDir(userId, dbSlot) {
  const dir = aiArtifactsDir(userId, dbSlot);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function analysisHistoryPath(userId, dbSlot) {
  return path.join(ensureAiArtifactsDir(userId, dbSlot), 'analysis-history.json');
}

function curatedHistoryPath(userId, dbSlot) {
  return path.join(ensureAiArtifactsDir(userId, dbSlot), 'curated-suggestions-history.json');
}

function readJsonArray(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function writeJsonArray(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function appendHistoryEntry(filePath, entry, limit = 50) {
  const existing = readJsonArray(filePath);
  existing.unshift(entry);
  writeJsonArray(filePath, existing.slice(0, limit));
}

function extractImportantCharacteristics(analysis) {
  const topTable = analysis?.largestTables?.[0];
  const topRisk = analysis?.qualityRisks?.[0];
  const topNumeric = analysis?.numericHighlights?.[0];
  return {
    topTable: topTable ? { table: topTable.table, rowCount: topTable.rowCount } : null,
    topRisk: topRisk ? { severity: topRisk.severity, title: topRisk.title } : null,
    topNumeric: topNumeric ? { table: topNumeric.table, column: topNumeric.column, p90: topNumeric.p90 } : null,
  };
}

async function generateCuratedSuggestionsWithLLM({ selectedTables, tableColumnsByTable, criteria, prompt }) {
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL || 'llama3.2:3b';
  const timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS || 20000);
  const schemaContext = selectedTables.map((t) => ({
    table: t,
    columns: tableColumnsByTable[t] || [],
  }));
  const userPrompt = [
    'Generate exactly 3 SQLite SELECT suggestions for curated models.',
    'Return strict JSON only as {"suggestions":[...]}',
    'Each suggestion item must have: title, rationale, sql.',
    'Use only selected tables and valid SQLite syntax.',
    'No markdown. No prose outside JSON.',
    `Selected tables: ${JSON.stringify(schemaContext)}`,
    `Criteria: ${criteria || ''}`,
    `User prompt: ${prompt || ''}`,
  ].join('\n');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${ollamaBaseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        prompt: userPrompt,
        stream: false,
        format: 'json',
        options: {
          temperature: 0.2,
          num_predict: 700,
        },
      }),
    });
  } catch (e) {
    clearTimeout(timeoutId);
    return null;
  }
  clearTimeout(timeoutId);

  if (!response.ok) return null;
  const payload = await response.json();
  const content = payload?.response || '';
  try {
    const parsed = JSON.parse(content);
    const suggestionsRaw = Array.isArray(parsed) ? parsed : parsed?.suggestions;
    if (!Array.isArray(suggestionsRaw)) return null;
    const normalized = suggestionsRaw
      .filter((s) => s && s.title && s.sql)
      .map((s) => ({
        title: String(s.title),
        rationale: String(s.rationale || 'AI-generated suggestion'),
        sql: String(s.sql),
      }))
      .slice(0, 3);
    return normalized.length ? normalized : null;
  } catch (e) {
    return null;
  }
}

function parseJsonSafe(content) {
  try {
    return { value: JSON.parse(content), error: null };
  } catch (err) {
    return { value: null, error: err };
  }
}

function parseLimitQueryParam(rawLimit, defaultLimit = 1000) {
  if (rawLimit === 'all') return null;
  const parsed = Number(rawLimit ?? defaultLimit);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultLimit;
  return Math.floor(parsed);
}

function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

function toCardinalityLabel(ratio) {
  if (ratio >= 0.95) return 'very_high';
  if (ratio >= 0.5) return 'high';
  if (ratio >= 0.15) return 'medium';
  return 'low';
}

function calcNumericStats(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return { count: 0, min: null, max: null, avg: null, p50: null, p90: null };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    count: values.length,
    min,
    max,
    avg,
    p50: percentile(values, 50),
    p90: percentile(values, 90),
  };
}

// List all tables in the SQLite database
app.get('/tables', (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  const ldb = new sqlite3.Database(d.dbPath);
  ldb.all(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`, (err, rows) => {
    ldb.close();
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(row => row.name));
  });
});

app.get('/ai/database-analysis', async (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  const ldb = new sqlite3.Database(d.dbPath);
  try {
    const tables = await new Promise((resolve, reject) => {
      ldb.all(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`, (err, rows) => {
        if (err) return reject(err);
        resolve((rows || []).map((row) => row.name));
      });
    });

    const tableProfiles = [];
    for (const tableName of tables) {
      const rowCount = await new Promise((resolve, reject) => {
        ldb.get(`SELECT COUNT(*) AS c FROM "${tableName}"`, (err, row) => {
          if (err) return reject(err);
          resolve(row?.c || 0);
        });
      });

      const schemaRows = await new Promise((resolve, reject) => {
        ldb.all(`PRAGMA table_info("${tableName}")`, (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        });
      });

      const columns = [];
      for (const col of schemaRows) {
        const colName = col.name;
        const sampled = await new Promise((resolve, reject) => {
          ldb.all(`SELECT "${colName}" AS v FROM "${tableName}" LIMIT 1000`, (err, rows) => {
            if (err) return reject(err);
            resolve((rows || []).map((r) => r.v));
          });
        });

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
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to analyze database' });
  } finally {
    ldb.close();
  }
});

app.post('/ai/curated-suggestions', async (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  const { selectedTables = [], criteria = '', prompt = '' } = req.body || {};
  if (!Array.isArray(selectedTables) || selectedTables.length === 0) {
    return res.status(400).json({ error: 'selectedTables is required' });
  }
  const ldb = new sqlite3.Database(d.dbPath);
  try {
    const availableTables = await new Promise((resolve, reject) => {
      ldb.all(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`, (err, rows) => {
        if (err) return reject(err);
        resolve((rows || []).map((r) => r.name));
      });
    });
    const validTables = selectedTables.filter((t) => availableTables.includes(t));
    if (validTables.length === 0) {
      return res.status(400).json({ error: 'No valid selected tables found in the active database' });
    }

    const tableColumnsByTable = {};
    for (const table of validTables) {
      const cols = await new Promise((resolve, reject) => {
        ldb.all(`PRAGMA table_info(${safeSqlIdentifier(table)})`, (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        });
      });
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
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to generate curated suggestions' });
  } finally {
    ldb.close();
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
    return res.status(400).json({ error: 'historyId or suggestionIndex is required' });
  }
  const filePath = curatedHistoryPath(req.user.id, req.dbSlot);
  const entries = readJsonArray(filePath);
  if (!entries.length) return res.status(404).json({ error: 'No curated AI history found' });

  const targetIdx = historyId
    ? entries.findIndex((e) => e.id === historyId)
    : 0;
  if (targetIdx < 0) return res.status(404).json({ error: 'History entry not found' });
  entries[targetIdx] = {
    ...entries[targetIdx],
    usedSuggestionIndex: Number.isFinite(Number(suggestionIndex)) ? Number(suggestionIndex) : 0,
    usedAt: new Date().toISOString(),
  };
  writeJsonArray(filePath, entries);
  res.json({ success: true });
});

// Get all data from a specific table with pagination and caching
app.get('/table/:name', (req, res) => {
  const uid = req.user.id;
  const cacheUid = `${uid}:${req.dbSlot}`;
  const d = workspace.dirs(uid, req.dbSlot);
  const ldb = new sqlite3.Database(d.dbPath);
  const tableName = req.params.name;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(500, parseInt(req.query.limit) || 100); // Max 500 per page
  const offset = (page - 1) * limit;

  let countResult = getCachedData(cacheUid, 'table', `${tableName}:count`);

  Promise.all([
    new Promise((resolve, reject) => {
      if (countResult !== null) {
        resolve(countResult);
      } else {
        ldb.get(`SELECT COUNT(*) as count FROM "${tableName}"`, (err, row) => {
          if (err) reject(err);
          else {
            setCachedData(cacheUid, 'table', `${tableName}:count`, row.count);
            resolve(row.count);
          }
        });
      }
    }),
    new Promise((resolve, reject) => {
      ldb.all(`SELECT * FROM "${tableName}" LIMIT ${limit} OFFSET ${offset}`, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    })
  ]).then(([total, rows]) => {
    res.json({
      data: rows,
      pagination: {
        page,
        limit,
        total,
        hasMore: offset + limit < total
      }
    });
  }).catch(err => {
    res.status(500).json({ error: err.message });
  }).finally(() => {
    try {
      ldb.close();
    } catch (e) { /* ignore */ }
  });
});

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
app.post('/preview-staging-sql', (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  const { sql } = req.body;
  if (!sql) return res.status(400).json({ error: 'Missing SQL' });
  let previewSQL = sql.trim();
  // Add LIMIT 100 if not present
  if (!/limit\s+\d+/i.test(previewSQL)) {
    previewSQL = previewSQL.replace(/;*\s*$/, '') + ' LIMIT 100';
  }
  const ldb = new sqlite3.Database(d.dbPath);
  ldb.all(previewSQL, (err, rows) => {
    ldb.close();
    if (err) return res.status(400).json({ error: err.message });
    res.json({ rows });
  });
});

// Auto-documentation preview endpoint
app.post('/api/preview', async (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  const { sql } = req.body;
  if (!sql) return res.status(400).json({ error: 'Missing SQL' });
  let previewSQL = sql.trim();
  if (!/limit\s+\d+/i.test(previewSQL)) {
    previewSQL = previewSQL.replace(/;*\s*$/, '') + ' LIMIT 100';
  }
  try {
    const ldb = new sqlite3.Database(d.dbPath);
    const preview = await new Promise((resolve, reject) => {
      ldb.all(previewSQL, (err, rows) => {
        ldb.close();
        return err ? reject(err) : resolve(rows);
      });
    });
    let columns = [];
    if (preview.length > 0) {
      const keys = Object.keys(preview[0]);
      columns = keys.map(col => {
        const values = preview.map(row => row[col]);
        const nonNullValues = values.filter(v => v !== null && v !== '');
        const type = detectType(nonNullValues);
        const nullable = values.some(v => v === null || v === '');
        const unique = new Set(nonNullValues).size === nonNullValues.length && nonNullValues.length === preview.length;
        return {
          name: col,
          type,
          nullable,
          unique,
        };
      });
    }
    res.json({ columns, preview });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// List all saved stagings
app.get('/stagings', (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  const cleanedAt = workspace.getLayersCleanupTimestamp(req.user.id, req.dbSlot);
  fs.readdir(d.METADATA_DIR, (err, files) => {
    if (err) return res.status(500).json({ error: err.message });
    const names = files
      .filter(f => f.endsWith('.json'))
      .filter((f) => {
        if (!cleanedAt) return true;
        try {
          const stat = fs.statSync(path.join(d.METADATA_DIR, f));
          return stat.mtimeMs >= cleanedAt;
        } catch (e) {
          return false;
        }
      })
      .map(f => f.replace(/\.json$/, ''));
    res.json({ stagings: names });
  });
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
app.delete('/staging/:name', (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  const name = req.params.name;
  const metaPath = path.join(d.METADATA_DIR, `${name}.json`);
  const sqlPath = path.join(d.modelsStaging, `${name}.sql`);
  let errors = [];
  const cacheUid = `${req.user.id}:${req.dbSlot}`;
  invalidateCache(cacheUid, 'staging', name);
  invalidateCache(cacheUid, 'table', `${name}:count`);
  // Delete metadata JSON
  try { fs.unlinkSync(metaPath); } catch (e) { errors.push(e.message); }
  // Delete SQL file
  try { fs.unlinkSync(sqlPath); } catch (e) { errors.push(e.message); }
  const ldb = new sqlite3.Database(d.dbPath);
  ldb.run(`DROP TABLE IF EXISTS "${name}"`, (err) => {
    ldb.close();
    if (err) errors.push(err.message);
    if (errors.length > 0) {
      return res.status(500).json({ error: 'Failed to delete some files or table', details: errors });
    }
    res.json({ success: true });
  });
});

// Utility to generate dbt-compatible YAML schema
function generateDbtYaml({ name, description, columns }) {
  return [
    'version: 2',
    '',
    'models:',
    `  - name: ${name}`,
    `    description: "${description || ''}"`,
    '    columns:',
    ...columns.map(col => {
      const tests = [];
      if (!col.nullable) tests.push('not_null');
      if (col.unique) tests.push('unique');
      return [
        `      - name: ${col.name}`,
        `        description: "${col.description || ''}"`,
        `        data_type: ${col.type}`,
        ...(tests.length ? ['        tests:'].concat(tests.map(t => `          - ${t}`)) : [])
      ].join('\n');
    })
  ].join('\n');
}

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
    // Preview and doc generation if not provided
    let previewSQL = sql.trim();
    if (!/limit\s+\d+/i.test(previewSQL)) {
      previewSQL = previewSQL.replace(/;*\s*$/, '') + ' LIMIT 100';
    }
    const db = new sqlite3.Database(d.dbPath);
    try {
      preview = await new Promise((resolve, reject) => {
        db.all(previewSQL, (err, rows) => err ? reject(err) : resolve(rows));
      });
      // Normalize documentation structure: ensure 'name' field exists (support both 'column' and 'name')
      if (doc && doc.length > 0) {
        doc = doc.map(col => {
          const normalized = {
            ...col,
            name: col.name || col.column || col.source || col.original || '',
            // Preserve all custom fields
            description: col.description || '',
            type: col.type || typeof preview[0]?.[col.name || col.column] || 'string',
            nullable: col.nullable !== undefined ? col.nullable : (preview.length > 0 ? preview.some(row => row[col.name || col.column] === null || row[col.name || col.column] === '') : false),
            unique: col.unique !== undefined ? col.unique : (preview.length > 0 ? new Set(preview.map(row => row[col.name || col.column])).size === preview.length : false),
            testNull: col.testNull || false,
            testUnique: col.testUnique || false
          };
          // Remove old field names to avoid confusion
          delete normalized.column;
          return normalized;
        });
      } else if (preview.length > 0) {
        // Generate new documentation if none provided
        const keys = Object.keys(preview[0]);
        doc = keys.map(col => ({
          name: col,
          type: typeof preview[0][col],
          description: '',
          nullable: preview.some(row => row[col] === null || row[col] === ''),
          unique: new Set(preview.map(row => row[col])).size === preview.length,
          testNull: false,
          testUnique: false
        }));
      }
    } catch (e) {
      preview = [];
      // Normalize documentation even if preview fails
      if (doc && doc.length > 0) {
        doc = doc.map(col => ({
          ...col,
          name: col.name || col.column || col.source || col.original || '',
          description: col.description || '',
          type: col.type || 'string',
          nullable: col.nullable !== undefined ? col.nullable : false,
          unique: col.unique !== undefined ? col.unique : false,
          testNull: col.testNull || false,
          testUnique: col.testUnique || false
        })).map(col => {
          delete col.column;
          return col;
        });
      } else {
        doc = [];
      }
    }
    // Optionally create table
    if (createTable) {
      try {
        await new Promise((resolve, reject) => {
          db.run(`DROP TABLE IF EXISTS "${name}"`, err => err ? reject(err) : resolve());
        });
        const selectSQL = sql.trim().replace(/;\s*$/, '');
        await new Promise((resolve, reject) => {
          db.run(`CREATE TABLE "${name}" AS ${selectSQL}`, err => err ? reject(err) : resolve());
        });
        tableCreated = true;
      } catch (e) {
        tableError = e.message;
      }
    }
    db.close();
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
app.post('/drop-staged-tables', (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  const db = new sqlite3.Database(d.dbPath);
  db.all(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'stg_%'`, (err, rows) => {
    if (err) {
      db.close();
      return res.status(500).json({ error: err.message });
    }
    const tables = rows.map(r => r.name);
    let dropped = 0;
    let errors = [];
    if (tables.length === 0) {
      db.close();
      return res.json({ success: true, dropped: 0 });
    }
    tables.forEach(table => {
      db.run(`DROP TABLE IF EXISTS "${table}"`, err => {
        if (err) errors.push({ table, error: err.message });
        dropped++;
        if (dropped === tables.length) {
          db.close();
          if (errors.length > 0) {
            res.status(500).json({ error: 'Some tables could not be dropped', details: errors });
          } else {
            res.json({ success: true, dropped });
          }
        }
      });
    });
  });
});

// Download entire staged table as CSV
app.get('/download-staged/:name', (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  const tableName = req.params.name;
  // Only allow staged tables
  if (!tableName.startsWith('stg_')) {
    return res.status(400).json({ error: 'Not a staged table' });
  }
  const db = new sqlite3.Database(d.dbPath);
  db.all(`SELECT * FROM "${tableName}"`, (err, rows) => {
    db.close();
    if (err) return res.status(500).json({ error: err.message });
    if (!rows || rows.length === 0) {
      res.setHeader('Content-Disposition', `attachment; filename="${tableName}.csv"`);
      res.setHeader('Content-Type', 'text/csv');
      return res.send('');
    }
    const keys = Object.keys(rows[0]);
    const csvRows = [keys.join(',')];
    for (const row of rows) {
      csvRows.push(keys.map(k => {
        const val = row[k];
        if (val == null) return '';
        // Escape quotes
        return '"' + String(val).replace(/"/g, '""') + '"';
      }).join(','));
    }
    const csv = csvRows.join('\n');
    res.setHeader('Content-Disposition', `attachment; filename="${tableName}.csv"`);
    res.setHeader('Content-Type', 'text/csv');
    res.send(csv);
  });
});

// List all curated models
app.get('/curated-models', (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  const cleanedAt = workspace.getLayersCleanupTimestamp(req.user.id, req.dbSlot);
  fs.readdir(d.CURATED_META_DIR, (err, files) => {
    if (err) return res.status(500).json({ error: err.message });
    const names = files
      .filter(f => f.endsWith('.json'))
      .filter((f) => {
        if (!cleanedAt) return true;
        try {
          const stat = fs.statSync(path.join(d.CURATED_META_DIR, f));
          return stat.mtimeMs >= cleanedAt;
        } catch (e) {
          return false;
        }
      })
      .map(f => f.replace(/\.json$/, ''));
    res.json({ models: names });
  });
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
  // Preview and doc generation if not provided
  let preview = [];
  let doc = documentation || [];
  let previewSQL = sql.trim();
  if (!/limit\s+\d+/i.test(previewSQL)) {
    previewSQL = previewSQL.replace(/;*\s*$/, '') + ' LIMIT 100';
  }
  const db = new sqlite3.Database(d.dbPath);
  let tableCreated = false;
  let tableError = null;
  try {
    preview = await new Promise((resolve, reject) => {
      db.all(previewSQL, (err, rows) => err ? reject(err) : resolve(rows));
    });
    // Normalize documentation structure: ensure 'name' field exists and preserve all fields
    if (doc && doc.length > 0) {
      doc = doc.map(col => {
        const normalized = {
          ...col,
          name: col.name || col.column || col.source || col.original || '',
          // Preserve all custom fields
          description: col.description || '',
          type: col.type || typeof preview[0]?.[col.name || col.column] || 'string',
          nullable: col.nullable !== undefined ? col.nullable : (preview.length > 0 ? preview.some(row => row[col.name || col.column] === null || row[col.name || col.column] === '') : false),
          unique: col.unique !== undefined ? col.unique : (preview.length > 0 ? new Set(preview.map(row => row[col.name || col.column])).size === preview.length : false),
          testNull: col.testNull || false,
          testUnique: col.testUnique || false
        };
        // Remove old field names to avoid confusion
        delete normalized.column;
        return normalized;
      });
    } else if (preview.length > 0) {
      // Generate new documentation if none provided
      const keys = Object.keys(preview[0]);
      doc = keys.map(col => {
        const values = preview.map(row => row[col]);
        const nonNullValues = values.filter(v => v !== null && v !== '');
        return {
          name: col,
          type: typeof preview[0][col],
          description: '',
          nullable: values.some(v => v === null || v === ''),
          unique: new Set(nonNullValues).size === nonNullValues.length && nonNullValues.length === preview.length,
          testNull: false,
          testUnique: false
        };
      });
    }
  } catch (e) {
    preview = [];
    // Normalize documentation even if preview fails
    if (doc && doc.length > 0) {
      doc = doc.map(col => ({
        ...col,
        name: col.name || col.column || col.source || col.original || '',
        description: col.description || '',
        type: col.type || 'string',
        nullable: col.nullable !== undefined ? col.nullable : false,
        unique: col.unique !== undefined ? col.unique : false,
        testNull: col.testNull || false,
        testUnique: col.testUnique || false
      })).map(col => {
        delete col.column;
        return col;
      });
    } else {
      doc = [];
    }
  }
  // Materialize curated table so marts layer can query it
  if (createTable) {
    try {
      await new Promise((resolve, reject) => {
        db.run(`DROP TABLE IF EXISTS "${name}"`, err => err ? reject(err) : resolve());
      });
      const selectSQL = sql.trim().replace(/;\s*$/, '');
      await new Promise((resolve, reject) => {
        db.run(`CREATE TABLE "${name}" AS ${selectSQL}`, err => err ? reject(err) : resolve());
      });
      tableCreated = true;
    } catch (e) {
      tableError = e.message;
    }
  }
  db.close();

  // Chart generation removed

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
  if (!sql) return res.status(400).json({ error: 'Missing SQL' });
  let previewSQL = sql.trim();
  if (!/limit\s+\d+/i.test(previewSQL)) {
    previewSQL = previewSQL.replace(/;*\s*$/, '') + ' LIMIT 100';
  }
  const db = new sqlite3.Database(d.dbPath);
  try {
    const preview = await new Promise((resolve, reject) => {
      db.all(previewSQL, (err, rows) => err ? reject(err) : resolve(rows));
    });
    let columns = [];
    if (preview.length > 0) {
      const keys = Object.keys(preview[0]);
      columns = keys.map(col => {
        const values = preview.map(row => row[col]);
        const nonNullValues = values.filter(v => v !== null && v !== '');
        const type = detectType(nonNullValues);
        const nullable = values.some(v => v === null || v === '');
        const unique = new Set(nonNullValues).size === nonNullValues.length && nonNullValues.length === preview.length;
        return {
          name: col,
          type,
          nullable,
          unique,
        };
      });
    }
    db.close();
    res.json({ columns, preview });
  } catch (e) {
    db.close();
    res.status(400).json({ error: e.message });
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

    const db = new sqlite3.Database(d.dbPath);
    let finalSQL = sql.trim();
    if (limit && !/limit\s+\d+/i.test(finalSQL)) {
      finalSQL = finalSQL.replace(/;*\s*$/, '') + ` LIMIT ${limit}`;
    }
    const rows = await new Promise((resolve, reject) => {
      db.all(finalSQL, (err, rows) => err ? reject(err) : resolve(rows));
    });
    db.close();
    res.json({ rows, limit });
  } catch (err) {
    console.error(`Error fetching curated model data: ${err.message}`);
    res.status(500).json({ error: err.message });
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
      return res.status(400).json({ error: 'No SQL query found for this model' });
    }

    const db = new sqlite3.Database(d.dbPath);
    const rows = await new Promise((resolve, reject) => {
      db.all(sql.trim(), (err, rows) => err ? reject(err) : resolve(rows));
    });
    db.close();
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'No data found for this query' });
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

function inlineCuratedIntoMartSql(sql, curatedMetaDir) {
  if (!sql) return '';
  let finalSql = sql;
  let curatedFiles = [];
  try {
    curatedFiles = fs.readdirSync(curatedMetaDir).filter(f => f.endsWith('.json'));
  } catch (e) {
    return finalSql;
  }

  const curatedMap = new Map();
  curatedFiles.forEach(file => {
    const name = file.replace(/\.json$/, '');
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(curatedMetaDir, file), 'utf8'));
      if (meta.sql) curatedMap.set(name, meta.sql.trim().replace(/;+\s*$/, ''));
    } catch (e) {
      /* ignore */
    }
  });

  // Recursively inline curated references to reach staging/raw
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 5) {
    changed = false;
    iterations += 1;
    curatedMap.forEach((curSql, name) => {
      const fromRe = new RegExp(`\\bFROM\\s+("${name}"|${name})(?:\\s+AS)?(?:\\s+(\\w+))?`, 'gi');
      const joinRe = new RegExp(`\\bJOIN\\s+("${name}"|${name})(?:\\s+AS)?(?:\\s+(\\w+))?`, 'gi');

      const replacer = (alias) => {
        const effectiveAlias = alias || name;
        return `(${curSql}) AS ${effectiveAlias}`;
      };

      const newFinal = finalSql
        .replace(fromRe, (match, _tbl, alias) => `FROM ${replacer(alias)}`)
        .replace(joinRe, (match, _tbl, alias) => `JOIN ${replacer(alias)}`);

      if (newFinal !== finalSql) {
        changed = true;
        finalSql = newFinal;
      }
    });
  }

  return finalSql;
}

// Execute a SQL query with limit enforcement and measure elapsed time
async function runTimedQuery(dbPath, sql, limit = FULL_CHART_ROWS) {
  if (!sql) throw new Error('Missing SQL');
  const finalSQL = ensureLimit(sql, limit);
  const start = process.hrtime.bigint();
  const ldb = new sqlite3.Database(dbPath);
  const rows = await new Promise((resolve, reject) => {
    ldb.all(finalSQL, (err, r) => {
      ldb.close();
      return err ? reject(err) : resolve(r);
    });
  });
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  return { rows, elapsedMs };
}

// --- Marts layer endpoints ---
// List all marts models
app.get('/marts', (req, res) => {
  const d = workspace.dirs(req.user.id, req.dbSlot);
  const cleanedAt = workspace.getLayersCleanupTimestamp(req.user.id, req.dbSlot);
  fs.readdir(d.MARTS_META_DIR, (err, files) => {
    if (err) return res.status(500).json({ error: err.message });
    const names = files
      .filter(f => f.endsWith('.json'))
      .filter((f) => {
        if (!cleanedAt) return true;
        try {
          const stat = fs.statSync(path.join(d.MARTS_META_DIR, f));
          return stat.mtimeMs >= cleanedAt;
        } catch (e) {
          return false;
        }
      })
      .map(f => f.replace(/\.json$/, ''));
    res.json({ models: names });
  });
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
  if (!name || !sql) return res.status(400).json({ error: 'Missing name or SQL' });
  const filePath = path.join(d.MARTS_DIR, `${name}.sql`);
  fs.writeFileSync(filePath, sql);
  // Preview and doc generation if not provided
  let preview = [];
  let doc = documentation || [];
  let previewSQL = sql.trim();
  if (!/limit\s+\d+/i.test(previewSQL)) {
    previewSQL = previewSQL.replace(/;*\s*$/, '') + ' LIMIT 100';
  }
  const db = new sqlite3.Database(d.dbPath);
  try {
    preview = await new Promise((resolve, reject) => {
      db.all(previewSQL, (err, rows) => err ? reject(err) : resolve(rows));
    });
    // Normalize documentation structure: ensure 'name' field exists and preserve all fields
    if (doc && doc.length > 0) {
      doc = doc.map(col => {
        const normalized = {
          ...col,
          name: col.name || col.column || col.source || col.original || '',
          // Preserve all custom fields
          description: col.description || '',
          type: col.type || typeof preview[0]?.[col.name || col.column] || 'string',
          nullable: col.nullable !== undefined ? col.nullable : (preview.length > 0 ? preview.some(row => row[col.name || col.column] === null || row[col.name || col.column] === '') : false),
          unique: col.unique !== undefined ? col.unique : (preview.length > 0 ? new Set(preview.map(row => row[col.name || col.column])).size === preview.length : false),
          testNull: col.testNull || false,
          testUnique: col.testUnique || false
        };
        // Remove old field names to avoid confusion
        delete normalized.column;
        return normalized;
      });
    } else if (preview.length > 0) {
      // Generate new documentation if none provided
      const keys = Object.keys(preview[0]);
      doc = keys.map(col => {
        const values = preview.map(row => row[col]);
        const nonNullValues = values.filter(v => v !== null && v !== '');
        return {
          name: col,
          type: typeof preview[0][col],
          description: '',
          nullable: values.some(v => v === null || v === ''),
          unique: new Set(nonNullValues).size === nonNullValues.length && nonNullValues.length === preview.length,
          testNull: false,
          testUnique: false
        };
      });
    }
  } catch (e) {
    preview = [];
    // Normalize documentation even if preview fails
    if (doc && doc.length > 0) {
      doc = doc.map(col => ({
        ...col,
        name: col.name || col.column || col.source || col.original || '',
        description: col.description || '',
        type: col.type || 'string',
        nullable: col.nullable !== undefined ? col.nullable : false,
        unique: col.unique !== undefined ? col.unique : false,
        testNull: col.testNull || false,
        testUnique: col.testUnique || false
      })).map(col => {
        delete col.column;
        return col;
      });
    } else {
      doc = [];
    }
  }
  db.close();

  // Save metadata
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
  if (!sql) return res.status(400).json({ error: 'Missing SQL' });
  let previewSQL = sql.trim();
  if (!/limit\s+\d+/i.test(previewSQL)) {
    previewSQL = previewSQL.replace(/;*\s*$/, '') + ' LIMIT 100';
  }
  try {
    const ldb = new sqlite3.Database(d.dbPath);
    const preview = await new Promise((resolve, reject) => {
      ldb.all(previewSQL, (err, rows) => {
        ldb.close();
        return err ? reject(err) : resolve(rows);
      });
    });
    let columns = [];
    if (preview.length > 0) {
      const keys = Object.keys(preview[0]);
      columns = keys.map(col => {
        const values = preview.map(row => row[col]);
        const nonNullValues = values.filter(v => v !== null && v !== '');
        const type = detectType(nonNullValues);
        const nullable = values.some(v => v === null || v === '');
        const unique = new Set(nonNullValues).size === nonNullValues.length && nonNullValues.length === preview.length;
        return {
          name: col,
          type,
          nullable,
          unique,
        };
      });
    }
    res.json({ columns, preview });
  } catch (e) {
    res.status(400).json({ error: e.message });
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
    const ldb = new sqlite3.Database(d.dbPath);
    const rows = await new Promise((resolve, reject) => {
      ldb.all(finalSQL, (err, r) => {
        ldb.close();
        return err ? reject(err) : resolve(r);
      });
    });
    res.json({ rows, limit });
  } catch (err) {
    console.error(`Error fetching mart model data: ${err.message}`);
    res.status(500).json({ error: err.message });
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
      return res.status(400).json({ error: 'No SQL query found for this model' });
    }

    const db = new sqlite3.Database(d.dbPath);
    const rows = await new Promise((resolve, reject) => {
      db.all(sql.trim(), (err, rows) => err ? reject(err) : resolve(rows));
    });
    db.close();
    
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${name}.json"`);
      res.json(rows);
    } else {
      // CSV format
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
}); 