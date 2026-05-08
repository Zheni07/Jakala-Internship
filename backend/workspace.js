const path = require('path');
const fs = require('fs');

const WORKSPACES_ROOT = path.join(__dirname, 'data', 'workspaces');
const SAMPLE_DB = path.join(__dirname, '..', 'northwind_small.sqlite');
const TEMPLATE_MODELS = path.join(__dirname, '..', 'models');
const LAYERS_CLEANUP_MARKER = '.layers_cleaned_v2';
const DB_SLOTS = ['db1', 'db2'];

function normalizeDbSlot(slot) {
  return DB_SLOTS.includes(slot) ? slot : 'db1';
}

function workspaceRoot(userId, slot = 'db1') {
  return path.join(WORKSPACES_ROOT, userId, normalizeDbSlot(slot));
}

function cleanupMarkerPath(userId, slot = 'db1') {
  return path.join(workspaceRoot(userId, slot), LAYERS_CLEANUP_MARKER);
}

function getLayersCleanupTimestamp(userId, slot = 'db1') {
  const marker = cleanupMarkerPath(userId, slot);
  if (!fs.existsSync(marker)) return null;
  try {
    const raw = fs.readFileSync(marker, 'utf8').trim();
    const t = Date.parse(raw);
    return Number.isFinite(t) ? t : null;
  } catch (e) {
    return null;
  }
}

function userDbPath(userId, slot = 'db1') {
  return path.join(workspaceRoot(userId, slot), 'database.sqlite');
}

/** True only if the user has uploaded (or replaced) their workspace SQLite file. */
function userHasDatabase(userId, slot = 'db1') {
  return fs.existsSync(userDbPath(userId, slot));
}

function dirs(userId, slot = 'db1') {
  const root = workspaceRoot(userId, slot);
  const models = path.join(root, 'models');
  return {
    root,
    dbPath: path.join(root, 'database.sqlite'),
    modelsRoot: models,
    modelsStaging: path.join(models, 'staging'),
    METADATA_DIR: path.join(models, 'staging', 'metadata'),
    CURATED_DIR: path.join(models, 'curated'),
    CURATED_META_DIR: path.join(models, 'curated', 'metadata'),
    MARTS_DIR: path.join(models, 'marts'),
    MARTS_META_DIR: path.join(models, 'marts', 'metadata'),
    PERF_DIR: path.join(models, 'curated', 'metadata', 'performance'),
  };
}

function ensureWorkspaceDirs(userId, slot = 'db1') {
  const d = dirs(userId, slot);
  fs.mkdirSync(d.METADATA_DIR, { recursive: true });
  fs.mkdirSync(d.CURATED_META_DIR, { recursive: true });
  fs.mkdirSync(d.MARTS_META_DIR, { recursive: true });
  fs.mkdirSync(d.PERF_DIR, { recursive: true });
  fs.mkdirSync(d.modelsStaging, { recursive: true });
  fs.mkdirSync(d.CURATED_DIR, { recursive: true });
  fs.mkdirSync(d.MARTS_DIR, { recursive: true });
  return d;
}

function listFilesRecursively(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const results = [];
  const stack = [''];
  while (stack.length > 0) {
    const rel = stack.pop();
    const abs = path.join(rootDir, rel);
    const entries = fs.readdirSync(abs, { withFileTypes: true });
    entries.forEach((entry) => {
      const childRel = rel ? path.join(rel, entry.name) : entry.name;
      if (entry.isDirectory()) {
        stack.push(childRel);
      } else {
        results.push(childRel.replace(/\\/g, '/'));
      }
    });
  }
  return results.sort();
}

function isLegacyTemplateWorkspaceModels(modelsRoot) {
  if (!fs.existsSync(modelsRoot)) return false;
  if (!fs.existsSync(TEMPLATE_MODELS)) return false;

  const workspaceFiles = listFilesRecursively(modelsRoot);
  if (workspaceFiles.length === 0) return false;

  const templateFiles = new Set(listFilesRecursively(TEMPLATE_MODELS));
  if (templateFiles.size === 0) return false;

  // Must be entirely composed of files present in template models.
  const allInTemplate = workspaceFiles.every((rel) => templateFiles.has(rel));
  if (!allInTemplate) return false;

  // Verify content is identical to avoid deleting legitimate user work.
  return workspaceFiles.every((rel) => {
    const workspaceFile = path.join(modelsRoot, rel);
    const templateFile = path.join(TEMPLATE_MODELS, rel);
    try {
      const workspaceContent = fs.readFileSync(workspaceFile, 'utf8');
      const templateContent = fs.readFileSync(templateFile, 'utf8');
      return workspaceContent === templateContent;
    } catch (e) {
      return false;
    }
  });
}

/**
 * New or returning user: workspace folders only.
 * If there is no uploaded database yet, remove the whole `models` tree so old
 * template stagings/curated/marts (from a previous app version) never show in the UI.
 */
function ensureNewUserWorkspace(userId, slot = 'db1') {
  fs.mkdirSync(workspaceRoot(userId, slot), { recursive: true });
  const d = dirs(userId, slot);
  const marker = cleanupMarkerPath(userId, slot);

  // One-time migration for existing users: clear old layer artifacts from sidebar.
  // This runs only once per user and then stores a marker file.
  if (!fs.existsSync(marker)) {
    if (fs.existsSync(d.modelsRoot)) {
      fs.rmSync(d.modelsRoot, { recursive: true, force: true });
    }
    ensureWorkspaceDirs(userId, slot);
    fs.writeFileSync(marker, new Date().toISOString());
    return;
  }

  if (
    fs.existsSync(d.modelsRoot) &&
    (!userHasDatabase(userId, slot) || isLegacyTemplateWorkspaceModels(d.modelsRoot))
  ) {
    fs.rmSync(d.modelsRoot, { recursive: true, force: true });
  }
  ensureWorkspaceDirs(userId, slot);
}

function ensureUserWorkspaces(userId) {
  DB_SLOTS.forEach((slot) => ensureNewUserWorkspace(userId, slot));
}

/**
 * Clear all layer artifacts (staging/curated/marts metadata and SQL files)
 * and recreate empty folders for a clean start.
 */
function resetUserModels(userId, slot = 'db1') {
  const d = dirs(userId, slot);
  if (fs.existsSync(d.modelsRoot)) {
    fs.rmSync(d.modelsRoot, { recursive: true, force: true });
  }
  ensureWorkspaceDirs(userId, slot);
}

module.exports = {
  WORKSPACES_ROOT,
  SAMPLE_DB,
  TEMPLATE_MODELS,
  DB_SLOTS,
  normalizeDbSlot,
  workspaceRoot,
  cleanupMarkerPath,
  getLayersCleanupTimestamp,
  userDbPath,
  userHasDatabase,
  dirs,
  ensureWorkspaceDirs,
  ensureNewUserWorkspace,
  ensureUserWorkspaces,
  resetUserModels,
};
