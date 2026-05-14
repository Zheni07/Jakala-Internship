const path = require('path');
const fs = require('fs');
const workspace = require('../workspace');
const { dbAll } = require('../lib/sqliteAsync');

function safeSqlIdentifier(name) {
  return `"${String(name || '').replace(/"/g, '""')}"`;
}

/** Strip a leading WHERE so we never emit WHERE WHERE ... */
function normalizeCriteriaFragment(criteria) {
  if (!criteria || typeof criteria !== 'string') return '';
  let c = criteria.trim();
  if (!c) return '';
  if (/^\s*where\s+/i.test(c)) c = c.replace(/^\s*where\s+/i, '').trim();
  return c;
}

function buildWhereAddition(criteria) {
  const frag = normalizeCriteriaFragment(criteria);
  if (!frag) return '';
  return `\nWHERE (${frag})`;
}

/** Keep only a single SELECT statement; reject obvious non-SELECT or chained statements. */
function sanitizeSelectSql(sql) {
  let s = String(sql || '').trim();
  if (!s) return null;
  const semi = s.indexOf(';');
  if (semi !== -1) s = s.slice(0, semi).trim();
  if (!/^\s*select\b/i.test(s)) return null;
  if (/;\s*(drop|delete|insert|update|attach|pragma|vacuum)\b/i.test(String(sql))) return null;
  return s;
}

