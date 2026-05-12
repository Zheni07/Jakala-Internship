const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { withDatabase, dbRun, dbGet } = require('./lib/sqliteAsync');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-dataflowstudio-change-me';
const APP_DB = path.join(__dirname, 'data', 'app.sqlite');

function initAuthDb() {
  fs.mkdirSync(path.dirname(APP_DB), { recursive: true });
  const db = new sqlite3.Database(APP_DB);
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);
  db.close();
}

async function createUser(email, password) {
  const id = randomUUID();
  const hash = bcrypt.hashSync(password, 10);
  const normalized = String(email).toLowerCase().trim();
  await withDatabase(APP_DB, async (db) => {
    await dbRun(db, 'INSERT INTO users (id, email, password_hash, created_at) VALUES (?,?,?,?)', [
      id,
      normalized,
      hash,
      new Date().toISOString(),
    ]);
  });
  return { id, email: normalized };
}

async function findUserByEmail(email) {
  const normalized = String(email).toLowerCase().trim();
  return withDatabase(APP_DB, async (db) => {
    const row = await dbGet(db, 'SELECT id, email, password_hash FROM users WHERE email = ?', [normalized]);
    return row || null;
  });
}

function verifyLogin(email, password) {
  return findUserByEmail(email).then((row) => {
    if (!row) return null;
    if (!bcrypt.compareSync(password, row.password_hash)) return null;
    return { id: row.id, email: row.email };
  });
}

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
}

function authMiddleware(req, res, next) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(m[1], JWT_SECRET);
    req.user = { id: payload.id, email: payload.email };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = {
  initAuthDb,
  createUser,
  findUserByEmail,
  verifyLogin,
  signToken,
  authMiddleware,
};
