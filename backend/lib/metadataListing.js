const fs = require('fs');
const path = require('path');

/**
 * Lists model names from a metadata directory (*.json stems), optionally filtered by cleanup timestamp.
 */
function listJsonStemNames(metaDir, cleanedAtMs) {
  const files = fs.readdirSync(metaDir);
  return files
    .filter((f) => f.endsWith('.json'))
    .filter((f) => {
      if (!cleanedAtMs) return true;
      try {
        const stat = fs.statSync(path.join(metaDir, f));
        return stat.mtimeMs >= cleanedAtMs;
      } catch (e) {
        return false;
      }
    })
    .map((f) => f.replace(/\.json$/, ''));
}

module.exports = { listJsonStemNames };