function extractJsonObjectFromText(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const attempts = [];
  attempts.push(raw);
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) attempts.push(fence[1].trim());
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start !== -1 && end > start) attempts.push(raw.slice(start, end + 1));
  for (const a of attempts) {
    try {
      const v = JSON.parse(a);
      if (v && typeof v === 'object') return v;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** First column name (case-insensitive) shared by two column lists. */
function firstSharedColumnName(colsA, colsB) {
  if (!Array.isArray(colsA) || !Array.isArray(colsB)) return null;
  const byLower = new Map(colsB.map((c) => [String(c.name || '').toLowerCase(), c.name]));
  for (const a of colsA) {
    const key = String(a.name || '').toLowerCase();
    if (byLower.has(key)) return [a.name, byLower.get(key)];
  }
  return null;
}

function buildCuratedSuggestions({ selectedTables, tableColumnsByTable, prompt = '', criteria = '' }) {
  const normalizedTables = Array.isArray(selectedTables) ? selectedTables.filter(Boolean) : [];
  if (normalizedTables.length === 0) return [];

  const baseTable = normalizedTables[0];
  const baseColumns = tableColumnsByTable[baseTable] || [];
  const numericColumn = baseColumns.find(
    (c) =>
      /int|real|num|decimal|double|float|amount|price|qty|count/i.test(c.type || '') ||
      /amount|price|qty|count|total|sum|value/i.test(c.name || '')
  );
  const dateColumn = baseColumns.find(
    (c) => /date|time/i.test(c.type || '') || /date|time|created|updated|month|year/i.test(c.name || '')
  );
  const dimensionColumn =
    baseColumns.find((c) => c.name !== numericColumn?.name && c.name !== dateColumn?.name) || baseColumns[0];

  const criteriaWhere = buildWhereAddition(criteria);
  const promptComment = prompt && prompt.trim() ? `-- User intent: ${prompt.trim().replace(/\n/g, ' ')}\n` : '';
  const tableRef = safeSqlIdentifier(baseTable);
  const dimRef = dimensionColumn ? safeSqlIdentifier(dimensionColumn.name) : null;
  const numRef = numericColumn ? safeSqlIdentifier(numericColumn.name) : null;
  const dateRef = dateColumn ? safeSqlIdentifier(dateColumn.name) : null;

  const suggestions = [];

  if (normalizedTables.length >= 2) {
    const t0 = normalizedTables[0];
    const t1 = normalizedTables[1];
    const c0 = tableColumnsByTable[t0] || [];
    const c1 = tableColumnsByTable[t1] || [];
    const shared = firstSharedColumnName(c0, c1);
    if (shared) {
      const ref0 = safeSqlIdentifier(t0);
      const ref1 = safeSqlIdentifier(t1);
      const col0 = safeSqlIdentifier(shared[0]);
      const col1 = safeSqlIdentifier(shared[1]);
      suggestions.push({
        title: 'Joined view (first two selected tables)',
        rationale: `Join "${t0}" and "${t1}" on matching column "${shared[0]}".`,
        sql: `${promptComment}SELECT *\nFROM ${ref0}\nINNER JOIN ${ref1} ON ${ref0}.${col0} = ${ref1}.${col1}${criteriaWhere}\nLIMIT 500;`,
      });
    }
  }

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

  if (suggestions.length === 0) {
    suggestions.push({
      title: 'Preview rows',
      rationale: `Default safe SELECT for "${baseTable}".`,
      sql: `${promptComment}SELECT * FROM ${tableRef}${criteriaWhere} LIMIT 100;`,
    });
  }

  return suggestions.slice(0, 3);
}

/**
 * Drop suggestions whose SQL does not parse/plan against the given DB (catches bad LLM output).
 */
async function validateSelectSuggestions(db, suggestions) {
  if (!db || !Array.isArray(suggestions)) return [];
  const out = [];
  for (const raw of suggestions) {
    if (!raw || !raw.sql) continue;
    const sql = sanitizeSelectSql(raw.sql);
    if (!sql || sql.length > 12000) continue;
    try {
      await dbAll(db, `EXPLAIN QUERY PLAN ${sql}`);
      out.push({
        title: String(raw.title || 'Suggestion'),
        rationale: String(raw.rationale || ''),
        sql,
      });
    } catch {
      /* invalid for this database */
    }
    if (out.length >= 3) break;
  }
  return out;
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

function normalizeExtractedSuggestions(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const suggestionsRaw = Array.isArray(parsed) ? parsed : parsed.suggestions;
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
}

/** Parse suggestions from either /api/generate or /api/chat JSON body. */
function extractSuggestionsFromOllamaPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (Array.isArray(payload.suggestions)) {
    return normalizeExtractedSuggestions({ suggestions: payload.suggestions });
  }
  const r = payload.response;
  if (typeof r === 'string' && r.trim()) {
    const parsed = extractJsonObjectFromText(r);
    const n = normalizeExtractedSuggestions(parsed);
    if (n) return n;
  }
  if (r && typeof r === 'object') {
    const n = normalizeExtractedSuggestions(r);
    if (n) return n;
  }
  const c = payload.message?.content;
  if (typeof c === 'string' && c.trim()) {
    const parsed = extractJsonObjectFromText(c);
    const n = normalizeExtractedSuggestions(parsed);
    if (n) return n;
  }
  return null;
}

async function fetchOllamaTags(baseUrl) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  if (!base) return null;
  let signal;
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    signal = AbortSignal.timeout(10000);
  }
  try {
    const r = await fetch(`${base}/api/tags`, { method: 'GET', signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function modelInstalled(tagsJson, model) {
  const want = String(model || '').trim();
  if (!want || !tagsJson?.models?.length) return true;
  const base = want.split(':')[0].toLowerCase();
  return tagsJson.models.some((m) => {
    const n = String(m.name || '');
    return n === want || n.toLowerCase().startsWith(`${base}:`);
  });
}

function normalizeDashboardInsights(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const raw = Array.isArray(parsed) ? parsed : parsed.insights;
  if (!Array.isArray(raw)) return null;
  const out = raw
    .filter((x) => x && x.title && x.explanation)
    .map((x) => ({
      kind: String(x.kind || 'insight'),
      title: String(x.title),
      explanation: String(x.explanation),
    }))
    .slice(0, 8);
  return out.length ? out : null;
}

function extractDashboardInsightsFromOllamaPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (Array.isArray(payload.insights)) {
    return normalizeDashboardInsights({ insights: payload.insights });
  }
  const r = payload.response;
  if (typeof r === 'string' && r.trim()) {
    const parsed = extractJsonObjectFromText(r);
    const n = normalizeDashboardInsights(parsed);
    if (n) return n;
  }
  if (r && typeof r === 'object') {
    const n = normalizeDashboardInsights(r);
    if (n) return n;
  }
  const c = payload.message?.content;
  if (typeof c === 'string' && c.trim()) {
    const parsed = extractJsonObjectFromText(c);
    const n = normalizeDashboardInsights(parsed);
    if (n) return n;
  }
  return null;
}

/**
 * AI Database Dashboard insights — Ollama only (no heuristic fallback).
 * Returns { ok: true, insights } or { ok: false, code, message }.
 */
async function generateDashboardInsightsWithLLM(compactSummary) {
  const ollamaBaseUrl = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const model = process.env.OLLAMA_MODEL || 'llama3.2';
  const timeoutMs = Number(process.env.OLLAMA_DASHBOARD_TIMEOUT_MS || process.env.OLLAMA_TIMEOUT_MS || 600000);

  const userPrompt = [
    'You are a senior data engineer reviewing a SQLite database profile.',
    'You receive JSON computed from the database (aggregates and samples only, no raw rows).',
    'Return ONE JSON object only, no markdown, no text outside JSON.',
    'Shape: {"insights":[{"kind":"short_snake_case","title":"...","explanation":"..."}]}',
    'Produce 4 to 7 insights: priorities, data quality, modeling (staging/curated/marts), testing, performance.',
    'Use concrete table and column names from the input. Each explanation: 1-3 sentences.',
    'kind examples: priority, quality_risk, modeling, testing, performance, documentation.',
    '',
    'Input JSON:',
    JSON.stringify(compactSummary, null, 2),
  ].join('\n');

  const tagsJson = await fetchOllamaTags(ollamaBaseUrl);
  if (!tagsJson) {
    return {
      ok: false,
      code: 'OLLAMA_UNREACHABLE',
      message: `Cannot reach Ollama at ${ollamaBaseUrl} (GET /api/tags failed). Start Ollama or set OLLAMA_BASE_URL (e.g. http://127.0.0.1:11434).`,
    };
  }
  if (!Array.isArray(tagsJson.models) || tagsJson.models.length === 0) {
    return {
      ok: false,
      code: 'OLLAMA_NO_MODELS',
      message: `Ollama is running but no models are installed. Run: ollama pull llama3.2  then set OLLAMA_MODEL to the name shown by: ollama list`,
    };
  }
  if (!modelInstalled(tagsJson, model)) {
    const sample = tagsJson.models
      .slice(0, 20)
      .map((m) => m.name)
      .join(', ');
    return {
      ok: false,
      code: 'OLLAMA_MODEL_MISSING',
      message: `Model "${model}" is not installed. Run: ollama pull ${model.split(':')[0]}. Some installed models: ${sample || '(none)'}. Set OLLAMA_MODEL to one of these names.`,
    };
  }

  const attempts = [
    {
      path: '/api/generate',
      body: {
        model,
        prompt: userPrompt,
        stream: false,
        format: 'json',
        options: { temperature: 0.2, num_predict: 1600 },
      },
    },
    {
      path: '/api/generate',
      body: {
        model,
        prompt: userPrompt,
        stream: false,
        options: { temperature: 0.25, num_predict: 2000 },
      },
    },
    {
      path: '/api/chat',
      body: {
        model,
        messages: [{ role: 'user', content: userPrompt }],
        stream: false,
        format: 'json',
        options: { temperature: 0.2, num_predict: 1600 },
      },
    },
    {
      path: '/api/chat',
      body: {
        model,
        messages: [{ role: 'user', content: userPrompt }],
        stream: false,
        options: { temperature: 0.25, num_predict: 2000 },
      },
    },
  ];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    for (const att of attempts) {
      let r;
      try {
        r = await fetch(`${ollamaBaseUrl}${att.path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(att.body),
          signal: controller.signal,
        });
      } catch (e) {
        if (e.name === 'AbortError') {
          return {
            ok: false,
            code: 'OLLAMA_TIMEOUT',
            message: `Ollama dashboard request timed out after ${timeoutMs}ms. Set OLLAMA_DASHBOARD_TIMEOUT_MS (e.g. 900000 for 15 minutes) or OLLAMA_TIMEOUT_MS in backend/.env and restart the server.`,
          };
        }
        continue;
      }
      if (!r.ok) continue;
      let payload;
      try {
        payload = await r.json();
      } catch {
        continue;
      }
      const insights = extractDashboardInsightsFromOllamaPayload(payload);
      if (insights?.length) {
        return { ok: true, insights };
      }
    }
  } finally {
    clearTimeout(timeoutId);
  }

  return {
    ok: false,
    code: 'OLLAMA_EMPTY_RESPONSE',
    message:
      'Ollama responded but no usable JSON with insights was parsed. Try a larger model or increase OLLAMA_DASHBOARD_TIMEOUT_MS.',
  };
}

/**
 * Returns { ok: true, suggestions } or { ok: false, code, message } (never null for routing).
 * Tries /api/generate then /api/chat; with and without strict JSON mode.
 */
async function generateCuratedSuggestionsWithLLM({ selectedTables, tableColumnsByTable, criteria, prompt }) {
  const ollamaBaseUrl = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const model = process.env.OLLAMA_MODEL || 'llama3.2';
  const timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS || 180000);
  const schemaContext = selectedTables.map((t) => ({
    table: t,
    columns: (tableColumnsByTable[t] || []).map((c) => ({ name: c.name, type: c.type || '' })),
  }));
  const crit = normalizeCriteriaFragment(criteria);
  const critLine = crit
    ? `Filter: add a single predicate using AND (...) merged into WHERE. The filter expression is: (${crit}). Do not add a second WHERE keyword.`
    : 'No extra row filter.';

  const userPrompt = [
    'You are an expert SQLite analyst.',
    'Task: produce exactly 3 different SELECT queries suitable as "curated layer" models.',
    'Output: ONE JSON object only, no markdown, no text before or after JSON.',
    'Shape: {"suggestions":[{"title":"...","rationale":"...","sql":"..."}, ...]}',
    '',
    'Hard rules:',
    '1) sqlite dialect only; use double-quoted identifiers for every table and column name (e.g. "orders"."id").',
    '2) Only SELECT; no DDL/DML; no multiple statements; no semicolons inside the sql strings.',
    '3) Use ONLY tables and columns listed in the schema below. Do not invent tables or columns.',
    '4) If more than one table is listed, at least one suggestion MUST use explicit INNER JOIN ... ON ... between those tables.',
    '5) ' + critLine,
    '6) Each sql should be runnable and include a sensible LIMIT (<= 2000).',
    '',
    'Schema (authoritative):',
    JSON.stringify(schemaContext, null, 2),
    '',
    'User goal (optional, paraphrase in rationale if useful):',
    String(prompt || '').trim() || '(none)',
  ].join('\n');

  const tagsJson = await fetchOllamaTags(ollamaBaseUrl);
  if (!tagsJson) {
    return {
      ok: false,
      code: 'OLLAMA_UNREACHABLE',
      message: `Cannot reach Ollama at ${ollamaBaseUrl} (GET /api/tags failed). Start Ollama or set OLLAMA_BASE_URL (e.g. http://127.0.0.1:11434).`,
    };
  }
  if (!Array.isArray(tagsJson.models) || tagsJson.models.length === 0) {
    return {
      ok: false,
      code: 'OLLAMA_NO_MODELS',
      message: `Ollama is running but no models are installed. Run: ollama pull llama3.2  then set OLLAMA_MODEL to the name shown by: ollama list`,
    };
  }
  if (!modelInstalled(tagsJson, model)) {
    const sample = tagsJson.models
      .slice(0, 20)
      .map((m) => m.name)
      .join(', ');
    return {
      ok: false,
      code: 'OLLAMA_MODEL_MISSING',
      message: `Model "${model}" is not installed. Run: ollama pull ${model.split(':')[0]}. Some installed models: ${sample || '(none)'}. Set OLLAMA_MODEL to one of these names.`,
    };
  }

  const attempts = [
    {
      path: '/api/generate',
      body: {
        model,
        prompt: userPrompt,
        stream: false,
        format: 'json',
        options: { temperature: 0.1, num_predict: 2400 },
      },
    },
    {
      path: '/api/generate',
      body: {
        model,
        prompt: userPrompt,
        stream: false,
        options: { temperature: 0.15, num_predict: 2800 },
      },
    },
    {
      path: '/api/chat',
      body: {
        model,
        messages: [{ role: 'user', content: userPrompt }],
        stream: false,
        format: 'json',
        options: { temperature: 0.1, num_predict: 2400 },
      },
    },
    {
      path: '/api/chat',
      body: {
        model,
        messages: [{ role: 'user', content: userPrompt }],
        stream: false,
        options: { temperature: 0.15, num_predict: 2800 },
      },
    },
  ];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    for (const att of attempts) {
      let r;
      try {
        r = await fetch(`${ollamaBaseUrl}${att.path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(att.body),
          signal: controller.signal,
        });
      } catch (e) {
        if (e.name === 'AbortError') {
          return {
            ok: false,
            code: 'OLLAMA_TIMEOUT',
            message: `Ollama request timed out after ${timeoutMs}ms. Increase OLLAMA_TIMEOUT_MS or use a smaller/faster OLLAMA_MODEL.`,
          };
        }
        continue;
      }
      if (!r.ok) continue;
      let payload;
      try {
        payload = await r.json();
      } catch {
        continue;
      }
      const suggestions = extractSuggestionsFromOllamaPayload(payload);
      if (suggestions?.length) {
        return { ok: true, suggestions };
      }
    }
  } finally {
    clearTimeout(timeoutId);
  }

  return {
    ok: false,
    code: 'OLLAMA_EMPTY_RESPONSE',
    message:
      'Ollama responded but no usable JSON with 3 suggestions was parsed. Try OLLAMA_MODEL=llama3.2:latest or a larger model; ensure the model follows JSON output; or increase OLLAMA_TIMEOUT_MS / num_predict via Ollama version that supports format=json.',
  };
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

module.exports = {
  safeSqlIdentifier,
  buildCuratedSuggestions,
  validateSelectSuggestions,
  aiArtifactsDir,
  ensureAiArtifactsDir,
  analysisHistoryPath,
  curatedHistoryPath,
  readJsonArray,
  writeJsonArray,
  appendHistoryEntry,
  extractImportantCharacteristics,
  generateCuratedSuggestionsWithLLM,
  generateDashboardInsightsWithLLM,
  parseJsonSafe,
  parseLimitQueryParam,
  percentile,
  toCardinalityLabel,
  calcNumericStats,
};
