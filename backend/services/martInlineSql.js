const path = require('path');
const fs = require('fs');

function inlineCuratedIntoMartSql(sql, curatedMetaDir) {
  if (!sql) return '';
  let finalSql = sql;
  let curatedFiles = [];
  try {
    curatedFiles = fs.readdirSync(curatedMetaDir).filter((f) => f.endsWith('.json'));
  } catch (e) {
    return finalSql;
  }

  const curatedMap = new Map();
  curatedFiles.forEach((file) => {
    const name = file.replace(/\.json$/, '');
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(curatedMetaDir, file), 'utf8'));
      if (meta.sql) curatedMap.set(name, meta.sql.trim().replace(/;+\s*$/, ''));
    } catch (e) {
      /* ignore */
    }
  });

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

module.exports = { inlineCuratedIntoMartSql };
