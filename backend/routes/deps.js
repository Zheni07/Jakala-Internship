'use strict';

/**
 * Shared imports for domain route modules (single place to wire libs/services).
 */
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { randomUUID } = require('crypto');

const workspace = require('../workspace');
const { dbAll, dbGet, dbRun, withDatabase } = require('../lib/sqliteAsync');
const { Http } = require('../lib/http');
const { ensureSqlLimit } = require('../lib/sqlHelpers');
const { listJsonStemNames } = require('../lib/metadataListing');
const { computePreviewAndDocumentation } = require('../lib/previewDocumentation');
const { detectType, columnsFromPreview } = require('../lib/columnInference');
const { generateDbtYaml } = require('../lib/dbtYaml');
const {
  validateNamedSqlPayload,
  validateSqlOnlyPayload,
  validatePerfManualPayload,
  validatePerfDataflowPayload,
  validateStagingSavePayload,
  validateCuratedSavePayload,
} = require('../lib/validation');
const config = require('../config');

const {
  getCachedData,
  setCachedData,
  invalidateCache,
} = require('../services/modelCache');
const { perfJobs, runPerfJob } = require('../services/perfJobs');
const {
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
} = require('../services/aiHelpers');
const { inlineCuratedIntoMartSql } = require('../services/martInlineSql');
const { runTimedQuery } = require('../services/timedQuery');

const FULL_CHART_ROWS = config.fullChartRows;

module.exports = {
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
  validateNamedSqlPayload,
  validateSqlOnlyPayload,
  validatePerfManualPayload,
  validatePerfDataflowPayload,
  validateStagingSavePayload,
  validateCuratedSavePayload,
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
};
