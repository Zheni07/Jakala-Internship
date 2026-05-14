const workspace = require('../workspace');

function publicAuthPath(req) {
  return req.path === '/auth/register' || req.path === '/auth/login';
}

function resolveDbSlot(req) {
  const rawSlot = req.headers['x-database-slot'] || req.query.dbSlot || 'db1';
  return workspace.normalizeDbSlot(String(rawSlot));
}

function requireUploadedSqlite(req, res, next) {
  if (!workspace.userHasDatabase(req.user.id, req.dbSlot)) {
    return res.status(400).json({
      error: 'NO_DATABASE',
      message: `Upload a SQLite file (.sqlite or .db) for ${req.dbSlot.toUpperCase()} from the profile bar to work with data.`,
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

module.exports = {
  publicAuthPath,
  resolveDbSlot,
  requireUploadedSqlite,
  canUseAppWithoutDatabase,
};
