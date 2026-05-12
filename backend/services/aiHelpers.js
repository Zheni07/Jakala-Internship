const path = require('path');
const fs = require('fs');
const workspace = require('../workspace');

function safeSqlIdentifier(name) {
  return `"${String(name || '').replace(/"/g, '""')}"`;
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

module.exports = {
  safeSqlIdentifier,
  buildCuratedSuggestions,
  aiArtifactsDir,
  ensureAiArtifactsDir,
  analysisHistoryPath,
  curatedHistoryPath,
  readJsonArray,
  writeJsonArray,
  appendHistoryEntry,
  extractImportantCharacteristics,
  generateCuratedSuggestionsWithLLM,
  parseJsonSafe,
  parseLimitQueryParam,
  percentile,
  toCardinalityLabel,
  calcNumericStats,
};
