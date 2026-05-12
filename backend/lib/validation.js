class ValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
    this.details = details;
  }
}

function asObject(value) {
  return value && typeof value === 'object' ? value : {};
}

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(`${fieldName} is required`);
  }
  return value.trim();
}

function optionalBoolean(value, defaultValue = false) {
  if (value === undefined) return defaultValue;
  if (typeof value !== 'boolean') {
    throw new ValidationError('Boolean field has invalid type');
  }
  return value;
}

function optionalNumber(value, defaultValue) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new ValidationError('Numeric field has invalid value');
  return n;
}

function validateAuthPayload(body, { requireMinPassword = false } = {}) {
  const payload = asObject(body);
  const email = requireNonEmptyString(payload.email, 'email').toLowerCase();
  const password = requireNonEmptyString(payload.password, 'password');
  if (requireMinPassword && password.length < 6) {
    throw new ValidationError('Password must be at least 6 characters');
  }
  return { email, password };
}

function validateNamedSqlPayload(body, { sqlField = 'sql' } = {}) {
  const payload = asObject(body);
  const name = requireNonEmptyString(payload.name, 'name');
  const sql = requireNonEmptyString(payload[sqlField], sqlField);
  return { ...payload, name, [sqlField]: sql };
}

function validateSqlOnlyPayload(body, sqlField = 'sql') {
  const payload = asObject(body);
  const sql = requireNonEmptyString(payload[sqlField], sqlField);
  return { ...payload, [sqlField]: sql };
}

function validatePerfManualPayload(body, defaultRows) {
  const payload = asObject(body);
  const sql = requireNonEmptyString(payload.sql, 'sql');
  const rowLimit = optionalNumber(payload.rowLimit, defaultRows);
  const runId = payload.runId;
  return { sql, rowLimit, runId };
}

function validatePerfDataflowPayload(body, defaultRows) {
  const payload = asObject(body);
  const curatedName = requireNonEmptyString(payload.curatedName, 'curatedName');
  const rowLimit = optionalNumber(payload.rowLimit, defaultRows);
  const runId = payload.runId;
  return { curatedName, rowLimit, runId };
}

function validateStagingSavePayload(body) {
  const payload = validateNamedSqlPayload(body);
  return {
    ...payload,
    createTable: optionalBoolean(payload.createTable, false),
  };
}

function validateCuratedSavePayload(body) {
  const payload = validateNamedSqlPayload(body);
  return {
    ...payload,
    createTable: optionalBoolean(payload.createTable, true),
  };
}

module.exports = {
  ValidationError,
  validateAuthPayload,
  validateNamedSqlPayload,
  validateSqlOnlyPayload,
  validatePerfManualPayload,
  validatePerfDataflowPayload,
  validateStagingSavePayload,
  validateCuratedSavePayload,
};
