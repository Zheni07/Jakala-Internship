const sqlite3 = require('sqlite3').verbose();

/**
 * Promisified sqlite3 helpers. Callers own lifecycle unless using withDatabase.
 */
function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

/**
 * Opens a DB, runs an async callback, always closes the connection in finally.
 */
async function withDatabase(dbPath, fn) {
  const db = new sqlite3.Database(dbPath);
  try {
    return await fn(db);
  } finally {
    try {
      db.close();
    } catch (e) {
      /* ignore */
    }
  }
}

module.exports = {
  dbAll,
  dbGet,
  dbRun,
  withDatabase,
};
